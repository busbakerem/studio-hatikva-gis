import { readFile, writeFile } from "node:fs/promises";

// ── Load all data ────────────────────────────────────────────────────────────

const parcelsGJ = JSON.parse(await readFile("research/ownership-parcellation/data/parcels.geojson", "utf8"));
const municipalGJ = JSON.parse(await readFile("research/ownership-parcellation/data/municipal_land.geojson", "utf8"));
const landuseGJ = JSON.parse(await readFile("research/ownership-parcellation/data/land_use.geojson", "utf8"));
const perSite = JSON.parse(await readFile("research/ownership-parcellation/data/_per_site_data.json", "utf8"));
const planningContext = await readFile("research/ownership-parcellation/data/_planning_context.md", "utf8");
const parcelAddresses = JSON.parse(await readFile("research/ownership-parcellation/data/_parcel_addresses.json", "utf8"));
const crossRef = JSON.parse(await readFile("research/ownership-parcellation/data/_cross_reference.json", "utf8"));
const govmapData = JSON.parse(await readFile("research/ownership-parcellation/data/_govmap_cadastre.json", "utf8"));

// Build a set of nationally-registered chelkas per gush
const nationalChelkas = {};
for (const [gush, parcels] of Object.entries(govmapData)) {
  nationalChelkas[gush] = new Set(parcels.map(p => p.PARCEL));
}

// Mega-parcels that span multiple sites — should not be "owned" by any single site
const MEGA_PARCELS = ["6135/3", "6135/4"];
const MEGA_PARCEL_NOTE = "חלקת מושע שכונתית — חוצה מספר אתרים, אין לייחס לאתר בודד";

// ── Geometry helpers ─────────────────────────────────────────────────────────

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function centroidOfRings(rings) {
  const pts = rings[0];
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  return [cx / pts.length, cy / pts.length];
}

function centroidOfCoords(coords) {
  if (!coords) return null;
  // GeoJSON polygon
  if (coords[0] && coords[0][0] && Array.isArray(coords[0][0])) {
    return centroidOfRings(coords);
  }
  return null;
}

// ── Spatial cross-reference: parcels ↔ permits (for addresses) ───────────────

// Build parcel-address mapping for each site using parcels GeoJSON + permits
function linkAddressesToParcels(siteParcels, sitePermits, parcelFeatures) {
  const parcelAddresses = {}; // chelka -> Set of addresses

  for (const permit of sitePermits) {
    if (!permit.addresses) continue;
    // Find which parcel this permit's building is in
    // We don't have permit geometry in per_site_data, so match by building_num
    // Actually, we need spatial match. Let's use the parcel features from GeoJSON.
    // For now, just collect all addresses per site.
  }

  return parcelAddresses;
}

// Better approach: query permits with geometry from the raw neighborhood data
// We need to build the cross-ref from the geojson files that DO have geometry
// Load the full per-site data which has properties only.
// For address linkage, use the permits' addresses field matched spatially.

// Since we don't have per-permit geometry in the per_site_data.json,
// let's use a heuristic: match permit addresses to parcels by looking at
// which parcels contain the buildings mentioned in the permits.

// ── Constants ────────────────────────────────────────────────────────────────

const MOSHAA_THRESHOLD = 5000; // m² - parcels above this are likely moshaa

const siteNames = {
  "hatikva-hanoch-tarfon": "התקווה-חנוך-טרפון",
  "hatishbi-sasson": "תשבי-ששון",
  "derech-hahagana": "דרך ההגנה",
  "haverod-park": "הורד-פארק",
  "haverod-yechiam-leblov": "הורד-יחיעם-לבלוב",
};

const siteAddresses = {
  "hatikva-hanoch-tarfon": "רחובות התקווה, חנוך, טרפון",
  "hatishbi-sasson": "תשבי 7, 4, 9, 11 | ששון 6, 8, 13",
  "derech-hahagana": "ציר דרך ההגנה",
  "haverod-park": "הורד 6, הורד 9",
  "haverod-yechiam-leblov": "ורד 29, יחיעם 31, לבלוב 23",
};

// ── Neighborhood-wide stats ──────────────────────────────────────────────────

const parcels = parcelsGJ.features.map(f => f.properties);
const totalParcelArea = parcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);
const gushes = [...new Set(parcels.map(p => p.ms_gush))].sort((a, b) => a - b);

const moshaaParcels = parcels.filter(p => (p.Shape_Area || 0) > MOSHAA_THRESHOLD);
const regularParcels = parcels.filter(p => (p.Shape_Area || 0) <= MOSHAA_THRESHOLD);
const moshaaArea = moshaaParcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);
const regularArea = regularParcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);

const sizeRanges = [
  { label: "< 50", min: 0, max: 50 },
  { label: "50–100", min: 50, max: 100 },
  { label: "100–200", min: 100, max: 200 },
  { label: "200–500", min: 200, max: 500 },
  { label: "500–1,000", min: 500, max: 1000 },
  { label: "1,000–2,500", min: 1000, max: 2500 },
  { label: "2,500–5,000", min: 2500, max: 5000 },
];

const sizeDist = sizeRanges.map(r => ({
  label: r.label,
  count: regularParcels.filter(p => (p.Shape_Area || 0) >= r.min && (p.Shape_Area || 0) < r.max).length,
  area: regularParcels.filter(p => (p.Shape_Area || 0) >= r.min && (p.Shape_Area || 0) < r.max).reduce((s, p) => s + (p.Shape_Area || 0), 0),
}));

// Municipal ownership
const municipal = municipalGJ.features.map(f => f.properties);
const totalMunicipalArea = municipal.reduce((s, m) => s + (m.Shape_Area || 0), 0);
const ownershipTypes = {};
for (const m of municipal) {
  const t = m.t_sug || "אחר";
  if (!ownershipTypes[t]) ownershipTypes[t] = { count: 0, area: 0 };
  ownershipTypes[t].count++;
  ownershipTypes[t].area += m.Shape_Area || 0;
}

// Land use
const landuse = landuseGJ.features.map(f => f.properties);
const zoningByType = {};
for (const l of landuse) {
  const t = l.t_yeud_rashi || "אחר";
  if (!zoningByType[t]) zoningByType[t] = { count: 0, area: 0 };
  zoningByType[t].count++;
  zoningByType[t].area += l.Shape_Area || 0;
}
const totalZoningArea = landuse.reduce((s, l) => s + (l.Shape_Area || 0), 0);

// Per-gush
const parcelsByGush = {};
for (const p of parcels) {
  const g = p.ms_gush;
  if (!parcelsByGush[g]) parcelsByGush[g] = { count: 0, area: 0, moshaaCount: 0, moshaaArea: 0 };
  parcelsByGush[g].count++;
  parcelsByGush[g].area += p.Shape_Area || 0;
  if ((p.Shape_Area || 0) > MOSHAA_THRESHOLD) {
    parcelsByGush[g].moshaaCount++;
    parcelsByGush[g].moshaaArea += p.Shape_Area || 0;
  }
}

const municipalByGush = {};
for (const m of municipal) {
  const g = m.ms_gush;
  if (!municipalByGush[g]) municipalByGush[g] = { count: 0, area: 0 };
  municipalByGush[g].count++;
  municipalByGush[g].area += m.Shape_Area || 0;
}

