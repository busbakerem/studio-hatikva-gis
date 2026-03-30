import { readFile, writeFile } from "node:fs/promises";

// ── Load all data ────────────────────────────────────────────────────────────

const parcelsGJ = JSON.parse(await readFile("research/ownership-parcellation/data/parcels.geojson", "utf8"));
const municipalGJ = JSON.parse(await readFile("research/ownership-parcellation/data/municipal_land.geojson", "utf8"));
const landuseGJ = JSON.parse(await readFile("research/ownership-parcellation/data/land_use.geojson", "utf8"));
const perSite = JSON.parse(await readFile("research/ownership-parcellation/data/_per_site_data.json", "utf8"));
const planningContext = await readFile("research/ownership-parcellation/data/_planning_context.md", "utf8");

// ── Neighborhood-wide statistics ─────────────────────────────────────────────

// Parcels
const parcels = parcelsGJ.features.map(f => f.properties);
const totalParcelArea = parcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);
const gushes = [...new Set(parcels.map(p => p.ms_gush))].sort((a, b) => a - b);

// Parcel size distribution
const sizeRanges = [
  { label: "< 100 מ\"ר", min: 0, max: 100 },
  { label: "100-250 מ\"ר", min: 100, max: 250 },
  { label: "250-500 מ\"ר", min: 250, max: 500 },
  { label: "500-1000 מ\"ר", min: 500, max: 1000 },
  { label: "1000-2500 מ\"ר", min: 1000, max: 2500 },
  { label: "2500-5000 מ\"ר", min: 2500, max: 5000 },
  { label: "5000+ מ\"ר", min: 5000, max: Infinity },
];
const sizeDist = sizeRanges.map(r => ({
  label: r.label,
  count: parcels.filter(p => p.Shape_Area >= r.min && p.Shape_Area < r.max).length,
  area: parcels.filter(p => p.Shape_Area >= r.min && p.Shape_Area < r.max).reduce((s, p) => s + (p.Shape_Area || 0), 0),
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

// Gush breakdown for municipal
const municipalByGush = {};
for (const m of municipal) {
  const g = m.ms_gush;
  if (!municipalByGush[g]) municipalByGush[g] = { count: 0, area: 0 };
  municipalByGush[g].count++;
  municipalByGush[g].area += m.Shape_Area || 0;
}

// Land use zoning
const landuse = landuseGJ.features.map(f => f.properties);
const zoningByType = {};
for (const l of landuse) {
  const t = l.t_yeud_rashi || "אחר";
  if (!zoningByType[t]) zoningByType[t] = { count: 0, area: 0 };
  zoningByType[t].count++;
  zoningByType[t].area += l.Shape_Area || 0;
}
const totalZoningArea = landuse.reduce((s, l) => s + (l.Shape_Area || 0), 0);

// Zoning detail (sub-categories)
const zoningDetail = {};
for (const l of landuse) {
  const t = l.t_yeud_karka || "אחר";
  if (!zoningDetail[t]) zoningDetail[t] = { count: 0, area: 0, parent: l.t_yeud_rashi || "אחר" };
  zoningDetail[t].count++;
  zoningDetail[t].area += l.Shape_Area || 0;
}

// Per-gush parcel stats
const parcelsByGush = {};
for (const p of parcels) {
  const g = p.ms_gush;
  if (!parcelsByGush[g]) parcelsByGush[g] = { count: 0, area: 0, areas: [] };
  parcelsByGush[g].count++;
  parcelsByGush[g].area += p.Shape_Area || 0;
  parcelsByGush[g].areas.push(p.Shape_Area || 0);
}

// ── Per-site analysis ────────────────────────────────────────────────────────

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

const siteAnalyses = {};
for (const [siteId, siteData] of Object.entries(perSite.sites)) {
  const analysis = {};

  // Parcels
  analysis.parcels = siteData.parcels || [];
  analysis.parcelCount = analysis.parcels.length;
  analysis.totalParcelArea = analysis.parcels.reduce((s, p) => s + (p.Shape_Area || 0), 0);
  analysis.gushes = [...new Set(analysis.parcels.map(p => p.ms_gush))];
  analysis.avgParcelSize = analysis.parcelCount > 0 ? analysis.totalParcelArea / analysis.parcelCount : 0;
  analysis.minParcelSize = analysis.parcels.length > 0 ? Math.min(...analysis.parcels.map(p => p.Shape_Area || 0)) : 0;
  analysis.maxParcelSize = analysis.parcels.length > 0 ? Math.max(...analysis.parcels.map(p => p.Shape_Area || 0)) : 0;

  // Municipal ownership
  analysis.municipal = siteData.municipal || [];
  analysis.municipalCount = analysis.municipal.length;
  analysis.municipalArea = analysis.municipal.reduce((s, m) => s + (m.Shape_Area || 0), 0);
  analysis.municipalPct = analysis.totalParcelArea > 0 ? (analysis.municipalArea / analysis.totalParcelArea * 100) : 0;

  // Zoning
  analysis.landuse = siteData.landuse || [];
  analysis.zoningBreakdown = {};
  for (const l of analysis.landuse) {
    const t = l.t_yeud_rashi || "אחר";
    if (!analysis.zoningBreakdown[t]) analysis.zoningBreakdown[t] = { count: 0, area: 0 };
    analysis.zoningBreakdown[t].count++;
    analysis.zoningBreakdown[t].area += l.Shape_Area || 0;
  }

  // Permits
  analysis.permits = siteData.permits || [];
  analysis.activePermits = analysis.permits.filter(p =>
    p.building_stage === "בבניה" || p.building_stage === "בתהליך היתר" || p.building_stage === "קיים היתר"
  );
  analysis.newConstruction = analysis.permits.filter(p =>
    (p.sug_bakasha || "").includes("בניה חדשה")
  );

  // Buildings
  analysis.buildings = siteData.buildings || [];
  analysis.buildingCount = analysis.buildings.length;

  siteAnalyses[siteId] = analysis;
}

// ── Generate Markdown ────────────────────────────────────────────────────────

let md = `# בעלות קרקע ופרצלציה בשכונת התקווה
## מחקר לסטודיו אדריכלות — בצלאל

> תאריך: ${new Date().toLocaleDateString("he-IL")}
> מקור נתונים: שרת GIS עיריית תל אביב (IView2 MapServer)
> תחום מחקר: ~1,000 דונם, גבולות השכונה

---

## 1. סיכום כללי — שכונת התקווה

| נתון | ערך |
|------|-----|
| חלקות | ${parcels.length.toLocaleString()} |
| שטח חלקות כולל | ${(totalParcelArea / 1000).toFixed(1)} דונם |
| גושים | ${gushes.length} (${gushes.join(", ")}) |
| חלקות בבעלות עירייה | ${municipal.length} |
| שטח בעלות עירייה | ${(totalMunicipalArea / 1000).toFixed(1)} דונם |
| אחוז בעלות עירונית | ${(totalMunicipalArea / totalParcelArea * 100).toFixed(1)}% |
| מגרשי ייעוד קרקע | ${landuse.length.toLocaleString()} |

---

## 2. התפלגות גודל חלקות

| טווח גודל | חלקות | שטח כולל (דונם) | אחוז מהשטח |
|-----------|--------|-----------------|------------|
`;

for (const r of sizeDist) {
  md += `| ${r.label} | ${r.count} | ${(r.area / 1000).toFixed(1)} | ${(r.area / totalParcelArea * 100).toFixed(1)}% |\n`;
}

md += `
> **ממוצע חלקה:** ${(totalParcelArea / parcels.length).toFixed(0)} מ"ר | **חציון:** ${parcels.map(p => p.Shape_Area || 0).sort((a, b) => a - b)[Math.floor(parcels.length / 2)].toFixed(0)} מ"ר

### לפי גוש

| גוש | חלקות | שטח כולל (דונם) | ממוצע חלקה (מ"ר) | חלקות עירייה |
|-----|--------|-----------------|-----------------|-------------|
`;

for (const g of gushes) {
  const pg = parcelsByGush[g];
  const mg = municipalByGush[g] || { count: 0, area: 0 };
  const avg = pg.count > 0 ? pg.area / pg.count : 0;
  md += `| ${g} | ${pg.count} | ${(pg.area / 1000).toFixed(1)} | ${avg.toFixed(0)} | ${mg.count} |\n`;
}

md += `
---

## 3. בעלות עירונית

### סוגי בעלות

| סוג | חלקות | שטח (דונם) |
|-----|--------|-----------|
`;

for (const [t, v] of Object.entries(ownershipTypes).sort((a, b) => b[1].area - a[1].area)) {
  md += `| ${t} | ${v.count} | ${(v.area / 1000).toFixed(1)} |\n`;
}

md += `
---

## 4. ייעודי קרקע

### ייעודים ראשיים

| ייעוד | מגרשים | שטח (דונם) | אחוז |
|-------|--------|-----------|------|
`;

for (const [t, v] of Object.entries(zoningByType).sort((a, b) => b[1].area - a[1].area)) {
  md += `| ${t} | ${v.count} | ${(v.area / 1000).toFixed(1)} | ${(v.area / totalZoningArea * 100).toFixed(1)}% |\n`;
}

md += `
### ייעודים מפורטים

| ייעוד | ייעוד ראשי | מגרשים | שטח (דונם) |
|-------|-----------|--------|-----------|
`;

for (const [t, v] of Object.entries(zoningDetail).sort((a, b) => b[1].area - a[1].area).slice(0, 25)) {
  md += `| ${t} | ${v.parent} | ${v.count} | ${(v.area / 1000).toFixed(1)} |\n`;
}

md += `
---

## 5. ניתוח לפי אתרי סטודיו

> **הערה:** מספרים המופיעים לצד שמות רחובות הם **כתובות** (מספרי בתים), לא מספרי חלקות.
> מספרי החלקות נקבעו לפי שאילתה מרחבית של שכבת חלקות (524).

`;

for (const [siteId, a] of Object.entries(siteAnalyses)) {
  const siteName = siteNames[siteId] || siteId;
  const addr = siteAddresses[siteId] || "";
  md += `### ${siteName}
${addr ? `**כתובות אתר:** ${addr}\n` : ""}
| נתון | ערך |
|------|-----|
| חלקות | ${a.parcelCount} |
| שטח כולל | ${(a.totalParcelArea / 1000).toFixed(2)} דונם |
| גושים | ${a.gushes.join(", ")} |
| ממוצע חלקה | ${a.avgParcelSize.toFixed(0)} מ"ר |
| טווח גדלים | ${a.minParcelSize.toFixed(0)} - ${a.maxParcelSize.toFixed(0)} מ"ר |
| חלקות עירייה | ${a.municipalCount} (${a.municipalPct.toFixed(0)}% מהשטח) |
| מבנים | ${a.buildingCount} |
| היתרים פעילים | ${a.activePermits.length} |
| בניה חדשה | ${a.newConstruction.length} |

`;

  // Parcel detail
  if (a.parcels.length > 0 && a.parcels.length <= 30) {
    md += `**חלקות:**\n\n| גוש | חלקה | שטח רשום | שטח גרפי | בעלות עירייה |\n|-----|------|---------|----------|-------------|\n`;
    for (const p of a.parcels.sort((x, y) => x.ms_chelka - y.ms_chelka)) {
      const isMunicipal = a.municipal.some(m => m.ms_gush === p.ms_gush && m.ms_chelka === p.ms_chelka);
      md += `| ${p.ms_gush} | ${p.ms_chelka} | ${p.ms_shetach_rashum || "?"} | ${(p.Shape_Area || 0).toFixed(0)} | ${isMunicipal ? "כן" : "—"} |\n`;
    }
    md += "\n";
  }

  // Zoning
  if (Object.keys(a.zoningBreakdown).length > 0) {
    md += `**ייעודי קרקע:**\n\n| ייעוד | מגרשים | שטח (מ"ר) |\n|-------|--------|----------|\n`;
    for (const [t, v] of Object.entries(a.zoningBreakdown).sort((x, y) => y[1].area - x[1].area)) {
      md += `| ${t} | ${v.count} | ${v.area.toFixed(0)} |\n`;
    }
    md += "\n";
  }

  // Active permits
  if (a.activePermits.length > 0) {
    md += `**היתרים פעילים:**\n\n`;
    for (const p of a.activePermits) {
      md += `- **${p.addresses || "?"}** — ${p.sug_bakasha || "?"} [${p.building_stage}]\n`;
      if (p.yechidot_diyur) md += `  יח"ד: ${p.yechidot_diyur}`;
      if (p.sw_tama_38 === "כן") md += ` | תמ"א 38`;
      md += "\n";
    }
    md += "\n";
  }

  md += "---\n\n";
}

// Append planning context summary
md += `## 6. הקשר תכנוני

`;

// Extract key sections from planning context (first 3 sections)
const contextSections = planningContext.split("---").slice(1, 5).join("\n\n---\n\n");
md += contextSections;

md += `
---

## 7. מקורות

- שרת GIS עיריית תל אביב: https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer
- שכבה 515 — בעלויות עירייה
- שכבה 524 — חלקות
- שכבה 514 — ייעודי קרקע ראשיים
- שכבה 772 — בקשות והיתרי בניה
- שכבה 513 — מבנים
- מערכת מבא"ת: https://mavat.iplan.gov.il
- רשות מקרקעי ישראל: https://land.gov.il
`;

await writeFile("research/ownership-parcellation/neighborhood-overview.md", md);
console.log("MD written:", md.length, "chars");

// ── Generate HTML ────────────────────────────────────────────────────────────

function esc(s) { return String(s ?? "?").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function stageColor(stage) {
  if (stage === "בבניה") return "#e67e22";
  if (stage === "בתהליך היתר") return "#e74c3c";
  if (stage?.includes("תעודת גמר")) return "#27ae60";
  if (stage === "קיים היתר") return "#2980b9";
  return "#7f8c8d";
}
function tag(text, color) { return `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:4px;color:#fff;font-size:0.75rem;font-weight:600;background:${color}">${esc(text)}</span>`; }

const css = `
:root { --bg:#f8f9fa; --card:#fff; --border:#dee2e6; --text:#212529; --muted:#6c757d; --accent:#0d6efd; --green:#198754; --red:#dc3545; --orange:#fd7e14; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:1rem;max-width:1200px;margin:0 auto}
h1{font-size:1.8rem;margin-bottom:0.25rem}
h2{font-size:1.4rem;margin:2.5rem 0 1rem;border-bottom:2px solid var(--accent);padding-bottom:0.3rem}
h3{font-size:1.15rem;margin:1.5rem 0 0.5rem}
h4{font-size:1rem;margin:1rem 0 0.3rem}
.sub{color:var(--muted);margin-bottom:1rem}
.date{color:var(--muted);font-size:0.85rem;margin-bottom:2rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1.5rem}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0.75rem;text-align:center}
.stat .n{font-size:1.8rem;font-weight:700;color:var(--accent)}
.stat .l{font-size:0.8rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:0.85rem;margin:0.5rem 0}
th,td{padding:0.4rem 0.6rem;border:1px solid var(--border);text-align:right}
th{background:#e9ecef;font-weight:600}
tr:nth-child(even){background:#f8f9fa}
.bar-row{display:flex;align-items:center;gap:0.3rem;margin:0.15rem 0}
.bar-row .lbl{font-size:0.78rem;min-width:80px;text-align:left}
.bar-row .bar{height:18px;border-radius:3px;min-width:2px}
.bar-row .val{font-size:0.78rem;color:var(--muted)}
.site-card{border-right:4px solid var(--accent);margin:1rem 0}
.permit-item{border-right:3px solid var(--orange);padding-right:0.5rem;margin:0.3rem 0;font-size:0.85rem}
a{color:var(--accent)}
@media print{body{padding:0}.card{break-inside:avoid}}
`;

let html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>בעלות קרקע ופרצלציה — שכונת התקווה</title>
<style>${css}</style>
</head>
<body>
<h1>בעלות קרקע ופרצלציה בשכונת התקווה</h1>
<p class="sub">מחקר לסטודיו אדריכלות — בצלאל, אקדמיה לאמנות ועיצוב</p>
<p class="date">מקור: שרת GIS עיריית ת"א | ${new Date().toLocaleDateString("he-IL")}</p>

<div class="stats">
<div class="stat"><div class="n">${parcels.length.toLocaleString()}</div><div class="l">חלקות</div></div>
<div class="stat"><div class="n">${(totalParcelArea / 1000).toFixed(0)}</div><div class="l">דונם שטח חלקות</div></div>
<div class="stat"><div class="n">${gushes.length}</div><div class="l">גושים</div></div>
<div class="stat"><div class="n">${municipal.length}</div><div class="l">חלקות עירייה</div></div>
<div class="stat"><div class="n">${(totalMunicipalArea / totalParcelArea * 100).toFixed(0)}%</div><div class="l">בעלות עירונית</div></div>
<div class="stat"><div class="n">${landuse.length.toLocaleString()}</div><div class="l">מגרשי ייעוד</div></div>
</div>

<h2>התפלגות גודל חלקות</h2>
<div class="card">
`;

const maxSizeCount = Math.max(...sizeDist.map(r => r.count));
for (const r of sizeDist) {
  const w = Math.round((r.count / maxSizeCount) * 250);
  html += `<div class="bar-row"><span class="lbl">${r.label}</span><div class="bar" style="width:${w}px;background:var(--accent)"></div><span class="val">${r.count} חלקות (${(r.area / 1000).toFixed(1)} ד')</span></div>\n`;
}
html += `</div>
<p style="color:var(--muted);font-size:0.85rem;margin-top:0.5rem">ממוצע: ${(totalParcelArea / parcels.length).toFixed(0)} מ"ר | חציון: ${parcels.map(p => p.Shape_Area || 0).sort((a, b) => a - b)[Math.floor(parcels.length / 2)].toFixed(0)} מ"ר</p>

<h2>בעלות עירונית</h2>
<div class="card">
<table><thead><tr><th>סוג</th><th>חלקות</th><th>שטח (דונם)</th></tr></thead><tbody>
`;
for (const [t, v] of Object.entries(ownershipTypes).sort((a, b) => b[1].area - a[1].area)) {
  html += `<tr><td>${esc(t)}</td><td>${v.count}</td><td>${(v.area / 1000).toFixed(1)}</td></tr>\n`;
}
html += `</tbody></table></div>

<h2>ייעודי קרקע</h2>
<div class="card">
`;

const maxZoning = Math.max(...Object.values(zoningByType).map(v => v.area));
for (const [t, v] of Object.entries(zoningByType).sort((a, b) => b[1].area - a[1].area)) {
  const w = Math.round((v.area / maxZoning) * 250);
  const colors = { "מגורים": "#198754", "תחבורה": "#6c757d", "ציבורי מבני": "#0dcaf0", "שצ\"פ": "#20c997", "מסחר": "#ffc107", "תעסוקה": "#6610f2" };
  const c = colors[t] || "#0d6efd";
  html += `<div class="bar-row"><span class="lbl">${esc(t)}</span><div class="bar" style="width:${w}px;background:${c}"></div><span class="val">${v.count} (${(v.area / 1000).toFixed(1)} ד', ${(v.area / totalZoningArea * 100).toFixed(0)}%)</span></div>\n`;
}
html += `</div>

<h2>ניתוח לפי אתרי סטודיו</h2>
<p style="color:var(--muted);font-size:0.85rem;margin-bottom:1rem"><strong>הערה:</strong> מספרים לצד שמות רחובות הם <strong>כתובות</strong> (מספרי בתים), לא מספרי חלקות. מספרי החלקות נקבעו לפי שאילתה מרחבית של שכבת חלקות (524).</p>
`;

for (const [siteId, a] of Object.entries(siteAnalyses)) {
  const siteName = siteNames[siteId] || siteId;
  const addr = siteAddresses[siteId] || "";
  const addrHtml = addr ? `<p style="color:var(--muted);font-size:0.85rem"><strong>כתובות אתר:</strong> ${esc(addr)}</p>` : "";
  html += `<div class="card site-card">
<h3>${esc(siteName)}</h3>
${addrHtml}
<div class="stats" style="margin:0.5rem 0">
<div class="stat"><div class="n">${a.parcelCount}</div><div class="l">חלקות</div></div>
<div class="stat"><div class="n">${(a.totalParcelArea / 1000).toFixed(2)}</div><div class="l">דונם</div></div>
<div class="stat"><div class="n">${a.municipalPct.toFixed(0)}%</div><div class="l">עירייה</div></div>
<div class="stat"><div class="n">${a.buildingCount}</div><div class="l">מבנים</div></div>
<div class="stat"><div class="n">${a.activePermits.length}</div><div class="l">היתרים</div></div>
</div>
`;

  // Parcels table
  if (a.parcels.length > 0) {
    html += `<h4>חלקות</h4>
<table><thead><tr><th>גוש</th><th>חלקה</th><th>שטח רשום</th><th>שטח גרפי</th><th>עירייה</th></tr></thead><tbody>\n`;
    for (const p of a.parcels.sort((x, y) => x.ms_chelka - y.ms_chelka)) {
      const isMun = a.municipal.some(m => m.ms_gush === p.ms_gush && m.ms_chelka === p.ms_chelka);
      html += `<tr><td>${p.ms_gush}</td><td>${p.ms_chelka}</td><td>${p.ms_shetach_rashum || "?"}</td><td>${(p.Shape_Area || 0).toFixed(0)}</td><td>${isMun ? "✓" : "—"}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  // Zoning
  if (Object.keys(a.zoningBreakdown).length > 0) {
    html += `<h4>ייעודי קרקע</h4><table><thead><tr><th>ייעוד</th><th>מגרשים</th><th>שטח</th></tr></thead><tbody>\n`;
    for (const [t, v] of Object.entries(a.zoningBreakdown).sort((x, y) => y[1].area - x[1].area)) {
      html += `<tr><td>${esc(t)}</td><td>${v.count}</td><td>${v.area.toFixed(0)} מ"ר</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  // Permits
  if (a.activePermits.length > 0) {
    html += `<h4>היתרים פעילים</h4>\n`;
    for (const p of a.activePermits) {
      html += `<div class="permit-item">${tag(p.building_stage, stageColor(p.building_stage))} <strong>${esc(p.addresses)}</strong> — ${esc(p.sug_bakasha)}`;
      if (p.yechidot_diyur) html += ` | יח"ד: ${p.yechidot_diyur}`;
      html += `</div>\n`;
    }
  }

  html += `</div>\n`;
}

// Planning context (simplified for HTML)
html += `<h2>הקשר תכנוני</h2>
<div class="card">
<p>למסמך הקשר תכנוני מלא ראו את הקובץ <code>research/ownership-parcellation/data/_planning_context.md</code></p>
<h4>נקודות מפתח</h4>
<ul>
<li>שכונת התקווה הוקמה כהתיישבות בלתי חוקית בשנות ה-20-30 על קרקעות עירוניות ומנדטוריות</li>
<li>חלק ניכר מהקרקע בבעלות רמ"י / עירייה — פער בין רישום לבין מצב בשטח</li>
<li>תכנית 5000 (תא/5000) מגדירה את האזור להתחדשות עירונית עם הגדלת זכויות</li>
<li>רה-פרצלציה נדרשת כתנאי מקדים — חלקות קטנות, לא מוסדרות, גבולות לא תואמים</li>
<li>חסמים: ריבוי בעלים, מעורבות רמ"י, שמירה על זכויות דיירים</li>
</ul>
</div>

<h2>מקורות</h2>
<div class="card" style="font-size:0.85rem">
<ul>
<li><a href="https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer">שרת GIS עיריית תל אביב</a></li>
<li>שכבות: 515 (בעלויות), 524 (חלקות), 514 (ייעודי קרקע), 772 (היתרים), 513 (מבנים)</li>
<li><a href="https://mavat.iplan.gov.il">מבא"ת — מידע בניה ותכנון</a></li>
<li><a href="https://land.gov.il">רשות מקרקעי ישראל</a></li>
</ul>
</div>

</body>
</html>`;

await writeFile("research/ownership-parcellation/neighborhood-overview.html", html);
console.log("HTML written:", html.length, "chars");

// Print summary
console.log("\n=== NEIGHBORHOOD SUMMARY ===");
console.log("Parcels:", parcels.length, "| Area:", (totalParcelArea / 1000).toFixed(0), "dunam");
console.log("Municipal:", municipal.length, "parcels,", (totalMunicipalArea / 1000).toFixed(0), "dunam (", (totalMunicipalArea / totalParcelArea * 100).toFixed(1), "%)");
console.log("Gushes:", gushes.join(", "));
console.log("Zoning types:", Object.keys(zoningByType).join(", "));
console.log("\n=== PER SITE ===");
for (const [id, a] of Object.entries(siteAnalyses)) {
  console.log(`${siteNames[id]}: ${a.parcelCount} parcels, ${(a.totalParcelArea/1000).toFixed(2)}d, ${a.municipalPct.toFixed(0)}% municipal, ${a.buildingCount} buildings, ${a.activePermits.length} active permits`);
}
