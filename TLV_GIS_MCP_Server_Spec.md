# TLV GIS MCP Server — Specification for Claude Code

## Overview
MCP (Model Context Protocol) server that connects Claude to Tel Aviv Municipality's ArcGIS REST API, enabling direct queries on building permits, zoning plans (תב"עות), conservation buildings, parcels, and more.

## Base API Endpoints

### Primary Server
```
https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer
```

### Web Mercator Variant (for lat/lon queries)
```
https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer
```

### Orthophoto (Aerial imagery 2023)
```
https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2Ortho2023/MapServer
```

**No authentication required** — the API is fully public.

## Coordinate Systems
- Primary server uses **Israel TM Grid (EPSG:2039)** — `Spatial Reference: 2039`
- WM server uses **Web Mercator (EPSG:3857)** — `Spatial Reference: 102100`
- Queries can include `inSR=4326` and `outSR=4326` to use WGS84 lat/lon

## Key Layers (by ID)

### Building & Planning
| Layer ID | Name | Type | Use |
|----------|------|------|-----|
| 772 | בקשות והיתרי בניה | Polygon | Building permits & status, links to documents |
| 499 | אתרי בניה | Polygon | Active construction sites |
| 746 | פרויקטים דיור בהישג יד | Polygon | Affordable housing projects |
| 515 | בעלויות עירייה | Polygon | Municipal property ownership |

### Conservation & Heritage
Search the full layer list for layers containing "שימור" (conservation), "מורשת" (heritage).

### Infrastructure & Transport
| Layer ID | Name |
|----------|------|
| 954 | קווי מטרו |
| 766 | הקו הסגול - תחנות |
| 764 | הקו הירוק - תחנות |
| 423 | הקו האדום - תחנות |

### Environment
| Layer ID | Name |
|----------|------|
| 574 | חופות עצים 2024 |
| 628 | עצים |
| 516 | זיהומי קרקע |
| 489 | מסדרונות אקולוגיים |

### Base Data
| Layer ID | Name |
|----------|------|
| 806 | שמות רחובות מפה עברית |
| 510 | רובעים-למס |
| 402 | ktv_rechov_ironi_hist (historical streets) |

## ArcGIS REST API Query Format

### Basic Query
```
GET {base_url}/{layer_id}/query?
  where={SQL_WHERE_CLAUSE}
  &outFields={comma_separated_fields|*}
  &returnGeometry={true|false}
  &outSR={4326|2039|3857}
  &f={json|geojson|pjson}
```

### Query by Address (Building Permits - Layer 772)
```
GET .../772/query?
  where=addresses LIKE '%התקווה 44%'
  &outFields=request_num,addresses,tochen_bakasha,sug_bakasha,building_stage,permission_date,url_hadmaya,yechidot_diyur,sw_tama_38
  &returnGeometry=true
  &outSR=4326
  &f=json
```

### Spatial Query (by bounding box / envelope)
```
GET .../772/query?
  geometry={"xmin":180600,"ymin":661800,"xmax":180900,"ymax":662100,"spatialReference":{"wkid":2039}}
  &geometryType=esriGeometryEnvelope
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &returnGeometry=true
  &f=json
```

### Spatial Query (by point + radius)
```
GET .../772/query?
  geometry={"x":180750,"y":661950,"spatialReference":{"wkid":2039}}
  &geometryType=esriGeometryPoint
  &distance=100
  &units=esriSRUnit_Meter
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &returnGeometry=true
  &f=json
```

### Export Map Image (for visual reference)
```
GET .../export?
  bbox=180600,661800,180900,662100
  &bboxSR=2039
  &imageSR=2039
  &size=1024,1024
  &layers=show:772
  &format=png
  &transparent=true
  &f=image
```

## Key Fields — Layer 772 (Building Permits)