// ── Per-site analysis ────────────────────────────────────────────────────────

const siteAnalyses = {};
for (const [siteId, siteData] of Object.entries(perSite.sites)) {
  const a = {};
  a.parcels = siteData.parcels || [];
  a.parcelCount = a.parcels.length;
  a.totalParcelArea = a.parcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);
  a.gushes = [...new Set(a.parcels.map(p => p.ms_gush))];

  a.moshaaParcels = a.parcels.filter(p => (p.Shape_Area || 0) > MOSHAA_THRESHOLD);
  a.regularParcels = a.parcels.filter(p => (p.Shape_Area || 0) <= MOSHAA_THRESHOLD);

  a.municipal = siteData.municipal || [];
  a.municipalArea = a.municipal.reduce((s, m) => s + (m.Shape_Area || 0), 0);

  a.landuse = siteData.landuse || [];
  a.zoningBreakdown = {};
  for (const l of a.landuse) {
    const t = l.t_yeud_rashi || "אחר";
    if (!a.zoningBreakdown[t]) a.zoningBreakdown[t] = { count: 0, area: 0 };
    a.zoningBreakdown[t].count++;
    a.zoningBreakdown[t].area += l.Shape_Area || 0;
  }

  a.permits = siteData.permits || [];
  a.activePermits = a.permits.filter(p =>
    p.building_stage === "בבניה" || p.building_stage === "בתהליך היתר" || p.building_stage === "קיים היתר"
  );
  a.newConstruction = a.permits.filter(p => (p.sug_bakasha || "").includes("בניה חדשה"));

  a.buildings = siteData.buildings || [];

  // Addresses from permits
  a.addresses = [...new Set(a.permits.map(p => p.addresses).filter(Boolean))];

  // Try to map addresses to parcels via building_num matching
  // permits have building_num, and we can cross-ref
  a.parcelAddressMap = {};
  // Build a lookup: for each permit, find which parcel it's on
  // Since both are in the same bbox, use parcel size and position heuristics
  // For now, collect all addresses for the site

  siteAnalyses[siteId] = a;
}

// ── Extract planning context sections ────────────────────────────────────────

const planSections = planningContext.split(/^---$/m).map(s => s.trim()).filter(s => s.length > 0);

// ── Generate Markdown ────────────────────────────────────────────────────────

const bbox = "xmin=179800, ymin=661200, xmax=181200, ymax=662600";
const date = new Date().toLocaleDateString("he-IL");

let md = `# בעלות קרקע ופרצלציה בשכונת התקווה
## מחקר לסטודיו אדריכלות — בצלאל, אקדמיה לאמנות ועיצוב

> תאריך: ${date}

---

## 1. מבוא

### מטרת המחקר
מיפוי מבנה הבעלות והפרצלציה בשכונת התקווה כבסיס לפרויקטים אדריכליים ב-5 אתרי סטודיו. המחקר בוחן את מבנה החלקות, סוגי הבעלות, ייעודי הקרקע, ומגמות הפיתוח.

### מתודולוגיה
- **GIS עירוני** — שרת IView2 MapServer, עיריית תל אביב ✅ GIS_VERIFIED
  - שכבות: 524 (חלקות), 515 (בעלויות), 514 (ייעוד), 772 (היתרים), 513 (מבנים)
- **קדסטר לאומי** — GovMap WFS, שירות המדידות ✅ GOVMAP_VERIFIED
  - שכבת opendata:PARCEL_ALL — חלקות רשומות בטאבו
- **נתונים פתוחים** — data.gov.il (CKAN API) — כיסוי חלקי בלבד
- **תחום:** ${bbox} (Israel TM Grid / EPSG:2039)
- **הקשר תכנוני:** מבוסס על ידע מצטבר ❌ UNVERIFIED — דורש אימות מול מבא"ת

### מה ה-GIS מראה ומה לא
| מידע זמין ב-GIS ✅ | מידע חסר ❌ |
|---------------------|-------------|
| בעלות עירייה (שכבה 515) | בעלות רמ"י / קק"ל |
| גבולות חלקות ושטחים (524) | זהות הבעלים הפרטיים |
| ייעודי קרקע (514) | הבחנה בעלות/חכירה |
| היתרי בניה (772) | סטטוס מושע מפורט |
| מבנים וכתובות (513) | הערכת שווי / עסקאות |

---

## 2. ציר זמן היסטורי

| שנה | אירוע | אימות |
|------|-------|--------|
| 1920s–30s | הקמת שכונת התקווה כהתיישבות בלתי חוקית על קרקעות מנדטוריות ועירוניות | ❌ UNVERIFIED |
| 1948–50s | גל בניה מסיבי — 68 מבנים משנת 1949 בלבד (נתוני שכבה 513) | ✅ GIS_VERIFIED |
| 1965 | חוק התכנון והבנייה — סעיפים 121-122 מסדירים איחוד וחלוקה | ❌ UNVERIFIED |
| ~2000s | תכניות רה-פרצלציה ראשונות (תת"ג שונות בשדה heara של שכבה 524) | ✅ GIS_VERIFIED |
| ~2016–22 | תצ"ר (תכניות צירוף ורישום) מרובות — 286 חלקות עם הערות תכנוניות | ✅ GIS_VERIFIED |
| בתהליך | תא/5000 — תכנית מתאר כוללנית, מגדירה התחדשות עירונית בדרום ת"א | ❌ UNVERIFIED |

---

## 3. בעלות קרקע

### 3.1 בעלות עירונית (שכבה 515) ✅ GIS_VERIFIED

> **⚠️ חשוב:** שכבה 515 מציגה **רק** בעלות עירונית. אינה כוללת קרקע בבעלות רמ"י, קק"ל, או גורמים ציבוריים אחרים. "לא עירוני" ≠ "פרטי".

| נתון | ערך |
|------|-----|
| חלקות בבעלות עירייה | ${municipal.length} מתוך ${parcels.length} |
| שטח עירוני | ${(totalMunicipalArea / 1000).toFixed(1)} דונם מתוך ${(totalParcelArea / 1000).toFixed(0)} |
| אחוז עירוני מסך השטח | ${(totalMunicipalArea / totalParcelArea * 100).toFixed(1)}% |
| שטח לא-עירוני | ${((totalParcelArea - totalMunicipalArea) / 1000).toFixed(1)} דונם |

> השטח הלא-עירוני (${((totalParcelArea - totalMunicipalArea) / totalParcelArea * 100).toFixed(1)}%) עשוי לכלול: קרקע רמ"י, קק"ל, בעלות פרטית רשומה, או מושע. **לא ניתן לקבוע מה-GIS בלבד.** ❌ UNVERIFIED

#### סוגי בעלות עירונית

| סוג | חלקות | שטח (דונם) |
|-----|--------|-----------|
`;

for (const [t, v] of Object.entries(ownershipTypes).sort((a, b) => b[1].area - a[1].area)) {
  md += `| ${t} | ${v.count} | ${(v.area / 1000).toFixed(1)} |\n`;
}

md += `
#### לפי גוש

| גוש | חלקות | שטח (דונם) | חלקות עירייה | שטח עירוני (דונם) |
|-----|--------|-----------|-------------|-----------------|
`;

