import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  queryLayer,
  queryLayerAllFeatures,
  identifyAtPoint,
  exportMapImage,
  getLayerList,
} from "./arcgis-client.js";
import { queryGovMap, GOVMAP_LAYERS } from "./govmap-client.js";
import { searchDataGov, searchTabaPlans } from "./datagov-client.js";

const server = new McpServer({
  name: "tlv-gis",
  version: "1.0.0",
});

// ── Tool 1: query_building_permits ──────────────────────────────────────────

server.tool(
  "query_building_permits",
  "Query building permits (layer 772) by address, building number, or spatial bounding box. Returns permit details including request number, status, housing units, TAMA 38 status, and document links.",
  {
    address: z
      .string()
      .optional()
      .describe("Address to search for (Hebrew), e.g. 'התקווה 44'"),
    building_num: z.number().optional().describe("Building code number"),
    bbox: z
      .object({
        xmin: z.number(),
        ymin: z.number(),
        xmax: z.number(),
        ymax: z.number(),
      })
      .optional()
      .describe("Bounding box in Israel TM Grid (EPSG:2039)"),
    max_results: z
      .number()
      .optional()
      .default(50)
      .describe("Maximum number of results to return"),
  },
  async ({ address, building_num, bbox, max_results }) => {
    let where = "1=1";
    if (address) {
      where = `addresses LIKE '%${address}%'`;
    } else if (building_num) {
      where = `building_num = ${building_num}`;
    }

    const data = await queryLayer({
      layerId: 772,
      where,
      ...(bbox ? { bbox } : {}),
      outFields:
        "request_num,permission_num,permission_date,expiry_date,open_request,building_num,yechidot_diyur,sw_tama_38,sug_bakasha,tochen_bakasha,building_stage,url_hadmaya,ms_tik_binyan,addresses,hakala_tosefet_achuz_shetach,hakala_yd_mevukash,maslul_rishuy,request_stage",
      returnGeometry: true,
      resultRecordCount: max_results,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ── Tool 2: query_layer ─────────────────────────────────────────────────────

server.tool(
  "query_layer",
  "Generic query on any Tel Aviv GIS layer by ID. Use get_layer_list to find available layers. Supports SQL WHERE clauses, spatial bounding boxes, and field selection.",
  {
    layer_id: z.number().describe("The layer ID to query"),
    where: z
      .string()
      .optional()
      .default("1=1")
      .describe("SQL WHERE clause, e.g. \"shem_rechov LIKE '%דיזנגוף%'\""),
    bbox: z
      .object({
        xmin: z.number(),
        ymin: z.number(),
        xmax: z.number(),
        ymax: z.number(),
      })
      .optional()
      .describe("Bounding box in Israel TM Grid (EPSG:2039)"),
    out_fields: z
      .string()
      .optional()
      .default("*")
      .describe("Comma-separated field names, or * for all"),
    return_geometry: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to return geometry"),
    max_results: z
      .number()
      .optional()
      .default(100)
      .describe("Maximum number of results"),
  },
  async ({
    layer_id,
    where,
    bbox,
    out_fields,
    return_geometry,
    max_results,
  }) => {
    const data = await queryLayer({
      layerId: layer_id,
      where,
      ...(bbox ? { bbox } : {}),
      outFields: out_fields,
      returnGeometry: return_geometry,
      resultRecordCount: max_results,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ── Tool 3: get_building_documents ──────────────────────────────────────────

server.tool(
  "get_building_documents",
  "Get document links (architectural drawings, renders - גרמושקות, הדמיות) for a specific building from layer 772.",
  {
    address: z.string().optional().describe("Address to search for (Hebrew)"),
    building_num: z.number().optional().describe("Building code number"),
  },
  async ({ address, building_num }) => {
    if (!address && !building_num) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: provide either address or building_num",
          },
        ],
        isError: true,
      };
    }

    let where: string;
    if (address) {
      where = `addresses LIKE '%${address}%'`;
    } else {
      where = `building_num = ${building_num}`;
    }

    const data = (await queryLayer({
      layerId: 772,
      where,
      outFields:
        "request_num,addresses,tochen_bakasha,url_hadmaya,building_stage",
      returnGeometry: false,
    })) as { features?: { attributes: Record<string, unknown> }[] };

    const documents = (data.features || [])
      .filter((f) => f.attributes.url_hadmaya)
      .map((f) => ({
        request_num: f.attributes.request_num,
        address: f.attributes.addresses,
        description: f.attributes.tochen_bakasha,
        stage: f.attributes.building_stage,
        document_url: f.attributes.url_hadmaya,
      }));

    return {
      content: [
        {
          type: "text" as const,
          text:
            documents.length > 0
              ? JSON.stringify(documents, null, 2)
              : "No documents found for this query.",
        },
      ],
    };
  },
);

// ── Tool 4: export_map_image ────────────────────────────────────────────────

server.tool(
  "export_map_image",
  "Generate a map image URL for a specific area with selected layers. Returns a URL to a PNG image from the Tel Aviv GIS server.",
  {
    bbox: z
      .object({
        xmin: z.number(),
        ymin: z.number(),
        xmax: z.number(),
        ymax: z.number(),
      })
      .describe("Bounding box in Israel TM Grid (EPSG:2039)"),
    layers: z.array(z.number()).describe("Array of layer IDs to display"),
    width: z
      .number()
      .optional()
      .default(1024)
      .describe("Image width in pixels"),
    height: z
      .number()
      .optional()
      .default(1024)
      .describe("Image height in pixels"),
  },
  async ({ bbox, layers, width, height }) => {
    const imageUrl = await exportMapImage({
      bbox,
      layers,
      size: { width, height },
    });

    return {
      content: [{ type: "text" as const, text: `Map image URL:\n${imageUrl}` }],
    };
  },
);

// ── Tool 5: get_layer_list ──────────────────────────────────────────────────

server.tool(
  "get_layer_list",
  "List all available layers in the Tel Aviv GIS MapServer with IDs, names, and geometry types. Use this to discover which layers are available before querying.",
  {},
  async () => {
    const data = (await getLayerList()) as {
      layers?: {
        id: number;
        name: string;
        type: string;
        geometryType?: string;
        subLayerIds?: number[];
      }[];
    };

    const layers = (data.layers || []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      geometryType: l.geometryType,
      hasSubLayers: l.subLayerIds ? l.subLayerIds.length > 0 : false,
    }));

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(layers, null, 2) },
      ],
    };
  },
);

