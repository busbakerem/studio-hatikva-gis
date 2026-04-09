import { readFile, writeFile } from "node:fs/promises";

const data = JSON.parse(
  await readFile("blocks/hatishbi-sasson/_inventory.json", "utf-8"),
);
const inv = data.inventory as Array<{
  chelka: number;
  gush: number;
  parcelArea: number | null;
  registeredArea: number | null;
  buildings: Array<{
    id: number;
    type: string;
    floors: number | null;
    height: number | null;
    year: number | null;
    name: string;
    onPillars: string;
    footprintArea: number;
  }>;
  permits: Array<{
    requestNum: number;
    permissionNum: number;
    address: string;
    type: string;
    content: string;
    stage: string;
    date: string | null;
    expiryDate: string | null;
    housingUnits: number;
    tama38: string;
    docUrl: string;
    licensingTrack: string;
  }>;
}>;

// --- Aggregate stats ---
let totalBuildings = 0,
  totalArea = 0,
  totalPermits = 0;
const yearCounts: Record<string, number> = {};
const floorCounts: Record<string, number> = {};
interface ActiveSite {
  chelka: number;
  address: string;
  type: string;
  stage: string;
  date: string | null;
  expiryDate: string | null;
  housingUnits: number;
  content: string;
  docUrl: string;
}
const activeSites: ActiveSite[] = [];

for (const parcel of inv) {
  totalPermits += parcel.permits.length;
  for (const b of parcel.buildings) {
    totalBuildings++;
    totalArea += b.footprintArea;
    if (b.year) yearCounts[b.year] = (yearCounts[b.year] || 0) + 1;
    const f = String(b.floors ?? "unknown");
    floorCounts[f] = (floorCounts[f] || 0) + 1;
  }
  for (const p of parcel.permits) {
    if (
      p.stage === "בבניה" ||
      p.stage === "בתהליך היתר" ||
      p.type.includes("בניה חדשה") ||
      p.type.includes("הריסה")
    ) {
      activeSites.push({ chelka: parcel.chelka, ...p });
    }
  }
}

function stageColor(stage: string): string {
  if (stage === "בבניה") return "#e67e22";
  if (stage === "בתהליך היתר") return "#e74c3c";
  if (stage.includes("תעודת גמר")) return "#27ae60";
  if (stage === "קיים היתר") return "#2980b9";
  return "#7f8c8d";
}

function stageTag(stage: string): string {
  return `<span class="tag" style="background:${stageColor(stage)}">${stage}</span>`;
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? "?")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sortedYears = Object.entries(yearCounts).sort(
  (a, b) => Number(a[0]) - Number(b[0]),
);
const maxYearCount = Math.max(...sortedYears.map((e) => e[1]));
const sortedFloors = Object.entries(floorCounts).sort(
  (a, b) => Number(a[0]) - Number(b[0]),
);
const maxFloor = Math.max(...sortedFloors.map((e) => e[1]));

const css = `
:root { --bg: #f8f9fa; --card: #fff; --border: #dee2e6; --text: #212529; --muted: #6c757d; --accent: #0d6efd; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 1rem; max-width: 1100px; margin: 0 auto; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.3rem; }
h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
.subtitle { color: var(--muted); margin-bottom: 1rem; }
.date { color: var(--muted); font-size: 0.85rem; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
.stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; text-align: center; }
.stat .num { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
.stat .label { font-size: 0.8rem; color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0; }
th, td { padding: 0.4rem 0.6rem; border: 1px solid var(--border); text-align: right; }
th { background: #e9ecef; font-weight: 600; }
tr:nth-child(even) { background: #f8f9fa; }
.tag { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; color: #fff; font-size: 0.75rem; font-weight: 600; }
.permit-card { border-right: 4px solid var(--accent); padding-right: 0.75rem; margin: 0.5rem 0; }
a { color: var(--accent); }
.active-site { border-right: 4px solid #e74c3c; }
.year-bar { display: flex; align-items: center; gap: 0.3rem; margin: 0.1rem 0; }
.year-bar .bar { background: var(--accent); height: 16px; border-radius: 3px; min-width: 2px; }
.year-bar .yr { font-size: 0.75rem; width: 35px; text-align: left; }
.year-bar .cnt { font-size: 0.75rem; color: var(--muted); }
@media print { body { padding: 0; } .card { break-inside: avoid; } }
`;

let html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>סקר מבנים — בלוק תשבי-ששון | גוש 6135</title>
<style>${css}</style>
</head>
<body>
<h1>סקר מבנים — בלוק תשבי-ששון</h1>
<p class="subtitle">גוש 6135 | שכונת התקווה, תל אביב</p>
<p class="date">מסמך הכנה לסקר שטח | ${new Date().toLocaleDateString("he-IL")}</p>
<p style="color:var(--muted);font-size:0.85rem;margin:0.5rem 0"><strong>כתובות אתר:</strong> תשבי 7, 4, 9, 11 | ששון 6, 8, 13</p>
<p style="color:var(--muted);font-size:0.8rem;margin-bottom:1rem">הערה: מספרים אלו הם כתובות רחוב, לא מספרי חלקות. החלקות נקבעו לפי שאילתה מרחבית.</p>