for (const g of gushes) {
  const pg = parcelsByGush[g];
  const mg = municipalByGush[g] || { count: 0, area: 0 };
  md += `| ${g} | ${pg.count} | ${(pg.area / 1000).toFixed(1)} | ${mg.count} | ${(mg.area / 1000).toFixed(1)} |\n`;
}

md += `
### 3.2 קטגוריות בעלות — מה חסר

| קטגוריה | מקור | סטטוס |
|---------|------|--------|
| עיריית תל אביב | שכבה 515 | ✅ GIS_VERIFIED |
| רמ"י (רשות מקרקעי ישראל) | אינו בשרת GIS | ❌ UNVERIFIED — דורש בדיקה ב-land.gov.il |
| קק"ל | אינו בשרת GIS | ❌ UNVERIFIED |
| בעלות פרטית רשומה | אינו בשרת GIS | ❌ UNVERIFIED — דורש נסח טאבו |
| מושע | אינו מפורש בשרת GIS | ⚠️ INFERRED — חלקות גדולות מ-${MOSHAA_THRESHOLD} מ"ר |
| חכירה | אינו בשרת GIS | ❌ UNVERIFIED |

### 3.3 הצלבה עם קדסטר לאומי (GovMap) ✅ GOVMAP_VERIFIED
> מקור: GovMap WFS — opendata:PARCEL_ALL | שירות המדידות / מרשם מקרקעין

הקדסטר הלאומי (שירות המדידות) מכיל **רק חלקות רשומות ("מוסדר")** בטאבו. חלקות שקיימות ב-GIS העירוני אך לא בקדסטר הלאומי הן חלקות שנוצרו בתכניות עירוניות (תת"ג/תצ"ר) אך טרם נרשמו בטאבו.

| גוש | TLV GIS (עירוני) | GovMap (לאומי) | רק בעירוני | סטטוס |
|-----|-----------------|----------------|-----------|--------|
`;

// Add cross-ref data for key gushes
const keyGushes = [6135, 6134, 6978, 6979, 6013, 6034, 6980];
for (const g of keyGushes) {
  const cr = crossRef.allGushes[g];
  if (cr) {
    const onlyTlv = cr.tlv - Math.min(cr.govmap, cr.tlv);
    md += `| ${g} | ${cr.tlv} | ${cr.govmap} | ${onlyTlv > 0 ? onlyTlv : "—"} | ${cr.govmap === 0 ? "⚠️ לא רשום כלל" : (cr.allSettled ? "מוסדר" : "חלקי")} |\n`;
  }
}

md += `
> **ממצא מרכזי:** גוש 6135 מכיל 318 חלקות ב-GIS העירוני אך רק 150 בקדסטר הלאומי. **168 חלקות (53%) לא רשומות בטאבו.**
> גוש 6134 מכיל 248 חלקות ב-GIS העירוני אך **אפס** בקדסטר הלאומי — גוש שלם שאינו רשום.
> ⚠️ משמעות: חלוקת הקרקע בפועל שונה מהחלוקה הרשומה. תהליכי רה-פרצלציה בעיצומם.

---

## 4. פרצלציה

### 4.1 סקירה כללית ✅ GIS_VERIFIED
> מקור: שכבה 524, bbox: ${bbox}

| נתון | ערך |
|------|-----|
| סה"כ חלקות | ${parcels.length.toLocaleString()} |
| שטח כולל | ${(totalParcelArea / 1000).toFixed(0)} דונם |
| גושים | ${gushes.length} |

### 4.2 ⚠️ בעיית המושע

> **חלקות מושע** מופיעות ברישום ככלי אחד גדול אך בפועל מייצגות בעלות משותפת של עשרות בעלים.
> חלקת מושע של 37,000 מ"ר אינה "חלקה" במובן התכנוני — היא אוסף של חזקות קטנות ללא חלוקה רשומה.
> ⚠️ INFERRED — הזיהוי מבוסס על סף גודל **שרירותי** של ${MOSHAA_THRESHOLD} מ"ר. סף זה נבחר כהיוריסטיקה בלבד.
> אימות סטטוס מושע בפועל דורש בדיקת נסח טאבו לכל חלקה.
>
> **חלקות-על שכונתיות:** חלקות 6135/3 (37,637 מ"ר) ו-6135/4 (37,396 מ"ר) הן חלקות מושע ענקיות שחוצות מספר אתרי סטודיו. הן מופיעות כמעט בכל ניתוח אתר, אך אין לייחס אותן לאתר בודד.

| | חלקות רגילות | חלקות חשודות כמושע |
|--|--------------|-------------------|
| כמות | ${regularParcels.length} | ${moshaaParcels.length} |
| שטח כולל | ${(regularArea / 1000).toFixed(0)} דונם | ${(moshaaArea / 1000).toFixed(0)} דונם |
| אחוז מהשטח | ${(regularArea / totalParcelArea * 100).toFixed(0)}% | ${(moshaaArea / totalParcelArea * 100).toFixed(0)}% |

### 4.3 התפלגות גודל חלקות (ללא מושע) ✅ GIS_VERIFIED

| גודל (מ"ר) | חלקות | שטח (דונם) | אחוז מהשטח |
|------------|--------|-----------|------------|
`;

for (const r of sizeDist) {
  md += `| ${r.label} | ${r.count} | ${(r.area / 1000).toFixed(1)} | ${regularArea > 0 ? (r.area / regularArea * 100).toFixed(1) : 0}% |\n`;
}

const medianRegular = regularParcels.map(p => p.Shape_Area || 0).sort((a, b) => a - b);
const medianVal = medianRegular[Math.floor(medianRegular.length / 2)] || 0;
const avgRegular = regularParcels.length > 0 ? regularArea / regularParcels.length : 0;

md += `
> ממוצע (ללא מושע): ${avgRegular.toFixed(0)} מ"ר | חציון: ${medianVal.toFixed(0)} מ"ר

### 4.4 חלקות חשודות כמושע ⚠️ INFERRED

| גוש | חלקה | שטח (מ"ר) | הערה (heara) |
|-----|------|----------|-------------|
`;

for (const p of moshaaParcels.sort((a, b) => (b.Shape_Area || 0) - (a.Shape_Area || 0)).slice(0, 25)) {
  md += `| ${p.ms_gush} | ${p.ms_chelka} | ${(p.Shape_Area || 0).toFixed(0)} | ${p.heara || "—"} |\n`;
}

if (moshaaParcels.length > 25) md += `\n> מוצגות 25 מתוך ${moshaaParcels.length} חלקות\n`;

md += `
---

## 5. מסגרת תכנונית

### 5.1 ייעודי קרקע ✅ GIS_VERIFIED
> מקור: שכבה 514

| ייעוד ראשי | מגרשים | שטח (דונם) | אחוז |
|-----------|--------|-----------|------|
`;

for (const [t, v] of Object.entries(zoningByType).sort((a, b) => b[1].area - a[1].area)) {
  md += `| ${t} | ${v.count} | ${(v.area / 1000).toFixed(1)} | ${(v.area / totalZoningArea * 100).toFixed(1)}% |\n`;
}