// ── Tool 6: identify_at_point ───────────────────────────────────────────────

server.tool(
  "identify_at_point",
  "Identify all features at a given point across multiple layers. Useful for finding what exists at a specific location (buildings, zoning, infrastructure, etc.).",
  {
    x: z
      .number()
      .describe(
        "X coordinate (longitude if using WGS84/4326, or easting in Israel TM/2039)",
      ),
    y: z
      .number()
      .describe(
        "Y coordinate (latitude if using WGS84/4326, or northing in Israel TM/2039)",
      ),
    sr: z
      .number()
      .optional()
      .default(4326)
      .describe("Spatial reference WKID (4326 for WGS84, 2039 for Israel TM)"),
    layers: z
      .array(z.number())
      .optional()
      .describe(
        "Layer IDs to query. Defaults to common layers: building permits (772), construction sites (499), trees (628), streets (806)",
      ),
    tolerance: z
      .number()
      .optional()
      .default(10)
      .describe("Search tolerance in meters"),
  },
  async ({ x, y, sr, layers, tolerance }) => {
    const layerIds = layers || [772, 499, 628, 806];

    const data = await identifyAtPoint({
      layerIds,
      x,
      y,
      sr,
      tolerance,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ── Tool 7: export_geojson ──────────────────────────────────────────────────

server.tool(
  "export_geojson",
  "Export all features from a layer within a bounding box as a GeoJSON file. Fetches all pages of results and saves to disk. Geometry is output in WGS84 (EPSG:4326).",
  {
    layer_id: z
      .number()
      .describe(
        "The layer ID to export (e.g. 513 for buildings, 524 for parcels)",
      ),
    bbox: z
      .object({
        xmin: z.number(),
        ymin: z.number(),
        xmax: z.number(),
        ymax: z.number(),
      })
      .describe("Bounding box in Israel TM Grid (EPSG:2039)"),
    save_path: z.string().describe("File path to save the .geojson file"),
  },
  async ({ layer_id, bbox, save_path }) => {
    const geojson = await queryLayerAllFeatures(layer_id, bbox);

    await mkdir(dirname(save_path), { recursive: true });
    await writeFile(save_path, JSON.stringify(geojson, null, 2), "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Exported ${geojson.features.length} features to ${save_path}`,
        },
      ],
    };
  },
);

// ── Tool 8: query_govmap ────────────────────────────────────────────────────

server.tool(
  "query_govmap",
  "Query GovMap national WFS service for cadastral data (parcels, gush boundaries, municipal boundaries). Available layers: PARCEL_ALL (חלקות), SUB_GUSH_ALL (גושים), muni_il (רשויות), Nikuz (ניקוז), nechalim1 (נחלים). Data from Survey of Israel / national cadastre.",
  {
    layer: z
      .enum([
        "opendata:PARCEL_ALL",
        "opendata:SUB_GUSH_ALL",
        "opendata:muni_il",
        "opendata:Nikuz",
        "opendata:nechalim1",
      ])
      .describe("Layer name to query"),
    bbox: z
      .object({
        minLon: z.number(),
        minLat: z.number(),
        maxLon: z.number(),
        maxLat: z.number(),
      })
      .optional()
      .describe("Bounding box in WGS84 (lon/lat)"),
    gush_num: z
      .number()
      .optional()
      .describe(
        "Filter results to a specific gush number (e.g. 6135). Applied client-side.",
      ),
    max_features: z
      .number()
      .optional()
      .default(500)
      .describe("Maximum features to return"),
  },
  async ({ layer, bbox, gush_num, max_features }) => {
    const data = await queryGovMap({
      typeName: layer,
      ...(bbox ? { bbox } : {}),
      ...(gush_num !== undefined ? { gushFilter: gush_num } : {}),
      maxFeatures: max_features,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ── Tool 9: search_taba_plans ───────────────────────────────────────────────

server.tool(
  "search_taba_plans",
  'Search national taba plan (תב"ע) database from data.gov.il. Contains plan boundaries, status, and document links. Note: current coverage is partial — not all areas are included.',
  {
    query: z.string().optional().describe("Text search across all fields"),
    plan_number: z
      .string()
      .optional()
      .describe("Specific plan number, e.g. '001/2022'"),
    status: z.string().optional().describe("Plan status filter, e.g. 'בתוקף'"),
    limit: z.number().optional().default(50).describe("Max results"),
  },
  async ({ query, plan_number, status, limit }) => {
    const filters: Record<string, string> = {};
    if (plan_number) filters.Plan = plan_number;
    if (status) filters.status = status;

    const result = await searchTabaPlans(
      query,
      Object.keys(filters).length > 0 ? filters : undefined,
      limit,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${result.total} plans.\n\n${JSON.stringify(result.records, null, 2)}`,
        },
      ],
    };
  },
);

// ── Tool 10: search_datagov ─────────────────────────────────────────────────

server.tool(
  "search_datagov",
  "Search any data.gov.il CKAN datastore resource by ID. Use this for querying national open datasets.",
  {
    resource_id: z.string().describe("CKAN resource ID (UUID)"),
    query: z.string().optional().describe("Free text search"),
    filters: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .optional()
      .describe("Field-value filter pairs"),
    limit: z.number().optional().default(100).describe("Max results"),
    offset: z.number().optional().default(0).describe("Pagination offset"),
  },
  async ({ resource_id, query, filters, limit, offset }) => {
    const result = await searchDataGov({
      resourceId: resource_id,
      query,
      filters,
      limit,
      offset,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Total: ${result.total} records. Fields: ${result.fields.map((f) => f.id).join(", ")}\n\n${JSON.stringify(result.records, null, 2)}`,
        },
      ],
    };
  },
);

// ── Start server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TLV GIS MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
