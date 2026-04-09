#!/usr/bin/env node
/**
 * Build block-database.json for Hatishbi-Sasson block
 * Merges all GeoJSON layers + cross-reference data + Gemini document analysis
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
}

function readGeoJSON(filename) {
  try {
    return readJSON(filename);
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}

// --- Point-in-polygon (ray casting) ---
function pointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInFeature(point, feature) {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return geom.coordinates.some((ring) => pointInPolygon(point, ring));
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly) =>
      poly.some((ring) => pointInPolygon(point, ring)),
    );
  }
  return false;
}

function distanceSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function centroid(feature) {
  const coords =
    feature.geometry.type === "Polygon"
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates[0][0];
  let cx = 0,
    cy = 0;
  for (const [x, y] of coords) {
    cx += x;
    cy += y;
  }
  return [cx / coords.length, cy / coords.length];
}

function polygonArea(coords) {
  // Shoelace formula - returns area in approximate sq meters (rough at this lat)
  let area = 0;
  const ring = coords[0];
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  // Convert degrees to meters (approximate at lat 32)
  const mPerDegLon = 93700;
  const mPerDegLat = 111320;
  return Math.abs(area / 2) * mPerDegLon * mPerDegLat;
}

// --- Load all data ---
console.log("Loading data...");
const xref = readJSON("address_parcel_xref.json");
const docsIndex = readJSON("building_documents_index.json");
const buildings = readGeoJSON("buildings.geojson");
const parcels = readGeoJSON("parcels.geojson");
const permits = readGeoJSON("building_permits.geojson");
const businesses = readGeoJSON("businesses.geojson");
const addresses = readGeoJSON("addresses.geojson");
const municipal = readGeoJSON("municipal_ownership.geojson");
const landUse = readGeoJSON("land_use.geojson");
const construction = readGeoJSON("construction_sites.geojson");
const trees = readGeoJSON("trees.geojson");
const shelters = readGeoJSON("shelters.geojson");
const conservation = readGeoJSON("conservation.geojson");
const dangerous = readGeoJSON("dangerous_buildings.geojson");
const greenSpaces = readGeoJSON("green_spaces.geojson");
const streetCenterlines = readGeoJSON("street_centerlines.geojson");
const citywidePlans = readGeoJSON("citywide_plans.geojson");

// --- Gemini document analysis data ---
const GEMINI_DOCUMENTS = [
  {
    address: "תשבי 13",
    chelka: 110,
    docs: [
      {
        type: "מדידה",
        year: 2002,
        surveyor: "דרור בן נתן",
        area_measured: 90,
        area_tabu: 112,
        applicant: "משפחת סבן",
        permit_number: "2002-00548",
      },
      {
        type: "מדידה",
        year: 2003,
        surveyor: "דרור בן נתן",
        area_measured: 90,
        notes: "עדכון מדידה",
      },
      {
        type: "היתר",
        year: 2004,
        floors: "קרקע + גג",
        notes: "סריקה ירודה, חישוב שטחים לא קריא",
      },
    ],
  },
  {
    address: "תשבי 12",
    chelka: 43,
    docs: [
      {
        type: "מדידה",
        year: 1998,
        surveyor: "לאון כחנא",
        area_measured: 118,
        area_tabu: 141,
        applicant: "דנחי",
        notes: "תוספת בנייה",
      },
      {
        type: "מדידה",
        year: 2012,
        surveyor: "י.אברבוך",
        area_measured: 119,
        area_tabu: 141,
        plan_ref: 'תב"ע 2215',
        notes: "הגדרת מגרש משני, 47/3575 חלקים",
      },
      { type: "היתר", year: 2016, notes: "סריקה ירודה מאוד" },
      {
        type: "היתר (קונסטרוקציה)",
        year: 1996,
        notes: "פרטי זיון, תקרה, קלמרות",
      },
    ],
  },
  {
    address: "תשבי 11",
    chelka: 110,
    docs: [
      {
        type: "מדידה + מידע תכנוני",
        year: 2003,
        surveyor: "דד מועמן",
        area_measured: 86,
        area_tabu: 112,
        applicant: "עטית",
        plan_ref: 'תב"ע 2215א1',
        building_rights: {
          floors: 3,
          coverage: "60%",
          building_pct: "140%",
          setback_front: "0 מ'",
          setback_side: "3 מ' או 0",
          roof: "גג רעפים",
          basement: "מותר",
        },
        notes: "אין היטל השבחה — שכונת שיקום",
        file_number: "1218-21",
      },
      {
        type: "היתר",
        year: 2001,
        floors: "קרקע + קומה א + חלל גג",
        gush_noted: 6138,
        notes: 'גוש 6138 כנראה שגיאת הקלדה, צ"ל 6135',
      },
    ],
  },
  {
    address: "תשבי 9",
    chelka: 110,
    docs: [{ type: "היתר", year: 2011, notes: "קובץ כמעט ריק, לא ניתן לחלץ" }],
  },
  {
    address: "תשבי 3",
    chelka: 110,
    docs: [
      {
        type: "היתר",
        year: 2020,
        notes: "פרטי מיגון, חישובי שטחים, שם רחוב שגוי (ישבי)",
      },
    ],
  },
  {
    address: "תשבי 2",
    chelka: 43,
    docs: [{ type: "היתר", year: 1948, notes: "סריקה בלתי קריאה לחלוטין" }],
  },
  {
    address: "ששון 17",
    chelka: 44,
    docs: [
      {
        type: "מדידה",
        year: 1992,
        surveyor: "לאון כהנא",
        area_measured: 112,
        plan_ref: 'תב"ע 2215',
        building_rights: {
          floors: 3,
          density: '10 יח"ד/דונם',
          coverage: "50%",
          setback_front: "0",
          setback_side: "3 מ' או קיר משותף",
          setback_rear: "5 מ'",
          road_width: "5-8 מ'",
        },
        notes: "פטור היטל השבחה, תכנית 2215 טרם אושרה סופית בזמן עריכת המסמך",
      },
      {
        type: "מדידה להיתר",
        year: 2020,
        area_measured: 100,
        applicant: "כהן אלפר אירינה",
        plan_ref: "2215/א",
      },
      {
        type: "היתר",
        year: 2020,
        architect: "ענבר מען אשר",
        applicant: "כהן אלפר אירינה",
        area: 100,
      },
    ],
  },
  {
    address: "ששון 14א",
    chelka: 44,
    docs: [
      {
        type: "מדידה",
        year: 1985,
        applicant: "חלמיש",
        notes: "סריקה באיכות נמוכה",
      },
      {
        type: "מדידה",
        year: 2008,
        surveyor: "גטניו ברני",
        area_measured: 180,
        area_parcel_total: 11476,
        applicant: "חלמיש",
        plan_ref: 'תב"ע 2215',
      },
    ],
  },
  {
    address: "ששון 14",
    chelka: 44,
    docs: [{ type: "אחר", year: null, notes: "2 מסמכים לא קריאים" }],
  },
  {
    address: "ששון 8-10",
    chelka: 44,
    docs: [
      {
        type: "מדידה",
        year: 1992,
        surveyor: "לאון כהנא",
        area_measured: 254,
        plan_ref: 'תב"ע 2215',
        applicant: "מלמד שלום (שרעבי)",
        chelkot: [44, 45],
        building_rights: {
          floors: 3,
          building_pct: "140%",
          coverage: "60%",
          setback_front: "0",
          setback_side: "3 מ' או קירות משותפים",
          setback_rear: "5 מ'",
        },
        notes: "פטור היטל השבחה",
      },
      {
        type: "היתר",
        year: null,
        floors: "קרקע + קומה א + גג עליון",
        area: 254,
      },
    ],
  },
];

// --- Target parcels ---
const TARGET_CHELKOT = [43, 44, 71, 110];

// --- Build address→point map from addresses.geojson ---
const addressPointMap = {};
for (const feat of addresses.features) {
  const p = feat.properties;
  const street = p.t_rechov || "";
  const num = p.ms_bayit || "";
  const key = `${street} ${num}`.trim();
  const chelka = p.ms_chelka;
  const gush = p.ms_gush;
  addressPointMap[key] = {
    point: feat.geometry.coordinates,
    chelka,
    gush,
    full_address: p.t_ktovet_melea,
    street,
    number: num,
    street_eng: p.t_rechov_eng,
  };
}

// --- Build building spatial index ---
console.log("Building spatial index...");
const buildingFeatures = buildings.features;

function findBuildingForPoint(point) {
  // First try point-in-polygon
  for (const feat of buildingFeatures) {
    if (pointInFeature(point, feat)) {
      return feat;
    }
  }
  // Fallback: nearest centroid within 30m (~0.0003 degrees)
  let best = null;
  let bestDist = Infinity;
  for (const feat of buildingFeatures) {
    const c = centroid(feat);
    const d = distanceSq(point, c);
    if (d < bestDist) {
      bestDist = d;
      best = feat;
    }
  }
  // ~0.0003 degrees ≈ 30m
  if (bestDist < 0.0003 * 0.0003) return best;
  return null;
}

// --- Build permit map by address ---
const permitMap = {};
for (const feat of permits.features) {
  const addr = feat.properties.addresses || "";
  const addrs = addr.split(",").map((a) => a.trim());
  const permit = {
    request_num: feat.properties.request_num,
    permission_num: feat.properties.permission_num,
    type: feat.properties.sug_bakasha,
    stage: feat.properties.building_stage,
    date: feat.properties.permission_date,
    open_request: feat.properties.open_request,
    expiry_date: feat.properties.expiry_date,
    finished: feat.properties.finished,
    housing_units: feat.properties.yechidot_diyur,
    content: feat.properties.tochen_bakasha,
    tama38: feat.properties.sw_tama_38,
    url: feat.properties.url_hadmaya,
    area_sqm: feat.properties.Shape_Area,
  };
  for (const a of addrs) {
    if (!permitMap[a]) permitMap[a] = [];
    permitMap[a].push(permit);
  }
}

// --- Build business map by address ---
const businessMap = {};
for (const feat of businesses.features) {
  const p = feat.properties;
  // Business addresses use shem_rechov + ms_bayit fields
  const street = p.shem_rechov || "";
  const num = p.ms_bayit || "";
  const addr = `${street} ${num}`.trim();
  const biz = {
    name: p.shem_machzik_rashi || "",
    type: p.shimush || "",
    area_sqm: p.shetach || null,
    id: p.id_esek || null,
  };
  if (!businessMap[addr]) businessMap[addr] = [];
  businessMap[addr].push(biz);
}

// --- Build Gemini docs map ---
const geminiMap = {};
for (const entry of GEMINI_DOCUMENTS) {
  geminiMap[entry.address] = entry.docs;
}

// --- Build online docs map ---
const onlineDocsMap = {};
for (const entry of docsIndex) {
  const addr = entry.address;
  // Normalize "התשבי" -> "תשבי"
  const normAddr = addr.replace(/^ה/, "");
  onlineDocsMap[normAddr] = entry.documents;
  onlineDocsMap[addr] = entry.documents;
}

// --- Build municipal ownership map by chelka ---
const municipalMap = {};
for (const feat of municipal.features) {
  const p = feat.properties;
  const chelka = p.ms_chelka;
  municipalMap[chelka] = {
    type: p.t_sug_baalut || "בעלות חלקית",
    share: p.t_chelek || null,
    gis_area: feat.properties.Shape_Area,
  };
}

// --- Build conservation set ---
const conservationAddrs = new Set();
for (const feat of conservation.features) {
  const addr = feat.properties.t_ktovet || feat.properties.addresses || "";
  if (addr) conservationAddrs.add(addr);
}

// --- Build dangerous set ---
const dangerousAddrs = new Set();
for (const feat of dangerous.features) {
  const addr = feat.properties.t_ktovet || feat.properties.addresses || "";
  if (addr) dangerousAddrs.add(addr);
}

// --- Compute bounding box from target parcels ---
let bboxMinLon = Infinity,
  bboxMinLat = Infinity,
  bboxMaxLon = -Infinity,
  bboxMaxLat = -Infinity;
for (const feat of parcels.features) {
  const chelka = feat.properties.ms_chelka;
  if (!TARGET_CHELKOT.includes(chelka)) continue;
  const coords =
    feat.geometry.type === "Polygon"
      ? feat.geometry.coordinates[0]
      : feat.geometry.coordinates[0][0];
  for (const [lon, lat] of coords) {
    bboxMinLon = Math.min(bboxMinLon, lon);
    bboxMinLat = Math.min(bboxMinLat, lat);
    bboxMaxLon = Math.max(bboxMaxLon, lon);
    bboxMaxLat = Math.max(bboxMaxLat, lat);
  }
}

// --- Build parcel data ---
const parcelData = {};
for (const xrefEntry of xref) {
  const chelka = xrefEntry.chelka;
  if (!TARGET_CHELKOT.includes(chelka)) continue;
  parcelData[chelka] = {
    registered_area_sqm: xrefEntry.registered_area_sqm,
    gis_area_sqm: xrefEntry.gis_area_sqm,
    moshaa: xrefEntry.likely_moshaa,
    municipal_ownership: xrefEntry.municipal_ownership,
    building_count: xrefEntry.building_count,
    year_range: xrefEntry.buildings_summary.year_range,
    address_count: xrefEntry.addresses.length,
  };
}

// --- Build address records for target parcels ---
console.log("Building address records...");
const addressRecords = {};

for (const xrefEntry of xref) {
  const chelka = xrefEntry.chelka;
  if (!TARGET_CHELKOT.includes(chelka)) continue;

  for (let addr of xrefEntry.addresses) {
    // Normalize address
    const normAddr = addr;

    // Find address point
    const addrInfo = addressPointMap[normAddr];
    let buildingData = null;

    if (addrInfo && addrInfo.point) {
      const bldg = findBuildingForPoint(addrInfo.point);
      if (bldg) {
        const p = bldg.properties;
        const footprint = polygonArea(
          bldg.geometry.type === "Polygon"
            ? bldg.geometry.coordinates
            : bldg.geometry.coordinates[0],
        );
        buildingData = {
          year_built: p.year || null,
          floors: p.ms_komot || null,
          height_m: p.gova_simplex_2019
            ? Math.round(p.gova_simplex_2019 * 100) / 100
            : null,
          footprint_sqm: Math.round(footprint),
          building_type: p.t_sug_mivne || null,
          dsm_mean: p.dsm_mean ? Math.round(p.dsm_mean * 100) / 100 : null,
          dsm_max: p.dsm_max ? Math.round(p.dsm_max * 100) / 100 : null,
          id_binyan: p.id_binyan,
        };
      }
    }

    // Parse street and number
    const parts = normAddr.match(/^(.+?)\s+(\d+.*)$/);
    const street = parts ? parts[1] : normAddr;
    const number = parts ? parts[2] : "";

    // Find permits - try multiple address formats
    const addrVariants = [
      normAddr,
      `ה${normAddr}`, // prefix ה for תשבי -> התשבי
      normAddr.replace(/^ה/, ""), // remove prefix ה
    ];
    let addrPermits = [];
    for (const v of addrVariants) {
      if (permitMap[v]) addrPermits = addrPermits.concat(permitMap[v]);
    }
    // Deduplicate by request_num
    const seenPermits = new Set();
    addrPermits = addrPermits.filter((p) => {
      if (seenPermits.has(p.request_num)) return false;
      seenPermits.add(p.request_num);
      return true;
    });

    // Find businesses
    let addrBusinesses = [];
    for (const v of addrVariants) {
      if (businessMap[v])
        addrBusinesses = addrBusinesses.concat(businessMap[v]);
    }

    // Find Gemini docs
    let geminiDocs = [];
    for (const v of addrVariants) {
      if (geminiMap[v]) geminiDocs = geminiMap[v];
    }

    // Find online docs
    let onlineDocs = [];
    for (const v of addrVariants) {
      if (onlineDocsMap[v]) onlineDocs = onlineDocsMap[v];
    }

    // Extract building rights from Gemini docs if available
    let buildingRights = null;
    for (const doc of geminiDocs) {
      if (doc.building_rights) {
        buildingRights = {
          source: doc.plan_ref || 'תב"ע 2215',
          ...doc.building_rights,
        };
        break;
      }
    }

    // Check conservation / dangerous
    const isConservation = addrVariants.some((v) => conservationAddrs.has(v));
    const isDangerous = addrVariants.some((v) => dangerousAddrs.has(v));

    // Municipal ownership for this address's parcel
    const muni = municipalMap[chelka];
    const muniShare = muni ? muni.share : null;

    addressRecords[normAddr] = {
      chelka,
      street,
      number,
      building: buildingData,
      permits: addrPermits,
      documents: geminiDocs,
      online_documents: onlineDocs.length > 0 ? onlineDocs : undefined,
      businesses: addrBusinesses,
      municipal_ownership_share: muniShare,
      conservation: isConservation,
      dangerous: isDangerous,
      building_rights: buildingRights,
    };
  }
}

// --- Compute total area ---
let totalArea = 0;
for (const chelka of TARGET_CHELKOT) {
  if (parcelData[chelka]) {
    totalArea += parcelData[chelka].gis_area_sqm;
  }
}

// --- Assemble final database ---
const database = {
  block_info: {
    name: "בלוק תשבי-ששון",
    neighborhood: "שכונת התקווה",
    gush: 6135,
    parcels: TARGET_CHELKOT,
    bbox_wgs84: {
      south: bboxMinLat,
      west: bboxMinLon,
      north: bboxMaxLat,
      east: bboxMaxLon,
    },
    total_buildings:
      (parcelData[43]?.building_count || 0) +
      (parcelData[44]?.building_count || 0) +
      (parcelData[71]?.building_count || 0) +
      (parcelData[110]?.building_count || 0),
    total_area_sqm: totalArea,
    total_addresses: Object.keys(addressRecords).length,
    governing_plan: "תא/2215 (1992)",
    generated: new Date().toISOString(),
  },
  parcels: parcelData,
  addresses: addressRecords,
  planning_context: {
    governing_plan: { id: "תא/2215", year: 1992, status: "מאושרת" },
    future_reparcellation: {
      id: "תא/מק/4766",
      status: "לא חל על הבלוק",
      note: "חל על חלקות 79,82,96,102,104,105 באותו גוש — תבנית לעתיד",
    },
    building_rights_default: {
      floors: 3,
      coverage_pct: 60,
      building_pct: 140,
      setback_front: 0,
      setback_side: 3,
      setback_rear: 5,
      notes: "פטור היטל השבחה כל עוד שכונת שיקום",
    },
  },
};

// --- Write output ---
const outPath = path.join(DATA_DIR, "block-database.json");
fs.writeFileSync(outPath, JSON.stringify(database, null, 2), "utf8");

console.log(`\nDatabase written to ${outPath}`);
console.log(`Block parcels: ${TARGET_CHELKOT.join(", ")}`);
console.log(`Total addresses: ${Object.keys(addressRecords).length}`);
console.log(`Total buildings: ${database.block_info.total_buildings}`);
console.log(`Total area: ${totalArea} sqm`);

// Stats
let withBuilding = 0,
  withPermits = 0,
  withDocs = 0,
  withBiz = 0;
for (const rec of Object.values(addressRecords)) {
  if (rec.building) withBuilding++;
  if (rec.permits.length > 0) withPermits++;
  if (rec.documents.length > 0) withDocs++;
  if (rec.businesses.length > 0) withBiz++;
}
console.log(
  `Addresses with building data: ${withBuilding}/${Object.keys(addressRecords).length}`,
);
console.log(`Addresses with permits: ${withPermits}`);
console.log(`Addresses with Gemini docs: ${withDocs}`);
console.log(`Addresses with businesses: ${withBiz}`);