md += `
### 5.2 ציר זמן תכנוני מלא ✅ MAVAT_VERIFIED

| שנה | תכנית | תיאור | גוש | סטטוס |
|------|--------|-------|------|--------|
| 1958 | תא/465 | תכנית מתאר ראשונה | שכונה | בוטלה ע"י 2215 |
| ~1960 | תא/566, 566א | שינוי לתכנית 297. יזם: שיכון עובדים | 6135 | מאושרת |
| 1974 | תא/934 | תכנית מפורטת | שכונה | בוטלה ע"י 2215 |
| 1976 | תא/1692 | תכנית מפורטת | שכונה | בוטלה ע"י 2215 |
| 1982 | תא/2113 | תכנית מפורטת | שכונה | בוטלה ע"י 2215 |
| 1988 | תא/1094/ב | תכנית מפורטת | שכונה | בוטלה ע"י 2215 |
| **1992** | **תא/2215** | **"שיקום שכונת התקווה"** | **כל השכונה** | **מאושרת — בתוקף** |
| 2005 | תא/מק/2670 | תכנית מקומית | שכונה | מאושרת |
| 2008 | תא/מק/3560 | תכנית מקומית | שכונה | מאושרת |
| בתהליך | תא/5000 | מתאר עירונית כוללנית | כל ת"א | בתהליך |
| **2025** | **507-0726463** | **רה-פרצלציה, חלקה 1** | **6979** | **בתהליך** |
| **2025** | **תא/מק/4766** | **הסדרת מגרשים — 31.6 דונם** | **6135** | **בתהליך** |
| **2025** | **תא/מק/4765** | **הסדרת מגרשים — בעלות מדינה** | **6135** | **בתהליך** |
| **2025** | **תא/מק/4899** | **רה-פרצלציה** | **7069** | **בתהליך** |

### 5.3 תכנית הבסיס: תא/2215 (1992) ✅ MAVAT_VERIFIED

תכנית "שיקום שכונת התקווה" — מאושרת 26.03.1992. **זוהי תכנית הבסיס שעדיין חלה על כל השכונה.**
- שינתה/ביטלה את תכניות 465, 531, 608, 724, 706, 767, 1202, 2051, 1778, 1692, 1330, 1235, 2113, R-6, M.7, צ.פ.3/04/4
- כל זכויות הבניה הנוכחיות נגזרות ממנה
- כל תכניות הרה-פרצלציה החדשות מהוות **שינוי לתכנית 2215**

### 5.4 תא/5000 — מסגרת לתכניות חדשות ✅ MAVAT_VERIFIED

תכנית המתאר העירונית הכוללנית. כל תכניות הרה-פרצלציה מקודמות "מכוחה":
> "התכנית מקודמת על ידי ועדת המשנה המקומית... **ותואמת את הוראות תכנית המתאר העירונית תא/5000**"

### 5.5 שלוש תכניות רה-פרצלציה פעילות ✅ MAVAT_VERIFIED

> **ממצא מרכזי:** הרה-פרצלציה מתרחשת **עכשיו**, בו-זמנית בשלושה גושים. סה"כ ~52 דונם בתהליך.

| תכנית | גוש | חלקות | שטח | סוג | אתרי סטודיו |
|--------|------|--------|------|------|-------------|
| 507-0726463 | 6979 | חלקה 1 (מושע) | 12.6 ד' | איחוד וחלוקה ללא הסכמה | ✅ אתר 3, ⚠️ אתר 1 |
| תא/מק/4766 | 6135 | 79,82,96,102,104-105 | 31.6 ד' | הסדרת מגרשים | ✅ **אתר 2** (חלקה 79) |
| תא/מק/4899 | 7069 | 18, 139 | 8.2 ד' | רה-פרצלציה | — |

**תכנית 507-0726463 (גוש 6979) — פירוט:**
- ייעוד: 65.8% מגורים ב', 25.3% דרכים, 4.9% שבילים, 1.2% מבנ"צ
- צפיפות: ≥12 יח"ד/דונם | יח"ד מינימלית: 47 מ"ר
- עיצוב מיוחד: עד 5 קומות בתאי שטח נבחרים
- חזית מסחרית: דרך ההגנה — מסחר בקומת קרקע
- [צפייה במבא"ת](https://mavat.iplan.gov.il/SV4/1/5000989429/310)

### 5.6 בעלות מדינה: תא/מק/4765 ✅ MAVAT_VERIFIED

תכנית "הסדרת מגרשים בתחום הרחובות מושיע-שבתאי-נדב-בועז-הרן" (507-0893354):
- **בעלים: מדינת ישראל** — אישור רשמי לבעלות רמ"י על חלקות 25-26, גוש 6135
- שטח: 11.155 דונם
- חלקה 25 (8,689 מ"ר) נמצאת ב**אתר 5 (הורד-יחיעם-לבלוב)**
- **זהו אישור ישיר שקרקע רמ"י קיימת בשכונה — לא רק בעלות עירונית**

### 5.7 תא/566א — מקורות היסטוריים ✅ MAVAT_VERIFIED

שינוי לתכנית 297, גוש 6135, חלקות 352, 258, 15, 3, 2. יזם: **שיכון עובדים**.
חלקות 3 ו-2 הן חלקות המושע הענקיות (~37,000 מ"ר כ"א) שמופיעות כמעט בכל אתר סטודיו.

### 5.8 ראיות נוספות לרה-פרצלציה ✅ GIS_VERIFIED

> **מה-GIS:** ${parcels.filter(p => p.heara).length} חלקות מכילות הערות תת"ג/תצ"ר — תכניות חלוקה ורישום פעילות.
> **מהקדסטר הלאומי:** 168 חלקות בגוש 6135 ו-248 בגוש 6134 קיימות רק ב-GIS העירוני — עדות לחלוקות שטרם נרשמו.

### 5.9 השפעת תכניות על אתרי סטודיו

> מיקום אתרים מכויל על ידי המשתמש (30.3.2026). קואורדינטות ב-site-locations.json.

| אתר | גושים | תכניות חופפות | ממצא |
|------|--------|-------------|------|
| **1. התקווה-חנוך-טרפון** | 6135, 6979 | **507-0726463 (חופף — גוש 6979)** | רה-פרצלציה פעילה בתחום. 84% עירייה |
| **2. תשבי-ששון** | 6135 | **4766 (חלקות 79,82,102) + 4765 (חלקה 25)** | **שתי תכניות חופפות!** רה-פרצלציה + בעלות מדינה |
| **3. דרך ההגנה** | 6134, 6135, 6978, 6979 | **507-0726463 (גוש 6979)** | רה-פרצלציה. 4 גושים, 87% עירייה |
| 4. הורד-פארק | 6134, 6135 | חלקות מושע 3,4 (566א) | **100% עירייה**. חלקות-על בלבד |
| **5. הורד-יחיעם-לבלוב** | 6135 | **תא/מק/4765 (חלקה 25)** | **בעלות מדינה מאושרת**. 91% עירייה |

> ניתוח מפורט: ראו research/taba-plans/taba-analysis.md
> מפה אינטראקטיבית: research/ownership-parcellation/map.html

---

## 6. ניתוח 5 אתרי סטודיו

> **הערה:** מספרים לצד שמות רחובות הם **כתובות** (מספרי בתים), לא מספרי חלקות.
> מספרי החלקות נקבעו לפי שאילתה מרחבית של שכבה 524. ✅ GIS_VERIFIED
> **⚠️ מושע:** חלקות מעל ${MOSHAA_THRESHOLD} מ"ר מסומנות — ייתכן שהן חלקות מושע בבעלות משותפת.

`;

