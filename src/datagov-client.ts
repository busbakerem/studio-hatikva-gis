/**
 * data.gov.il CKAN API client for national planning data.
 * Uses the CKAN datastore_search API.
 */

const DATAGOV_API = "https://data.gov.il/api/3/action";

/** Known dataset resource IDs */
export const DATAGOV_RESOURCES = {
  /** תכניות בניין עיר (תב"עות) — blue-line boundaries */
  taba_plans: "201436f4-5699-494e-a67d-efe8acfd19fc",
};

export interface DataGovSearchOptions {
  resourceId: string;
  query?: string;
  filters?: Record<string, string | number>;
  limit?: number;
  offset?: number;
}

export interface DataGovResult {
  total: number;
  records: Record<string, unknown>[];
  fields: { id: string; type: string }[];
}

export async function searchDataGov(
  options: DataGovSearchOptions,
): Promise<DataGovResult> {
  const params = new URLSearchParams();
  params.set("resource_id", options.resourceId);
  params.set("limit", String(options.limit ?? 100));

  if (options.offset) {
    params.set("offset", String(options.offset));
  }

  if (options.query) {
    params.set("q", options.query);
  }

  if (options.filters) {
    params.set("filters", JSON.stringify(options.filters));
  }

  const url = `${DATAGOV_API}/datastore_search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `data.gov.il API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    success: boolean;
    result: DataGovResult;
    error?: { message: string };
  };

  if (!data.success) {
    throw new Error(
      `data.gov.il API error: ${data.error?.message ?? "unknown"}`,
    );
  }

  return data.result;
}

/**
 * Search for taba plans (תב"עות) by plan number or text query.
 */
export async function searchTabaPlans(
  query?: string,
  filters?: Record<string, string | number>,
  limit?: number,
): Promise<DataGovResult> {
  return searchDataGov({
    resourceId: DATAGOV_RESOURCES.taba_plans,
    query,
    filters,
    limit: limit ?? 50,
  });
}
