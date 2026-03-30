#!/usr/bin/env node
/**
 * Build script: inlines all GeoJSON/JSON data into map.html
 * so it works when opened directly via file:// protocol.
 *
 * Usage: node scripts/build-map.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read data files
const parcels = readFileSync(resolve(root, 'research/ownership-parcellation/data/parcels.geojson'), 'utf8');
const municipal = readFileSync(resolve(root, 'research/ownership-parcellation/data/municipal_land.geojson'), 'utf8');
const planBoundariesV2 = readFileSync(resolve(root, 'research/ownership-parcellation/data/plan_boundaries_v2.geojson'), 'utf8');
const plansDb = readFileSync(resolve(root, 'research/taba-plans/plans-database.json'), 'utf8');

const moshaaAnalysis = readFileSync(resolve(root, 'research/ownership-parcellation/data/moshaa_analysis.json'), 'utf8');

let landUse;
try {
  landUse = readFileSync(resolve(root, 'research/ownership-parcellation/data/land_use.geojson'), 'utf8');
} catch (e) {
  landUse = '{"type":"FeatureCollection","features":[]}';
  console.warn('Warning: land_use.geojson not found, using empty collection');
}

// Count features
function countFeatures(json) {
  try { return JSON.parse(json).features?.length ?? 0; } catch { return 0; }
}
function countItems(json) {
  try { return JSON.parse(json).length ?? 0; } catch { return 0; }
}

console.log('Feature counts:');
console.log(`  parcels.geojson:              ${countFeatures(parcels)} features (${(Buffer.byteLength(parcels)/1024/1024).toFixed(1)} MB)`);
console.log(`  municipal_land.geojson:       ${countFeatures(municipal)} features (${(Buffer.byteLength(municipal)/1024/1024).toFixed(1)} MB)`);
console.log(`  plan_boundaries_v2.geojson:   ${countFeatures(planBoundariesV2)} features (${(Buffer.byteLength(planBoundariesV2)/1024).toFixed(0)} KB)`);
console.log(`  land_use.geojson:             ${countFeatures(landUse)} features (${(Buffer.byteLength(landUse)/1024/1024).toFixed(1)} MB)`);
console.log(`  plans-database.json:          ${countItems(plansDb)} plans`);

// Build HTML
const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>מפת מחקר — שכונת התקווה | סטודיו בצלאל</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; }
#map { width: 100%; height: 100vh; }

#site-picker {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  z-index: 1000; background: #fff; border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25); direction: rtl; font-size: 13px;
  min-width: 320px; overflow: hidden; transition: all 0.3s;
}
#picker-header {
  padding: 10px 14px; cursor: pointer; display: flex; justify-content: space-between;
  align-items: center; background: #f8f9fa; border-bottom: 1px solid #eee;
}
#picker-header:hover { background: #e9ecef; }
#picker-body { padding: 8px 14px 12px; }
#picker-body.collapsed { display: none; }
#site-picker table { width: 100%; border-collapse: collapse; }
#site-picker th, #site-picker td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #f0f0f0; }
#site-picker th { font-size: 10px; color: #aaa; }
.site-row { cursor: pointer; transition: background 0.15s; }
.site-row:hover { background: #f0f7ff; }
.site-row.active { background: #e3f2fd; }
.site-row.done { background: #e8f5e9; }
.site-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.site-coords { font-family: monospace; font-size: 10px; color: #888; }
.btn { padding: 3px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-family: inherit; }
.btn-mark { background: #1976d2; color: #fff; }
.btn-mark:disabled { background: #ccc; cursor: default; }
.btn-clear { background: #eee; color: #333; margin-right: 3px; }
.btn-save { background: #2e7d32; color: #fff; }
#save-msg { font-size: 10px; color: #2e7d32; display: none; }
#picker-actions { display: flex; gap: 6px; margin-top: 6px; align-items: center; }

.info-panel {
  background: #fff; padding: 10px; border-radius: 6px; font-size: 12px; direction: rtl;
  min-width: 180px; max-width: 340px;
}
.info-panel h4 { margin: 0 0 4px; font-size: 13px; }
.info-panel table { width: 100%; border-collapse: collapse; }
.info-panel td { padding: 2px 4px; border-bottom: 1px solid #f0f0f0; }
.info-panel td:first-child { font-weight: 600; white-space: nowrap; }
.info-panel .plan-list { margin: 6px 0 0; padding: 0; list-style: none; font-size: 11px; }
.info-panel .plan-list li { padding: 2px 0; border-bottom: 1px solid #f5f5f5; }
.info-panel .plan-tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; margin-left: 4px; }

.plan-popup { max-width: 380px; direction: rtl; font-size: 12px; }
.plan-popup h4 { margin: 0 0 4px; }
.plan-popup table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.plan-popup td { padding: 2px 4px; border-bottom: 1px solid #f0f0f0; }
.plan-popup td:first-child { font-weight: 600; white-space: nowrap; }
.plan-popup .provisions { margin: 4px 0 0; padding-right: 16px; font-size: 11px; line-height: 1.5; }
.plan-popup .provisions li { margin-bottom: 2px; }

.legend {
  background: rgba(255,255,255,0.95); padding: 8px 12px; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 11px; line-height: 1.7;
  max-height: 55vh; overflow-y: auto; direction: rtl;
}
.legend h4 { font-size: 11px; margin: 6px 0 2px; border-bottom: 1px solid #eee; padding-bottom: 1px; color: #555; }
.legend h4:first-child { margin-top: 0; }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-color { width: 14px; height: 10px; border: 1px solid #999; border-radius: 2px; flex-shrink: 0; }

.site-label-tip {
  background: none !important; border: none !important; box-shadow: none !important;
  font-size: 11px; font-weight: 700; color: #333; text-shadow: 0 0 4px #fff, 0 0 4px #fff, 0 0 4px #fff;
}

#btn-show-all {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  z-index: 1000; background: #1976d2; color: #fff; border: none; border-radius: 6px;
  padding: 8px 20px; font-size: 13px; font-family: inherit; cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
}
#btn-show-all:hover { background: #1565c0; }

#load-status {
  position: absolute; top: 60px; right: 10px; z-index: 1000;
  background: rgba(0,0,0,0.75); color: #fff; padding: 8px 14px; border-radius: 6px;
  font-size: 12px; direction: rtl; line-height: 1.6;
}
#load-status.done { background: rgba(46,125,50,0.85); }

.leaflet-control-layers { direction: rtl; text-align: right; }
.leaflet-control-layers label { direction: rtl; }

#plans-panel {
  position: absolute; top: 10px; right: 10px; z-index: 1000;
  background: rgba(255,255,255,0.96); border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.2); direction: rtl; font-size: 12px;
  width: 260px; max-height: 50vh; overflow: hidden; display: flex; flex-direction: column;
}
#plans-panel-header {
  padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between;
  align-items: center; background: #f5f5f5; border-bottom: 1px solid #e0e0e0;
  font-weight: 600; font-size: 12px; flex-shrink: 0;
}
#plans-panel-header:hover { background: #eeeeee; }
#plans-panel-body { overflow-y: auto; padding: 0; }
#plans-panel-body.collapsed { display: none; }
.plan-list-item {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  cursor: pointer; transition: background 0.15s; border-bottom: 1px solid #f0f0f0;
  font-size: 11px; line-height: 1.3;
}
.plan-list-item:hover { background: #f0f7ff; }
.plan-list-item .plan-dot {
  width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; border: 1px solid #999;
}
.plan-list-item .plan-label { flex: 1; }
.plan-list-item .plan-year { color: #888; font-size: 10px; flex-shrink: 0; }
</style>
</head>
<body>
<div id="map"></div>
<button id="btn-show-all">הצג הכל</button>
<div id="load-status">טוען שכבות...</div>

<div id="site-picker">
  <div id="picker-header">
    <span style="font-weight:600">\\u{1F4CD} סימון אתרי סטודיו</span>
    <span id="picker-toggle" style="font-size:16px">\\u25BE</span>
  </div>
  <div id="picker-body">
    <table>
      <thead><tr><th></th><th>אתר</th><th>מרכז</th><th></th></tr></thead>
      <tbody id="site-rows"></tbody>
    </table>
    <div id="picker-actions">
      <button class="btn btn-save" id="btn-export">שמור JSON (0/5)</button>
      <span id="save-msg">נשמר!</span>
    </div>
  </div>
</div>

<div id="plans-panel">
  <div id="plans-panel-header">
    <span>\\u{1F4D0} \\u05EA\\u05DB\\u05E0\\u05D9\\u05D5\\u05EA \\u05D1\\u05D0\\u05D6\\u05D5\\u05E8</span>
    <span id="plans-panel-toggle" style="font-size:14px">\\u25BE</span>
  </div>
  <div id="plans-panel-body"></div>
</div>

<script>
// ══════════════════════════════════════════════════════════════════════════════
// INLINE DATA
// ══════════════════════════════════════════════════════════════════════════════
var PARCELS_DATA = ${parcels.trimEnd()};

var MUNICIPAL_DATA = ${municipal.trimEnd()};

var PLAN_BOUNDARIES_V2 = ${planBoundariesV2.trimEnd()};

var LAND_USE_DATA = ${landUse.trimEnd()};

var PLANS_DATABASE = ${plansDb.trimEnd()};

// ══════════════════════════════════════════════════════════════════════════════
// PLAN COLOR PALETTE — unique color per plan
// ══════════════════════════════════════════════════════════════════════════════
var PLAN_COLORS = {
  '\\u05EA\\u05D0/2215':     { stroke: '#9e9e9e', fill: '#e0e0e0', opacity: 0.12, label: '\\u05EA\\u05D0/2215 — \\u05EA\\u05DB\\u05E0\\u05D9\\u05EA \\u05E9\\u05D9\\u05E7\\u05D5\\u05DD (1992)', dash: null },
  '\\u05EA\\u05D0/\\u05D2/3': { stroke: '#1e88e5', fill: '#90caf9', opacity: 0.18, label: '\\u05EA\\u05D0/\\u05D2/3 — \\u05D1\\u05E0\\u05D9\\u05D9\\u05D4 \\u05E2\\u05DC \\u05D2\\u05D2\\u05D5\\u05EA (2014)', dash: null },
  '\\u05EA\\u05D0/2324':     { stroke: '#2e7d32', fill: '#a5d6a7', opacity: 0.18, label: '\\u05EA\\u05D0/2324 — \\u05D9\\u05D3 \\u05D0\\u05DC\\u05D9\\u05D4\\u05D5 2 (1986)', dash: null },
  '\\u05EA\\u05D0/3448':     { stroke: '#e65100', fill: '#ffcc80', opacity: 0.20, label: '\\u05EA\\u05D0/3448 — \\u05D9\\u05D3 \\u05D0\\u05DC\\u05D9\\u05D4\\u05D5 \\u05D3\\u05E8\\u05D5\\u05DD (2008)', dash: null },
  '\\u05EA\\u05D0/\\u05DE\\u05E7/2751': { stroke: '#c62828', fill: '#ef9a9a', opacity: 0.22, label: '\\u05EA\\u05D0/\\u05DE\\u05E7/2751 — \\u05E9\\u05D5\\u05E7 \\u05D4\\u05EA\\u05E7\\u05D5\\u05D5\\u05D4 (1999)', dash: null },
  '\\u05EA\\u05D0/566\\u05D0': { stroke: '#6d4c41', fill: '#bcaaa4', opacity: 0.20, label: '\\u05EA\\u05D0/566\\u05D0 — \\u05EA\\u05D9\\u05E7\\u05D5\\u05DF \\u05EA\\u05DB\\u05E0\\u05D9\\u05EA 297 (1959)', dash: null }
};
// Fallback for plans in process (not approved)
var PLAN_PROCESS_STYLE = { stroke: '#f9a825', fill: '#fff176', opacity: 0.15, dash: '6,6' };

// ══════════════════════════════════════════════════════════════════════════════
// MOSHAA ANALYSIS DATA
// ══════════════════════════════════════════════════════════════════════════════
var MOSHAA_DATA = ${moshaaAnalysis.trimEnd()};

// Build moshaa lookup: gush_chelka -> moshaa record
var MOSHAA_LOOKUP = {};
MOSHAA_DATA.forEach(function(m) { MOSHAA_LOOKUP[m.gush + '_' + m.chelka] = m; });

// Moshaa style colors
var MOSHAA_COLORS = {
  '\\u05DC\\u05DC\\u05D0_\\u05D8\\u05D9\\u05E4\\u05D5\\u05DC':       { fill: '#b71c1c', stroke: '#b71c1c', label: '\\u05DC\\u05DC\\u05D0 \\u05D8\\u05D9\\u05E4\\u05D5\\u05DC (57)' },
  '\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA_\\u05E8\\u05D4_\\u05E4\\u05E8\\u05E6\\u05DC\\u05E6\\u05D9\\u05D4': { fill: '#ef6c00', stroke: '#ef6c00', label: '\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA \\u05E8\\u05D4-\\u05E4\\u05E8\\u05E6\\u05DC\\u05E6\\u05D9\\u05D4 (6)' },
  '\\u05E9\\u05D5\\u05D9\\u05DB\\u05D4':           { fill: '#2e7d32', stroke: '#2e7d32', label: '\\u05E9\\u05D5\\u05D9\\u05DB\\u05D4 (2)' }
};

// Pre-compute per-site moshaa overlap totals
var MOSHAA_SITE_STATS = {};
[1,2,3,4,5].forEach(function(sn) {
  var total = 0, untreated = 0;
  MOSHAA_DATA.forEach(function(m) {
    if (m.overlapping_sites.indexOf(sn) !== -1) {
      total += m.area_sqm;
      if (m.status === '\\u05DC\\u05DC\\u05D0_\\u05D8\\u05D9\\u05E4\\u05D5\\u05DC') untreated += m.area_sqm;
    }
  });
  MOSHAA_SITE_STATS[sn] = { total_dunam: (total / 1000).toFixed(1), untreated_pct: total > 0 ? Math.round(untreated / total * 100) : 0 };
});

// ══════════════════════════════════════════════════════════════════════════════
// STATUS PANEL
// ══════════════════════════════════════════════════════════════════════════════
var statusEl = document.getElementById('load-status');
var statusLines = [];
function logStatus(msg) {
  statusLines.push(msg);
  statusEl.innerHTML = statusLines.join('<br>');
}

// ══════════════════════════════════════════════════════════════════════════════
// SITE DATA
// ══════════════════════════════════════════════════════════════════════════════
var siteColors = ['#e91e63', '#2196f3', '#ff9800', '#4caf50', '#9c27b0'];
var siteNames = ['\\u05D4\\u05EA\\u05E7\\u05D5\\u05D5\\u05D4-\\u05D7\\u05E0\\u05D5\\u05DA-\\u05D8\\u05E8\\u05E4\\u05D5\\u05DF','\\u05EA\\u05E9\\u05D1\\u05D9-\\u05E9\\u05E9\\u05D5\\u05DF','\\u05D3\\u05E8\\u05DA \\u05D4\\u05D4\\u05D2\\u05E0\\u05D4','\\u05D4\\u05D5\\u05E8\\u05D3-\\u05E4\\u05D0\\u05E8\\u05E7','\\u05D4\\u05D5\\u05E8\\u05D3-\\u05D9\\u05D7\\u05D9\\u05E2\\u05DD-\\u05DC\\u05D1\\u05DC\\u05D5\\u05D1'];
var siteIds = ['hatikva-hanoch-tarfon','hatishbi-sasson','derech-hahagana','haverod-park','haverod-yechiam-leblov'];
var siteData = [{center:null,marker:null,circle:null},{center:null,marker:null,circle:null},{center:null,marker:null,circle:null},{center:null,marker:null,circle:null},{center:null,marker:null,circle:null}];
var siteRadius = 60;
var activeSite = null;

var savedPositions = {
  0: [32.05172906313234, 34.79006946086884],
  1: [32.0487965112553, 34.79240834712983],
  2: [32.05375335186845, 34.79045569897182],
  3: [32.052816328304516, 34.79361534118653],
  4: [32.05163377573587, 34.792724847793586],
};

// ══════════════════════════════════════════════════════════════════════════════
// MAP INIT
// ══════════════════════════════════════════════════════════════════════════════
var map = L.map('map', {zoomControl: true}).setView([32.0513, 34.7920], 16);

var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'&copy; OSM', maxZoom:20});
var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution:'&copy; Esri', maxZoom:20});
var cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {attribution:'&copy; CARTO', maxZoom:20});
osmLayer.addTo(map);

// ══════════════════════════════════════════════════════════════════════════════
// LAYER GROUPS
// ══════════════════════════════════════════════════════════════════════════════
var sitesLayer = L.layerGroup().addTo(map);
var parcelsLayer = L.layerGroup();
var municipalLayer = L.layerGroup();
var tabaBaseLayer = L.layerGroup();   // תא/2215 only — off by default
var tabaPlansLayer = L.layerGroup();  // all other plans — on by default
var zoningLayer = L.layerGroup();
var moshaaLayer = L.layerGroup();

// Track plan layers for hover/click interaction
var planLayerMap = {};  // plan_id -> { layer, plan, strokeColor, fillColor, fillOpacity, dashArray }

// ══════════════════════════════════════════════════════════════════════════════
// COLLAPSIBLE PICKER
// ══════════════════════════════════════════════════════════════════════════════
var pickerEl = document.getElementById('site-picker');
var pickerBody = document.getElementById('picker-body');
var pickerToggle = document.getElementById('picker-toggle');
L.DomEvent.disableClickPropagation(pickerEl);
L.DomEvent.disableScrollPropagation(pickerEl);

document.getElementById('picker-header').addEventListener('click', function() {
  pickerBody.classList.toggle('collapsed');
  pickerToggle.textContent = pickerBody.classList.contains('collapsed') ? '\\u25B8' : '\\u25BE';
});

// ══════════════════════════════════════════════════════════════════════════════
// SITE PICKER LOGIC
// ══════════════════════════════════════════════════════════════════════════════
var tbody = document.getElementById('site-rows');
tbody.addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;
  e.stopPropagation();
  var i = parseInt(btn.dataset.site);
  if (btn.dataset.action === 'mark') {
    activeSite = i;
    map.getContainer().style.cursor = 'crosshair';
    renderTable();
  } else if (btn.dataset.action === 'clear') {
    clearSite(i);
    activeSite = null;
    map.getContainer().style.cursor = '';
    renderTable();
    updateExportBtn();
  }
});

function renderTable() {
  tbody.innerHTML = '';
  siteNames.forEach(function(name, i) {
    var has = siteData[i].center !== null;
    var active = activeSite === i;
    var tr = document.createElement('tr');
    tr.className = 'site-row' + (active ? ' active' : '') + (has ? ' done' : '');
    tr.innerHTML =
      '<td><span class="site-dot" style="background:' + siteColors[i] + '"></span></td>' +
      '<td><b>' + (i+1) + '. ' + name + '</b></td>' +
      '<td class="site-coords">' + (has ? siteData[i].center[0].toFixed(5) + ', ' + siteData[i].center[1].toFixed(5) : '\\u2014') + '</td>' +
      '<td>' +
      '<button class="btn btn-mark" data-action="mark" data-site="' + i + '"' + (active?' disabled':'') + '>' + (active ? '\\u23F3 \\u05DC\\u05D7\\u05E5' : (has ? '\\u27F2' : '\\u05E1\\u05DE\\u05DF')) + '</button>' +
      (has ? ' <button class="btn btn-clear" data-action="clear" data-site="' + i + '">\\u2715</button>' : '') +
      '</td>';
    tbody.appendChild(tr);
  });
}

function getPlanColor(planId) {
  return PLAN_COLORS[planId] || null;
}

function placeSite(i, latlng) {
  clearSite(i);
  siteData[i].center = [latlng.lat, latlng.lng];

  siteData[i].marker = L.circleMarker(latlng, {
    radius: 5, color: '#fff', weight: 2, fillColor: siteColors[i], fillOpacity: 1
  }).addTo(sitesLayer);

  siteData[i].marker.bindTooltip((i+1) + '. ' + siteNames[i], {
    permanent: true, direction: 'top', offset: [0, -8],
    className: 'site-label-tip'
  });

  siteData[i].circle = L.circle(latlng, {
    radius: siteRadius, color: siteColors[i], weight: 2,
    fillColor: siteColors[i], fillOpacity: 0.06,
    dashArray: '6,4'
  }).addTo(sitesLayer);

  updateSitePopup(i);
}

function updateSitePopup(i) {
  if (!siteData[i].marker) return;
  var siteNum = i + 1;
  var overlapping = PLANS_DATABASE.filter(function(p) {
    return p.overlapping_sites && p.overlapping_sites.indexOf(siteNum) !== -1;
  });
  var html = '<div class="info-panel"><h4 style="color:' + siteColors[i] + '">' + siteNames[i] + '</h4>';
  if (siteData[i].center) {
    html += '<table><tr><td>\\u05DE\\u05E8\\u05DB\\u05D6</td><td style="font-family:monospace;font-size:10px">' +
      siteData[i].center[0].toFixed(6) + ', ' + siteData[i].center[1].toFixed(6) + '</td></tr></table>';
  }
  // Moshaa overlap info
  var ms = MOSHAA_SITE_STATS[siteNum];
  if (ms && parseFloat(ms.total_dunam) > 0) {
    html += '<div style="margin:6px 0;padding:5px 8px;background:#fff3e0;border-right:3px solid #b71c1c;border-radius:3px;font-size:11px;line-height:1.5">' +
      '<b style="color:#b71c1c">\\u05DE\\u05D5\\u05E9\\u05E2 \\u05D7\\u05D5\\u05E4\\u05E4\\u05EA:</b> ' + ms.total_dunam + ' \\u05D3\\u05D5\\u05E0\\u05DD' +
      ' (' + ms.untreated_pct + '% \\u05DC\\u05DC\\u05D0 \\u05D8\\u05D9\\u05E4\\u05D5\\u05DC)</div>';
  }

  if (overlapping.length > 0) {
    html += '<h4 style="font-size:12px;margin:8px 0 4px;border-bottom:1px solid #eee">\\u05EA\\u05DB\\u05E0\\u05D9\\u05D5\\u05EA \\u05D7\\u05D5\\u05E4\\u05E4\\u05D5\\u05EA (' + overlapping.length + ')</h4>';
    html += '<ul class="plan-list">';
    overlapping.forEach(function(p) {
      var pc = getPlanColor(p.plan_id);
      var tagBg = pc ? pc.fill : '#e0e0e0';
      var tagFg = pc ? pc.stroke : '#333';
      html += '<li><span style="display:inline-block;width:10px;height:10px;background:' + tagBg + ';border:1px solid ' + tagFg + ';border-radius:2px;margin-left:4px;vertical-align:middle"></span> ' +
        '<b>' + p.plan_id + '</b> \\u2014 ' + p.plan_name +
        (p.year ? ' (' + p.year + ')' : '') + '</li>';
    });
    html += '</ul>';
  }
  html += '</div>';
  siteData[i].marker.bindPopup(html, {maxWidth: 350});
}

function clearSite(i) {
  if (siteData[i].marker) { sitesLayer.removeLayer(siteData[i].marker); siteData[i].marker = null; }
  if (siteData[i].circle) { sitesLayer.removeLayer(siteData[i].circle); siteData[i].circle = null; }
  siteData[i].center = null;
}

function updateExportBtn() {
  var count = siteData.filter(function(s){return s.center !== null}).length;
  document.getElementById('btn-export').textContent = '\\u05E9\\u05DE\\u05D5\\u05E8 JSON (' + count + '/5)';
}

map.on('click', function(e) {
  if (activeSite === null) return;
  placeSite(activeSite, e.latlng);
  var current = activeSite;
  activeSite = null;
  map.getContainer().style.cursor = '';
  for (var j = current + 1; j < 5; j++) {
    if (!siteData[j].center) { activeSite = j; map.getContainer().style.cursor = 'crosshair'; break; }
  }
  renderTable();
  updateExportBtn();
});

// Export button
var exportBtn = document.getElementById('btn-export');
L.DomEvent.disableClickPropagation(exportBtn);
exportBtn.addEventListener('click', function() {
  var result = {};
  siteNames.forEach(function(name, i) {
    var c = siteData[i].center;
    if (!c) { result[siteIds[i]] = {name:name, center:null, bounds:null}; return; }
    result[siteIds[i]] = {
      name: name,
      center: {lat:c[0], lon:c[1]},
      bounds: {
        sw: {lat: c[0]-0.0006, lon: c[1]-0.0006},
        ne: {lat: c[0]+0.0006, lon: c[1]+0.0006}
      }
    };
  });
  var blob = new Blob([JSON.stringify(result, null, 2)], {type:'application/json'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'site-locations.json'; a.click();
  document.getElementById('save-msg').style.display = 'inline';
  setTimeout(function(){ document.getElementById('save-msg').style.display = 'none'; }, 2000);
});

// Show all button
var btnShowAll = document.getElementById('btn-show-all');
L.DomEvent.disableClickPropagation(btnShowAll);
btnShowAll.addEventListener('click', function() {
  var allBounds = [];
  siteData.forEach(function(s) { if (s.center) allBounds.push(s.center); });
  if (allBounds.length > 0) {
    map.fitBounds(allBounds, {padding: [60, 60], maxZoom: 16});
  } else {
    map.setView([32.0513, 34.7920], 15);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. PARCELS LAYER \\u2014 colored by size
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  var count = PARCELS_DATA.features.length;
  L.geoJSON(PARCELS_DATA, {
    style: function(f) {
      var area = f.properties.Shape_Area || 0;
      if (area > 5000) return { color: '#c62828', weight: 0.8, fillColor: '#ef5350', fillOpacity: 0.3 };
      if (area >= 1000) return { color: '#e65100', weight: 0.8, fillColor: '#ff9800', fillOpacity: 0.25 };
      return { color: '#2e7d32', weight: 0.8, fillColor: '#66bb6a', fillOpacity: 0.15 };
    },
    onEachFeature: function(f, layer) {
      var p = f.properties;
      var area = p.Shape_Area || 0;
      var moshaa = area > 5000;
      layer.bindTooltip('\\u05D2\\u05D5\\u05E9 ' + p.ms_gush + ' / \\u05D7\\u05DC\\u05E7\\u05D4 ' + p.ms_chelka + ' | ' + area.toFixed(0) + " \\u05DE\\"\\u05E8", {sticky: true, direction: 'top'});
      layer.bindPopup(
        '<div class="info-panel"><h4>\\u05D7\\u05DC\\u05E7\\u05D4 ' + p.ms_gush + '/' + p.ms_chelka + '</h4><table>' +
        '<tr><td>\\u05E9\\u05D8\\u05D7</td><td>' + area.toFixed(0) + " \\u05DE\\"\\u05E8</td></tr>" +
        (p.heara ? '<tr><td>\\u05D4\\u05E2\\u05E8\\u05D4</td><td>' + p.heara + '</td></tr>' : '') +
        (moshaa ? '<tr><td colspan="2" style="color:#c62828;font-weight:bold">\\u26A0\\uFE0F \\u05D7\\u05E9\\u05D3 \\u05DE\\u05D5\\u05E9\\u05E2 (> 5,000 \\u05DE\\"\\u05E8)</td></tr>' : '') +
        '</table></div>'
      );
    }
  }).addTo(parcelsLayer);
  logStatus('\\u2705 \\u05D7\\u05DC\\u05E7\\u05D5\\u05EA: ' + count + ' features');
})();
parcelsLayer.addTo(map);

// ══════════════════════════════════════════════════════════════════════════════
// 2. MUNICIPAL OWNERSHIP \\u2014 blue transparent
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  var count = MUNICIPAL_DATA.features.length;
  L.geoJSON(MUNICIPAL_DATA, {
    style: { color: '#1565c0', weight: 1, fillColor: '#42a5f5', fillOpacity: 0.25 },
    onEachFeature: function(f, layer) {
      var p = f.properties;
      layer.bindPopup('<div class="info-panel"><h4 style="color:#1565c0">\\u05D1\\u05E2\\u05DC\\u05D5\\u05EA \\u05E2\\u05D9\\u05E8\\u05D9\\u05D9\\u05D4</h4><table>' +
        '<tr><td>\\u05D2\\u05D5\\u05E9/\\u05D7\\u05DC\\u05E7\\u05D4</td><td>' + p.ms_gush + '/' + p.ms_chelka + '</td></tr>' +
        '<tr><td>\\u05E1\\u05D5\\u05D2</td><td>' + (p.t_sug||'?') + '</td></tr>' +
        '<tr><td>\\u05E9\\u05D8\\u05D7</td><td>' + (p.Shape_Area||0).toFixed(0) + " \\u05DE\\"\\u05E8</td></tr>" +
        '</table></div>');
    }
  }).addTo(municipalLayer);
  logStatus('\\u2705 \\u05D1\\u05E2\\u05DC\\u05D5\\u05EA \\u05E2\\u05D9\\u05E8\\u05D5\\u05E0\\u05D9\\u05EA: ' + count + ' features');
})();
municipalLayer.addTo(map);

// ══════════════════════════════════════════════════════════════════════════════
// 3. TABA PLANS \\u2014 split: base plan (2215) vs other plans
// ══════════════════════════════════════════════════════════════════════════════
var BASE_PLAN_ID = '\\u05EA\\u05D0/2215';

(function() {
  var boundaryByPlan = {};
  PLAN_BOUNDARIES_V2.features.forEach(function(f) {
    boundaryByPlan[f.properties.plan_id] = f;
  });

  var planCount = 0;

  PLANS_DATABASE.forEach(function(plan) {
    var pc = getPlanColor(plan.plan_id);
    var isBase = plan.plan_id === BASE_PLAN_ID;
    var isProcess = plan.status !== '\\u05DE\\u05D0\\u05D5\\u05E9\\u05E8\\u05EA';
    var strokeColor, fillColor, fillOpacity, dashArray;

    if (isBase) {
      // Base plan: dashed grey outline only, no fill
      strokeColor = '#757575';
      fillColor = 'transparent';
      fillOpacity = 0;
      dashArray = '8,4';
    } else if (isProcess) {
      strokeColor = PLAN_PROCESS_STYLE.stroke;
      fillColor = PLAN_PROCESS_STYLE.fill;
      fillOpacity = 0.12;
      dashArray = '6,6';
    } else if (pc) {
      strokeColor = pc.stroke;
      fillColor = pc.fill;
      fillOpacity = 0.15;
      dashArray = null;
    } else {
      strokeColor = '#7b1fa2';
      fillColor = '#ce93d8';
      fillOpacity = 0.12;
      dashArray = null;
    }

    var boundary = boundaryByPlan[plan.plan_id];
    if (boundary) {
      var targetLayer = isBase ? tabaBaseLayer : tabaPlansLayer;
      var geoLayer = L.geoJSON(boundary, {
        style: {
          color: strokeColor, weight: 2, fillColor: fillColor,
          fillOpacity: fillOpacity, dashArray: dashArray
        },
        onEachFeature: function(f, layer) {
          layer.bindPopup(buildPlanPopup(plan, strokeColor), {maxWidth: 400});
          // Hover highlight
          layer.on('mouseover', function() {
            layer.setStyle({ fillOpacity: isBase ? 0.08 : 0.45, weight: 3.5 });
            layer.bringToFront();
          });
          layer.on('mouseout', function() {
            layer.setStyle({ fillOpacity: fillOpacity, weight: 2 });
          });
        }
      }).addTo(targetLayer);

      planLayerMap[plan.plan_id] = {
        layer: geoLayer, plan: plan,
        strokeColor: strokeColor, fillColor: fillColor,
        fillOpacity: fillOpacity, dashArray: dashArray
      };
      planCount++;
    }
  });

  logStatus('\\u2705 \\u05EA\\u05DB\\u05E0\\u05D9\\u05D5\\u05EA: ' + planCount + ' plans');
})();
tabaPlansLayer.addTo(map);
// tabaBaseLayer NOT added — off by default

function buildPlanPopup(plan, color) {
  var provisions = (plan.key_provisions || []).slice(0, 3);
  var html = '<div class="plan-popup">' +
    '<h4 style="color:' + color + '">' + plan.plan_id + ' \\u2014 ' + plan.plan_name + '</h4>' +
    '<table>' +
    '<tr><td>\\u05E1\\u05D8\\u05D8\\u05D5\\u05E1</td><td>' + plan.status + '</td></tr>' +
    (plan.year ? '<tr><td>\\u05E9\\u05E0\\u05D4</td><td>' + plan.year + '</td></tr>' : '') +
    (plan.area_dunam ? '<tr><td>\\u05E9\\u05D8\\u05D7</td><td>' + plan.area_dunam + ' \\u05D3\\u05D5\\u05E0\\u05DD</td></tr>' : '') +
    '<tr><td>\\u05D2\\u05D5\\u05E9\\u05D9\\u05DD</td><td>' + (plan.gushim || []).join(', ') + '</td></tr>' +
    '</table>';
  if (plan.description_heb) {
    html += '<div style="font-size:11px;color:#555;margin:4px 0;line-height:1.4">' +
      plan.description_heb.substring(0, 200) + (plan.description_heb.length > 200 ? '...' : '') + '</div>';
  }
  if (provisions.length > 0) {
    html += '<ol class="provisions">';
    provisions.forEach(function(p) {
      html += '<li>' + p.substring(0, 120) + (p.length > 120 ? '...' : '') + '</li>';
    });
    html += '</ol>';
  }
  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. ZONING LAYER
// ══════════════════════════════════════════════════════════════════════════════
var zoningColors = {
  '\\u05DE\\u05D2\\u05D5\\u05E8\\u05D9\\u05DD':'#4caf50',
  '\\u05EA\\u05D7\\u05D1\\u05D5\\u05E8\\u05D4':'#78909c',
  '\\u05DE\\u05D1\\u05E0\\u05D9\\u05DD \\u05D5\\u05DE\\u05D5\\u05E1\\u05D3\\u05D5\\u05EA \\u05E6\\u05D9\\u05D1\\u05D5\\u05E8':'#29b6f6',
  '\\u05E9\\u05D8\\u05D7\\u05D9\\u05DD \\u05E4\\u05EA\\u05D5\\u05D7\\u05D9\\u05DD':'#81c784',
  '\\u05DE\\u05E1\\u05D7\\u05E8':'#ffc107',
  '\\u05EA\\u05E2\\u05E1\\u05D5\\u05E7\\u05D4':'#7e57c2',
  '\\u05DE\\u05D2\\u05D5\\u05E8\\u05D9\\u05DD-\\u05EA\\u05E2\\u05E1\\u05D5\\u05E7\\u05D4 \\u05DE\\u05E2\\u05D5\\u05E8\\u05D1':'#ec407a',
  '\\u05E9\\u05D8\\u05D7 \\u05DC\\u05EA\\u05DB\\u05E0\\u05D5\\u05DF \\u05D1\\u05E2\\u05EA\\u05D9\\u05D3':'#bdbdbd',
  '\\u05D0\\u05D7\\u05E8':'#e0e0e0',
  '\\u05DC\\u05DC\\u05D0 \\u05E1\\u05D9\\u05D5\\u05D5\\u05D2':'#f5f5f5'
};

(function() {
  var count = LAND_USE_DATA.features.length;
  L.geoJSON(LAND_USE_DATA, {
    style: function(f) {
      return { color:'#666', weight:0.3, fillColor: zoningColors[f.properties.t_yeud_rashi]||'#e0e0e0', fillOpacity:0.25 };
    },
    onEachFeature: function(f, layer) {
      var p = f.properties;
      layer.bindPopup('<div class="info-panel"><h4>' + (p.t_yeud_rashi||'?') + '</h4><table>' +
        '<tr><td>\\u05DE\\u05E4\\u05D5\\u05E8\\u05D8</td><td>' + (p.t_yeud_karka||'?') + '</td></tr>' +
        '<tr><td>\\u05EA\\u05D1\\"\\u05E2</td><td>' + (p.st_taba||'').trim() + '</td></tr>' +
        '</table></div>');
    }
  }).addTo(zoningLayer);
  logStatus('\\u2705 \\u05D9\\u05D9\\u05E2\\u05D5\\u05D3\\u05D9 \\u05E7\\u05E8\\u05E7\\u05E2: ' + count + ' features');
})();

// ══════════════════════════════════════════════════════════════════════════════
// 5. MOSHAA LAYER \\u2014 filtered from parcels, colored by status
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  var moshaaFeatures = PARCELS_DATA.features.filter(function(f) {
    var p = f.properties;
    return MOSHAA_LOOKUP[p.ms_gush + '_' + p.ms_chelka] !== undefined;
  });
  var count = 0;
  moshaaFeatures.forEach(function(f) {
    var p = f.properties;
    var m = MOSHAA_LOOKUP[p.ms_gush + '_' + p.ms_chelka];
    var mc = MOSHAA_COLORS[m.status] || MOSHAA_COLORS['\\u05DC\\u05DC\\u05D0_\\u05D8\\u05D9\\u05E4\\u05D5\\u05DC'];
    var dunam = (m.area_sqm / 1000).toFixed(1);
    var statusLabel = m.status === '\\u05DC\\u05DC\\u05D0_\\u05D8\\u05D9\\u05E4\\u05D5\\u05DC' ? '\\u05DC\\u05DC\\u05D0 \\u05D8\\u05D9\\u05E4\\u05D5\\u05DC' : m.status === '\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA_\\u05E8\\u05D4_\\u05E4\\u05E8\\u05E6\\u05DC\\u05E6\\u05D9\\u05D4' ? '\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA \\u05E8\\u05D4-\\u05E4\\u05E8\\u05E6\\u05DC\\u05E6\\u05D9\\u05D4' : '\\u05E9\\u05D5\\u05D9\\u05DB\\u05D4';
    var planText = m.plan_id ? m.plan_id + (m.plan_year ? ' (' + m.plan_year + ')' : '') : '\\u05D0\\u05D9\\u05DF \\u05EA\\u05DB\\u05E0\\u05D9\\u05EA';
    var sitesText = m.overlapping_sites.length > 0 ? m.overlapping_sites.map(function(s){return siteNames[s-1]}).join(', ') : '\\u2014';

    L.geoJSON(f, {
      style: {
        color: mc.stroke, weight: 2, fillColor: mc.fill, fillOpacity: 0.4
      },
      onEachFeature: function(feat, layer) {
        layer.bindTooltip('\\u05DE\\u05D5\\u05E9\\u05E2 ' + p.ms_gush + '/' + p.ms_chelka + ' | ' + dunam + ' \\u05D3\\u05D5\\u05E0\\u05DD', {sticky: true, direction: 'top'});
        layer.bindPopup(
          '<div class="info-panel" style="min-width:220px"><h4 style="color:' + mc.stroke + '">\\u05D2\\u05D5\\u05E9 ' + p.ms_gush + ' / \\u05D7\\u05DC\\u05E7\\u05D4 ' + p.ms_chelka + '</h4>' +
          '<table>' +
          '<tr><td>\\u05E9\\u05D8\\u05D7</td><td>' + dunam + ' \\u05D3\\u05D5\\u05E0\\u05DD</td></tr>' +
          '<tr><td>\\u05E1\\u05D8\\u05D8\\u05D5\\u05E1</td><td style="color:' + mc.stroke + ';font-weight:600">' + statusLabel + '</td></tr>' +
          '<tr><td>\\u05EA\\u05DB\\u05E0\\u05D9\\u05EA</td><td>' + planText + '</td></tr>' +
          '<tr><td>\\u05D0\\u05EA\\u05E8\\u05D9\\u05DD \\u05D7\\u05D5\\u05E4\\u05E4\\u05D9\\u05DD</td><td>' + sitesText + '</td></tr>' +
          '</table>' +
          '<div style="font-size:10px;color:#888;margin-top:4px;border-top:1px solid #eee;padding-top:3px">\\u05D7\\u05DC\\u05E7\\u05EA \\u05DE\\u05D5\\u05E9\\u05E2 \\u2014 \\u05D1\\u05E2\\u05DC\\u05D5\\u05EA \\u05DE\\u05E9\\u05D5\\u05EA\\u05E4\\u05EA</div>' +
          '</div>'
        );
      }
    }).addTo(moshaaLayer);
    count++;
  });
  logStatus('\\u2705 \\u05DE\\u05D5\\u05E9\\u05E2: ' + count + '/65 parcels matched');
})();
moshaaLayer.addTo(map);

// ══════════════════════════════════════════════════════════════════════════════
// LOAD SITES + FINISH
// ══════════════════════════════════════════════════════════════════════════════
Object.keys(savedPositions).forEach(function(i) {
  placeSite(parseInt(i), L.latLng(savedPositions[i][0], savedPositions[i][1]));
});
renderTable();
updateExportBtn();
logStatus('\\u2705 \\u05D0\\u05EA\\u05E8\\u05D9 \\u05E1\\u05D8\\u05D5\\u05D3\\u05D9\\u05D5: 5');

pickerBody.classList.add('collapsed');
pickerToggle.textContent = '\\u25B8';

statusEl.classList.add('done');
setTimeout(function() { statusEl.style.display = 'none'; }, 5000);

// ══════════════════════════════════════════════════════════════════════════════
// PLANS PANEL (right side)
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  var panelEl = document.getElementById('plans-panel');
  var panelBody = document.getElementById('plans-panel-body');
  var panelToggle = document.getElementById('plans-panel-toggle');
  L.DomEvent.disableClickPropagation(panelEl);
  L.DomEvent.disableScrollPropagation(panelEl);

  document.getElementById('plans-panel-header').addEventListener('click', function() {
    panelBody.classList.toggle('collapsed');
    panelToggle.textContent = panelBody.classList.contains('collapsed') ? '\\u25B8' : '\\u25BE';
  });

  // Build plan list
  var html = '';
  PLANS_DATABASE.forEach(function(plan) {
    var entry = planLayerMap[plan.plan_id];
    if (!entry) return;
    var isBase = plan.plan_id === BASE_PLAN_ID;
    var isProcess = plan.status !== '\\u05DE\\u05D0\\u05D5\\u05E9\\u05E8\\u05EA';
    var dotStyle = isBase
      ? 'background:transparent;border:2px dashed #757575'
      : 'background:' + entry.fillColor + ';border-color:' + entry.strokeColor + (isProcess ? ';border-style:dashed' : '');
    html += '<div class="plan-list-item" data-plan="' + plan.plan_id + '">' +
      '<div class="plan-dot" style="' + dotStyle + '"></div>' +
      '<div class="plan-label">' + plan.plan_id + (isBase ? ' (\\u05D1\\u05E1\\u05D9\\u05E1)' : '') +
      '<br><span style="color:#777;font-size:10px">' + plan.plan_name + '</span></div>' +
      '<div class="plan-year">' + (plan.year || '') + '</div>' +
      '</div>';
  });
  panelBody.innerHTML = html;

  // Click handler: zoom to plan + open popup
  panelBody.addEventListener('click', function(e) {
    var item = e.target.closest('.plan-list-item');
    if (!item) return;
    var planId = item.dataset.plan;
    var entry = planLayerMap[planId];
    if (!entry) return;

    // If base plan layer is off, add it temporarily
    var isBase = planId === BASE_PLAN_ID;
    if (isBase && !map.hasLayer(tabaBaseLayer)) {
      map.addLayer(tabaBaseLayer);
    }

    // Zoom to plan bounds
    var bounds = entry.layer.getBounds();
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });

    // Open popup on first sub-layer
    entry.layer.eachLayer(function(l) {
      l.openPopup();
    });
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// LAYER CONTROL + LEGEND
// ══════════════════════════════════════════════════════════════════════════════
L.control.layers(
  {'OpenStreetMap': osmLayer, '\\u{1F6F0}\\uFE0F \\u05DC\\u05D5\\u05D5\\u05D9\\u05DF': satellite, '\\u05D1\\u05D4\\u05D9\\u05E8': cartoLight},
  {
    '\\u{1F4CD} \\u05D0\\u05EA\\u05E8\\u05D9 \\u05E1\\u05D8\\u05D5\\u05D3\\u05D9\\u05D5': sitesLayer,
    '\\u{1F4D0} \\u05EA\\u05D1\\"\\u05E2\\u05D5\\u05EA \\u05E0\\u05D5\\u05E1\\u05E4\\u05D5\\u05EA': tabaPlansLayer,
    '\\u{1F4DC} \\u05EA\\u05D0/2215 \\u2014 \\u05EA\\u05DB\\u05E0\\u05D9\\u05EA \\u05D1\\u05E1\\u05D9\\u05E1': tabaBaseLayer,
    '\\u{1F7EB} \\u05D7\\u05DC\\u05E7\\u05D5\\u05EA (\\u05DC\\u05E4\\u05D9 \\u05D2\\u05D5\\u05D3\\u05DC)': parcelsLayer,
    '\\u{1F535} \\u05D1\\u05E2\\u05DC\\u05D5\\u05EA \\u05E2\\u05D9\\u05E8\\u05D5\\u05E0\\u05D9\\u05EA': municipalLayer,
    '\\u{1F7E5} \\u05D0\\u05D3\\u05DE\\u05D5\\u05EA \\u05DE\\u05D5\\u05E9\\u05E2': moshaaLayer,
    '\\u{1F3A8} \\u05D9\\u05D9\\u05E2\\u05D5\\u05D3\\u05D9 \\u05E7\\u05E8\\u05E7\\u05E2': zoningLayer
  },
  {collapsed: false, position: 'topleft'}
).addTo(map);

var legend = L.control({position:'bottomleft'});
legend.onAdd = function() {
  var div = L.DomUtil.create('div','legend');

  // Plans legend - per plan
  var plansHtml = '<h4>\\u05EA\\u05D1\\"\\u05E2\\u05D5\\u05EA</h4>';
  plansHtml += '<div class="legend-item"><div class="legend-color" style="background:transparent;border:2px dashed #757575"></div>\\u05EA\\u05D0/2215 \\u2014 \\u05EA\\u05DB\\u05E0\\u05D9\\u05EA \\u05D1\\u05E1\\u05D9\\u05E1 (\\u05DB\\u05D1\\u05D5\\u05D9)</div>';
  var planKeys = Object.keys(PLAN_COLORS);
  planKeys.forEach(function(id) {
    if (id === '\\u05EA\\u05D0/2215') return; // skip base in main legend
    var pc = PLAN_COLORS[id];
    plansHtml += '<div class="legend-item"><div class="legend-color" style="background:' + pc.fill + ';border-color:' + pc.stroke + '"></div>' + pc.label + '</div>';
  });
  plansHtml += '<div class="legend-item"><div class="legend-color" style="background:#fff176;border-color:#f9a825;border-style:dashed"></div>\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA (\\u05E7\\u05D5 \\u05DE\\u05E7\\u05D5\\u05D5\\u05E7\\u05D5)</div>';

  div.innerHTML =
    '<h4>\\u05D7\\u05DC\\u05E7\\u05D5\\u05EA \\u2014 \\u05DC\\u05E4\\u05D9 \\u05D2\\u05D5\\u05D3\\u05DC</h4>' +
    '<div class="legend-item"><div class="legend-color" style="background:#66bb6a;border-color:#2e7d32"></div>&lt; 1,000 \\u05DE\\"\\u05E8</div>' +
    '<div class="legend-item"><div class="legend-color" style="background:#ff9800;border-color:#e65100"></div>1,000\\u20135,000 \\u05DE\\"\\u05E8</div>' +
    '<div class="legend-item"><div class="legend-color" style="background:#ef5350;border-color:#c62828"></div>&gt; 5,000 \\u05DE\\"\\u05E8 (\\u05D7\\u05E9\\u05D3 \\u05DE\\u05D5\\u05E9\\u05E2)</div>' +
    '<h4>\\u05D1\\u05E2\\u05DC\\u05D5\\u05EA \\u05E2\\u05D9\\u05E8\\u05D5\\u05E0\\u05D9\\u05EA</h4>' +
    '<div class="legend-item"><div class="legend-color" style="background:rgba(66,165,245,0.25);border-color:#1565c0"></div>\\u05E2\\u05D9\\u05E8\\u05D9\\u05D9\\u05EA \\u05EA\\"\\u05D0 (\\u05E9\\u05DB\\u05D1\\u05D4 515)</div>' +
    '<h4>\\u05D0\\u05D3\\u05DE\\u05D5\\u05EA \\u05DE\\u05D5\\u05E9\\u05E2</h4>' +
    '<div class="legend-item"><div class="legend-color" style="background:#b71c1c;border-color:#b71c1c"></div>\\u05DC\\u05DC\\u05D0 \\u05D8\\u05D9\\u05E4\\u05D5\\u05DC (57)</div>' +
    '<div class="legend-item"><div class="legend-color" style="background:#ef6c00;border-color:#ef6c00"></div>\\u05D1\\u05EA\\u05D4\\u05DC\\u05D9\\u05DA \\u05E8\\u05D4-\\u05E4\\u05E8\\u05E6\\u05DC\\u05E6\\u05D9\\u05D4 (6)</div>' +
    '<div class="legend-item"><div class="legend-color" style="background:#2e7d32;border-color:#2e7d32"></div>\\u05E9\\u05D5\\u05D9\\u05DB\\u05D4 (2)</div>' +
    plansHtml +
    '<h4>\\u05D0\\u05EA\\u05E8\\u05D9 \\u05E1\\u05D8\\u05D5\\u05D3\\u05D9\\u05D5</h4>' +
    siteNames.map(function(n,i){return '<div class="legend-item"><div class="legend-color" style="background:transparent;border:2px dashed ' + siteColors[i] + ';border-radius:50%"></div>' + (i+1) + '. ' + n + '</div>'}).join('') +
    '<h4>\\u05D9\\u05D9\\u05E2\\u05D5\\u05D3\\u05D9 \\u05E7\\u05E8\\u05E7\\u05E2</h4>' +
    Object.entries(zoningColors).filter(function(e){return !['\\u05D0\\u05D7\\u05E8','\\u05DC\\u05DC\\u05D0 \\u05E1\\u05D9\\u05D5\\u05D5\\u05D2','\\u05E9\\u05D8\\u05D7 \\u05DC\\u05EA\\u05DB\\u05E0\\u05D5\\u05DF \\u05D1\\u05E2\\u05EA\\u05D9\\u05D3'].includes(e[0])}).map(function(e){return '<div class="legend-item"><div class="legend-color" style="background:'+e[1]+';border-color:#999"></div>'+e[0]+'</div>'}).join('');
  return div;
};
legend.addTo(map);
<\/script>
</body>
</html>`;

const outPath = resolve(root, 'research/ownership-parcellation/map.html');
writeFileSync(outPath, html, 'utf8');
const sizeMB = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`\nWritten: ${outPath} (${sizeMB} MB)`);