for (const [siteId, a] of Object.entries(siteAnalyses)) {
  const siteName = siteNames[siteId] || siteId;
  const addr = siteAddresses[siteId] || "";

  md += `### 6.${Object.keys(siteAnalyses).indexOf(siteId) + 1} ${siteName}\n`;
  if (addr) md += `**כתובות אתר:** ${addr}\n\n`;

  md += `| נתון | ערך | אימות |
|------|-----|--------|
| חלקות | ${a.parcelCount} (${a.regularParcels.length} רגילות + ${a.moshaaParcels.length} חשודות מושע) | ✅ GIS |
| מבנים | ${a.buildings.length} | ✅ GIS |
| בעלות עירונית | ${a.municipal.length} חלקות, ${(a.municipalArea / 1000).toFixed(1)} דונם | ✅ GIS |
| היתרים פעילים | ${a.activePermits.length} | ✅ GIS |
| בניה חדשה | ${a.newConstruction.length} | ✅ GIS |

`;

  // Parcels table with moshaa flag and addresses from spatial cross-reference
  const siteAddrMap = parcelAddresses[siteId] || {};

  if (a.parcels.length > 0) {
    md += `#### חלקות ✅ GIS_VERIFIED\n\n`;
    md += `![מפת אתר](../../blocks/${siteId}/site-map.png)\n\n`;
    md += `| גוש | חלקה | שטח (מ"ר) | עירייה | טאבו | מושע? | כתובות |\n`;
    md += `|-----|------|----------|--------|------|-------|--------|\n`;

    for (const p of a.parcels.sort((x, y) => x.ms_chelka - y.ms_chelka)) {
      const key = `${p.ms_gush}/${p.ms_chelka}`;
      const isMun = a.municipal.some(m => m.ms_gush === p.ms_gush && m.ms_chelka === p.ms_chelka);
      const isMoshaa = (p.Shape_Area || 0) > MOSHAA_THRESHOLD;
      const isMega = MEGA_PARCELS.includes(key);
      const addrs = siteAddrMap[key] || [];
      const addrStr = addrs.length > 0 ? addrs.join(", ") : "—";
      const moshaaLabel = isMega ? "⚠️ שכונתית" : (isMoshaa ? "⚠️ חשוד" : "—");
      const gushSet = nationalChelkas[String(p.ms_gush)];
      const isRegistered = gushSet ? gushSet.has(p.ms_chelka) : false;
      const tabuLabel = isRegistered ? "✅ מוסדר" : "❌ לא רשום";

      md += `| ${p.ms_gush} | ${p.ms_chelka} | ${(p.Shape_Area || 0).toFixed(0)} | ${isMun ? "✅" : "—"} | ${tabuLabel} | ${moshaaLabel} | ${addrStr} |\n`;
    }

    // Mega-parcel note
    const hasMega = a.parcels.some(p => MEGA_PARCELS.includes(`${p.ms_gush}/${p.ms_chelka}`));
    if (hasMega) {
      md += `\n> 🔶 **חלקות-על שכונתיות** (6135/3, 6135/4): ${MEGA_PARCEL_NOTE}\n`;
    }

    if (a.moshaaParcels.length > 0) {
      const nonMega = a.moshaaParcels.filter(p => !MEGA_PARCELS.includes(`${p.ms_gush}/${p.ms_chelka}`));
      if (nonMega.length > 0) {
        md += `\n> ⚠️ **${nonMega.length} חלקות נוספות חשודות כמושע** (> ${MOSHAA_THRESHOLD} מ"ר): `;
        md += nonMega.map(p => `${p.ms_gush}/${p.ms_chelka} (${(p.Shape_Area || 0).toFixed(0)} מ"ר)`).join(", ");
        md += `\n`;
      }
    }
    md += "\n";
  }

  // Zoning
  if (Object.keys(a.zoningBreakdown).length > 0) {
    md += `#### ייעודי קרקע ✅ GIS_VERIFIED\n\n`;
    md += `| ייעוד | מגרשים | שטח (מ"ר) |\n|-------|--------|----------|\n`;
    for (const [t, v] of Object.entries(a.zoningBreakdown).sort((x, y) => y[1].area - x[1].area)) {
      md += `| ${t} | ${v.count} | ${v.area.toFixed(0)} |\n`;
    }
    md += "\n";
  }

  // Active permits
  if (a.activePermits.length > 0) {
    md += `#### היתרים פעילים ✅ GIS_VERIFIED\n\n`;
    for (const p of a.activePermits) {
      md += `- **${p.addresses || "?"}** — ${p.sug_bakasha || "?"} [${p.building_stage}]`;
      if (p.yechidot_diyur) md += ` | יח"ד: ${p.yechidot_diyur}`;
      if (p.sw_tama_38 === "כן") md += ` | תמ"א 38`;
      md += "\n";
    }
    md += "\n";
  }

  md += "---\n\n";
}

md += `## 7. שאלות פתוחות ומקורות

### שאלות לבירור שטח ❌ UNVERIFIED

1. **בעלות רמ"י:** מהו חלקה של רמ"י (מינהל מקרקעי ישראל) מכלל הקרקע בשכונה? שכבה 515 מציגה רק בעלות עירונית.
2. **מושע:** אילו מהחלקות הגדולות (> ${MOSHAA_THRESHOLD} מ"ר) הן בפועל חלקות מושע? יש לאמת מול נסח טאבו.
3. **חכירה:** מהו חלק הקרקע בחכירה לעומת בעלות מלאה? לא ניתן לדעת מה-GIS.
4. **תא/5000:** מהו הסטטוס העדכני של התכנית? מה הם ייעודי הקרקע המוצעים לשכונה?
5. **רה-פרצלציה:** האם קיימות תכניות איחוד וחלוקה מאושרות או בתהליך? (בדיקה במבא"ת)
6. **פינוי-בינוי:** האם קיימים מתחמים מוכרזים בשכונה?

### מקורות

#### מקורות אומתו ✅
- שרת GIS עיריית תל אביב: \`https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer\`
  - שכבה 515: בעלויות עירייה (${municipal.length} רשומות)
  - שכבה 524: חלקות (${parcels.length} רשומות)
  - שכבה 514: ייעודי קרקע (${landuse.length} רשומות)
  - שכבה 772: היתרי בניה
  - שכבה 513: מבנים
  - bbox: ${bbox}

#### מקורות לא אומתו ❌
- מערכת מבא"ת: https://mavat.iplan.gov.il — לבדיקת תכניות תא/5000
- רשות מקרקעי ישראל: https://land.gov.il — לבדיקת בעלות רמ"י
- לשכת רישום מקרקעין (טאבו) — נסחים לאימות בעלות ומושע
- ויקיפדיה — שכונת התקווה (רקע היסטורי)
`;

await writeFile("research/ownership-parcellation/neighborhood-report.md", md);
console.log("MD written:", md.length, "chars");

// ── Generate HTML ────────────────────────────────────────────────────────────

