/**
 * Query 5 architecture studio sites across 5 GIS layers and save results.
 * Uses the ArcGIS client's queryLayerAllFeatures function.
 */
import { queryLayerAllFeatures } from '../dist/arcgis-client.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const SITES = {
  'hatikva-hanoch-tarfon': { xmin: 180250, ymin: 661980, xmax: 180380, ymax: 662120 },
  'hatishbi-sasson':       { xmin: 180440, ymin: 661700, xmax: 180620, ymax: 661850 },
  'derech-hahagana':       { xmin: 180350, ymin: 662250, xmax: 180550, ymax: 662420 },
  'haverod-park':          { xmin: 180580, ymin: 662160, xmax: 180740, ymax: 662320 },
  'haverod-yechiam-leblov':{ xmin: 180520, ymin: 662020, xmax: 180690, ymax: 662180 },
};

const LAYERS = {
  municipal: 515,
  parcels:   524,
  landuse:   514,
  permits:   772,
  buildings: 513,
};

const BUILDING_FIELDS = ['id_binyan', 't_sug_mivne', 'ms_komot', 'gova_simplex_2019', 'year', 'Shape_Area'];

function extractProps(feature, layerKey) {
  const props = feature.attributes || feature.properties || {};
  if (layerKey === 'buildings') {
    const picked = {};
    for (const f of BUILDING_FIELDS) {
      if (f in props) picked[f] = props[f];
    }
    // Calculate Shape_Area from geometry rings if not present
    if (!('Shape_Area' in picked) && feature.geometry?.rings) {
      picked.Shape_Area = calcPolygonArea(feature.geometry.rings);
    }
    return picked;
  }
  return props;
}

function calcPolygonArea(rings) {
  let total = 0;
  for (const ring of rings) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    total += Math.abs(area) / 2;
  }
  return total;
}

async function main() {
  const result = { sites: {} };
  const summary = [];

  for (const [siteName, bbox] of Object.entries(SITES)) {
    console.log(`\n--- ${siteName} ---`);
    result.sites[siteName] = {};
    const siteSummary = { site: siteName };

    for (const [layerKey, layerId] of Object.entries(LAYERS)) {
      try {
        const data = await queryLayerAllFeatures(layerId, bbox);
        const features = (data.features || []).map(f => extractProps(f, layerKey));
        result.sites[siteName][layerKey] = features;
        siteSummary[layerKey] = features.length;
        console.log(`  ${layerKey} (${layerId}): ${features.length} features`);
      } catch (err) {
        console.error(`  ${layerKey} (${layerId}): ERROR - ${err.message}`);
        result.sites[siteName][layerKey] = [];
        siteSummary[layerKey] = 0;
      }
    }
    summary.push(siteSummary);
  }

  const outPath = 'research/ownership-parcellation/data/_per_site_data.json';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${outPath}`);

  // Print summary table
  console.log('\n=== SUMMARY ===');
  console.log('Site'.padEnd(28), ...Object.keys(LAYERS).map(k => k.padEnd(12)));
  for (const s of summary) {
    console.log(
      s.site.padEnd(28),
      ...Object.keys(LAYERS).map(k => String(s[k]).padEnd(12))
    );
  }
}

main().catch(err => { console.error(err); process.exit(1); });
