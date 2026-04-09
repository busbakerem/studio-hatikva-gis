/**
 * GovMap WFS client for national cadastral data.
 * Endpoint: https://open.govmap.gov.il/geoserver/opendata/wfs
 *
 * Available layers:
 *   opendata:PARCEL_ALL — National parcels (WGS84)
 *   opendata:Parcels_ITM — National parcels (Israel TM Grid)
 *   opendata:SUB_GUSH_ALL — Gush boundaries (WGS84)
 *   opendata:SUB_GUSH_ALL_ITM — Gush boundaries (Israel TM Grid)
 *   opendata:muni_il — Municipal boundaries
 *   opendata:Nikuz — Drainage basins
 *   opendata:nechalim1 — Streams
 */

const GOVMAP_WFS_URL = "https://open.govmap.gov.il/geoserver/opendata/wfs";

export interface GovMapBBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export const GOVMAP_LAYERS = [
  {
    name: "opendata:PARCEL_ALL",
    title: "חלקות (WGS84)",
    description: "National cadastral parcels",
  },
  {
    name: "opendata:Parcels_ITM",
    title: "חלקות (Israel TM)",
    description: "National cadastral parcels in ITM",
  },
  {
    name: "opendata:SUB_GUSH_ALL",
    title: "גושים (WGS84)",
    description: "Gush (block) boundaries",
  },
  {
    name: "opendata:SUB_GUSH_ALL_ITM",
    title: "גושים (Israel TM)",
    description: "Gush boundaries in ITM",
  },
  {
    name: "opendata:muni_il",
    title: "רשויות מוניציפאליות",
    description: "Municipal boundaries",
  },
  {
    name: "opendata:Nikuz",
    title: "אגני ניקוז",
    description: "Drainage basins",
  },
  { name: "opendata:nechalim1", title: "נחלים", description: "Streams" },
];

export interface GovMapQueryOptions {
  typeName: string;
  bbox?: GovMapBBox;
  cqlFilter?: string;
  maxFeatures?: number;
  propertyName?: string;
  /** Client-side filter by GUSH_NUM (since CQL_FILTER is unreliable on this server) */
  gushFilter?: number;
}

export async function queryGovMap(
  options: GovMapQueryOptions,
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("service", "WFS");
  params.set("version", "2.0.0");
  params.set("request", "GetFeature");
  params.set("typeName", options.typeName);
  params.set("outputFormat", "application/json");
  params.set("srsName", "EPSG:4326");
  params.set("count", String(options.maxFeatures ?? 1000));

  if (options.bbox) {
    const { minLon, minLat, maxLon, maxLat } = options.bbox;
    // GeoServer WFS bbox order: minx,miny,maxx,maxy = minLon,minLat,maxLon,maxLat
    params.set("bbox", `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`);
  }

  if (options.cqlFilter) {
    // Note: GovMap WFS has limited CQL support. Bbox queries are more reliable.
    params.set("CQL_FILTER", options.cqlFilter);
  }

  if (options.propertyName) {
    params.set("propertyName", options.propertyName);
  }

  const url = `${GOVMAP_WFS_URL}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `GovMap WFS error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  if (!text || text.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error(
      `GovMap WFS returned non-JSON response: ${text.slice(0, 200)}`,
    );
  }

  const data = JSON.parse(text) as {
    type: string;
    features?: Array<{ properties: Record<string, unknown> }>;
  };

  // Client-side gush filter (CQL_FILTER is unreliable on this server)
  if (options.gushFilter !== undefined && data.features) {
    data.features = data.features.filter(
      (f) => f.properties.GUSH_NUM === options.gushFilter,
    );
  }

  return data;
}
