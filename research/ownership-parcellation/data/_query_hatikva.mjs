import { queryLayerAllFeatures } from '../../../dist/arcgis-client.js';
import { writeFile } from 'node:fs/promises';

const bbox = { xmin: 179800, ymin: 661200, xmax: 181200, ymax: 662600 };
const base = 'research/ownership-parcellation/data';

// 1. Municipal ownership (layer 515)
console.log('Querying municipal ownership (515)...');
const municipal = await queryLayerAllFeatures(515, bbox);
await writeFile(base + '/municipal_land.geojson', JSON.stringify(municipal, null, 2));
console.log('Municipal land:', municipal.features.length, 'features');

// 2. Parcels (layer 524)
console.log('Querying parcels (524)...');
const parcels = await queryLayerAllFeatures(524, bbox);
await writeFile(base + '/parcels.geojson', JSON.stringify(parcels, null, 2));
console.log('Parcels:', parcels.features.length, 'features');

// 3. Land use zoning (layer 514)
console.log('Querying land use (514)...');
const landuse = await queryLayerAllFeatures(514, bbox);
await writeFile(base + '/land_use.geojson', JSON.stringify(landuse, null, 2));
console.log('Land use:', landuse.features.length, 'features');

// Save raw stats
const stats = {
  municipal: {
    count: municipal.features.length,
    fields: municipal.features[0]?.properties ? Object.keys(municipal.features[0].properties) : [],
    sample: municipal.features.slice(0, 3).map(f => f.properties),
  },
  parcels: {
    count: parcels.features.length,
    fields: parcels.features[0]?.properties ? Object.keys(parcels.features[0].properties) : [],
    sample: parcels.features.slice(0, 3).map(f => f.properties),
  },
  landuse: {
    count: landuse.features.length,
    fields: landuse.features[0]?.properties ? Object.keys(landuse.features[0].properties) : [],
    sample: landuse.features.slice(0, 3).map(f => f.properties),
  },
};
await writeFile(base + '/_neighborhood_stats.json', JSON.stringify(stats, null, 2));
console.log('Stats saved');
