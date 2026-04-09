#!/usr/bin/env node
/**
 * Extract text from all taba plan PDFs using pdf-parse.
 * Outputs:
 *   research/taba-plans/extracted/{filename}.txt  — raw text per PDF
 *   research/taba-plans/extracted/_extraction-log.json — classification log
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const RESEARCH_DIR = path.resolve("research/taba-plans");
const DOWNLOAD_DIR = path.join(RESEARCH_DIR, "to-download");
const OUTPUT_DIR = path.join(RESEARCH_DIR, "extracted");

// Hebrew Unicode range: \u0590-\u05FF (Hebrew block)
const HEBREW_RE = /[\u0590-\u05FF]/g;
// Replacement/unknown chars
const BROKEN_RE = /[▯�\uFFFD]/g;

function classifyExtraction(text, numPages) {
  const totalChars = text.length;
  const hebrewMatches = text.match(HEBREW_RE) || [];
  const hebrewCount = hebrewMatches.length;
  const brokenMatches = text.match(BROKEN_RE) || [];
  const brokenCount = brokenMatches.length;

  const charsPerPage = numPages > 0 ? totalChars / numPages : 0;
  const hebrewPerPage = numPages > 0 ? hebrewCount / numPages : 0;
  const hebrewRatio = totalChars > 0 ? hebrewCount / totalChars : 0;
  const brokenRatio = totalChars > 0 ? brokenCount / totalChars : 0;

  let category;
  if (charsPerPage < 50) {
    category = "scan-only";
  } else if (brokenRatio > 0.1 || (hebrewPerPage < 200 && hebrewPerPage > 0)) {
    category = "text-partial";
  } else if (hebrewPerPage >= 200) {
    category = "text-good";
  } else {
    // Has text but no Hebrew — might be encoded weirdly
    category = charsPerPage > 200 ? "text-partial" : "scan-only";
  }

  const needsClaudeReview = category !== "text-good";

  return {
    char_count: totalChars,
    hebrew_count: hebrewCount,
    hebrew_ratio: Math.round(hebrewRatio * 1000) / 1000,
    broken_count: brokenCount,
    chars_per_page: Math.round(charsPerPage),
    hebrew_per_page: Math.round(hebrewPerPage),
    category,
    needs_claude_review: needsClaudeReview,
  };
}

async function extractPdf(filePath) {
  const filename = path.basename(filePath);
  const txtName = filename.replace(/\.pdf$/i, ".txt");

  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const text = data.text || "";
    const numPages = data.numpages || 0;

    // Save extracted text
    const txtPath = path.join(OUTPUT_DIR, txtName);
    fs.writeFileSync(txtPath, text, "utf8");

    const stats = classifyExtraction(text, numPages);

    return {
      filename,
      path: path.relative(".", filePath).replace(/\\/g, "/"),
      pages: numPages,
      ...stats,
    };
  } catch (err) {
    // Save empty file for failed extractions
    const txtPath = path.join(OUTPUT_DIR, txtName);
    fs.writeFileSync(txtPath, "", "utf8");

    return {
      filename,
      path: path.relative(".", filePath).replace(/\\/g, "/"),
      pages: 0,
      char_count: 0,
      hebrew_count: 0,
      hebrew_ratio: 0,
      broken_count: 0,
      chars_per_page: 0,
      hebrew_per_page: 0,
      category: "scan-only",
      needs_claude_review: true,
      error: err.message,
    };
  }
}

async function main() {
  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Collect all PDFs from both directories
  const pdfs = [];

  for (const dir of [RESEARCH_DIR, DOWNLOAD_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.toLowerCase().endsWith(".pdf")) {
        pdfs.push(path.join(dir, f));
      }
    }
  }

  console.log(`Found ${pdfs.length} PDFs to process\n`);

  const results = [];
  for (const pdfPath of pdfs) {
    const basename = path.basename(pdfPath);
    process.stdout.write(`  ${basename} ... `);
    const result = await extractPdf(pdfPath);
    console.log(
      `${result.category} (${result.pages}p, ${result.hebrew_per_page} heb/p)`,
    );
    results.push(result);
  }

  // Save extraction log
  const logPath = path.join(OUTPUT_DIR, "_extraction-log.json");
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2), "utf8");

  // Summary
  const counts = { "text-good": 0, "text-partial": 0, "scan-only": 0 };
  for (const r of results) counts[r.category]++;

  console.log("\n--- Summary ---");
  console.log(`Total PDFs: ${results.length}`);
  console.log(`  text-good:    ${counts["text-good"]}`);
  console.log(`  text-partial: ${counts["text-partial"]}`);
  console.log(`  scan-only:    ${counts["scan-only"]}`);
  console.log(`\nExtraction log: ${logPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
