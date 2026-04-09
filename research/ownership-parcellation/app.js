/* ============================================================
 *  app.js — Hatikva Neighborhood Research Map
 *  Ported from map.html monolith → modular architecture
 * ============================================================ */

const store = {
  map: null,
  baseMaps: {},
  layers: {},
  data: {},
  planPolygons: {},
  frameworkPlanIds: new Set(),
};

// ==================== INIT ====================

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    initMap();
    buildTabsUI();
    await loadAllData();
    initButtons();
    document.getElementById("loading").style.display = "none";
  } catch (err) {
    document.getElementById("loading").innerHTML =
      '<div style="color:#c62828">שגיאה בטעינת נתונים</div>' +
      '<div style="font-size:11px;margin-top:6px">' +
      err.message +
      "</div>";
    console.error(err);
  }
}

// ==================== MAP INIT ====================

function initMap() {
  store.map = L.map("map", {
    center: CONFIG.map.center,
    zoom: CONFIG.map.zoom,
    zoomControl: true,
  });

  store.baseMaps = {
    Positron: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; CartoDB &copy; OSM",
        maxZoom: 19,
        subdomains: "abcd",
      },
    ),
    OpenStreetMap: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap", maxZoom: 19 },
    ),
    לוויין: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "&copy; Esri", maxZoom: 19 },
    ),
  };

  store.baseMaps.Positron.addTo(store.map);
}

// ==================== TABS ====================

function buildTabsUI() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
}

// ==================== DATA LOADING ====================

async function loadAllData() {
  // Create layer groups
  for (const cfg of CONFIG.layers) {
    store.layers[cfg.id] = L.layerGroup();
  }

  // Fetch unique data files
  const fileCache = {};
  for (const cfg of CONFIG.layers) {
    if (cfg.file && !fileCache[cfg.file]) {
      fileCache[cfg.file] = fetch(cfg.file).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${cfg.file}: ${r.status}`);
        return r.json();
      });
    }
  }
  const files = Object.keys(fileCache);
  const results = await Promise.all(files.map((f) => fileCache[f]));
  files.forEach((f, i) => {
    fileCache[f] = results[i];
  });

  // Assign to store by layer id
  for (const cfg of CONFIG.layers) {
    if (cfg.file) store.data[cfg.id] = fileCache[cfg.file];
  }

  // Build layers (order matters: parcels before moshaa/plans which reference parcel data)
  buildGeoJSONLayer(getCfg("parcels"));
  buildMoshaaLayer();
  buildGeoJSONLayer(getCfg("municipal"));
  buildReparcellationLayer();
  buildPlansLayer(); // handles plans + framework-plans
  buildGushLayer();
  buildSitesLayer();

  // Add visible layers to map
  for (const cfg of CONFIG.layers) {
    if (cfg.visible) store.layers[cfg.id].addTo(store.map);
  }

  // Layer control
  const overlays = {};
  for (const cfg of CONFIG.layers) {
    overlays[cfg.name] = store.layers[cfg.id];
  }
  L.control
    .layers(store.baseMaps, overlays, {
      position: "topright",
      collapsed: true,
    })
    .addTo(store.map);

  // Build UI panels
  buildReparcellationTab();
  buildPlansTab();
  buildStatsTab();
  buildLegend();
}

function getCfg(id) {
  return CONFIG.layers.find((l) => l.id === id);
}

// ==================== GENERIC GEOJSON LAYER ====================

function buildGeoJSONLayer(cfg) {
  const data = store.data[cfg.id];
  if (!data) return;

  const baseStyle = { ...cfg.style };

  L.geoJSON(data, {
    style: baseStyle,
    interactive: cfg.interactive !== false,
    onEachFeature: cfg.interactive
      ? function (feature, layer) {
          const p = feature.properties;

          layer.bindTooltip(tooltipFor(cfg.infoTemplate, p), {
            direction: "top",
            sticky: true,
          });

          layer.on("mouseover", () =>
            layer.setStyle({
              fillOpacity: (baseStyle.fillOpacity || 0.3) + 0.15,
              weight: (baseStyle.weight || 1) + 0.5,
            }),
          );
          layer.on("mouseout", () => layer.setStyle(baseStyle));
          layer.on("click", () => showInfo(cfg.infoTemplate, p, feature));
        }
      : undefined,
  }).addTo(store.layers[cfg.id]);
}

function tooltipFor(template, p) {
  switch (template) {
    case "parcel": {
      const area = p.ms_shetach || p.ms_shetach_rashum || 0;
      return `גוש ${p.ms_gush} חלקה ${p.ms_chelka} | ${Math.round(area).toLocaleString()} מ"ר`;
    }
    case "municipal":
      return `בעלות עירונית | ${p.ms_gush}/${p.ms_chelka}`;
    default:
      return "";
  }
}

// ==================== MOSHAA LAYER ====================

const MOSHAA_STYLES = {
  ללא_טיפול: { fill: "#ef4444", border: "#dc2626", label: "ללא טיפול" },
  בתהליך_רה_פרצלציה: {
    fill: "#f59e0b",
    border: "#d97706",
    label: "בתהליך",
  },
  שויכה: { fill: "#10b981", border: "#059669", label: "שויכה" },
};