<div class="stats">
`;

const statsItems: [string | number, string][] = [
  [inv.length, "חלקות"],
  [totalBuildings, "מבנים"],
  [totalArea.toFixed(0) + ' מ"ר', "שטח טביעות רגל"],
  [totalPermits, "היתרים"],
  [activeSites.length, "אתרים פעילים"],
  [data.conservation, "מבנים לשימור"],
  [data.dangerous, "מבנים מסוכנים"],
];
for (const [num, label] of statsItems) {
  html += `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>\n`;
}
html += `</div>\n`;

// Year distribution
html += `<h2>התפלגות שנות בניה</h2>\n<div class="card">\n`;
for (const [y, c] of sortedYears) {
  const w = Math.round((c / maxYearCount) * 200);
  html += `<div class="year-bar"><span class="yr">${y}</span><div class="bar" style="width:${w}px"></div><span class="cnt">${c}</span></div>\n`;
}
const unknownYear = totalBuildings - sortedYears.reduce((s, e) => s + e[1], 0);
if (unknownYear > 0) {
  const w = Math.round((unknownYear / maxYearCount) * 200);
  html += `<div class="year-bar"><span class="yr">?</span><div class="bar" style="width:${w}px;background:#adb5bd"></div><span class="cnt">${unknownYear}</span></div>\n`;
}
html += `</div>\n`;

// Floor distribution
html += `<h2>התפלגות קומות</h2>\n<div class="card">\n`;
for (const [f, c] of sortedFloors) {
  const w = Math.round((c / maxFloor) * 200);
  const label = f === "null" || f === "unknown" || f === "0" ? "?" : f;
  html += `<div class="year-bar"><span class="yr">${label}</span><div class="bar" style="width:${w}px;background:#198754"></div><span class="cnt">${c}</span></div>\n`;
}
html += `</div>\n`;

// Active sites
html += `<h2>אתרים פעילים — בניה והריסה</h2>\n`;
if (activeSites.length === 0) {
  html += `<p>לא נמצאו אתרים פעילים.</p>\n`;
} else {
  for (const s of activeSites) {
    const content = (s.content || "")
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .trim();
    html += `<div class="card active-site">
<h3>חלקה ${s.chelka} — ${esc(s.address)}</h3>
<p>${stageTag(s.stage)} <strong>${esc(s.type)}</strong></p>
<p>תאריך היתר: ${s.date || "טרם ניתן"} | תוקף: ${s.expiryDate || "?"} | יח"ד: ${s.housingUnits || 0}</p>
${s.docUrl ? `<p><a href="${s.docUrl}" target="_blank">קישור למסמכים</a></p>` : ""}
${content ? `<p style="font-size:0.8rem;color:var(--muted);margin-top:0.3rem">${esc(content).slice(0, 400)}</p>` : ""}
</div>\n`;
  }
}

// Per-parcel detail
html += `<h2>פירוט לפי חלקה</h2>\n`;
for (const parcel of inv) {
  if (parcel.buildings.length === 0 && parcel.permits.length === 0) continue;

  html += `<div class="card">
<h3>חלקה ${parcel.chelka} <span style="color:var(--muted);font-weight:400">(שטח רשום: ${parcel.registeredArea || "?"} מ"ר | גרפי: ${parcel.parcelArea?.toFixed(0) || "?"} מ"ר)</span></h3>\n`;

  if (parcel.buildings.length > 0) {
    html += `<table><thead><tr><th>#</th><th>סוג</th><th>קומות</th><th>גובה</th><th>שנה</th><th>שטח מ"ר</th><th>עמודים</th></tr></thead><tbody>\n`;
    for (const b of parcel.buildings) {
      html += `<tr><td>${b.id}</td><td>${esc(b.type)}</td><td>${b.floors ?? "?"}</td><td>${b.height?.toFixed(1) ?? "?"}</td><td>${b.year || "?"}</td><td>${b.footprintArea.toFixed(0)}</td><td>${esc(b.onPillars)}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  if (parcel.permits.length > 0) {
    html += `<div style="margin-top:0.5rem"><strong>היתרים:</strong></div>\n`;
    for (const p of parcel.permits) {
      html += `<div class="permit-card">
<p><strong>${esc(p.address)}</strong> — ${esc(p.type)} ${stageTag(p.stage)}</p>
<p style="font-size:0.8rem">היתר: ${p.date || "טרם"} | תוקף: ${p.expiryDate || "?"} | יח"ד: ${p.housingUnits || 0} | מסלול: ${esc(p.licensingTrack)}</p>
${p.docUrl ? `<p style="font-size:0.8rem"><a href="${p.docUrl}" target="_blank">מסמכים</a></p>` : ""}
</div>\n`;
    }
  }

  html += `</div>\n`;
}

html += `</body>\n</html>`;

await writeFile("blocks/hatishbi-sasson/building-inventory.html", html);
console.log("HTML written:", html.length, "chars");
