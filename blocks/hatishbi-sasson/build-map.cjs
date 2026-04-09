#!/usr/bin/env node
/**
 * Build block-map.html for Hatishbi-Sasson block
 * Embeds the database + all GeoJSON layers into a single HTML file
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function readFile(filename) {
  return fs.readFileSync(path.join(DATA_DIR, filename), "utf8");
}

function readJSONSafe(filename) {
  try {
    return readFile(filename);
  } catch {
    return '{"type":"FeatureCollection","features":[]}';
  }
}

// Load all data as strings for embedding
const database = readFile("block-database.json");
const buildingsGeoJSON = readFile("buildings.geojson");
const parcelsGeoJSON = readFile("parcels.geojson");
const landUseGeoJSON = readFile("land_use.geojson");
const municipalGeoJSON = readFile("municipal_ownership.geojson");
const permitsGeoJSON = readFile("building_permits.geojson");
const constructionGeoJSON = readFile("construction_sites.geojson");
const treesGeoJSON = readFile("trees.geojson");
const conservationGeoJSON = readJSONSafe("conservation.geojson");
const dangerousGeoJSON = readJSONSafe("dangerous_buildings.geojson");
const addressesGeoJSON = readFile("addresses.geojson");
const businessesGeoJSON = readFile("businesses.geojson");
const greenSpacesGeoJSON = readFile("green_spaces.geojson");
const streetCenterlinesGeoJSON = readFile("street_centerlines.geojson");
const sheltersGeoJSON = readFile("shelters.geojson");
// Simplify citywide plans - reduce coordinate precision to 5 decimals and thin coordinates
function simplifyGeoJSON(jsonStr, precisionDigits) {
  const gj = JSON.parse(jsonStr);
  function roundCoords(coords) {
    if (typeof coords[0] === "number") {
      return [
        parseFloat(coords[0].toFixed(precisionDigits)),
        parseFloat(coords[1].toFixed(precisionDigits)),
      ];
    }
    return coords.map((c) => roundCoords(c));
  }
  function thinRing(ring, step) {
    if (ring.length <= 10) return ring;
    const result = [];
    for (let i = 0; i < ring.length; i += step) result.push(ring[i]);
    // Ensure ring closes
    if (
      result.length > 0 &&
      (result[result.length - 1][0] !== result[0][0] ||
        result[result.length - 1][1] !== result[0][1])
    ) {
      result.push(result[0]);
    }
    return result;
  }
  function simplifyGeom(geom) {
    if (geom.type === "Polygon") {
      geom.coordinates = geom.coordinates.map((ring) =>
        roundCoords(thinRing(ring, 3)),
      );
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates = geom.coordinates.map((poly) =>
        poly.map((ring) => roundCoords(thinRing(ring, 3))),
      );
    } else {
      geom.coordinates = roundCoords(geom.coordinates);
    }
  }
  for (const f of gj.features) {
    simplifyGeom(f.geometry);
    // Keep only essential properties
    const p = f.properties;
    f.properties = {
      shem_taba: p.shem_taba,
      taba: p.taba,
      t_status: p.t_status,
      id_taba: p.id_taba,
    };
  }
  return JSON.stringify(gj);
}
const citywidePlansGeoJSON = simplifyGeoJSON(
  readFile("citywide_plans.geojson"),
  5,
);
const contextBuildingsGeoJSON = readJSONSafe("context_buildings.geojson");

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>בלוק תשבי-ששון | שכונת התקווה</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;direction:rtl;overflow:hidden;color:#1f2937;font-size:13px}
#app{display:flex;height:100vh;width:100vw}
#side-panel{width:32%;min-width:320px;max-width:440px;background:#fff;border-left:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden;z-index:1000}
#panel-header{padding:14px 18px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb}
#panel-header .title{font-size:16px;font-weight:700;color:#111827}
#panel-header .subtitle{font-size:11px;color:#6b7280;margin-top:2px}
#tabs{display:flex;background:#fff;border-bottom:1px solid #e5e7eb}
.tab{flex:1;padding:10px 6px;text-align:center;cursor:pointer;font-size:11.5px;font-weight:500;color:#9ca3af;border-bottom:2px solid transparent;transition:all .15s}
.tab.active{color:#3b82f6;border-bottom-color:#3b82f6}
.tab:hover{color:#6b7280}
.tab-content{display:none;flex:1;overflow-y:auto;padding:14px 18px}
.tab-content.active{display:block}
#map-container{flex:1;position:relative}
#map{width:100%;height:100%}

/* Info sections */
.info-section{margin-bottom:16px}
.info-section h3{font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f3f4f6}
.info-table{width:100%;border-collapse:collapse}
.info-table td{padding:4px 0;border-bottom:1px solid #f9fafb;vertical-align:top;font-size:12px}
.info-table td:first-child{font-weight:500;white-space:nowrap;width:35%;color:#6b7280}
.info-table td:last-child{color:#111827}

/* Status badges */
.badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:10.5px;font-weight:500}
.badge-green{background:#f0fdf4;color:#166534}
.badge-amber{background:#fffbeb;color:#92400e}
.badge-red{background:#fef2f2;color:#991b1b}
.badge-blue{background:#eff6ff;color:#1e40af}
.badge-gray{background:#f3f4f6;color:#4b5563}

/* Building list */
.addr-list{list-style:none;padding:0}
.addr-item{padding:8px 10px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .1s;display:flex;justify-content:space-between;align-items:center}
.addr-item:hover{background:#f0f9ff}
.addr-item .addr-name{font-weight:500;font-size:12px}
.addr-item .addr-meta{font-size:10.5px;color:#6b7280}
.addr-item .chelka-tag{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500}

/* Layer toggles */
.layer-group{margin-bottom:12px}
.layer-group h4{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
.layer-toggle{display:flex;align-items:center;padding:4px 0;cursor:pointer;font-size:12px}
.layer-toggle input{margin-left:8px;accent-color:#3b82f6}
.layer-toggle .count{margin-right:auto;font-size:10px;color:#9ca3af;background:#f3f4f6;padding:0 5px;border-radius:8px}

/* Documents timeline */
.doc-item{padding:10px 12px;border-right:3px solid #d1d5db;margin-bottom:8px;background:#fafafa;border-radius:0 6px 6px 0}
.doc-item.survey{border-right-color:#3b82f6}
.doc-item.permit{border-right-color:#f59e0b}
.doc-item.other{border-right-color:#9ca3af}
.doc-item .doc-header{display:flex;justify-content:space-between;margin-bottom:4px}
.doc-item .doc-type{font-weight:600;font-size:12px}
.doc-item .doc-year{font-size:11px;color:#6b7280}
.doc-item .doc-detail{font-size:11px;color:#4b5563;line-height:1.5}
.doc-item .doc-link{display:inline-block;margin-top:4px;font-size:11px;color:#2563eb;text-decoration:none;padding:2px 6px;background:#eff6ff;border-radius:3px}
.doc-item .doc-link:hover{background:#dbeafe;text-decoration:underline}

/* Plan cards */
.plan-card{padding:12px;margin-bottom:10px;border-radius:6px;background:#fafafa;border-right:3px solid #6366f1}
.plan-card.basis{border-right-color:#2563eb;background:#eff6ff}
.plan-card.not-applicable{border-right-color:#d1d5db;background:#f9fafb;opacity:0.7}
.plan-card .plan-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.plan-card .plan-id{font-weight:700;font-size:13px;color:#111827}
.plan-card .plan-year{font-size:11px;color:#6b7280}
.plan-card .plan-desc{font-size:11px;color:#4b5563;line-height:1.5;margin-bottom:6px}
.plan-card .plan-files{display:flex;flex-wrap:wrap;gap:4px}
.plan-card .plan-files a{font-size:10.5px;color:#2563eb;text-decoration:none;padding:2px 8px;background:#eff6ff;border-radius:3px;display:inline-block}
.plan-card .plan-files a:hover{background:#dbeafe;text-decoration:underline}
.plan-note{font-size:10px;color:#6b7280;font-style:italic;margin-top:2px}

/* Popup */
.leaflet-popup-content{direction:rtl;font-family:"Segoe UI",system-ui,sans-serif;font-size:12px;min-width:220px;max-width:320px}
.leaflet-popup-content h4{margin:0 0 6px;font-size:14px;color:#111827}
.popup-table{width:100%;border-collapse:collapse}
.popup-table td{padding:3px 0;font-size:11px;border-bottom:1px solid #f3f4f6}
.popup-table td:first-child{color:#6b7280;width:40%;font-weight:500}
.popup-section{margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb}
.popup-section h5{font-size:11px;font-weight:600;color:#374151;margin-bottom:4px}

/* Block summary cards */
.summary-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.summary-card{background:#f9fafb;border-radius:6px;padding:10px;text-align:center}
.summary-card .val{font-size:20px;font-weight:700;color:#111827}
.summary-card .label{font-size:10px;color:#6b7280;margin-top:2px}

/* Parcel summary */
.parcel-card{padding:10px;margin-bottom:8px;border-radius:6px;border-right:4px solid #ccc}
.parcel-card h4{font-size:12px;font-weight:600;margin-bottom:4px}
.parcel-card .meta{font-size:11px;color:#4b5563;line-height:1.6}

/* Collapse toggle */
#panel-toggle{position:absolute;top:50%;right:0;z-index:1001;background:#fff;border:1px solid #e5e7eb;border-right:none;border-radius:6px 0 0 6px;padding:8px 4px;cursor:pointer;font-size:14px;box-shadow:-2px 0 8px rgba(0,0,0,.05);transform:translateY(-50%)}
#panel-toggle:hover{background:#f3f4f6}
.panel-collapsed #side-panel{display:none}
.panel-collapsed #panel-toggle{right:0}

/* Legend */
.legend{direction:rtl;background:#fff;padding:8px 12px;border-radius:6px;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.2);line-height:1.8}
.legend-item{display:flex;align-items:center;gap:6px}
.legend-swatch{width:14px;height:10px;border-radius:2px;border:1px solid rgba(0,0,0,.15);flex-shrink:0}

/* Scrollbar */
.tab-content::-webkit-scrollbar{width:5px}
.tab-content::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
</style>
</head>
<body>
<div id="app">
<div id="side-panel">
  <div id="panel-header">
    <div class="title">בלוק תשבי-ששון</div>
    <div class="subtitle">גוש 6135 | חלקות 43, 44, 71, 110 | שכונת התקווה</div>
  </div>
  <div id="tabs">
    <div class="tab active" data-tab="info">מידע</div>
    <div class="tab" data-tab="buildings">מבנים</div>
    <div class="tab" data-tab="layers">שכבות</div>
    <div class="tab" data-tab="docs">מסמכים</div>
    <div class="tab" data-tab="plans">תכניות</div>
  </div>
  <div id="tab-info" class="tab-content active"></div>
  <div id="tab-buildings" class="tab-content"></div>
  <div id="tab-layers" class="tab-content"></div>
  <div id="tab-docs" class="tab-content"></div>
  <div id="tab-plans" class="tab-content"></div>
</div>
<div id="map-container">
  <button id="panel-toggle" title="סגור/פתח פאנל">◀</button>
  <div id="map"></div>
</div>
</div>

<script>
// ====== EMBEDDED DATA ======
const DB = ${database};
const BUILDINGS_GJ = ${buildingsGeoJSON};
const PARCELS_GJ = ${parcelsGeoJSON};
const LAND_USE_GJ = ${landUseGeoJSON};
const MUNICIPAL_GJ = ${municipalGeoJSON};
const PERMITS_GJ = ${permitsGeoJSON};
const CONSTRUCTION_GJ = ${constructionGeoJSON};
const TREES_GJ = ${treesGeoJSON};
const CONSERVATION_GJ = ${conservationGeoJSON};
const DANGEROUS_GJ = ${dangerousGeoJSON};
const ADDRESSES_GJ = ${addressesGeoJSON};
const BUSINESSES_GJ = ${businessesGeoJSON};
const GREEN_SPACES_GJ = ${greenSpacesGeoJSON};
const STREETS_GJ = ${streetCenterlinesGeoJSON};
const SHELTERS_GJ = ${sheltersGeoJSON};
const CITYWIDE_PLANS_GJ = ${citywidePlansGeoJSON};
const CONTEXT_BUILDINGS_GJ = ${contextBuildingsGeoJSON};

// ====== CONSTANTS ======
const TARGET_CHELKOT = [43, 44, 71, 110];
const PARCEL_COLORS = {44:'#d97706',110:'#0d9488',43:'#7c3aed',71:'#f97316'};
const PARCEL_LABELS = {44:'ששון (44)',110:'תשבי אי-זוגי (110)',43:'תשבי זוגי (43)',71:'אצ"ל 66 (71)'};

// Building year colors
function yearColor(y){
  if(!y||y===0)return '#9ca3af';
  if(y<1948)return '#991b1b';
  if(y<=1960)return '#ea580c';
  if(y<=1980)return '#ca8a04';
  if(y<=2000)return '#65a30d';
  return '#16a34a';
}
function yearLabel(y){
  if(!y||y===0)return 'לא ידוע';
  if(y<1948)return 'לפני 1948';
  if(y<=1960)return '1948-1960';
  if(y<=1980)return '1960-1980';
  if(y<=2000)return '1980-2000';
  return '2000+';
}

// ====== MAP INIT ======
const bbox = DB.block_info.bbox_wgs84;
const center = [(bbox.south+bbox.north)/2, (bbox.west+bbox.east)/2];

const map = L.map('map',{center,zoom:17,zoomControl:true});

const cartodb = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {attribution:'&copy; CartoDB &copy; OSM',maxZoom:20,subdomains:'abcd'});
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {attribution:'&copy; Esri',maxZoom:20});
cartodb.addTo(map);
L.control.layers({'Positron':cartodb,'לוויין':satellite},{},{position:'topright',collapsed:true}).addTo(map);

// Fit to block bbox with padding
map.fitBounds([[bbox.south,bbox.west],[bbox.north,bbox.east]],{padding:[30,30]});

// ====== LAYER GROUPS ======
const layers = {};
function makeLayer(name){const lg=L.layerGroup();layers[name]=lg;return lg;}

const lyrContextBuildings = makeLayer('context_buildings');
const lyrParcels = makeLayer('parcels');
const lyrLandUse = makeLayer('land_use');
const lyrBuildings = makeLayer('buildings');
const lyrMunicipal = makeLayer('municipal');
const lyrPermits = makeLayer('permits');
const lyrConstruction = makeLayer('construction');
const lyrTrees = makeLayer('trees');
const lyrConservation = makeLayer('conservation');
const lyrDangerous = makeLayer('dangerous');
const lyrAddresses = makeLayer('addresses');
const lyrBusinesses = makeLayer('businesses');
const lyrGreenSpaces = makeLayer('green_spaces');
const lyrStreets = makeLayer('streets');
const lyrShelters = makeLayer('shelters');
const lyrCitywidePlans = makeLayer('citywide_plans');

// Default visible layers
lyrParcels.addTo(map);
lyrBuildings.addTo(map);
lyrLandUse.addTo(map);

// ====== ADDRESS LOOKUP ======
// Build address point map for building matching
const addrPoints = {};
ADDRESSES_GJ.features.forEach(f=>{
  const p=f.properties;
  const key=\`\${p.t_rechov} \${p.ms_bayit}\`.trim();
  addrPoints[key]={coords:f.geometry.coordinates,chelka:p.ms_chelka,gush:p.ms_gush};
});

// Build building lookup by id
const buildingById = {};
BUILDINGS_GJ.features.forEach(f=>{buildingById[f.properties.id_binyan]=f;});

// Build address→building mapping using DB
const addrBuildingMap = {};
for(const[addr,rec] of Object.entries(DB.addresses)){
  if(rec.building&&rec.building.id_binyan){
    addrBuildingMap[addr]=rec.building.id_binyan;
  }
}

// ====== RENDER CONTEXT BUILDINGS ======
L.geoJSON(CONTEXT_BUILDINGS_GJ,{
  style:{color:'#d1d5db',weight:0.5,fillColor:'#e5e7eb',fillOpacity:0.3}
}).addTo(lyrContextBuildings);

// ====== RENDER PARCELS ======
L.geoJSON(PARCELS_GJ,{
  style:function(f){
    const ch=f.properties.ms_chelka;
    const isTarget=TARGET_CHELKOT.includes(ch);
    return{
      color:isTarget?(PARCEL_COLORS[ch]||'#6b7280'):'#9ca3af',
      weight:isTarget?2.5:1,
      opacity:isTarget?0.8:0.4,
      fillColor:isTarget?(PARCEL_COLORS[ch]||'#6b7280'):'#9ca3af',
      fillOpacity:isTarget?0.12:0.05,
      dashArray:isTarget?null:'4 4'
    };
  },
  onEachFeature:function(f,layer){
    const p=f.properties;
    const ch=p.ms_chelka;
    const isTarget=TARGET_CHELKOT.includes(ch);
    const area=p.ms_shetach_rashum||Math.round(p.Shape_Area)||0;
    layer.bindTooltip(\`חלקה \${ch} | \${area.toLocaleString()} מ"ר\`,{direction:'top',sticky:true,className:'parcel-tooltip'});
    if(isTarget){
      layer.on('click',()=>showParcelDetail(ch));
    }
  }
}).addTo(lyrParcels);

// ====== RENDER LAND USE ======
const LU_COLORS={'מגורים ב':'#fde68a','תחבורה':'#d1d5db','מבנים ומוסדות ציבור':'#bfdbfe'};
L.geoJSON(LAND_USE_GJ,{
  style:function(f){
    const t=f.properties.t_yeud_rashi||'';
    return{color:'#9ca3af',weight:0.5,fillColor:LU_COLORS[t]||'#e5e7eb',fillOpacity:0.15};
  },
  onEachFeature:function(f,layer){
    const p=f.properties;
    layer.bindTooltip(p.t_yeud_rashi||p.t_yeud_meshani||'ייעוד',{direction:'top',sticky:true});
  }
}).addTo(lyrLandUse);

// ====== RENDER BUILDINGS ======
// Track which buildings have Gemini docs
const geminiAddrs = new Set(Object.entries(DB.addresses).filter(([k,v])=>v.documents&&v.documents.length>0).map(([k])=>k));
const permitAddrs = new Set(Object.entries(DB.addresses).filter(([k,v])=>v.permits&&v.permits.length>0).map(([k])=>k));

// Map building id to address
const buildingIdToAddr = {};
for(const[addr,rec] of Object.entries(DB.addresses)){
  if(rec.building&&rec.building.id_binyan){
    buildingIdToAddr[rec.building.id_binyan]=addr;
  }
}

let highlightedLayer = null;

L.geoJSON(BUILDINGS_GJ,{
  style:function(f){
    const bid=f.properties.id_binyan;
    const addr=buildingIdToAddr[bid];
    const yr=f.properties.year;
    const hasGemini=addr&&geminiAddrs.has(addr);
    const hasPermit=addr&&permitAddrs.has(addr);
    return{
      color:hasGemini?'#2563eb':(hasPermit?'#d97706':'#6b7280'),
      weight:hasGemini?2.5:(hasPermit?1.8:1),
      opacity:0.8,
      fillColor:yearColor(yr),
      fillOpacity:0.55,
      dashArray:hasPermit&&!hasGemini?'5 3':null
    };
  },
  onEachFeature:function(f,layer){
    const bid=f.properties.id_binyan;
    const addr=buildingIdToAddr[bid];
    const yr=f.properties.year;
    const floors=f.properties.ms_komot;

    // Tooltip
    let tip=addr||\`מבנה \${bid}\`;
    if(yr)tip+=\` | \${yr}\`;
    if(floors)tip+=\` | \${floors} קומות\`;
    layer.bindTooltip(tip,{direction:'top',sticky:true});

    // Hover
    layer.on('mouseover',()=>{if(layer!==highlightedLayer)layer.setStyle({fillOpacity:0.75,weight:2.5});});
    layer.on('mouseout',()=>{if(layer!==highlightedLayer){
      const a2=buildingIdToAddr[bid];
      const hg=a2&&geminiAddrs.has(a2);
      const hp=a2&&permitAddrs.has(a2);
      layer.setStyle({fillOpacity:0.55,weight:hg?2.5:(hp?1.8:1)});
    }});

    // Click - show popup + sidebar
    layer.on('click',()=>{
      if(addr){
        showBuildingPopup(addr,layer);
        showBuildingDetail(addr);
      }
    });
  }
}).addTo(lyrBuildings);

// ====== RENDER MUNICIPAL OWNERSHIP ======
L.geoJSON(MUNICIPAL_GJ,{
  style:{color:'#dc2626',weight:2,opacity:0.6,fillColor:'#fca5a5',fillOpacity:0.15,dashArray:'6 4'},
  onEachFeature:function(f,layer){
    const p=f.properties;
    layer.bindTooltip(\`בעלות עירונית | חלקה \${p.ms_chelka}\`,{direction:'top',sticky:true});
  }
}).addTo(lyrMunicipal);

// ====== RENDER PERMITS ======
L.geoJSON(PERMITS_GJ,{
  style:{color:'#f59e0b',weight:2.5,opacity:0.8,fillColor:'#fbbf24',fillOpacity:0.2},
  onEachFeature:function(f,layer){
    const p=f.properties;
    layer.bindTooltip(\`היתר \${p.request_num} | \${p.addresses||''}\`,{direction:'top',sticky:true});
    layer.on('click',()=>{
      const addr=(p.addresses||'').split(',')[0].trim();
      if(addr&&DB.addresses[addr])showBuildingDetail(addr);
    });
  }
}).addTo(lyrPermits);

// ====== RENDER CONSTRUCTION SITES ======
L.geoJSON(CONSTRUCTION_GJ,{
  style:{color:'#ef4444',weight:2,fillColor:'#fecaca',fillOpacity:0.3,dashArray:'3 5'},
  onEachFeature:function(f,layer){
    const p=f.properties;
    layer.bindTooltip(\`אתר בנייה | \${p.t_ktovet||p.shem_atr||''}\`,{direction:'top',sticky:true});
  }
}).addTo(lyrConstruction);

// ====== RENDER TREES ======
TREES_GJ.features.forEach(f=>{
  const p=f.properties;
  const c=f.geometry.coordinates;
  L.circleMarker([c[1],c[0]],{radius:4,color:'#166534',fillColor:'#22c55e',fillOpacity:0.7,weight:1})
    .bindTooltip(p.t_min||p.shem_min||'עץ',{direction:'top'})
    .addTo(lyrTrees);
});

// ====== RENDER ADDRESSES ======
ADDRESSES_GJ.features.forEach(f=>{
  const p=f.properties;
  const c=f.geometry.coordinates;
  if(p.ms_chelka&&TARGET_CHELKOT.includes(p.ms_chelka)){
    L.circleMarker([c[1],c[0]],{radius:2.5,color:'#4b5563',fillColor:'#6b7280',fillOpacity:0.6,weight:0.5})
      .bindTooltip(\`\${p.t_rechov} \${p.ms_bayit}\`,{direction:'top',permanent:false})
      .addTo(lyrAddresses);
  }
});

// ====== RENDER BUSINESSES ======
BUSINESSES_GJ.features.forEach(f=>{
  const p=f.properties;
  const c=f.geometry.coordinates;
  L.circleMarker([c[1],c[0]],{radius:4,color:'#7c3aed',fillColor:'#a78bfa',fillOpacity:0.7,weight:1})
    .bindTooltip(\`\${p.shimush||''} | \${p.shem_rechov} \${p.ms_bayit}\`,{direction:'top'})
    .addTo(lyrBusinesses);
});

// ====== RENDER GREEN SPACES ======
L.geoJSON(GREEN_SPACES_GJ,{
  style:{color:'#16a34a',weight:1.5,fillColor:'#86efac',fillOpacity:0.3},
  onEachFeature:function(f,layer){
    layer.bindTooltip(f.properties.shem_gan||'שטח ירוק',{direction:'top',sticky:true});
  }
}).addTo(lyrGreenSpaces);

// ====== RENDER STREETS ======
L.geoJSON(STREETS_GJ,{
  style:{color:'#6b7280',weight:1.5,opacity:0.5,dashArray:'8 4'},
  onEachFeature:function(f,layer){
    layer.bindTooltip(f.properties.t_rechov||'',{direction:'top',sticky:true,permanent:false});
  }
}).addTo(lyrStreets);

// ====== RENDER SHELTERS ======
SHELTERS_GJ.features.forEach(f=>{
  const p=f.properties;
  const c=f.geometry.type==='Point'?f.geometry.coordinates:f.geometry.coordinates[0][0];
  const lat=Array.isArray(c[0])?c[0][1]:c[1];
  const lon=Array.isArray(c[0])?c[0][0]:c[0];
  L.marker([lat,lon],{icon:L.divIcon({html:'<div style="background:#1e40af;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">M</div>',iconSize:[20,20],iconAnchor:[10,10],className:''})})
    .bindTooltip(\`מקלט | \${p.t_ktovet||''}\`,{direction:'top'})
    .addTo(lyrShelters);
});

// ====== RENDER CITYWIDE PLANS ======
L.geoJSON(CITYWIDE_PLANS_GJ,{
  style:{color:'#6366f1',weight:0.8,opacity:0.3,fillColor:'#818cf8',fillOpacity:0.05},
  onEachFeature:function(f,layer){
    layer.bindTooltip(f.properties.shem_taba||f.properties.taba||'תוכנית',{direction:'top',sticky:true});
  }
}).addTo(lyrCitywidePlans);

// ====== LEGEND ======
const legend = L.control({position:'bottomleft'});
legend.onAdd=function(){
  const div=L.DomUtil.create('div','legend');
  div.innerHTML=\`
    <div style="font-weight:600;margin-bottom:4px">שנת בנייה</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#991b1b"></span> לפני 1948</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#ea580c"></span> 1948-1960</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#ca8a04"></span> 1960-1980</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#65a30d"></span> 1980-2000</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#16a34a"></span> 2000+</div>
    <div class="legend-item"><span class="legend-swatch" style="background:#9ca3af"></span> לא ידוע</div>
    <div style="margin-top:6px;border-top:1px solid #e5e7eb;padding-top:4px">
    <div class="legend-item"><span class="legend-swatch" style="background:transparent;border:2px solid #2563eb"></span> מסמכים סרוקים</div>
    <div class="legend-item"><span class="legend-swatch" style="background:transparent;border:2px dashed #d97706"></span> היתרי בנייה</div>
    </div>\`;
  return div;
};
legend.addTo(map);

// ====== SIDEBAR: INFO TAB ======
function renderInfoTab(){
  const bi=DB.block_info;
  const pc=DB.parcels;
  let h=\`
    <div class="summary-cards">
      <div class="summary-card"><div class="val">\${bi.total_buildings}</div><div class="label">מבנים</div></div>
      <div class="summary-card"><div class="val">\${bi.total_addresses}</div><div class="label">כתובות</div></div>
      <div class="summary-card"><div class="val">\${(bi.total_area_sqm/1000).toFixed(1)}</div><div class="label">דונם</div></div>
      <div class="summary-card"><div class="val">4</div><div class="label">חלקות</div></div>
    </div>
    <div class="info-section">
      <h3>פרטי בלוק</h3>
      <table class="info-table">
        <tr><td>גוש</td><td>\${bi.gush}</td></tr>
        <tr><td>שכונה</td><td>\${bi.neighborhood}</td></tr>
        <tr><td>תוכנית מנחה</td><td>\${bi.governing_plan}</td></tr>
        <tr><td>סטטוס מושע</td><td>3 מתוך 4 חלקות מושע</td></tr>
      </table>
    </div>
    <div class="info-section"><h3>חלקות הבלוק</h3>\`;
  for(const ch of TARGET_CHELKOT){
    const p=pc[ch];
    if(!p)continue;
    const color=PARCEL_COLORS[ch]||'#6b7280';
    h+=\`<div class="parcel-card" style="border-right-color:\${color}">
      <h4>\${PARCEL_LABELS[ch]||'חלקה '+ch}</h4>
      <div class="meta">
        שטח רשום: \${p.registered_area_sqm.toLocaleString()} מ"ר |
        מבנים: \${p.building_count} |
        \${p.moshaa?'<span class="badge badge-amber">מושע</span>':'<span class="badge badge-gray">רגיל</span>'}
        \${p.municipal_ownership?'<br>בעלות עירונית: '+p.municipal_ownership.share:''}
        <br>שנים: \${p.year_range||'—'}
      </div>
    </div>\`;
  }
  h+=\`</div>
    <div class="info-section">
      <h3>זכויות בנייה (ברירת מחדל)</h3>
      <table class="info-table">
        <tr><td>קומות</td><td>\${DB.planning_context.building_rights_default.floors}</td></tr>
        <tr><td>כיסוי</td><td>\${DB.planning_context.building_rights_default.coverage_pct}%</td></tr>
        <tr><td>אחוזי בנייה</td><td>\${DB.planning_context.building_rights_default.building_pct}%</td></tr>
        <tr><td>קו בניין קדמי</td><td>\${DB.planning_context.building_rights_default.setback_front} מ'</td></tr>
        <tr><td>קו בניין צדי</td><td>\${DB.planning_context.building_rights_default.setback_side} מ'</td></tr>
        <tr><td>קו בניין אחורי</td><td>\${DB.planning_context.building_rights_default.setback_rear} מ'</td></tr>
      </table>
      <div style="font-size:10px;color:#6b7280;margin-top:4px">\${DB.planning_context.building_rights_default.notes}</div>
    </div>\`;
  document.getElementById('tab-info').innerHTML=h;
}

// ====== SIDEBAR: BUILDINGS TAB ======
function renderBuildingsTab(){
  // Group addresses by chelka
  let h='';
  for(const ch of TARGET_CHELKOT){
    const color=PARCEL_COLORS[ch]||'#6b7280';
    const addrs=Object.entries(DB.addresses).filter(([k,v])=>v.chelka===ch).sort((a,b)=>{
      const na=parseInt(a[1].number)||0, nb=parseInt(b[1].number)||0;
      if(a[1].street!==b[1].street)return a[1].street.localeCompare(b[1].street);
      return na-nb;
    });
    h+=\`<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:\${color};margin-bottom:4px;padding:4px 0;border-bottom:2px solid \${color}">\${PARCEL_LABELS[ch]} (\${addrs.length})</div>
      <ul class="addr-list">\`;
    for(const[addr,rec] of addrs){
      const yr=rec.building?rec.building.year_built:'';
      const fl=rec.building?rec.building.floors:'';
      const hasDocs=rec.documents&&rec.documents.length>0;
      const hasPermits=rec.permits&&rec.permits.length>0;
      let tags='';
      if(hasDocs)tags+='<span class="badge badge-blue" style="margin-left:3px">מסמכים</span>';
      if(hasPermits)tags+='<span class="badge badge-amber" style="margin-left:3px">היתר</span>';
      h+=\`<li class="addr-item" onclick="flyToAddress('\${addr.replace(/'/g,"\\\\'")}')">
        <div><div class="addr-name">\${addr}</div><div class="addr-meta">\${yr?yr+' | ':''}\${fl?fl+' קומות':''} \${tags}</div></div>
        <span class="chelka-tag" style="background:\${color}20;color:\${color}">\${ch}</span>
      </li>\`;
    }
    h+=\`</ul></div>\`;
  }
  document.getElementById('tab-buildings').innerHTML=h;
}

// ====== SIDEBAR: LAYERS TAB ======
function renderLayersTab(){
  const layerDefs=[
    {group:'שכבות בסיס',items:[
      {id:'buildings',label:'מבנים',count:BUILDINGS_GJ.features.length,default:true},
      {id:'parcels',label:'חלקות',count:PARCELS_GJ.features.length,default:true},
      {id:'land_use',label:'ייעודי קרקע',count:LAND_USE_GJ.features.length,default:true},
    ]},
    {group:'שכבות ניתוח',items:[
      {id:'municipal',label:'בעלות עירונית',count:MUNICIPAL_GJ.features.length,default:false},
      {id:'permits',label:'היתרי בנייה',count:PERMITS_GJ.features.length,default:false},
      {id:'construction',label:'אתרי בנייה',count:CONSTRUCTION_GJ.features.length,default:false},
      {id:'trees',label:'עצים',count:TREES_GJ.features.length,default:false},
      {id:'businesses',label:'עסקים',count:BUSINESSES_GJ.features.length,default:false},
      {id:'green_spaces',label:'שטחים ירוקים',count:GREEN_SPACES_GJ.features.length,default:false},
      {id:'streets',label:'צירי רחוב',count:STREETS_GJ.features.length,default:false},
      {id:'shelters',label:'מקלטים',count:SHELTERS_GJ.features.length,default:false},
      {id:'addresses',label:'כתובות',count:ADDRESSES_GJ.features.length,default:false},
      {id:'citywide_plans',label:'תוכניות כלל-עירוניות',count:CITYWIDE_PLANS_GJ.features.length,default:false},
    ]},
    {group:'הקשר',items:[
      {id:'context_buildings',label:'מבנים סביבתיים',count:CONTEXT_BUILDINGS_GJ.features.length,default:false},
    ]}
  ];

  let h='';
  for(const g of layerDefs){
    h+=\`<div class="layer-group"><h4>\${g.group}</h4>\`;
    for(const item of g.items){
      h+=\`<label class="layer-toggle">
        <input type="checkbox" data-layer="\${item.id}" \${item.default?'checked':''}> \${item.label}
        <span class="count">\${item.count}</span>
      </label>\`;
    }
    h+=\`</div>\`;
  }
  document.getElementById('tab-layers').innerHTML=h;

  // Bind checkboxes
  document.querySelectorAll('.layer-toggle input').forEach(cb=>{
    cb.addEventListener('change',function(){
      const lid=this.dataset.layer;
      const lg=layers[lid];
      if(!lg)return;
      if(this.checked){map.addLayer(lg);}
      else{map.removeLayer(lg);}
    });
  });
}

// ====== SIDEBAR: DOCS TAB ======
function renderDocsTab(){
  // Collect all documents from DB, sorted by year
  const allDocs=[];
  for(const[addr,rec] of Object.entries(DB.addresses)){
    if(rec.documents&&rec.documents.length>0){
      for(const doc of rec.documents){
        allDocs.push({addr,chelka:rec.chelka,...doc});
      }
    }
  }
  allDocs.sort((a,b)=>(a.year||9999)-(b.year||9999));

  let h=\`<div class="info-section"><h3>מסמכים סרוקים (\${allDocs.length})</h3>
    <div style="font-size:10.5px;color:#6b7280;margin-bottom:10px">ניתוח Gemini של סריקות היתרים ומדידות</div>\`;
  for(const doc of allDocs){
    const cls=doc.type.includes('מדידה')?'survey':(doc.type.includes('היתר')?'permit':'other');
    const color=PARCEL_COLORS[doc.chelka]||'#6b7280';
    h+=\`<div class="doc-item \${cls}" onclick="flyToAddress('\${doc.addr.replace(/'/g,"\\\\'")}')">
      <div class="doc-header">
        <span class="doc-type">\${doc.type}</span>
        <span class="doc-year">\${doc.year||'ללא תאריך'}</span>
      </div>
      <div class="doc-detail">
        <strong>\${doc.addr}</strong> <span class="chelka-tag" style="background:\${color}20;color:\${color};font-size:9px;padding:0 4px;border-radius:2px">\${doc.chelka}</span><br>\`;
    if(doc.surveyor)h+=\`מודד: \${doc.surveyor}<br>\`;
    if(doc.applicant)h+=\`מבקש: \${doc.applicant}<br>\`;
    if(doc.architect)h+=\`אדריכל: \${doc.architect}<br>\`;
    if(doc.area_measured)h+=\`שטח: \${doc.area_measured} מ"ר\`;
    if(doc.area_tabu)h+=\` (טאבו: \${doc.area_tabu} מ"ר)\`;
    if(doc.area_measured)h+='<br>';
    if(doc.plan_ref)h+=\`תב"ע: \${doc.plan_ref}<br>\`;
    if(doc.notes)h+=\`<span style="color:#6b7280">\${doc.notes}</span>\`;
    if(doc.file)h+=\`<br><a class="doc-link" href="\${doc.file}" target="_blank">📄 פתח PDF</a>\`;
    if(doc.extra_files){for(const ef of doc.extra_files){h+=\` <a class="doc-link" href="\${ef}" target="_blank">📄 נוסף</a>\`;}}
    h+=\`</div></div>\`;
  }
  h+=\`</div>\`;
  document.getElementById('tab-docs').innerHTML=h;
}

// ====== SIDEBAR: PLANS TAB ======
function renderPlansTab(){
  const plans = DB.planning_context.taba_plans || [];
  let h=\`<div class="info-section">
    <h3>תכניות תב"א רלוונטיות (\${plans.length})</h3>
    <div style="font-size:10.5px;color:#6b7280;margin-bottom:10px">תכניות החלות על הבלוק (גוש 6135, חלקות 43,44,71,110)</div>\`;

  for(const p of plans){
    const isBasis = p.plan_id === 'תא/2215';
    const isNotApplicable = p.plan_id === 'תא/מק/4766';
    const cardClass = isBasis ? 'plan-card basis' : (isNotApplicable ? 'plan-card not-applicable' : 'plan-card');
    const statusClass = p.status === 'מאושרת' ? 'badge-green' : (p.status === 'בתהליך' ? 'badge-amber' : 'badge-gray');

    h+=\`<div class="\${cardClass}">
      <div class="plan-header">
        <span class="plan-id">\${p.plan_id}</span>
        <span><span class="badge \${statusClass}">\${p.status}</span> <span class="plan-year">\${p.year}</span></span>
      </div>
      <div class="plan-desc">\${p.description}</div>\`;

    if(isBasis){
      h+=\`<div class="plan-note" style="color:#1e40af;font-style:normal;font-weight:600">⭐ תכנית בסיס לבלוק</div>\`;
    }
    if(isNotApplicable){
      h+=\`<div class="plan-note">⚠️ לא חל על הבלוק — חל על חלקות אחרות בגוש 6135</div>\`;
    }

    if(p.files && p.files.length > 0){
      h+=\`<div class="plan-files">\`;
      for(const f of p.files){
        const label = f.includes('תשריט') ? '🗺️ תשריט' : (f.includes('הוראות') ? '📋 הוראות' : (f.includes('זכויות') ? '📊 זכויות בניה' : (f.includes('מצב מאושר') ? '📐 מצב מאושר' : '📄 מסמך')));
        h+=\`<a href="\${f}" target="_blank">\${label}</a>\`;
      }
      h+=\`</div>\`;
    }
    h+=\`</div>\`;
  }

  // Add note about governing plan
  h+=\`<div style="margin-top:16px;padding:10px;background:#f0fdf4;border-radius:6px;font-size:11px;color:#166534">
    <strong>תכנית מנחה:</strong> \${DB.block_info.governing_plan}<br>
    <span style="font-size:10px;color:#6b7280">זכויות בנייה ברירת מחדל: \${DB.planning_context.building_rights_default.floors} קומות, \${DB.planning_context.building_rights_default.coverage_pct}% כיסוי, \${DB.planning_context.building_rights_default.building_pct}% בנייה</span>
  </div>\`;

  h+=\`</div>\`;
  document.getElementById('tab-plans').innerHTML=h;
}

// ====== BUILDING POPUP ======
function showBuildingPopup(addr,layer){
  const rec=DB.addresses[addr];
  if(!rec)return;
  const b=rec.building||{};
  let html=\`<h4>\${addr}</h4><table class="popup-table">
    <tr><td>חלקה</td><td>\${rec.chelka} (גוש 6135)</td></tr>\`;
  if(b.year_built)html+=\`<tr><td>שנת בנייה</td><td>\${b.year_built}</td></tr>\`;
  if(b.floors)html+=\`<tr><td>קומות</td><td>\${b.floors}</td></tr>\`;
  if(b.height_m)html+=\`<tr><td>גובה</td><td>\${b.height_m} מ'</td></tr>\`;
  if(b.footprint_sqm)html+=\`<tr><td>טביעת רגל</td><td>\${b.footprint_sqm} מ"ר</td></tr>\`;
  html+=\`</table>\`;

  // Municipal ownership
  if(rec.municipal_ownership_share){
    html+=\`<div class="popup-section"><h5>בעלות עירונית</h5>\${rec.municipal_ownership_share}</div>\`;
  }

  // Permits
  if(rec.permits&&rec.permits.length>0){
    html+=\`<div class="popup-section"><h5>היתרים (\${rec.permits.length})</h5>\`;
    for(const p of rec.permits.slice(0,2)){
      html+=\`<div style="font-size:10px;margin-bottom:3px">\${p.type||'היתר'} (\${p.request_num})</div>\`;
    }
    if(rec.permits.length>2)html+=\`<div style="font-size:10px;color:#6b7280">+\${rec.permits.length-2} נוספים</div>\`;
    html+=\`</div>\`;
  }

  // Gemini docs with PDF links
  if(rec.documents&&rec.documents.length>0){
    html+=\`<div class="popup-section"><h5>מסמכים סרוקים (\${rec.documents.length})</h5>\`;
    for(const d of rec.documents.slice(0,3)){
      if(d.file){
        html+=\`<div style="font-size:10px;margin-bottom:3px"><a href="\${d.file}" target="_blank" style="color:#2563eb;text-decoration:none">📄 \${d.type} \${d.year||''}</a></div>\`;
      } else {
        html+=\`<div style="font-size:10px;margin-bottom:3px">\${d.type} \${d.year||''}</div>\`;
      }
    }
    if(rec.documents.length>3)html+=\`<div style="font-size:10px;color:#6b7280">+\${rec.documents.length-3} נוספים</div>\`;
    html+=\`</div>\`;
  }

  // Businesses
  if(rec.businesses&&rec.businesses.length>0){
    html+=\`<div class="popup-section"><h5>עסקים</h5>\`;
    for(const bz of rec.businesses){
      html+=\`<div style="font-size:10px">\${bz.type}</div>\`;
    }
    html+=\`</div>\`;
  }

  layer.bindPopup(html,{maxWidth:320,minWidth:220}).openPopup();
}

// ====== SIDEBAR DETAIL VIEWS ======
function showBuildingDetail(addr){
  const rec=DB.addresses[addr];
  if(!rec)return;
  const b=rec.building||{};

  let h=\`<div class="info-section">
    <h3 style="border-right:4px solid \${PARCEL_COLORS[rec.chelka]||'#6b7280'};padding-right:8px">\${addr}</h3>
    <table class="info-table">
      <tr><td>חלקה</td><td>\${rec.chelka} (גוש 6135) \${DB.parcels[rec.chelka]?.moshaa?'<span class="badge badge-amber">מושע</span>':''}</td></tr>\`;
  if(b.year_built)h+=\`<tr><td>שנת בנייה</td><td>\${b.year_built} <span class="badge" style="background:\${yearColor(b.year_built)}20;color:\${yearColor(b.year_built)}">\${yearLabel(b.year_built)}</span></td></tr>\`;
  if(b.floors)h+=\`<tr><td>קומות</td><td>\${b.floors}</td></tr>\`;
  if(b.height_m)h+=\`<tr><td>גובה</td><td>\${b.height_m} מ'</td></tr>\`;
  if(b.footprint_sqm)h+=\`<tr><td>טביעת רגל</td><td>\${b.footprint_sqm} מ"ר</td></tr>\`;
  if(rec.municipal_ownership_share)h+=\`<tr><td>בעלות עירונית</td><td>\${rec.municipal_ownership_share}</td></tr>\`;
  h+=\`<tr><td>שימור</td><td>\${rec.conservation?'כן':'לא'}</td></tr>
    <tr><td>מבנה מסוכן</td><td>\${rec.dangerous?'כן':'לא'}</td></tr>
    </table></div>\`;

  // Building rights
  if(rec.building_rights){
    const br=rec.building_rights;
    h+=\`<div class="info-section"><h3>זכויות בנייה</h3>
      <table class="info-table">\`;
    if(br.source)h+=\`<tr><td>מקור</td><td>\${br.source}</td></tr>\`;
    if(br.floors)h+=\`<tr><td>קומות</td><td>\${br.floors}</td></tr>\`;
    if(br.coverage||br.coverage_pct)h+=\`<tr><td>כיסוי</td><td>\${br.coverage||br.coverage_pct+'%'}</td></tr>\`;
    if(br.building_pct)h+=\`<tr><td>אחוזי בנייה</td><td>\${br.building_pct}</td></tr>\`;
    if(br.setback_front!==undefined)h+=\`<tr><td>קו בניין קדמי</td><td>\${br.setback_front}</td></tr>\`;
    if(br.setback_side!==undefined)h+=\`<tr><td>קו בניין צדי</td><td>\${br.setback_side}</td></tr>\`;
    if(br.setback_rear!==undefined)h+=\`<tr><td>קו בניין אחורי</td><td>\${br.setback_rear}</td></tr>\`;
    h+=\`</table></div>\`;
  }

  // Permits
  if(rec.permits&&rec.permits.length>0){
    h+=\`<div class="info-section"><h3>היתרי בנייה (\${rec.permits.length})</h3>\`;
    for(const p of rec.permits){
      const date=p.date?new Date(p.date).toLocaleDateString('he-IL'):'';
      h+=\`<div class="doc-item permit">
        <div class="doc-header"><span class="doc-type">\${p.type||'היתר'}</span><span class="doc-year">\${date}</span></div>
        <div class="doc-detail">בקשה: \${p.request_num}\`;
      if(p.housing_units)h+=\` | \${p.housing_units} יח"ד\`;
      if(p.stage)h+=\`<br><span class="badge \${p.stage==='קיים היתר'||p.stage.includes('תעודת גמר')?'badge-green':(p.stage==='בבניה'?'badge-amber':'badge-gray')}">\${p.stage}</span>\`;
      h+=\`</div></div>\`;
    }
    h+=\`</div>\`;
  }

  // Documents with PDF links
  if(rec.documents&&rec.documents.length>0){
    h+=\`<div class="info-section"><h3>מסמכים סרוקים (\${rec.documents.length})</h3>\`;
    for(const d of rec.documents){
      const cls=d.type.includes('מדידה')?'survey':(d.type.includes('היתר')?'permit':'other');
      h+=\`<div class="doc-item \${cls}">
        <div class="doc-header"><span class="doc-type">\${d.type}</span><span class="doc-year">\${d.year||''}</span></div>
        <div class="doc-detail">\`;
      if(d.surveyor)h+=\`מודד: \${d.surveyor}<br>\`;
      if(d.applicant)h+=\`מבקש: \${d.applicant}<br>\`;
      if(d.architect)h+=\`אדריכל: \${d.architect}<br>\`;
      if(d.area_measured)h+=\`שטח נמדד: \${d.area_measured} מ"ר\`;
      if(d.area_tabu)h+=\` (טאבו: \${d.area_tabu} מ"ר)\`;
      if(d.area_measured||d.area_tabu)h+='<br>';
      if(d.plan_ref)h+=\`תב"ע: \${d.plan_ref}<br>\`;
      if(d.notes)h+=\`<span style="color:#6b7280">\${d.notes}</span>\`;
      if(d.file)h+=\`<br><a class="doc-link" href="\${d.file}" target="_blank">📄 פתח PDF</a>\`;
      if(d.extra_files){for(const ef of d.extra_files){h+=\` <a class="doc-link" href="\${ef}" target="_blank">📄 נוסף</a>\`;}}
      h+=\`</div></div>\`;
    }
    h+=\`</div>\`;
  }

  // Businesses
  if(rec.businesses&&rec.businesses.length>0){
    h+=\`<div class="info-section"><h3>עסקים (\${rec.businesses.length})</h3>
      <table class="info-table">\`;
    for(const bz of rec.businesses){
      h+=\`<tr><td>\${bz.type}</td><td>\${bz.name||''}\${bz.area_sqm?' | '+bz.area_sqm+' מ"ר':''}</td></tr>\`;
    }
    h+=\`</table></div>\`;
  }

  document.getElementById('tab-info').innerHTML=h;
  switchTab('info');
}

function showParcelDetail(chelka){
  const p=DB.parcels[chelka];
  if(!p)return;
  const color=PARCEL_COLORS[chelka]||'#6b7280';
  const addrs=Object.entries(DB.addresses).filter(([k,v])=>v.chelka===chelka);

  let h=\`<div class="info-section">
    <h3 style="border-right:4px solid \${color};padding-right:8px">\${PARCEL_LABELS[chelka]||'חלקה '+chelka}</h3>
    <table class="info-table">
      <tr><td>גוש / חלקה</td><td>6135 / \${chelka}</td></tr>
      <tr><td>שטח רשום</td><td>\${p.registered_area_sqm.toLocaleString()} מ"ר</td></tr>
      <tr><td>שטח GIS</td><td>\${p.gis_area_sqm.toLocaleString()} מ"ר</td></tr>
      <tr><td>מושע</td><td>\${p.moshaa?'<span class="badge badge-amber">כן</span>':'<span class="badge badge-gray">לא</span>'}</td></tr>
      <tr><td>מבנים</td><td>\${p.building_count}</td></tr>
      <tr><td>כתובות</td><td>\${p.address_count}</td></tr>
      <tr><td>שנים</td><td>\${p.year_range||'—'}</td></tr>\`;
  if(p.municipal_ownership)h+=\`<tr><td>בעלות עירונית</td><td>\${p.municipal_ownership.share}</td></tr>\`;
  h+=\`</table></div>
    <div class="info-section"><h3>כתובות בחלקה (\${addrs.length})</h3><ul class="addr-list">\`;
  for(const[addr,rec] of addrs.sort((a,b)=>(parseInt(a[1].number)||0)-(parseInt(b[1].number)||0))){
    const yr=rec.building?rec.building.year_built:'';
    h+=\`<li class="addr-item" onclick="flyToAddress('\${addr.replace(/'/g,"\\\\'")}')">
      <span class="addr-name">\${addr}</span><span class="addr-meta">\${yr||''}</span>
    </li>\`;
  }
  h+=\`</ul></div>\`;
  document.getElementById('tab-info').innerHTML=h;
  switchTab('info');
}

// ====== NAVIGATION ======
function flyToAddress(addr){
  const pt=addrPoints[addr];
  if(pt){
    map.flyTo([pt.coords[1],pt.coords[0]],19,{duration:0.5});
    // Find and open building popup
    const bid=addrBuildingMap[addr];
    if(bid){
      lyrBuildings.eachLayer(function(layer){
        if(layer.eachLayer){
          layer.eachLayer(function(sub){
            // GeoJSON layers are nested
          });
        }
      });
    }
    showBuildingDetail(addr);
  }
}
// Make global
window.flyToAddress=flyToAddress;

// ====== TABS ======
function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
}
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click',()=>switchTab(t.dataset.tab));
});

// ====== PANEL TOGGLE ======
document.getElementById('panel-toggle').addEventListener('click',function(){
  document.getElementById('app').classList.toggle('panel-collapsed');
  this.textContent=document.getElementById('app').classList.contains('panel-collapsed')?'▶':'◀';
  setTimeout(()=>map.invalidateSize(),300);
});

// ====== INIT ======
renderInfoTab();
renderBuildingsTab();
renderLayersTab();
renderDocsTab();
renderPlansTab();
<\/script>
</body>
</html>`;

// Write output
const outPath = path.join(__dirname, "block-map.html");
fs.writeFileSync(outPath, html, "utf8");

const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Map written to ${outPath} (${sizeKB} KB)`);