| Field | Hebrew | Type | Description |
|-------|--------|------|-------------|
| request_num | מספר בקשה | Integer | Permit request number |
| permission_num | מספר היתר | Integer | Permit number |
| permission_date | תאריך היתר | Date | Permit issue date |
| expiry_date | תאריך תוקף היתר | Date | Permit expiry |
| open_request | תאריך פתיחת בקשה | Date | Request opening date |
| building_num | קוד בניין | Integer | Building code |
| yechidot_diyur | יחידות דיור | Integer | Housing units |
| sw_tama_38 | תמא 38 | String | TAMA 38 status |
| sug_bakasha | סוג בקשה | String | Request type |
| tochen_bakasha | תוכן בקשה | String | Request content/description |
| building_stage | פעילות רישוי אחרונה | String | Last licensing activity |
| url_hadmaya | קישור למסמך | String | **Link to architectural drawings/renders** |
| ms_tik_binyan | מס' תיק בניין | Integer | Building file number |
| addresses | כתובות | String | Addresses |
| hakala_tosefet_achuz_shetach | הקלה - תוספת שטח באחוזים | String | Variance - area addition % |
| hakala_yd_mevukash | הקלה - תוספת יח"ד מבוקשת | String | Variance - requested housing units |
| maslul_rishuy | מסלול רישוי | String | Licensing track |
| request_stage | שלב בקשה | String | Request stage |

## MCP Server Tools to Implement

### Tool 1: `query_building_permits`
Query building permits by address, building number, or spatial envelope.
- Input: `address` (string) OR `bbox` (object with xmin,ymin,xmax,ymax in Israel TM)
- Output: JSON array of permits with all fields

### Tool 2: `query_layer`
Generic query on any layer by ID.
- Input: `layer_id` (number), `where` (SQL string), `bbox` (optional), `out_fields` (optional)
- Output: JSON features

### Tool 3: `get_building_documents`
Get document links (גרמושקות, הדמיות) for a specific building.
- Input: `address` (string) OR `building_num` (number)
- Output: Array of document URLs from `url_hadmaya` field

### Tool 4: `export_map_image`
Generate a map image of a specific area with selected layers.
- Input: `bbox`, `layers` (array of layer IDs), `size` (width,height)
- Output: PNG image URL or base64

### Tool 5: `get_layer_list`
List all available layers with IDs and descriptions.
- Output: Layer tree with IDs, names, geometry types

### Tool 6: `identify_at_point`
Identify all features at a given point across multiple layers.
- Input: `x`, `y` (coordinates), `layers` (optional array of layer IDs)
- Output: All features found at that point

## Implementation Notes

### Tech Stack
- **Node.js / TypeScript** recommended (Claude Code native)
- Use `@modelcontextprotocol/sdk` for MCP server scaffolding
- Use `node-fetch` or built-in `fetch` for HTTP requests
- URL-encode Hebrew characters in query strings

### Hebrew URL Encoding
Hebrew text in `where` clauses must be URL-encoded:
```javascript
const where = encodeURIComponent(`addresses LIKE '%התקווה 44%'`);
```

### Pagination
MaxRecordCount is 2000. For larger results, use `resultOffset` and `resultRecordCount`:
```
&resultOffset=0&resultRecordCount=100
```

### Geometry Handling
- Return geometry as GeoJSON when possible (`f=geojson`)
- For area calculations, use Israel TM (2039) which is in meters
- For display/mapping, convert to WGS84 (4326)

### Error Handling
- The API returns `{"error":{"code":...}}` on failures
- Common issues: invalid field names, syntax errors in WHERE clause
- Always validate layer ID exists before querying

## Installation (Claude Code)

```bash
# In project directory
claude code

# Prompt:
# "Build an MCP server based on the spec in TLV_GIS_MCP_Server_Spec.md.
#  Use TypeScript, @modelcontextprotocol/sdk.
#  Implement all 6 tools.
#  Test with a query on layer 772 for address 'התקווה 44'."
```

### Claude Desktop Config (after build)
Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tlv-gis": {
      "command": "node",
      "args": ["/path/to/tlv-gis-mcp/dist/index.js"]
    }
  }
}
```

## Future Enhancements
- Cache layer metadata to reduce API calls
- Add support for MAVAT (מב"ת) national planning portal
- Add coordinate conversion tool (WGS84 ↔ Israel TM)
- Add historical aerial photo layers
- Integrate with OpenDataTLV datasets
- Add support for "דף מידע תכנוני" (planning info page) generation
