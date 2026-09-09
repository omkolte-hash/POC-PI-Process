// Plain node --test smoke check for js/import-engine.js — no framework, run with:
//   node --test js/import-engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseCsvDataset, discoverSchema, autoMappingRowsFromSchema, buildPreview,
  joinDatasets, runJoinChain, resolveJoinDuplicates, detectBrokenMappings, toCamelCase
} from "./import-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "e2e", "tests", "fixtures", "candidates.csv");

test("single-dataset CSV import reproduces the fixed importer's 8 candidates, 6 OPEN + 2 SC", () => {
  const text = readFileSync(CSV_PATH, "utf8");
  const { rows, schema, recordCount } = parseCsvDataset(text, "Roster");
  assert.equal(recordCount, 8);

  const mapping = autoMappingRowsFromSchema(schema, "ds1");
  assert.ok(mapping.find((m) => m.targetField === "slatScore"), "auto-map should camelCase 'SLAT Score' -> slatScore");
  assert.ok(mapping.find((m) => m.targetField === "category"));
  assert.ok(mapping.find((m) => m.targetField === "applicantId"));

  const job = {
    datasets: [{ key: "ds1", name: "Roster", sourceType: "csv", rows, schema, recordCount }],
    joins: [], filters: [], fieldMappings: mapping,
    candidateIdField: "applicantId", categoryField: "category", shortlistRankField: "slatScore"
  };
  const preview = buildPreview(job, []);
  assert.equal(preview.finalCount, 8);
  const byCategory = preview.finalRows.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {});
  assert.equal(byCategory.OPEN, 6);
  assert.equal(byCategory.SC, 2);
});

test("toCamelCase handles the fixture's exact headers", () => {
  assert.equal(toCamelCase("SLAT Score"), "slatScore");
  assert.equal(toCamelCase("Education Background"), "educationBackground");
  assert.equal(toCamelCase("Applicant ID"), "applicantId");
});

test("left vs inner join produce different unmatched counts", () => {
  const left = [{ "a.id": "1", "a.name": "X" }, { "a.id": "2", "a.name": "Y" }];
  const right = [{ "b.id": "1", "b.score": "90" }];
  const inner = joinDatasets(left, right, { leftFields: ["a.id"], rightFields: ["b.id"], joinType: "inner", missingStrategy: "exclude" });
  assert.equal(inner.matched, 1);
  assert.equal(inner.rows.length, 1);

  const leftJoin = joinDatasets(left, right, { leftFields: ["a.id"], rightFields: ["b.id"], joinType: "left", missingStrategy: "keep-with-nulls" });
  assert.equal(leftJoin.matched, 1);
  assert.equal(leftJoin.unmatchedLeft, 1);
  assert.equal(leftJoin.rows.length, 2, "left join with keep-with-nulls should retain the unmatched left row");
});

test("runJoinChain folds a 3-dataset linear chain", () => {
  const datasets = [
    { key: "ds1", rows: [{ id: "1", name: "A" }, { id: "2", name: "B" }] },
    { key: "ds2", rows: [{ id: "1", score: "90" }, { id: "2", score: "80" }] },
    { key: "ds3", rows: [{ id: "1", status: "SUCCESS" }] }
  ];
  const joins = [
    { id: "j1", leftFields: ["ds1.id"], rightFields: ["ds2.id"], joinType: "inner", missingStrategy: "exclude" },
    { id: "j2", leftFields: ["ds1.id"], rightFields: ["ds3.id"], joinType: "left", missingStrategy: "keep-with-nulls" }
  ];
  const { rows, stepResults } = runJoinChain(datasets, joins);
  assert.equal(stepResults.length, 2);
  assert.equal(rows.length, 2); // candidate 2 has no ds3 match but left join keeps it
  const c1 = rows.find((r) => r["ds1.id"] === "1");
  assert.equal(c1["ds3.status"], "SUCCESS");
});

test("keep-first duplicate strategy collapses a duplicate join key to one row", () => {
  const matches = [{ left: { id: "1" }, rightGroup: [{ score: "10" }, { score: "20" }] }];
  const first = resolveJoinDuplicates(matches, "keep-first");
  assert.equal(first.kept[0].right.score, "10");
  const last = resolveJoinDuplicates(matches, "keep-last");
  assert.equal(last.kept[0].right.score, "20");
  const rejected = resolveJoinDuplicates(matches, "reject");
  assert.equal(rejected.kept.length, 0);
});

test("detectBrokenMappings flags a renamed/missing column instead of silently mis-mapping", () => {
  const config = { pipeline: { fieldMappings: [{ sourceKey: "ds1", sourceField: "ds1.slatScore", targetField: "slatScore" }] } };
  const okIssues = detectBrokenMappings(config, { ds1: [{ field: "slatScore", type: "number" }] });
  assert.equal(okIssues.length, 0);
  const brokenIssues = detectBrokenMappings(config, { ds1: [{ field: "score", type: "number" }] });
  assert.equal(brokenIssues.length, 1);
  assert.match(brokenIssues[0].detail, /slatScore/);
});
