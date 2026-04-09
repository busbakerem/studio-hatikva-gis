import { readFile, writeFile } from "node:fs/promises";
import { queryLayerAllFeatures } from "../dist/arcgis-client.js";

// ── Geometry helpers ─────────────────────────────────────────────────────────

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function centroid(coords) {
  // GeoJSON polygon: coords[0] is outer ring
  const ring = coords[0] || coords;
  let cx = 0,
    cy = 0;
  for (const p of ring) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / ring.length, cy / ring.length];
}

// ── Sites ────────────────────────────────────────────────────────────────────

const sites = {
  "hatikva-hanoch-tarfon": {
    xmin: 180250,
    ymin: 661980,
    xmax: 180380,
    ymax: 662120,
  },
  "hatishbi-sasson": { xmin: 180440, ymin: 661700, xmax: 180620, ymax: 661850 },
  "derech-hahagana": { xmin: 180350, ymin: 662250, xmax: 180550, ymax: 662420 },
  "haverod-park": { xmin: 180580, ymin: 662160, xmax: 180740, ymax: 662320 },
  "haverod-yechiam-leblov": {
    xmin: 180520,
    ymin: 662020,
    xmax: 180690,
    ymax: 662180,
  },
};

const result = {};

for (const [siteId, bbox] of Object.entries(sites)) {
  console.log(`\n--- ${siteId} ---`);

  // Query parcels, buildings, and permits WITH geometry (GeoJSON format with WGS84)
  const parcelsGJ = await queryLayerAllFeatures(524, bbox);
  const permitsGJ = await queryLayerAllFeatures(772, bbox);

  console.log(
    `Parcels: ${parcelsGJ.features.length}, Permits: ${permitsGJ.features.length}`,
  );

  // Build parcel address map: for each parcel, find which permits fall inside it
  const parcelAddresses = {}; // "gush/chelka" -> Set<address>

  for (const parcel of parcelsGJ.features) {
    const gush = parcel.properties.ms_gush;
    const chelka = parcel.properties.ms_chelka;
    const key = `${gush}/${chelka}`;
    parcelAddresses[key] = new Set();

    // Get parcel outer ring (GeoJSON Polygon)
    const parcelRing = parcel.geometry?.coordinates?.[0];
    if (!parcelRing) continue;

    // Check each permit
    for (const permit of permitsGJ.features) {
      if (!permit.properties.addresses) continue;
      const permitGeom = permit.geometry?.coordinates;
      if (!permitGeom) continue;

      // Get permit centroid
      const [cx, cy] = centroid(permitGeom);

      if (pointInRing(cx, cy, parcelRing)) {
        parcelAddresses[key].add(permit.properties.addresses);
      }
    }
  }

  // Convert sets to arrays
  const addressMap = {};
  for (const [key, addrs] of Object.entries(parcelAddresses)) {
    addressMap[key] = [...addrs];
  }

  result[siteId] = addressMap;

  // Print results
  for (const [key, addrs] of Object.entries(addressMap)) {
    if (addrs.length > 0) {
      console.log(`  ${key}: ${addrs.join(" | ")}`);
    }
  }

  // Count how many parcels got addresses
  const withAddr = Object.values(addressMap).filter((a) => a.length > 0).length;
  console.log(
    `  Parcels with addresses: ${withAddr}/${parcelsGJ.features.length}`,
  );
}

await writeFile(
  "research/ownership-parcellation/data/_parcel_addresses.json",
  JSON.stringify(result, null, 2),
);
console.log("\nSaved to _parcel_addresses.json");
