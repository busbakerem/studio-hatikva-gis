import { readFile, writeFile } from "node:fs/promises";
import { queryLayerAllFeatures } from "../dist/arcgis-client.js";

const siteLocs = JSON.parse(await readFile("research/ownership-parcellation/data/site-locations.json", "utf8"));

// WGS84 → ITM conversion (calibrated from parcels GeoJSON)
const wgsMinLon=34.77883, wgsMinLat=32.03474;
const itmMinX=179800, itmMinY=661200;
const sx = (181200 - 179800) / (34.80366 - 34.77883);
const sy = (662600 - 661200) / (32.05934 - 32.03474);

function wgsToItm(lon, lat) {
  return [Math.round(itmMinX + (lon - wgsMinLon) * sx), Math.round(itmMinY + (lat - wgsMinLat) * sy)];
}

const pad = 120; // meters
const siteIds = Object.keys(siteLocs);
const result = { sites: {} };

for (const siteId of siteIds) {
  const site = siteLocs[siteId];
  const [cx, cy] = wgsToItm(site.center.lon, site.center.lat);
  const bbox = { xmin: cx - pad, ymin: cy - pad, xmax: cx + pad, ymax: cy + pad };

  console.log(`\n--- ${siteId} (ITM ${cx},${cy}) ---`);

  const layers = { municipal: 515, parcels: 524, landuse: 514, permits: 772, buildings: 513 };
  const siteResult = {};

  for (const [name, layerId] of Object.entries(layers)) {
    const gj = await queryLayerAllFeatures(layerId, bbox);
    siteResult[name] = gj.features.map(f => f.properties);
    console.log(`  ${name} (${layerId}): ${gj.features.length} features`);
  }

  result.sites[siteId] = siteResult;
}

await writeFile("research/ownership-parcellation/data/_per_site_data.json", JSON.stringify(result, null, 2));
console.log("\nSaved _per_site_data.json");

// Also re-run address-parcel cross-reference using WGS84 geometry
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function centroid(coords) {
  const ring = coords[0] || coords;
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; }
  return [cx / ring.length, cy / ring.length];
}

const addrResult = {};
for (const siteId of siteIds) {
  const site = siteLocs[siteId];
  const [cx, cy] = wgsToItm(site.center.lon, site.center.lat);
  const bbox = { xmin: cx - pad, ymin: cy - pad, xmax: cx + pad, ymax: cy + pad };

  const parcelsGJ = await queryLayerAllFeatures(524, bbox);
  const permitsGJ = await queryLayerAllFeatures(772, bbox);

  const parcelAddresses = {};
  for (const parcel of parcelsGJ.features) {
    const key = `${parcel.properties.ms_gush}/${parcel.properties.ms_chelka}`;
    parcelAddresses[key] = new Set();
    const parcelRing = parcel.geometry?.coordinates?.[0];
    if (!parcelRing) continue;

    for (const permit of permitsGJ.features) {
      if (!permit.properties.addresses || !permit.geometry?.coordinates) continue;
      const [pcx, pcy] = centroid(permit.geometry.coordinates);
      if (pointInRing(pcx, pcy, parcelRing)) {
        parcelAddresses[key].add(permit.properties.addresses);
      }
    }
  }

  addrResult[siteId] = {};
  for (const [key, addrs] of Object.entries(parcelAddresses)) {
    addrResult[siteId][key] = [...addrs];
  }

  const withAddr = Object.values(addrResult[siteId]).filter(a => a.length > 0).length;
  console.log(`${siteId}: ${withAddr}/${parcelsGJ.features.length} parcels with addresses`);
}

await writeFile("research/ownership-parcellation/data/_parcel_addresses.json", JSON.stringify(addrResult, null, 2));
console.log("Saved _parcel_addresses.json");
