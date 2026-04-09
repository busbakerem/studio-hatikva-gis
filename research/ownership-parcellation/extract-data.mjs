/**
 * Extract inline JS data variables from map.html into separate JSON files.
 * Usage: node extract-data.mjs
 */

import { readFileSync, writeFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "map.html");
const dataDir = join(__dirname, "data");

const html = readFileSync(htmlPath, "utf-8");
const lines = html.split("\n");

// Variables to extract: [varName, outputFile]
const vars = [
  ["parcelsData", "parcels.geojson"],
  ["municipalData", "municipal.geojson"],
  ["moshaaData", "moshaa.json"],
  ["gushBoundaries", "gush-boundaries.geojson"],
  ["plansDb", "plans.json"],
  ["siteLocations", "sites.json"],
];

// Plan IDs to remove from plansDb (moved to reparcellation.json)
const removePlanIds = new Set([
  "507-0726463",
  "תא/מק/4765",
  "תא/מק/4766",
  "תא/מק/4899",
]);

function extractVariable(varName) {
  // Find the line with "const VARNAME ="
  const startIdx = lines.findIndex((l) => l.includes(`const ${varName} =`));
  if (startIdx === -1) throw new Error(`Variable "${varName}" not found`);

  const startLine = lines[startIdx];
  const eqPos = startLine.indexOf("=");
  // Get first meaningful char after "="
  const afterEq = startLine.slice(eqPos + 1).trim();
  const openBracket = afterEq[0]; // { or [
  const closeBracket = openBracket === "{" ? "}" : "]";

  // Collect lines from opening bracket to matching close, tracking depth
  let depth = 0;
  let collecting = false;
  const chunks = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    if (i === startIdx) {
      // Start from the opening bracket
      const bracketStart = line.indexOf(openBracket, eqPos);
      chunks.push(line.slice(bracketStart));
    } else {
      chunks.push(line);
    }

    // Count brackets in this line (outside of strings — rough but sufficient for well-formed data)
    for (const ch of line) {
      if (ch === openBracket) depth++;
      else if (ch === closeBracket) depth--;
    }

    if (depth === 0 && chunks.length > 0) {
      // Remove trailing semicolon if present
      let joined = chunks.join("\n");
      joined = joined.replace(/;\s*$/, "");
      return { raw: joined, startLine: startIdx + 1, endLine: i + 1 };
    }
  }

  throw new Error(`Could not find matching close bracket for "${varName}"`);
}

function jsObjectToJson(jsStr) {
  // Convert JS object literal to valid JSON:
  // 1. Unquoted keys -> quoted keys
  // 2. Trailing commas -> removed
  // 3. Single quotes -> double quotes (if any)

  // Use eval in a safe-ish way (data is from our own file)
  // This handles Hebrew strings, unquoted keys, trailing commas natively
  const fn = new Function(`return (${jsStr})`);
  return fn();
}

console.log("Extracting data from map.html...\n");

for (const [varName, outFile] of vars) {
  const { raw, startLine, endLine } = extractVariable(varName);

  let data = jsObjectToJson(raw);

  // Remove specific plan_ids from plansDb
  if (varName === "plansDb") {
    const before = data.length;
    data = data.filter((plan) => !removePlanIds.has(plan.plan_id));
    const removed = before - data.length;
    console.log(`  Removed ${removed} reparcellation plans from plansDb`);
  }

  const json = JSON.stringify(data, null, 2);
  const outPath = join(dataDir, outFile);
  writeFileSync(outPath, json, "utf-8");

  const size = statSync(outPath).size;
  const sizeKB = (size / 1024).toFixed(1);

  // Count records
  let count;
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    count = `${data.features.length} features`;
  } else if (Array.isArray(data)) {
    count = `${data.length} items`;
  } else if (typeof data === "object") {
    count = `${Object.keys(data).length} keys`;
  }

  console.log(
    `  ${varName} -> ${outFile}  (lines ${startLine}-${endLine}, ${sizeKB} KB, ${count})`,
  );
}

console.log("\nDone.");