function buildMoshaaLayer() {
  const moshaaData = store.data.moshaa;
  const parcelsData = store.data.parcels;

  const moshaaLookup = {};
  moshaaData.forEach((m) => {
    moshaaLookup[m.gush + "_" + m.chelka] = m;
  });

  const moshaaFeatures = parcelsData.features.filter((f) => {
    const key = f.properties.ms_gush + "_" + f.properties.ms_chelka;
    return moshaaLookup[key];
  });

  moshaaFeatures.forEach((feature) => {
    const p = feature.properties;
    const key = p.ms_gush + "_" + p.ms_chelka;
    const mInfo = moshaaLookup[key];
    const s = MOSHAA_STYLES[mInfo.status] || MOSHAA_STYLES["ללא_טיפול"];

    const layer = L.geoJSON(feature, {
      style: {
        color: s.border,
        weight: 1.8,
        opacity: 0.8,
        fillColor: s.fill,
        fillOpacity: 0.18,
      },
    });

    layer.bindTooltip(
      `<b>מושע</b> ${mInfo.gush}/${mInfo.chelka}<br>${(mInfo.area_sqm / 1000).toFixed(1)} דונם — ${statusHeb(mInfo.status)}`,
      { direction: "top", sticky: true },
    );

    layer.on("mouseover", () =>
      layer.setStyle({ fillOpacity: 0.35, weight: 2.5 }),
    );
    layer.on("mouseout", () =>
      layer.setStyle({ fillOpacity: 0.18, weight: 1.8 }),
    );
    layer.on("click", () => showMoshaaInfo(mInfo, feature));
    layer.addTo(store.layers.moshaa);
  });
}

// ==================== REPARCELLATION LAYER ====================

function buildReparcellationLayer() {
  const reparData = store.data.reparcellation;
  const boundariesData = store.data["reparcellation-boundaries"];

  if (!reparData || !boundariesData) return;

  // Status -> visual style mapping
  const statusStyles = {
    מאושרת: { fillColor: "#10b981", fillOpacity: 0.15 },
    מאושר_להפקדה: { fillColor: "#10b981", fillOpacity: 0.15 },
    מופקדת: { fillColor: "#3b82f6", fillOpacity: 0.12 },
    לקראת_דיון_בהפקדה: { fillColor: "#3b82f6", fillOpacity: 0.12 },
    תחילת_תכנון: {
      fillColor: "#f59e0b",
      fillOpacity: 0.1,
      dashArray: "6 4",
    },
    לא_ידוע: { fillColor: "#9ca3af", fillOpacity: 0.08, dashArray: "4 4" },
  };

  // Build boundary lookup: normalized plan_id -> feature
  const boundaryLookup = {};
  boundariesData.features.forEach((f) => {
    const id = (f.properties.plan_id || "").replace(/\\/g, "/");
    boundaryLookup[id] = f;
  });

  reparData.forEach((plan) => {
    const normalizedId = (plan.plan_id || "").replace(/\\/g, "/");
    const boundaryFeature = boundaryLookup[normalizedId];

    // Skip plans with no matching polygon in boundaries file
    if (!boundaryFeature) return;

    const statusCfg =
      CONFIG.reparcellationStatuses[plan.status] ||
      CONFIG.reparcellationStatuses["לא_טופל"];
    const style = statusStyles[plan.status] || statusStyles["לא_ידוע"];
    const borderColor = style.fillColor;

    const lyr = L.geoJSON(boundaryFeature, {
      style: {
        color: borderColor,
        weight: 2,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        dashArray: style.dashArray || null,
      },
    });

    lyr.bindTooltip(
      `<b>${plan.plan_id}</b>: ${plan.plan_name}<br>${statusCfg.label}`,
      { direction: "top", sticky: true },
    );

    lyr.on("mouseover", () =>
      lyr.setStyle({ fillOpacity: style.fillOpacity + 0.12, weight: 3 }),
    );
    lyr.on("mouseout", () =>
      lyr.setStyle({ fillOpacity: style.fillOpacity, weight: 2 }),
    );
    lyr.on("click", () => showReparcellationInfo(plan));
    lyr.addTo(store.layers.reparcellation);

    // Label at centroid
    try {
      const center = turf.centroid(boundaryFeature);
      const [lon, lat] = center.geometry.coordinates;
      const shortId = plan.plan_id.replace("תא/מק/", "");
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: "repar-label",
          html: `<div style="font-size:9px;font-weight:600;color:${borderColor};text-shadow:0 0 3px #fff,0 0 3px #fff;text-align:center">${shortId}</div>`,
          iconSize: [50, 14],
          iconAnchor: [25, 7],
        }),
        interactive: false,
      }).addTo(store.layers.reparcellation);
    } catch (e) {}
  });
}

// ==================== PLANS LAYER ====================

function isFrameworkPlan(plan) {
  return (plan.gushim || []).length >= CONFIG.frameworkGushThreshold;
}