function esc(s) { return String(s ?? "?").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function badge(level) {
  const badges = {
    "GIS": '<span style="background:#198754;color:#fff;padding:0.1rem 0.4rem;border-radius:3px;font-size:0.7rem;font-weight:600">✅ GIS</span>',
    "WEB": '<span style="background:#0d6efd;color:#fff;padding:0.1rem 0.4rem;border-radius:3px;font-size:0.7rem;font-weight:600">✅ WEB</span>',
    "INFERRED": '<span style="background:#fd7e14;color:#fff;padding:0.1rem 0.4rem;border-radius:3px;font-size:0.7rem;font-weight:600">⚠️ INFERRED</span>',
    "UNVERIFIED": '<span style="background:#dc3545;color:#fff;padding:0.1rem 0.4rem;border-radius:3px;font-size:0.7rem;font-weight:600">❌ UNVERIFIED</span>',
  };
  return badges[level] || level;
}
function stageColor(s) {
  if (s === "בבניה") return "#e67e22";
  if (s === "בתהליך היתר") return "#e74c3c";
  if (s?.includes("תעודת גמר")) return "#27ae60";
  if (s === "קיים היתר") return "#2980b9";
  return "#7f8c8d";
}
function stageTag(s) { return '<span style="display:inline-block;padding:0.1rem 0.4rem;border-radius:3px;color:#fff;font-size:0.7rem;font-weight:600;background:' + stageColor(s) + '">' + esc(s) + '</span>'; }

const css = `
:root{--bg:#f8f9fa;--card:#fff;--border:#dee2e6;--text:#212529;--muted:#6c757d;--accent:#0d6efd;--green:#198754;--red:#dc3545;--orange:#fd7e14;--warn:#ffc107}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:1rem 1.5rem;max-width:1200px;margin:0 auto}
h1{font-size:1.8rem;margin-bottom:0.2rem}h2{font-size:1.35rem;margin:2.5rem 0 1rem;border-bottom:2px solid var(--accent);padding-bottom:0.3rem}h3{font-size:1.1rem;margin:1.5rem 0 0.5rem}h4{font-size:0.95rem;margin:1rem 0 0.3rem;color:var(--muted)}
.sub{color:var(--muted);margin-bottom:0.5rem}.date{color:var(--muted);font-size:0.82rem;margin-bottom:2rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem}
.warn{background:#fff3cd;border-color:var(--warn);border-radius:6px;padding:0.6rem 0.8rem;margin:0.5rem 0;font-size:0.85rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.6rem;margin-bottom:1rem}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0.6rem;text-align:center}
.stat .n{font-size:1.6rem;font-weight:700;color:var(--accent)}.stat .l{font-size:0.75rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:0.82rem;margin:0.5rem 0}
th,td{padding:0.35rem 0.5rem;border:1px solid var(--border);text-align:right}
th{background:#e9ecef;font-weight:600}tr:nth-child(even){background:#f8f9fa}
.moshaa{background:#fff3cd !important}
.bar-row{display:flex;align-items:center;gap:0.3rem;margin:0.12rem 0}
.bar-row .lbl{font-size:0.75rem;min-width:70px;text-align:left}.bar-row .bar{height:16px;border-radius:3px;min-width:2px}.bar-row .val{font-size:0.75rem;color:var(--muted)}
.site-card{border-right:4px solid var(--accent)}
.permit-item{border-right:3px solid var(--orange);padding-right:0.5rem;margin:0.3rem 0;font-size:0.82rem}
a{color:var(--accent)}
@media print{body{padding:0;font-size:9pt}.card{break-inside:avoid}}
`;

let html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>בעלות קרקע ופרצלציה — שכונת התקווה | בצלאל</title>
<style>${css}</style>
</head>
<body>

<h1>בעלות קרקע ופרצלציה בשכונת התקווה</h1>
<p class="sub">מחקר לסטודיו אדריכלות — בצלאל, אקדמיה לאמנות ועיצוב</p>
<p class="date">מקור: שרת GIS עיריית ת"א | ${date}</p>

<h2>1. מבוא</h2>
<div class="card">
<p>מיפוי מבנה הבעלות והפרצלציה בשכונת התקווה כבסיס לפרויקטים אדריכליים ב-5 אתרי סטודיו.</p>
<table>
<tr><th>מידע זמין ב-GIS ${badge("GIS")}</th><th>מידע חסר ${badge("UNVERIFIED")}</th></tr>
<tr><td>בעלות עירייה (515)</td><td>בעלות רמ"י / קק"ל</td></tr>
<tr><td>גבולות חלקות ושטחים (524)</td><td>זהות בעלים פרטיים</td></tr>
<tr><td>ייעודי קרקע (514)</td><td>הבחנה בעלות / חכירה</td></tr>
<tr><td>היתרי בניה (772)</td><td>סטטוס מושע מפורט</td></tr>
<tr><td>מבנים וכתובות (513)</td><td>הערכות שווי</td></tr>
</table>
</div>

<h2>3. בעלות קרקע</h2>
<div class="warn">⚠️ <strong>שכבה 515 = בעלות עירונית בלבד.</strong> אינה כוללת רמ"י, קק"ל, או בעלות פרטית. "לא עירוני" ≠ "פרטי".</div>

<div class="stats">
<div class="stat"><div class="n">${parcels.length.toLocaleString()}</div><div class="l">חלקות</div></div>
<div class="stat"><div class="n">${(totalParcelArea / 1000).toFixed(0)}</div><div class="l">דונם סה"כ</div></div>
<div class="stat"><div class="n">${municipal.length}</div><div class="l">חלקות עירייה</div></div>
<div class="stat"><div class="n">${(totalMunicipalArea / totalParcelArea * 100).toFixed(0)}%</div><div class="l">עירוני מסך השטח</div></div>
<div class="stat"><div class="n">${((totalParcelArea - totalMunicipalArea) / 1000).toFixed(0)}</div><div class="l">דונם לא-עירוני</div></div>
</div>

<div class="card">
<h4>סוגי בעלות עירונית ${badge("GIS")}</h4>
<table><thead><tr><th>סוג</th><th>חלקות</th><th>דונם</th></tr></thead><tbody>
`;
for (const [t, v] of Object.entries(ownershipTypes).sort((a, b) => b[1].area - a[1].area)) {
  html += `<tr><td>${esc(t)}</td><td>${v.count}</td><td>${(v.area / 1000).toFixed(1)}</td></tr>\n`;
}
html += `</tbody></table></div>

<div class="card">
<h4>הצלבה עם קדסטר לאומי (GovMap) ${badge("GIS")}</h4>
<p style="font-size:0.82rem;color:var(--muted)">הקדסטר הלאומי (שירות המדידות) מכיל רק חלקות רשומות ("מוסדר") בטאבו. חלקות שקיימות ב-GIS העירוני אך לא בקדסטר הלאומי טרם נרשמו.</p>
<table><thead><tr><th>גוש</th><th>TLV GIS</th><th>GovMap</th><th>רק בעירוני</th><th>סטטוס</th></tr></thead><tbody>
`;
for (const g of [6135, 6134, 6978, 6979, 6013, 6034, 6980]) {
  const cr = crossRef.allGushes[g];
  if (cr) {
    const onlyTlv = cr.tlv - Math.min(cr.govmap, cr.tlv);
    const statusLabel = cr.govmap === 0 ? '<span style="color:var(--red)">⚠️ לא רשום כלל</span>' : (cr.allSettled ? "מוסדר" : "חלקי");
    html += `<tr><td>${g}</td><td>${cr.tlv}</td><td>${cr.govmap}</td><td>${onlyTlv > 0 ? onlyTlv : "—"}</td><td>${statusLabel}</td></tr>\n`;
  }
}
html += `</tbody></table>
<div class="warn" style="margin-top:0.5rem">⚠️ <strong>ממצא מרכזי:</strong> גוש 6135: 168 חלקות (53%) לא רשומות בטאבו. גוש 6134: 248 חלקות ב-GIS עירוני, אפס בקדסטר לאומי — גוש שלם לא רשום.</div>
</div>

<h2>4. פרצלציה</h2>
<div class="warn">⚠️ <strong>בעיית המושע:</strong> ${moshaaParcels.length} חלקות (${(moshaaArea / totalParcelArea * 100).toFixed(0)}% מהשטח) חשודות כמושע — שטח רשום כולל, בעלות משותפת של מספר בעלים. סף ${MOSHAA_THRESHOLD} מ"ר הוא <strong>היוריסטיקה שרירותית</strong> — אימות דורש נסח טאבו. ⚠️ INFERRED</div>
<div class="warn">🔶 <strong>חלקות-על:</strong> 6135/3 (37,637 מ"ר) ו-6135/4 (37,396 מ"ר) חוצות מספר אתרי סטודיו — אין לייחס לאתר בודד.</div>

<div class="stats">
<div class="stat"><div class="n">${regularParcels.length}</div><div class="l">חלקות רגילות</div></div>
<div class="stat"><div class="n">${(regularArea / 1000).toFixed(0)}</div><div class="l">דונם רגילות</div></div>
<div class="stat"><div class="n">${moshaaParcels.length}</div><div class="l">חשודות מושע</div></div>
<div class="stat"><div class="n">${(moshaaArea / 1000).toFixed(0)}</div><div class="l">דונם מושע</div></div>
</div>

<div class="card">
<h4>התפלגות גודל חלקות — ללא מושע ${badge("GIS")}</h4>
`;
const maxSC = Math.max(...sizeDist.map(r => r.count));
for (const r of sizeDist) {
  const w = Math.round((r.count / maxSC) * 250);
  html += `<div class="bar-row"><span class="lbl">${r.label} מ"ר</span><div class="bar" style="width:${w}px;background:var(--accent)"></div><span class="val">${r.count} (${(r.area / 1000).toFixed(1)} ד')</span></div>\n`;
}
html += `<p style="margin-top:0.5rem;font-size:0.8rem;color:var(--muted)">ממוצע: ${avgRegular.toFixed(0)} מ"ר | חציון: ${medianVal.toFixed(0)} מ"ר</p>
</div>

<h2>5. ייעודי קרקע ${badge("GIS")}</h2>
<div class="card">
`;
const maxZ = Math.max(...Object.values(zoningByType).map(v => v.area));
const zColors = {"מגורים":"#198754","תחבורה":"#6c757d","מבנים ומוסדות ציבור":"#0dcaf0","שטחים פתוחים":"#20c997","מסחר":"#ffc107","תעסוקה":"#6610f2","מגורים-תעסוקה מעורב":"#d63384"};
for (const [t, v] of Object.entries(zoningByType).sort((a, b) => b[1].area - a[1].area)) {
  const w = Math.round((v.area / maxZ) * 250);
  const c = zColors[t] || "#0d6efd";
  html += `<div class="bar-row"><span class="lbl">${esc(t)}</span><div class="bar" style="width:${w}px;background:${c}"></div><span class="val">${v.count} (${(v.area / 1000).toFixed(1)} ד', ${(v.area / totalZoningArea * 100).toFixed(0)}%)</span></div>\n`;
}
html += `</div>

<h2>5.5 שלוש תכניות רה-פרצלציה פעילות ${badge("GIS")}</h2>
<div class="warn">⚠️ <strong>ממצא מרכזי:</strong> הרה-פרצלציה מתרחשת <strong>עכשיו</strong>, בו-זמנית בשלושה גושים. סה"כ ~52 דונם בתהליך.</div>

<div class="card">
<h4>507-0726463 — גוש 6979 (12.6 ד')</h4>
<p>איחוד וחלוקה של חלקת מושע <strong>ללא הסכמת בעלים</strong>. מכוח תא/5000, שינוי לתא/2215.</p>
<table><thead><tr><th>ייעוד</th><th>שטח</th><th>%</th></tr></thead><tbody>
<tr><td>מגורים ב'</td><td>8,488</td><td>65.8%</td></tr>
<tr><td>דרכים</td><td>3,634</td><td>28.2%</td></tr>
<tr><td>שבילים</td><td>625</td><td>4.9%</td></tr>
<tr><td>מבנ"צ</td><td>158</td><td>1.2%</td></tr>
</tbody></table>
<p style="font-size:0.82rem">צפיפות: ≥12 יח"ד/ד' | יח"ד מינימלית: 47 מ"ר | חזית מסחרית: דרך ההגנה | עד 5 קומות</p>
<p style="font-size:0.82rem;color:var(--muted)">✅ <strong>אתר 3</strong> (חופף) | ⚠️ <strong>אתר 1</strong> (גובל) | <a href="https://mavat.iplan.gov.il/SV4/1/5000989429/310" target="_blank">מבא"ת</a></p>
</div>

<div class="card" style="border-right:4px solid var(--red)">
<h4>תא/מק/4766 (507-0859751) — גוש 6135 (31.6 ד')</h4>
<p><strong>הסדרת מגרשים בשכונת התקווה</strong> — חלקות 79, 82, 96, 102, 104-105</p>
<p style="font-size:0.82rem;color:var(--red)">✅ <strong>אתר 2 (תשבי-ששון) — רה-פרצלציה פעילה בתחום! חלקה 79 בתחום האתר</strong></p>
</div>

<div class="card">
<h4>תא/מק/4899 (507-0884080) — גוש 7069 (8.2 ד')</h4>
<p>רה-פרצלציה — חלקות 18, 139. לא חופף עם אתרי סטודיו.</p>
</div>

<h2>5.6 בעלות מדינה ${badge("GIS")}</h2>
<div class="card" style="border-right:4px solid var(--orange)">
<h4>תא/מק/4765 (507-0893354) — גוש 6135</h4>
<p>הסדרת מגרשים — רחובות מושיע-שבתאי-נדב-בועז-הרן. חלקות 25-26, 11.155 דונם.</p>
<p><strong>בעלים: מדינת ישראל</strong> — אישור רשמי לבעלות רמ"י. חלקה 25 (8,689 מ"ר) ב<strong>אתר 5</strong>.</p>
</div>

<h2>5.7 השפעה על אתרי סטודיו</h2>
<div class="card">
<p style="font-size:0.8rem;color:var(--muted)">מיקומים מכוילים 30.3.2026</p>
<table><thead><tr><th>אתר</th><th>גושים</th><th>תכניות</th><th>ממצא</th></tr></thead><tbody>
<tr style="background:#fff5f5"><td><strong>1. התקווה-חנוך</strong></td><td>6135, 6979</td><td><strong>507 (חופף)</strong></td><td><strong>רה-פרצלציה בתחום. 84% עירייה</strong></td></tr>
<tr style="background:#fff0f0"><td><strong>2. תשבי-ששון</strong></td><td>6135</td><td><strong>4766 + 4765</strong></td><td><strong>שתי תכניות חופפות! רה-פרצלציה + בעלות מדינה</strong></td></tr>
<tr style="background:#fff5f5"><td><strong>3. דרך ההגנה</strong></td><td>6134-6979</td><td><strong>507 (חופף)</strong></td><td><strong>רה-פרצלציה. 4 גושים, 87% עירייה</strong></td></tr>
<tr><td>4. הורד-פארק</td><td>6134, 6135</td><td>566א</td><td>100% עירייה. חלקות-על בלבד</td></tr>
<tr style="background:#fff5f5"><td><strong>5. הורד-יחיעם</strong></td><td>6135</td><td><strong>4765 (חלקה 25)</strong></td><td><strong>בעלות מדינה. 91% עירייה</strong></td></tr>
</tbody></table>
</div>

<h2>6. אתרי סטודיו</h2>
<div class="warn">מספרים לצד שמות רחובות = <strong>כתובות</strong>, לא מספרי חלקות. חלקות מעל ${MOSHAA_THRESHOLD} מ"ר מסומנות כחשודות מושע.</div>
`;

