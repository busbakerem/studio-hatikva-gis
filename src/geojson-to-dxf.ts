/**
 * GeoJSON to DXF converter with 3D extrusion support.
 * Produces DXF files compatible with Rhino import.
 */

import { readFile, writeFile } from "node:fs/promises";

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[][] | number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ── DXF writer helpers ──────────────────────────────────────────────────────

let handleCounter = 100;
function nextHandle(): string {
  return (handleCounter++).toString(16).toUpperCase();
}

function dxfHeader(): string {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
6
0
ENDSEC
`;
}

function dxfTables(layerNames: string[]): string {
  const layers = layerNames
    .map(
      (name, i) => `0
LAYER
5
${nextHandle()}
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
${name}
70
0
62
${(i % 7) + 1}
6
Continuous
`
    )
    .join("");

  return `0
SECTION
2
TABLES
0
TABLE
2
LAYER
5
${nextHandle()}
100
AcDbSymbolTable
70
${layerNames.length}
${layers}0
ENDTAB
0
ENDSEC
`;
}

function dxfEntitiesStart(): string {
  return `0
SECTION
2
ENTITIES
`;
}

function dxfEntitiesEnd(): string {
  return `0
ENDSEC
0
EOF
`;
}

function dxf3DFace(
  layer: string,
  p1: number[],
  p2: number[],
  p3: number[],
  p4: number[]
): string {
  return `0
3DFACE
5
${nextHandle()}
8
${layer}
10
${p1[0]}
20
${p1[1]}
30
${p1[2]}
11
${p2[0]}
21
${p2[1]}
31
${p2[2]}
12
${p3[0]}
22
${p3[1]}
32
${p3[2]}
13
${p4[0]}
23
${p4[1]}
33
${p4[2]}
`;
}

function dxfPolyline3D(layer: string, pts: number[][], closed: boolean): string {
  let s = `0
POLYLINE
5
${nextHandle()}
8
${layer}
66
1
70
${closed ? 9 : 8}
`;
  for (const p of pts) {
    s += `0
VERTEX
5
${nextHandle()}
8
${layer}
10
${p[0]}
20
${p[1]}
30
${p[2] ?? 0}
70
32
`;
  }
  s += `0
SEQEND
5
${nextHandle()}
8
${layer}
`;
  return s;
}

function dxfLwPolyline(layer: string, pts: number[][], closed: boolean): string {
  let s = `0
LWPOLYLINE
5
${nextHandle()}
8
${layer}
100
AcDbEntity
100
AcDbPolyline
90
${pts.length}
70
${closed ? 1 : 0}
`;
  for (const p of pts) {
    s += `10
${p[0]}
20
${p[1]}
`;
  }
  return s;
}

// ── Geometry conversion ─────────────────────────────────────────────────────

function getRings(feature: GeoJSONFeature): number[][][] {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return geom.coordinates as number[][][];
  }
  if (geom.type === "MultiPolygon") {
    const multi = geom.coordinates as number[][][][];
    return multi.flatMap((p) => p);
  }
  return [];
}

function buildExtrudedBuilding(
  ring: number[][],
  height: number,
  layer: string
): string {
  let entities = "";
  const n = ring.length;
  // Skip last point if it duplicates first (closed ring)
  const pts = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]
    ? ring.slice(0, -1)
    : ring;
  const count = pts.length;

  // Top polyline (closed, at height)
  const topPts = pts.map((p) => [p[0], p[1], height]);
  entities += dxfPolyline3D(layer + "_TOP", topPts, true);

  // Bottom polyline (closed, at z=0)
  const botPts = pts.map((p) => [p[0], p[1], 0]);
  entities += dxfPolyline3D(layer + "_BOT", botPts, true);

  // Wall faces (3DFACE quads)
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const b1 = [pts[i][0], pts[i][1], 0];
    const b2 = [pts[j][0], pts[j][1], 0];
    const t1 = [pts[i][0], pts[i][1], height];
    const t2 = [pts[j][0], pts[j][1], height];
    entities += dxf3DFace(layer + "_WALLS", b1, b2, t2, t1);
  }

  // Top cap as triangle fan from centroid
  const cx = pts.reduce((s, p) => s + p[0], 0) / count;
  const cy = pts.reduce((s, p) => s + p[1], 0) / count;
  const center = [cx, cy, height];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const t1 = [pts[i][0], pts[i][1], height];
    const t2 = [pts[j][0], pts[j][1], height];
    entities += dxf3DFace(layer + "_CAP", t1, t2, center, center);
  }

  return entities;
}

// ── Main export functions ───────────────────────────────────────────────────

export async function buildingsGeojsonToDxf(
  inputPath: string,
  outputPath: string,
  heightField: string = "gova_simplex_2019"
): Promise<{ total: number; with3d: number; without3d: number }> {
  handleCounter = 100;
  const raw = JSON.parse(await readFile(inputPath, "utf-8")) as GeoJSONCollection;

  const layers = ["BUILDINGS_TOP", "BUILDINGS_BOT", "BUILDINGS_WALLS", "BUILDINGS_CAP", "BUILDINGS_2D"];
  let dxf = dxfHeader() + dxfTables(layers) + dxfEntitiesStart();

  let with3d = 0;
  let without3d = 0;

  for (const feature of raw.features) {
    const rings = getRings(feature);
    if (rings.length === 0) continue;

    const height = Number(feature.properties[heightField]) || 0;

    for (const ring of rings) {
      if (height > 0) {
        dxf += buildExtrudedBuilding(ring, height, "BUILDINGS");
        with3d++;
      } else {
        // 2D polyline fallback
        dxf += dxfLwPolyline("BUILDINGS_2D", ring, true);
        without3d++;
      }
    }
  }

  dxf += dxfEntitiesEnd();
  await writeFile(outputPath, dxf, "utf-8");

  return { total: raw.features.length, with3d, without3d };
}

export async function polygonGeojsonToDxf(
  inputPath: string,
  outputPath: string,
  layerName: string = "PARCELS"
): Promise<{ total: number; exported: number }> {
  handleCounter = 100;
  const raw = JSON.parse(await readFile(inputPath, "utf-8")) as GeoJSONCollection;

  const layers = [layerName];
  let dxf = dxfHeader() + dxfTables(layers) + dxfEntitiesStart();

  let exported = 0;
  for (const feature of raw.features) {
    const rings = getRings(feature);
    for (const ring of rings) {
      dxf += dxfLwPolyline(layerName, ring, true);
      exported++;
    }
  }

  dxf += dxfEntitiesEnd();
  await writeFile(outputPath, dxf, "utf-8");

  return { total: raw.features.length, exported };
}