function buildPlansLayer() {
  const plansDb = store.data.plans;
  const parcelsData = store.data.parcels;
  const gushBoundaries = store.data["gush-boundaries"];

  // Build parcel lookup: gush_chelka -> feature (for chelka-level polygons)
  const parcelLookup = {};
  parcelsData.features.forEach((f) => {
    const p = f.properties;
    const key = p.ms_gush + "_" + p.ms_chelka;
    parcelLookup[key] = f;
  });

  // Build gush boundary lookup: ms_gush -> [features]
  const gushLookup = {};
  gushBoundaries.features.forEach((f) => {
    const gush = f.properties.ms_gush;
    if (!gushLookup[gush]) gushLookup[gush] = [];
    gushLookup[gush].push(f);
  });

  // Build parcel-by-gush lookup for full gush coverage
  const parcelsByGush = {};
  parcelsData.features.forEach((f) => {
    const g = f.properties.ms_gush;
    if (!parcelsByGush[g]) parcelsByGush[g] = [];
    parcelsByGush[g].push(f);
  });

  // Sort plans by area descending (largest first = rendered at bottom)
  const sortedPlans = [...plansDb].sort(
    (a, b) => (b.area_dunam || 9999) - (a.area_dunam || 9999),
  );

  sortedPlans.forEach((plan) => {
    const idx = plansDb.indexOf(plan);
    const color = CONFIG.planColors[idx % CONFIG.planColors.length];
    const gushim = plan.gushim || [];
    const isFramework = isFrameworkPlan(plan);

    if (isFramework) store.frameworkPlanIds.add(plan.plan_id);

    // Determine which features to use for polygon
    let matchingFeatures = [];

    // Check if plan has specific chelkot (array of numbers, not object)
    const chelkot = plan.chelkot;
    const hasSpecificChelkot = Array.isArray(chelkot) && chelkot.length > 0;
    const hasChelkotObj =
      chelkot && typeof chelkot === "object" && !Array.isArray(chelkot);

    if (hasSpecificChelkot && gushim.length === 1) {
      // Single gush + specific chelkot → use parcel polygons
      chelkot.forEach((c) => {
        const f = parcelLookup[gushim[0] + "_" + c];
        if (f) matchingFeatures.push(f);
      });
    } else if (hasChelkotObj) {
      // Object form: { "6135": [85, 86], "6979": [3, 9] } → use parcel polygons
      Object.entries(chelkot).forEach(([gush, cList]) => {
        if (gush === "other") return;
        (cList || []).forEach((c) => {
          const f = parcelLookup[gush + "_" + c];
          if (f) matchingFeatures.push(f);
        });
      });
    }

    // If no specific chelkot or couldn't find parcels, fall back to gush boundaries then all parcels in gush
    if (matchingFeatures.length === 0) {
      gushim.forEach((g) => {
        if (gushLookup[g]) {
          matchingFeatures.push(...gushLookup[g]);
        } else if (parcelsByGush[g]) {
          // No gush boundary available, use all parcels in gush
          matchingFeatures.push(...parcelsByGush[g]);
        }
      });
    }

    // Filter out degenerate polygons (area < 10 sqm)
    matchingFeatures = matchingFeatures.filter((f) => {
      try {
        return turf.area(f) >= 10;
      } catch (e) {
        return true;
      }
    });

    if (matchingFeatures.length === 0) return;

    // Try to union all matching features into one polygon
    let planGeom = null;
    try {
      if (matchingFeatures.length === 1) {
        planGeom = matchingFeatures[0];
      } else {
        planGeom = matchingFeatures[0];
        for (let i = 1; i < matchingFeatures.length; i++) {
          try {
            planGeom = turf.union(
              turf.featureCollection([planGeom, matchingFeatures[i]]),
            );
          } catch (e) {
            /* skip bad geometry */
          }
        }
      }
    } catch (e) {
      planGeom = turf.featureCollection(matchingFeatures);
    }

    if (!planGeom) return;

    const isApproved = plan.status === "מאושרת";

    if (isFramework) {
      const lyr = L.geoJSON(planGeom, {
        style: {
          color: "#9ca3af",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0,
          dashArray: "8 4",
        },
      });
      lyr.bindTooltip(
        `<b>${plan.plan_id}</b>: ${plan.plan_name}<br>${plan.year || "?"} — תכנית מסגרת`,
        { direction: "top", sticky: true },
      );
      lyr.on("click", () => showPlanInfo(plan, color));
      lyr.addTo(store.layers["framework-plans"]);
      store.planPolygons[plan.plan_id] = lyr;
    } else {
      const dashArray = isApproved ? null : "6 4";
      const baseOpacity = 0.06;
      const baseWeight = isApproved ? 2 : 1.5;

      const lyr = L.geoJSON(planGeom, {
        style: {
          color: color,
          weight: baseWeight,
          fillColor: color,
          fillOpacity: baseOpacity,
          dashArray: dashArray,
        },
      });

      lyr.bindTooltip(
        `<b>${plan.plan_id}</b>: ${plan.plan_name}<br>${plan.year || "?"} — ${plan.status}`,
        { direction: "top", sticky: true },
      );

      lyr.on("mouseover", () =>
        lyr.setStyle({ fillOpacity: 0.18, weight: baseWeight + 1 }),
      );
      lyr.on("mouseout", () =>
        lyr.setStyle({ fillOpacity: baseOpacity, weight: baseWeight }),
      );
      lyr.on("click", () => showPlanInfo(plan, color));
      lyr.addTo(store.layers.plans);
      store.planPolygons[plan.plan_id] = lyr;
    }
  });
}

// ==================== GUSH LAYER ====================

function buildGushLayer() {
  const gushBoundaries = store.data["gush-boundaries"];

  // Group gush boundary features by ms_gush, then union per gush
  const gushGroups = {};
  gushBoundaries.features.forEach((f) => {
    const g = f.properties.ms_gush;
    if (!gushGroups[g]) gushGroups[g] = [];
    gushGroups[g].push(f);
  });

  Object.entries(gushGroups).forEach(([gush, features]) => {
    // Union features per gush
    let geom = features[0];
    for (let i = 1; i < features.length; i++) {
      try {
        geom = turf.union(turf.featureCollection([geom, features[i]]));
      } catch (e) {}
    }

    L.geoJSON(geom, {
      style: {
        color: "#9ca3af",
        weight: 0.5,
        opacity: 0.5,
        dashArray: "4 3",
        fillOpacity: 0,
      },
      interactive: false,
    }).addTo(store.layers["gush-boundaries"]);

    // Label at centroid
    try {
      const center = turf.centroid(geom);
      const [lon, lat] = center.geometry.coordinates;
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: "gush-label",
          html: gush,
          iconSize: [40, 14],
          iconAnchor: [20, 7],
        }),
        interactive: false,
      }).addTo(store.layers["gush-boundaries"]);
    } catch (e) {}
  });
}

// ==================== SITES LAYER ====================

