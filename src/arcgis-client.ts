/**
 * ArcGIS REST API client for Tel Aviv Municipality GIS server.
 */

const BASE_URL =
  "https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer";
const WM_BASE_URL =
  "https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer";

export interface BBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface QueryOptions {
  layerId: number;
  where?: string;
  bbox?: BBox;
  outFields?: string;
  returnGeometry?: boolean;
  outSR?: number;
  resultOffset?: number;
  resultRecordCount?: number;
}

export interface PointQueryOptions {
  layerIds: number[];
  x: number;
  y: number;
  sr?: number;
  tolerance?: number;
}

export interface ExportMapOptions {
  bbox: BBox;
  bboxSR?: number;
  layers: number[];
  size?: { width: number; height: number };
  format?: string;
  transparent?: boolean;
}

export interface ArcGISError {
  error: {
    code: number;
    message: string;
    details?: string[];
  };
}

function isArcGISError(obj: unknown): obj is ArcGISError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "error" in obj &&
    typeof (obj as ArcGISError).error?.code === "number"
  );
}

export async function queryLayer(options: QueryOptions): Promise<unknown> {
  const params = new URLSearchParams();

  params.set("where", options.where || "1=1");
  params.set("outFields", options.outFields || "*");
  params.set("returnGeometry", String(options.returnGeometry ?? true));
  params.set("outSR", String(options.outSR ?? 4326));
  params.set("f", "json");

  if (options.bbox) {
    const geometry = JSON.stringify({
      xmin: options.bbox.xmin,
      ymin: options.bbox.ymin,
      xmax: options.bbox.xmax,
      ymax: options.bbox.ymax,
      spatialReference: { wkid: 2039 },
    });
    params.set("geometry", geometry);
    params.set("geometryType", "esriGeometryEnvelope");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("inSR", "2039");
  }

  if (options.resultOffset !== undefined) {
    params.set("resultOffset", String(options.resultOffset));
  }
  if (options.resultRecordCount !== undefined) {
    params.set("resultRecordCount", String(options.resultRecordCount));
  }

  const url = `${BASE_URL}/${options.layerId}/query?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  if (isArcGISError(data)) {
    throw new Error(`ArcGIS error ${data.error.code}: ${data.error.message}`);
  }

  return data;
}

export async function identifyAtPoint(
  options: PointQueryOptions,
): Promise<unknown> {
  // Use individual layer queries with point geometry for more reliable results
  const results: {
    layerId: number;
    layerName?: string;
    features: unknown[];
  }[] = [];

  for (const layerId of options.layerIds) {
    const params = new URLSearchParams();
    const sr = options.sr ?? 4326;
    const geometry = JSON.stringify({
      x: options.x,
      y: options.y,
      spatialReference: { wkid: sr },
    });

    params.set("geometry", geometry);
    params.set("geometryType", "esriGeometryPoint");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("distance", String(options.tolerance ?? 10));
    params.set("units", "esriSRUnit_Meter");
    params.set("where", "1=1");
    params.set("outFields", "*");
    params.set("returnGeometry", "true");
    params.set("outSR", String(sr));
    params.set("inSR", String(sr));
    params.set("f", "json");

    const url = `${BASE_URL}/${layerId}/query?${params.toString()}`;
    const response = await fetch(url);
    const data = (await response.json()) as { features?: unknown[] };

    if (!isArcGISError(data) && data.features) {
      results.push({
        layerId,
        features: data.features,
      });
    }
  }

  return results;
}

export async function exportMapImage(
  options: ExportMapOptions,
): Promise<string> {
  const params = new URLSearchParams();
  const bboxSR = options.bboxSR ?? 2039;
  const size = options.size ?? { width: 1024, height: 1024 };

  params.set(
    "bbox",
    `${options.bbox.xmin},${options.bbox.ymin},${options.bbox.xmax},${options.bbox.ymax}`,
  );
  params.set("bboxSR", String(bboxSR));
  params.set("imageSR", String(bboxSR));
  params.set("size", `${size.width},${size.height}`);
  params.set("layers", `show:${options.layers.join(",")}`);
  params.set("format", options.format ?? "png");
  params.set("transparent", String(options.transparent ?? true));
  params.set("f", "image");

  return `${BASE_URL}/export?${params.toString()}`;
}

export interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

interface EsriFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
    paths?: number[][][];
    x?: number;
    y?: number;
  };
}

interface EsriQueryResult {
  features?: EsriFeature[];
  geometryType?: string;
  exceededTransferLimit?: boolean;
}

function esriGeometryToGeoJSON(
  geom: EsriFeature["geometry"],
  geometryType?: string,
): unknown {
  if (!geom) return null;

  if (geom.rings) {
    if (geom.rings.length === 1) {
      return { type: "Polygon", coordinates: geom.rings };
    }
    return { type: "MultiPolygon", coordinates: geom.rings.map((r) => [r]) };
  }
  if (geom.paths) {
    if (geom.paths.length === 1) {
      return { type: "LineString", coordinates: geom.paths[0] };
    }
    return { type: "MultiLineString", coordinates: geom.paths };
  }
  if (geom.x !== undefined && geom.y !== undefined) {
    return { type: "Point", coordinates: [geom.x, geom.y] };
  }
  return null;
}

export async function queryLayerAllFeatures(
  layerId: number,
  bbox: BBox,
): Promise<GeoJSONCollection> {
  const allFeatures: GeoJSONFeature[] = [];
  let offset = 0;
  const pageSize = 1000;
  let geometryType: string | undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set("where", "1=1");
    params.set("outFields", "*");
    params.set("returnGeometry", "true");
    params.set("outSR", "4326");
    params.set("f", "json");
    params.set("resultOffset", String(offset));
    params.set("resultRecordCount", String(pageSize));

    const geometry = JSON.stringify({
      xmin: bbox.xmin,
      ymin: bbox.ymin,
      xmax: bbox.xmax,
      ymax: bbox.ymax,
      spatialReference: { wkid: 2039 },
    });
    params.set("geometry", geometry);
    params.set("geometryType", "esriGeometryEnvelope");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("inSR", "2039");

    const url = `${BASE_URL}/${layerId}/query?${params.toString()}`;
    const response = await fetch(url);
    const data = (await response.json()) as EsriQueryResult;

    if (!data.features || data.features.length === 0) break;

    if (!geometryType) geometryType = data.geometryType;

    for (const f of data.features) {
      allFeatures.push({
        type: "Feature",
        properties: f.attributes,
        geometry: esriGeometryToGeoJSON(f.geometry, geometryType),
      });
    }

    if (!data.exceededTransferLimit || data.features.length < pageSize) break;
    offset += data.features.length;
  }

  return { type: "FeatureCollection", features: allFeatures };
}

export async function getLayerList(): Promise<unknown> {
  const url = `${BASE_URL}?f=json`;
  const response = await fetch(url);
  const data = await response.json();

  if (isArcGISError(data)) {
    throw new Error(`ArcGIS error ${data.error.code}: ${data.error.message}`);
  }

  return data;
}