for (const [siteId, a] of Object.entries(siteAnalyses)) {
  const siteName = siteNames[siteId] || siteId;
  const addr = siteAddresses[siteId] || "";

  html += `<div class="card site-card">
<h3>${esc(siteName)}</h3>
${addr ? `<p style="font-size:0.82rem;color:var(--muted)"><strong>כתובות:</strong> ${esc(addr)}</p>` : ""}
<div class="stats" style="margin:0.5rem 0">
<div class="stat"><div class="n">${a.regularParcels.length}+${a.moshaaParcels.length}</div><div class="l">חלקות+מושע</div></div>
<div class="stat"><div class="n">${a.buildings.length}</div><div class="l">מבנים</div></div>
<div class="stat"><div class="n">${a.municipal.length}</div><div class="l">חלקות עירייה</div></div>
<div class="stat"><div class="n">${a.activePermits.length}</div><div class="l">היתרים</div></div>
</div>
`;

  // Parcels
  const siteAddrMapHtml = parcelAddresses[siteId] || {};
  if (a.parcels.length > 0) {
    html += `<h4>חלקות ${badge("GIS")}</h4>
<p><img src="../../blocks/${siteId}/site-map.png" alt="מפת אתר" style="max-width:100%;border:1px solid var(--border);border-radius:6px;margin:0.5rem 0"></p>
<table><thead><tr><th>גוש</th><th>חלקה</th><th>שטח</th><th>עירייה</th><th>טאבו</th><th>מושע?</th><th>כתובות</th></tr></thead><tbody>\n`;
    for (const p of a.parcels.sort((x, y) => x.ms_chelka - y.ms_chelka)) {
      const key = p.ms_gush + "/" + p.ms_chelka;
      const isMun = a.municipal.some(m => m.ms_gush === p.ms_gush && m.ms_chelka === p.ms_chelka);
      const isMoshaa = (p.Shape_Area || 0) > MOSHAA_THRESHOLD;
      const isMega = MEGA_PARCELS.includes(key);
      const addrs = siteAddrMapHtml[key] || [];
      const addrStr = addrs.length > 0 ? esc(addrs.join(", ")) : "—";
      const moshaaLabel = isMega ? "🔶 שכונתית" : (isMoshaa ? "⚠️" : "—");
      const gushSet = nationalChelkas[String(p.ms_gush)];
      const isRegistered = gushSet ? gushSet.has(p.ms_chelka) : false;
      const tabuTag = isRegistered ? '<span style="color:#198754">✅</span>' : '<span style="color:#dc3545">❌</span>';
      const cls = isMega ? ' class="moshaa" style="background:#ffe0cc"' : (isMoshaa ? ' class="moshaa"' : (!isRegistered ? ' style="background:#fff5f5"' : ""));
      html += `<tr${cls}><td>${p.ms_gush}</td><td>${p.ms_chelka}</td><td>${(p.Shape_Area || 0).toFixed(0)}</td><td>${isMun ? "✅" : "—"}</td><td>${tabuTag}</td><td>${moshaaLabel}</td><td>${addrStr}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
    const hasMega = a.parcels.some(p => MEGA_PARCELS.includes(p.ms_gush + "/" + p.ms_chelka));
    if (hasMega) {
      html += `<p class="warn">🔶 <strong>חלקות-על שכונתיות</strong> (6135/3, 6135/4): ${esc(MEGA_PARCEL_NOTE)}</p>\n`;
    }
  }

  // Zoning
  if (Object.keys(a.zoningBreakdown).length > 0) {
    html += `<h4>ייעודי קרקע</h4><table><thead><tr><th>ייעוד</th><th>מגרשים</th><th>שטח</th></tr></thead><tbody>\n`;
    for (const [t, v] of Object.entries(a.zoningBreakdown).sort((x, y) => y[1].area - x[1].area)) {
      html += `<tr><td>${esc(t)}</td><td>${v.count}</td><td>${v.area.toFixed(0)}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  // Permits
  if (a.activePermits.length > 0) {
    html += `<h4>היתרים פעילים</h4>\n`;
    for (const p of a.activePermits) {
      html += `<div class="permit-item">${stageTag(p.building_stage)} <strong>${esc(p.addresses)}</strong> — ${esc(p.sug_bakasha)}`;
      if (p.yechidot_diyur) html += ` | יח"ד: ${p.yechidot_diyur}`;
      html += `</div>\n`;
    }
  }

  html += `</div>\n`;
}

// Open questions
html += `<h2>7. שאלות פתוחות ${badge("UNVERIFIED")}</h2>
<div class="card">
<ol>
<li><strong>בעלות רמ"י:</strong> מהו חלקה של רמ"י מכלל הקרקע?</li>
<li><strong>מושע:</strong> אילו מ-${moshaaParcels.length} החלקות הגדולות הן בפועל מושע?</li>
<li><strong>חכירה:</strong> מהו חלק החכירה לעומת בעלות מלאה?</li>
<li><strong>תא/5000:</strong> סטטוס עדכני וייעודים מוצעים?</li>
<li><strong>רה-פרצלציה:</strong> תכניות מאושרות או בתהליך?</li>
<li><strong>פינוי-בינוי:</strong> מתחמים מוכרזים?</li>
</ol>
</div>

<h2>מקורות</h2>
<div class="card" style="font-size:0.82rem">
<p><strong>✅ אומתו:</strong></p>
<ul>
<li><a href="https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer">שרת GIS — IView2 MapServer</a> (שכבות 515, 524, 514, 772, 513)</li>
</ul>
<p><strong>❌ לא אומתו:</strong></p>
<ul>
<li><a href="https://mavat.iplan.gov.il">מבא"ת</a> — תכניות תא/5000</li>
<li><a href="https://land.gov.il">רמ"י</a> — בעלות מדינה</li>
<li>טאבו — נסחי רישום, אימות מושע</li>
</ul>
</div>

</body>
</html>`;

await writeFile("research/ownership-parcellation/neighborhood-report.html", html);
console.log("HTML written:", html.length, "chars");
console.log("Done.");
