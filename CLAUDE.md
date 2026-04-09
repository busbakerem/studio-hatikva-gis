# TLV GIS MCP Server

## Address vs Parcel Numbers

- User always provides STREET ADDRESSES (כתובות), never parcel numbers (חלקות)
- To find actual chelka numbers, always query layer 524 spatially
- Never assume a number is a chelka unless explicitly stated as "חלקה"
- Example: "Hatishbi 7" = street address on Hatishbi street, NOT chelka 7

## Data Sources

### Source 1: TLV GIS (primary)

Endpoint: `https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer`

- ArcGIS REST API, no auth required
- Coordinate system: Israel TM Grid (EPSG:2039), can output WGS84
- ~257 layers, municipal data only

Key layers:

- 513: מבנים (buildings — footprints, heights, floors, year)
- 515: בעלויות עירייה (municipal ownership — ONLY municipal, not all public land)
- 524: חלקות (parcels — municipal cadastre, includes moshaa)
- 514: ייעודי קרקע (land use zoning)
- 772: בקשות והיתרי בניה (building permits — rich, 44 fields)
- 682: מבנים לשימור (conservation)
- 591: מבנים מסוכנים (dangerous buildings)

### Source 2: GovMap WFS (national cadastre)

Endpoint: `https://open.govmap.gov.il/geoserver/opendata/wfs`

- OGC WFS, no auth required, GeoJSON output
- Coordinate system: WGS84 (EPSG:4326)
- National Survey of Israel data — different parcel numbering than TLV GIS
- CQL_FILTER does NOT work reliably — use bbox + client-side gush filter instead

Available layers:

- `opendata:PARCEL_ALL` — national cadastral parcels (fields: GUSH_NUM, PARCEL, LEGAL_AREA, STATUS_TEX, LOCALITY_N)
- `opendata:SUB_GUSH_ALL` — gush boundaries
- `opendata:muni_il` — municipal boundaries

Important: GovMap gush numbers may differ from TLV GIS gush numbers for the same area.

### Source 3: data.gov.il (national open data)

Endpoint: `https://data.gov.il/api/3/action/datastore_search`

- CKAN datastore API
- Contains national taba plans (partial coverage)
- Resource ID for taba plans: `201436f4-5699-494e-a67d-efe8acfd19fc`
- Current taba dataset covers mainly southern Israel, limited Tel Aviv data

### Source 4: Mavat/iplan (blocked)

Endpoint: `https://iplan.gov.il` / `https://mavat.iplan.gov.il`

- Behind Cloudflare protection — 403 from server-side requests
- Cannot be queried programmatically without browser automation
- Manual lookup only: search by gush/chelka at mavat.iplan.gov.il

## Verification Protocol

Every factual claim in research documents must be tagged with a confidence level:

- ✅ GIS_VERIFIED — data comes directly from a GIS layer query (layer number + query noted)
- ✅ WEB_VERIFIED — confirmed via web search with source URL
- ⚠️ INFERRED — logically derived from verified data but not directly confirmed
- ❌ UNVERIFIED — based on general knowledge, needs confirmation

Rules:

- Never present UNVERIFIED claims as facts
- UNVERIFIED items go in a separate "שאלות פתוחות לבירור" section
- Statistics must always note the source layer and query bbox
- When GIS data seems inconsistent (e.g. moshaa parcels showing as very large), FLAG it and explain why

## Moshaa Land (אדמת מושע)

- Moshaa parcels appear as ONE large parcel in the cadastral layer (524) but actually represent shared ownership among many holders
- NEVER report moshaa parcel size as if it's a single property
- Always note: "חלקת מושע — שטח רשום כולל, בעלות משותפת של מספר בעלים"
- The actual "unit" in moshaa is the individual holding, not the registered parcel

## Ownership Categories

Always distinguish between:

1. עיריית תל אביב — municipal (from layer 515)
2. רמ"י (רשות מקרקעי ישראל) — state land authority (NOT in GIS, requires external verification)
3. קק"ל — JNF (NOT in GIS)
4. בעלות פרטית רשומה — registered private
5. מושע — shared unregistered (large parcels in layer 524 with note "moshaa")
6. חכירה — leasehold vs freehold

Layer 515 ONLY shows municipal ownership. It does NOT show RMI, KKL, or private ownership.
Never claim "X% is municipally owned" as if it means "X% is publicly owned" — these are different things.

## Address-Parcel Linkage

When presenting parcel data, always cross-reference layer 524 (parcels) with layer 513 (buildings) to attach street addresses to parcel numbers. A table of parcels without addresses is not useful.

## Site vs Context

Always define and mark clearly:

- האתר (site boundary) — the specific project area
- הסביבה (context) — 200m radius for environmental/urban analysis
- השכונה (neighborhood) — full Hatikva boundaries for statistical overview