function buildSitesLayer() {
  const siteLocations = store.data.sites;

  Object.entries(siteLocations).forEach(([key, site]) => {
    const info = CONFIG.siteNames[key];
    if (!info) return;
    const clr = CONFIG.siteColors[info.num];

    // Soft halo circle
    L.circle([site.center.lat, site.center.lon], {
      radius: 120,
      color: clr,
      weight: 1.5,
      opacity: 0.5,
      dashArray: "5 4",
      fillColor: clr,
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(store.layers.sites);

    // Numbered marker
    const marker = L.marker([site.center.lat, site.center.lon], {
      icon: L.divIcon({
        className: "site-label",
        html: `<div style="background:${clr};color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;box-shadow:0 3px 12px ${clr}66;border:3px solid #fff;">${info.num}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
      zIndexOffset: 2000,
    });

    marker.bindTooltip(`<b>אתר ${info.num}</b>: ${info.name}`, {
      direction: "top",
      offset: [0, -19],
    });
    marker.on("click", () => showSiteInfo(key, site, info));
    marker.addTo(store.layers.sites);

    // Name label below marker
    L.marker([site.center.lat - 0.0003, site.center.lon], {
      icon: L.divIcon({
        className: "site-name-label",
        html: `<div style="text-align:center;color:${clr};font-weight:600">${info.name}</div>`,
        iconSize: [130, 16],
        iconAnchor: [65, 0],
      }),
      interactive: false,
      zIndexOffset: 1500,
    }).addTo(store.layers.sites);
  });
}

// ==================== INFO PANEL (dispatcher) ====================

function showInfo(template, data, feature, extra) {
  switch (template) {
    case "parcel":
      showParcelInfo(data, feature);
      break;
    case "moshaa":
      showMoshaaInfo(data, feature);
      break;
    case "municipal":
      showMunicipalInfo(data, feature);
      break;
    case "plan":
      showPlanInfo(data, extra);
      break;
    case "reparcellation":
      showReparcellationInfo(data);
      break;
    case "site":
      showSiteInfo(data, feature, extra);
      break;
  }
}

// ==================== PARCEL INFO ====================

function showParcelInfo(props, feature) {
  const area = props.ms_shetach || props.ms_shetach_rashum || 0;
  const gush = props.ms_gush;
  const chelka = props.ms_chelka;

  // Check moshaa
  const moshaaMatch = store.data.moshaa
    ? store.data.moshaa.find((m) => m.gush === gush && m.chelka === chelka)
    : null;

  // Check municipal
  let isMunicipal = false;
  if (store.data.municipal) {
    isMunicipal = store.data.municipal.features.some(
      (f) => f.properties.ms_gush === gush && f.properties.ms_chelka === chelka,
    );
  }

  let html = `<div class="info-section"><h3>חלקה ${gush}/${chelka}</h3>
    <table class="info-table">
      <tr><td>גוש</td><td>${gush}</td></tr>
      <tr><td>חלקה</td><td>${chelka}</td></tr>
      <tr><td>שטח רשום</td><td>${props.ms_shetach_rashum ? props.ms_shetach_rashum.toLocaleString() : "—"} מ"ר</td></tr>
      <tr><td>שטח מדוד</td><td>${area ? Math.round(area).toLocaleString() : "—"} מ"ר</td></tr>
      <tr><td>מושע</td><td>${
        moshaaMatch
          ? `<span class="status-badge ${moshaaMatch.status === "ללא_טיפול" ? "status-untreated" : moshaaMatch.status === "שויכה" ? "status-allocated" : "status-process"}">${statusHeb(moshaaMatch.status)}</span>`
          : "לא"
      }</td></tr>
      <tr><td>בעלות עירונית</td><td>${isMunicipal ? '<span class="status-badge status-approved">כן</span>' : "לא"}</td></tr>
      ${props.heara ? `<tr><td>הערה</td><td>${props.heara}</td></tr>` : ""}
    </table></div>`;

  if (moshaaMatch && moshaaMatch.notes) {
    html += `<div class="info-section"><h3>הערות מושע</h3><p style="font-size:12px;color:#555;line-height:1.5">${moshaaMatch.notes}</p></div>`;
  }

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== MOSHAA INFO ====================

function showMoshaaInfo(mInfo, feature) {
  let html = `<div class="info-section"><h3>חלקת מושע — גוש ${mInfo.gush} חלקה ${mInfo.chelka}</h3>
    <table class="info-table">
      <tr><td>גוש</td><td>${mInfo.gush}</td></tr>
      <tr><td>חלקה</td><td>${mInfo.chelka}</td></tr>
      <tr><td>שטח</td><td>${Math.round(mInfo.area_sqm).toLocaleString()} מ"ר (${(mInfo.area_sqm / 1000).toFixed(1)} דונם)</td></tr>
      <tr><td>סטטוס</td><td><span class="status-badge ${mInfo.status === "ללא_טיפול" ? "status-untreated" : mInfo.status === "שויכה" ? "status-allocated" : "status-process"}">${statusHeb(mInfo.status)}</span></td></tr>
      ${mInfo.plan_id ? `<tr><td>תכנית</td><td>${mInfo.plan_id}</td></tr>` : ""}
      ${mInfo.plan_status ? `<tr><td>סטטוס תכנית</td><td>${mInfo.plan_status}</td></tr>` : ""}
      ${mInfo.plan_year ? `<tr><td>שנת תכנית</td><td>${mInfo.plan_year}</td></tr>` : ""}
      ${
        mInfo.overlapping_sites && mInfo.overlapping_sites.length > 0
          ? `<tr><td>אתרים חופפים</td><td>${mInfo.overlapping_sites.join(", ")}</td></tr>`
          : ""
      }
    </table></div>`;

  if (mInfo.notes) {
    html += `<div class="info-section"><h3>הערות</h3><p style="font-size:12px;color:#555;line-height:1.5">${mInfo.notes}</p></div>`;
  }

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== MUNICIPAL INFO ====================

function showMunicipalInfo(props, feature) {
  const area = props.ms_shetach || props.ms_shetach_rashum || 0;
  let html = `<div class="info-section"><h3>בעלות עירונית — גוש ${props.ms_gush} חלקה ${props.ms_chelka}</h3>
    <table class="info-table">
      <tr><td>גוש</td><td>${props.ms_gush}</td></tr>
      <tr><td>חלקה</td><td>${props.ms_chelka}</td></tr>
      <tr><td>סוג בעלות</td><td>${props.t_sug || "עיריית תל אביב"}</td></tr>
      <tr><td>חלקיות</td><td>${props.CHELEK || props.chelkiut || "—"}</td></tr>
      <tr><td>שטח</td><td>${area ? Math.round(area).toLocaleString() + ' מ"ר' : "—"}</td></tr>
    </table></div>`;

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== PLAN INFO ====================

function showPlanInfo(plan, color) {
  let html = `<div class="info-section">
    <h3 style="border-right: 4px solid ${color}; padding-right: 8px;">${plan.plan_id}: ${plan.plan_name}</h3>
    <table class="info-table">
      <tr><td>מזהה</td><td>${plan.plan_id}</td></tr>
      <tr><td>שנה</td><td>${plan.year || "לא ידוע"}</td></tr>
      <tr><td>סטטוס</td><td><span class="status-badge ${plan.status === "מאושרת" ? "status-approved" : "status-process"}">${plan.status}</span></td></tr>
      ${plan.area_dunam ? `<tr><td>שטח</td><td>${plan.area_dunam} דונם</td></tr>` : ""}
      ${plan.units ? `<tr><td>יח"ד</td><td>${plan.units.toLocaleString()}</td></tr>` : ""}
      <tr><td>ייעוד</td><td>${plan.land_use || "—"}</td></tr>
      <tr><td>גושים</td><td>${(plan.gushim || []).join(", ") || "—"}</td></tr>
      ${plan.is_reparcellation ? '<tr><td>רה-פרצלציה</td><td><span class="status-badge status-process">כן</span></td></tr>' : ""}
      ${
        plan.overlapping_sites && plan.overlapping_sites.length > 0
          ? `<tr><td>אתרים חופפים</td><td>${plan.overlapping_sites.join(", ")}</td></tr>`
          : ""
      }
    </table></div>`;

  if (plan.description_heb) {
    html += `<div class="info-section"><h3>תיאור</h3><p style="font-size:12px;color:#555;line-height:1.6">${plan.description_heb}</p></div>`;
  }

  if (plan.key_provisions && plan.key_provisions.length > 0) {
    html += `<div class="info-section"><h3>הוראות עיקריות</h3><ul class="provisions-list">`;
    plan.key_provisions.forEach((p) => {
      html += `<li>${p}</li>`;
    });
    html += `</ul></div>`;
  }

  if (plan.notes) {
    html += `<div class="info-section"><h3>הערות</h3><p style="font-size:12px;color:#888;line-height:1.5">${plan.notes}</p></div>`;
  }

  // Source documents
  const links = plan.source_links || {};
  const hasLinks = Object.keys(links).length > 0;
  html += `<div class="info-section"><h3>מסמכים</h3>`;
  if (hasLinks) {
    const linkStyle =
      "display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#374151;text-decoration:none;border:1px solid #e5e7eb";
    html += `<div style="display:flex;flex-wrap:wrap;gap:8px">`;
    Object.entries(links).forEach(([label, url]) => {
      const icon = label.includes("הוראות")
        ? "📄"
        : label.includes("תשריט")
          ? "🗺️"
          : "📄";
      html += `<a href="${url}" target="_blank" style="${linkStyle}">${icon} ${label}</a>`;
    });
    html += `</div>`;
  } else {
    html += `<p style="font-size:12px;color:#9ca3af">אין מסמך מקושר</p>`;
  }
  html += `</div>`;

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== REPARCELLATION INFO ====================

function showReparcellationInfo(plan) {
  const statusCfg =
    CONFIG.reparcellationStatuses[plan.status] ||
    CONFIG.reparcellationStatuses["לא_טופל"];

  let html = `<div class="info-section">
    <h3 style="border-right: 4px solid ${statusCfg.color}; padding-right: 8px;">${plan.plan_id}: ${plan.plan_name}</h3>
    <table class="info-table">
      <tr><td>מזהה</td><td>${plan.plan_id}</td></tr>
      ${plan.mavat_id ? `<tr><td>מבא"ת</td><td>${plan.mavat_id}</td></tr>` : ""}
      <tr><td>סטטוס</td><td><span class="repar-status" style="background:${statusCfg.bg};color:${statusCfg.color}">${statusCfg.label}</span></td></tr>
      ${plan.year ? `<tr><td>שנה</td><td>${plan.year}</td></tr>` : ""}
      ${plan.area_dunam ? `<tr><td>שטח</td><td>${plan.area_dunam} דונם</td></tr>` : ""}
      <tr><td>גושים</td><td>${(plan.gushim || []).join(", ") || "—"}</td></tr>
      ${plan.chelkot && plan.chelkot.length > 0 ? `<tr><td>חלקות</td><td>${plan.chelkot.join(", ")}</td></tr>` : ""}
      ${plan.streets && plan.streets.length > 0 ? `<tr><td>רחובות</td><td>${plan.streets.join(", ")}</td></tr>` : ""}
      ${plan.management && plan.management.company ? `<tr><td>חברה מנהלת</td><td>${plan.management.company}</td></tr>` : ""}
      ${plan.management && plan.management.architects && plan.management.architects.length > 0 ? `<tr><td>אדריכלים</td><td>${plan.management.architects.join(", ")}</td></tr>` : ""}
    </table></div>`;

  // Contact
  if (plan.management && plan.management.contact) {
    const c = plan.management.contact;
    if (c.name || c.phone || c.email) {
      html += `<div class="info-section"><h3>איש קשר</h3><div class="repar-contact">`;
      if (c.name) html += `${c.name}<br>`;
      if (c.phone) html += `<a href="tel:${c.phone}">${c.phone}</a><br>`;
      if (c.email) html += `<a href="mailto:${c.email}">${c.email}</a>`;
      html += `</div></div>`;
    }
  }

  // Description
  if (plan.description_heb) {
    html += `<div class="info-section"><h3>תיאור</h3><p style="font-size:12px;color:#555;line-height:1.6">${plan.description_heb}</p></div>`;
  }

  // Key provisions
  if (plan.key_provisions && plan.key_provisions.length > 0) {
    html += `<div class="info-section"><h3>הוראות עיקריות</h3><ul class="provisions-list">`;
    plan.key_provisions.forEach((p) => {
      html += `<li>${p}</li>`;
    });
    html += `</ul></div>`;
  }

  // Source documents
  const links = plan.source_links || {};
  const hasLinks = Object.keys(links).length > 0;
  html += `<div class="info-section"><h3>מסמכים</h3>`;
  if (hasLinks) {
    const linkStyle =
      "display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#374151;text-decoration:none;border:1px solid #e5e7eb";
    html += `<div style="display:flex;flex-wrap:wrap;gap:8px">`;
    Object.entries(links).forEach(([label, url]) => {
      html += `<a href="${url}" target="_blank" style="${linkStyle}">📄 ${label}</a>`;
    });
    html += `</div>`;
  } else {
    html += `<span class="repar-missing">חסר PDF</span>`;
  }
  html += `</div>`;

  // Notes
  if (plan.notes) {
    html += `<div class="info-section"><h3>הערות</h3><p style="font-size:12px;color:#888;line-height:1.5">${plan.notes}</p></div>`;
  }

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== SITE INFO ====================

function showSiteInfo(key, site, info) {
  // Find overlapping moshaa
  const overlappingMoshaa = store.data.moshaa
    ? store.data.moshaa.filter(
        (m) => m.overlapping_sites && m.overlapping_sites.includes(info.num),
      )
    : [];

  let html = `<div class="info-section">
    <h3>אתר ${info.num}: ${info.name}</h3>
    <table class="info-table">
      <tr><td>מרכז</td><td style="font-family:monospace;font-size:11px">${site.center.lat.toFixed(5)}, ${site.center.lon.toFixed(5)}</td></tr>
    </table></div>`;

  if (overlappingMoshaa.length > 0) {
    html += `<div class="info-section"><h3>חלקות מושע חופפות (${overlappingMoshaa.length})</h3>
      <table class="info-table">
        <tr style="font-size:10px;color:#999"><td>גוש/חלקה</td><td>שטח</td><td>סטטוס</td></tr>`;
    overlappingMoshaa.forEach((m) => {
      html += `<tr>
        <td>${m.gush}/${m.chelka}</td>
        <td>${(m.area_sqm / 1000).toFixed(1)} ד'</td>
        <td><span class="status-badge ${m.status === "ללא_טיפול" ? "status-untreated" : m.status === "שויכה" ? "status-allocated" : "status-process"}">${statusHeb(m.status)}</span></td>
      </tr>`;
    });
    html += `</table></div>`;
  }

  document.getElementById("tab-info").innerHTML = html;
  switchTab("info");
}

// ==================== REPARCELLATION TAB ====================

function buildReparcellationTab() {
  const container = document.getElementById("tab-reparcellation");
  const reparData = store.data.reparcellation;
  if (!reparData) {
    container.innerHTML = '<div class="empty-state"><p>אין נתונים</p></div>';
    return;
  }

  // Count PDFs
  const withPdf = reparData.filter(
    (p) => Object.keys(p.source_links || {}).length > 0,
  ).length;

  // Group by status
  const groups = {};
  reparData.forEach((plan) => {
    const statusKey = plan.status;
    if (!groups[statusKey]) groups[statusKey] = [];
    groups[statusKey].push(plan);
  });

  // Sort groups by CONFIG order
  const sortedStatuses = Object.keys(groups).sort((a, b) => {
    const oa = (CONFIG.reparcellationStatuses[a] || {}).order || 99;
    const ob = (CONFIG.reparcellationStatuses[b] || {}).order || 99;
    return oa - ob;
  });

  let html = `<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">${reparData.length} תכניות רה-פרצלציה | ${withPdf} עם PDF</div>`;

  sortedStatuses.forEach((statusKey) => {
    const statusCfg =
      CONFIG.reparcellationStatuses[statusKey] ||
      CONFIG.reparcellationStatuses["לא_טופל"];
    const plans = groups[statusKey];

    html += `<div class="repar-section-header">${statusCfg.label} (${plans.length})</div>`;

    plans.forEach((plan) => {
      const hasLinks = Object.keys(plan.source_links || {}).length > 0;
      html += `<div class="repar-card" data-plan-id="${plan.plan_id}" style="--repar-color: ${statusCfg.color}">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="font-weight:600;font-size:12px;color:#111827">${plan.plan_id}</div>
          <span class="repar-status" style="background:${statusCfg.bg};color:${statusCfg.color}">${statusCfg.label}</span>
        </div>
        <div style="font-size:11px;color:#374151;margin-top:2px">${plan.plan_name}</div>
        <div class="repar-meta">
          ${plan.area_dunam ? `${plan.area_dunam} דונם | ` : ""}גוש ${(plan.gushim || []).join(", ")}
          ${plan.management && plan.management.company ? ` | ${plan.management.company}` : ""}
          ${plan.management && plan.management.architects && plan.management.architects.length ? ` | ${plan.management.architects[0]}` : ""}
          ${!hasLinks ? ' <span class="repar-missing">חסר PDF</span>' : ""}
        </div>
      </div>`;
    });
  });

  container.innerHTML = html;

  // Click handlers → show info
  container.querySelectorAll(".repar-card").forEach((card) => {
    card.addEventListener("click", () => {
      const pid = card.dataset.planId;
      const plan = reparData.find((p) => p.plan_id === pid);
      if (plan) {
        showReparcellationInfo(plan);
        // Show reparcellation layer if not visible
        if (!store.map.hasLayer(store.layers.reparcellation)) {
          store.layers.reparcellation.addTo(store.map);
        }
      }
    });
  });
}

// ==================== PLANS TAB ====================

function buildPlansTab() {
  const container = document.getElementById("tab-plans");
  const plansDb = store.data.plans;
  const local = plansDb.filter((p) => !store.frameworkPlanIds.has(p.plan_id));
  const framework = plansDb.filter((p) =>
    store.frameworkPlanIds.has(p.plan_id),
  );

  let html = `<div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${plansDb.length} תכניות (${local.length} מקומיות, ${framework.length} מסגרת)</div>`;

  if (local.length > 0) {
    html += `<div class="plans-section-header">תכניות מקומיות</div>`;
    local.forEach((plan) => {
      html += renderPlanCard(plan, false);
    });
  }

  if (framework.length > 0) {
    html += `<div class="plans-section-header">תכניות מסגרת</div>`;
    framework.forEach((plan) => {
      html += renderPlanCard(plan, true);
    });
  }

  container.innerHTML = html;

  // Click → zoom + highlight on map, show details in info tab
  container.querySelectorAll(".plan-card").forEach((card) => {
    card.addEventListener("click", () => {
      const pid = card.dataset.planId;
      const poly = store.planPolygons[pid];
      const plan = plansDb.find((p) => p.plan_id === pid);
      const isFramework = store.frameworkPlanIds.has(pid);

      if (poly) {
        if (
          isFramework &&
          !store.map.hasLayer(store.layers["framework-plans"])
        ) {
          store.layers["framework-plans"].addTo(store.map);
          const color =
            CONFIG.planColors[plansDb.indexOf(plan) % CONFIG.planColors.length];
          poly.setStyle({
            color: color,
            weight: 2.5,
            fillOpacity: 0.15,
            dashArray: "8 4",
          });
          store.map.fitBounds(poly.getBounds(), { padding: [30, 30] });
          setTimeout(() => {
            poly.setStyle({
              color: "#9ca3af",
              weight: 1.5,
              fillOpacity: 0,
              dashArray: "8 4",
            });
            if (
              !document
                .getElementById("btn-framework")
                .classList.contains("active")
            ) {
              store.map.removeLayer(store.layers["framework-plans"]);
            }
          }, 3000);
        } else {
          store.map.fitBounds(poly.getBounds(), { padding: [30, 30] });
          poly.setStyle({ fillOpacity: 0.3, weight: 3.5 });
          setTimeout(() => {
            const baseWeight = plan.status === "מאושרת" ? 2 : 1.5;
            poly.setStyle({
              fillOpacity: isFramework ? 0 : 0.06,
              weight: isFramework ? 1.5 : baseWeight,
            });
          }, 900);
        }
      }

      if (plan) {
        const color =
          CONFIG.planColors[plansDb.indexOf(plan) % CONFIG.planColors.length];
        showPlanInfo(plan, color);
      }
    });
  });
}

function renderPlanCard(plan, isFramework) {
  const plansDb = store.data.plans;
  const color =
    CONFIG.planColors[plansDb.indexOf(plan) % CONFIG.planColors.length];
  return `<div class="plan-card ${isFramework ? "framework" : ""}" data-plan-id="${plan.plan_id}" style="border-right: 3px solid ${isFramework ? "#9ca3af" : color};">
    <div class="plan-title">${plan.plan_id}: ${plan.plan_name}</div>
    <div class="plan-meta">
      ${plan.year ? `<span class="plan-year">${plan.year}</span>` : ""}
      <span class="status-badge ${plan.status === "מאושרת" ? "status-approved" : "status-process"}">${plan.status}</span>
      ${plan.area_dunam ? ` | ${plan.area_dunam} ד'` : ""}
      ${plan.is_reparcellation ? " | רה-פרצלציה" : ""}
    </div>
  </div>`;
}

// ==================== STATISTICS TAB ====================

function buildStatsTab() {
  const container = document.getElementById("tab-stats");
  const parcelsData = store.data.parcels;
  const moshaaData = store.data.moshaa;
  const municipalData = store.data.municipal;
  const plansDb = store.data.plans;
  const reparData = store.data.reparcellation;

  // Parcel stats
  const totalParcels = parcelsData.features.length;
  let totalArea = 0;
  parcelsData.features.forEach((f) => {
    totalArea += f.properties.ms_shetach || f.properties.ms_shetach_rashum || 0;
  });

  // Moshaa stats
  const totalMoshaa = moshaaData.length;
  let moshaaArea = 0;
  let untreated = 0,
    inProcess = 0,
    allocated = 0;
  moshaaData.forEach((m) => {
    moshaaArea += m.area_sqm;
    if (m.status === "ללא_טיפול") untreated++;
    else if (m.status === "בתהליך_רה_פרצלציה") inProcess++;
    else if (m.status === "שויכה") allocated++;
  });

  // Municipal stats
  const totalMunicipal = municipalData.features.length;
  let municipalArea = 0;
  municipalData.features.forEach((f) => {
    municipalArea += f.properties.Shape_Area || f.properties.ms_shetach || 0;
  });

  // Plans stats
  const totalPlans = plansDb.length;
  const localPlansCount = plansDb.filter(
    (p) => !store.frameworkPlanIds.has(p.plan_id),
  ).length;
  const frameworkPlansCount = plansDb.filter((p) =>
    store.frameworkPlanIds.has(p.plan_id),
  ).length;
  const approvedPlans = plansDb.filter((p) => p.status === "מאושרת").length;
  const reparcPlans = plansDb.filter((p) => p.is_reparcellation).length;

  // Reparcellation stats
  const reparCount = reparData ? reparData.length : 0;
  const reparByStatus = {};
  if (reparData) {
    reparData.forEach((p) => {
      const s = CONFIG.reparcellationStatuses[p.status];
      const label = s ? s.label : p.status;
      reparByStatus[label] = (reparByStatus[label] || 0) + 1;
    });
  }

  let reparStatsHtml = "";
  Object.entries(reparByStatus).forEach(([label, count]) => {
    reparStatsHtml += `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${count}</span></div>`;
  });

  container.innerHTML = `
    <div class="stat-card">
      <h4>חלקות</h4>
      <div class="stat-big">${totalParcels.toLocaleString()} <span class="stat-unit">חלקות</span></div>
      <div class="stat-row"><span class="stat-label">שטח כולל</span><span class="stat-value">${(totalArea / 1000).toFixed(0)} דונם</span></div>
    </div>

    <div class="stat-card">
      <h4>אדמות מושע</h4>
      <div class="stat-big">${totalMoshaa} <span class="stat-unit">חלקות</span></div>
      <div class="stat-row"><span class="stat-label">שטח כולל</span><span class="stat-value">${(moshaaArea / 1000).toFixed(1)} דונם</span></div>
      <div class="stat-row"><span class="stat-label">ללא טיפול</span><span class="stat-value" style="color:#ef4444">${untreated}</span></div>
      <div class="stat-row"><span class="stat-label">בתהליך רה-פרצלציה</span><span class="stat-value" style="color:#f59e0b">${inProcess}</span></div>
      <div class="stat-row"><span class="stat-label">שויכה</span><span class="stat-value" style="color:#10b981">${allocated}</span></div>
    </div>

    <div class="stat-card">
      <h4>בעלות עירונית</h4>
      <div class="stat-big">${totalMunicipal} <span class="stat-unit">חלקות</span></div>
      <div class="stat-row"><span class="stat-label">שטח</span><span class="stat-value">${(municipalArea / 1000).toFixed(1)} דונם</span></div>
      <div class="stat-row"><span class="stat-label">אחוז משטח כולל</span><span class="stat-value">${totalArea > 0 ? ((municipalArea / totalArea) * 100).toFixed(1) : "—"}%</span></div>
    </div>

    <div class="stat-card">
      <h4>תכניות בניין עיר</h4>
      <div class="stat-big">${totalPlans} <span class="stat-unit">תכניות</span></div>
      <div class="stat-row"><span class="stat-label">מקומיות</span><span class="stat-value">${localPlansCount}</span></div>
      <div class="stat-row"><span class="stat-label">מסגרת (שכונתיות)</span><span class="stat-value">${frameworkPlansCount}</span></div>
      <div class="stat-row"><span class="stat-label">מאושרות</span><span class="stat-value">${approvedPlans}</span></div>
      <div class="stat-row"><span class="stat-label">כוללות רה-פרצלציה</span><span class="stat-value">${reparcPlans}</span></div>
      <div class="stat-row"><span class="stat-label">טווח שנים</span><span class="stat-value">${getYearRange()}</span></div>
    </div>

    <div class="stat-card">
      <h4>רה-פרצלציה</h4>
      <div class="stat-big">${reparCount} <span class="stat-unit">תכניות</span></div>
      ${reparStatsHtml}
    </div>

    <div class="stat-card">
      <h4>אתרי סטודיו</h4>
      <div class="stat-big">5 <span class="stat-unit">אתרים</span></div>
    </div>
  `;
}

function getYearRange() {
  const years = store.data.plans.filter((p) => p.year).map((p) => p.year);
  if (years.length === 0) return "—";
  return Math.min(...years) + "–" + Math.max(...years);
}

// ==================== LEGEND ====================

function buildLegend() {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
    <h4>חלקות</h4>
    <div class="legend-item"><div class="legend-dot" style="background:#9ca3af"></div> גבולות חלקות</div>
    <div class="legend-item"><div class="legend-line dashed" style="border-color:#9ca3af;opacity:0.5"></div> גושים</div>

    <h4>אדמות מושע</h4>
    <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div> ללא טיפול</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> בתהליך רה-פרצלציה</div>
    <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div> שויכה</div>

    <h4>בעלות</h4>
    <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div> עיריית ת"א</div>

    <h4>רה-פרצלציה</h4>
    <div class="legend-item"><div class="legend-dot" style="background:#166534"></div> מאושרת</div>
    <div class="legend-item"><div class="legend-dot" style="background:#1e40af"></div> מופקדת / לקראת דיון</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> תחילת תכנון</div>

    <h4>תכניות מקומיות</h4>
    <div class="legend-item"><div class="legend-line" style="border-color:#7c3aed"></div> מאושרת</div>
    <div class="legend-item"><div class="legend-line dashed" style="border-color:#7c3aed"></div> בתהליך</div>
    <div class="legend-item"><div class="legend-line dashed" style="border-color:#9ca3af"></div> מסגרת (מוסתרת)</div>

    <h4>אתרי סטודיו</h4>
    <div class="legend-item"><div class="legend-dot" style="background:#E8635A"></div> 1 התקווה-חנוך-טרפון</div>
    <div class="legend-item"><div class="legend-dot" style="background:#5B8DEF"></div> 2 תשבי-ששון</div>
    <div class="legend-item"><div class="legend-dot" style="background:#3BB076"></div> 3 דרך ההגנה</div>
    <div class="legend-item"><div class="legend-dot" style="background:#9B72CF"></div> 4 הורד-פארק</div>
    <div class="legend-item"><div class="legend-dot" style="background:#E09B4F"></div> 5 הורד-יחיעם-לבלוב</div>
  `;
    return div;
  };
  legend.addTo(store.map);
}

// ==================== BUTTONS ====================

function initButtons() {
  document.getElementById("btn-show-all").addEventListener("click", () => {
    store.map.setView(CONFIG.map.center, CONFIG.map.zoom);
  });

  document.getElementById("btn-about").addEventListener("click", () => {
    document.getElementById("about-overlay").classList.add("visible");
  });

  document.getElementById("btn-about-close").addEventListener("click", () => {
    document.getElementById("about-overlay").classList.remove("visible");
  });

  document.getElementById("about-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove("visible");
    }
  });

  // Framework plans toggle
  document.getElementById("btn-framework").addEventListener("click", () => {
    const btn = document.getElementById("btn-framework");
    const isActive = btn.classList.toggle("active");
    if (isActive) {
      store.layers["framework-plans"].addTo(store.map);
    } else {
      store.map.removeLayer(store.layers["framework-plans"]);
    }
  });
}

// ==================== HELPERS ====================

function statusHeb(s) {
  switch (s) {
    case "ללא_טיפול":
      return "ללא טיפול";
    case "בתהליך_רה_פרצלציה":
      return "בתהליך רה-פרצלציה";
    case "שויכה":
      return "שויכה";
    default:
      return s;
  }
}
