#!/usr/bin/env node
/**
 * Builds plan_boundaries_v2.geojson by computing union polygons
 * for each plan from matching parcels (by gush number).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import union from "@turf/union";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const parcels = JSON.parse(
  readFileSync(
    resolve(root, "research/ownership-parcellation/data/parcels.geojson"),
    "utf8",
  ),
);
const plans = JSON.parse(
  readFileSync(
    resolve(root, "research/taba-plans/plans-database.json"),
    "utf8",
  ),
);

console.log(`Parcels: ${parcels.features.length} features`);
console.log(`Plans: ${plans.length}`);

// Index parcels by gush
const parcelsByGush = {};
parcels.features.forEach((f) => {
  const gush = f.properties.ms_gush;
  if (!parcelsByGush[gush]) parcelsByGush[gush] = [];
  parcelsByGush[gush].push(f);
});
console.log(`Gushim found: ${Object.keys(parcelsByGush).join(", ")}`);

const outputFeatures = [];

plans.forEach((plan) => {
  const gushim = plan.gushim || [];
  if (gushim.length === 0) {
    console.log(`  ${plan.plan_id}: no gushim, skipping`);
    return;
  }

  // Collect all parcel features for this plan's gushim
  const matchingParcels = [];
  gushim.forEach((g) => {
    const p = parcelsByGush[g] || [];
    matchingParcels.push(...p);
  });

  console.log(
    `  ${plan.plan_id} (${plan.plan_name}): gushim=[${gushim}], ${matchingParcels.length} parcels`,
  );

  if (matchingParcels.length === 0) {
    console.log(`    -> no matching parcels found, skipping`);
    return;
  }

  // Union all parcels into one polygon using FeatureCollection (turf v7 API)
  const validParcels = matchingParcels.filter(
    (f) => f.geometry && f.geometry.coordinates,
  );
  let merged = null;

  // Process in batches to avoid stack overflow on large sets
  const BATCH = 200;
  const batches = [];
  for (let i = 0; i < validParcels.length; i += BATCH) {
    batches.push(validParcels.slice(i, i + BATCH));
  }

  const batchResults = [];
  for (const batch of batches) {
    if (batch.length === 1) {
      batchResults.push(batch[0]);
      continue;
    }
    try {
      const fc = { type: "FeatureCollection", features: batch };
      const result = union(fc);
      if (result) batchResults.push(result);
    } catch (e) {
      console.log(`    -> batch union error: ${e.message.substring(0, 80)}`);
      // Fallback: add individual features
      batchResults.push(...batch);
    }
  }

  // Merge batch results
  if (batchResults.length === 1) {
    merged = batchResults[0];
  } else if (batchResults.length > 1) {
    try {
      const fc = { type: "FeatureCollection", features: batchResults };
      merged = union(fc);
    } catch (e) {
      console.log(`    -> final merge error: ${e.message.substring(0, 80)}`);
      merged = batchResults[0]; // fallback to first batch
    }
  }

  if (merged) {
    outputFeatures.push({
      type: "Feature",
      properties: {
        plan_id: plan.plan_id,
        plan_name: plan.plan_name,
        year: plan.year,
        status: plan.status,
        gushim: gushim.join(","),
        parcel_count: matchingParcels.length,
      },
      geometry: merged.geometry,
    });
    console.log(`    -> OK: ${merged.geometry.type}`);
  } else {
    console.log(`    -> FAILED: could not merge any parcels`);
  }
});

const output = {
  type: "FeatureCollection",
  features: outputFeatures,
};

const outPath = resolve(
  root,
  "research/ownership-parcellation/data/plan_boundaries_v2.geojson",
);
writeFileSync(outPath, JSON.stringify(output), "utf8");
const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(0);
console.log(
  `\nWritten: ${outPath} (${sizeMB} KB, ${outputFeatures.length} plan polygons)`,
);
