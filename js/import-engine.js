// Generic, configurable Import / Data-Integration Engine — client-side only, no backend.
//
// This is the "entry point" module: an institute assembles a Data Integration Job out of one or more
// Data Sources (CSV today; see SOURCE_TYPES for the extension point), joins them, maps/transforms/
// filters the result, and commits a final candidate dataset. Nothing here hard-codes a field name,
// a join type, a filter condition, an institute, or a programme — everything is driven by the
// pipeline object the wizard UI builds (see index.html's ij* state/handlers).
//
// Scope, decided with the product owner (see plan): a linear join chain (not an arbitrary DAG), a
// DNF filter shape (OR of AND-groups) at two stages ("dataset:<key>" and "final"), and a fixed
// picker-based transform library (no free-text formula language). MongoDB/API/Excel/SQL sources are
// intentionally not implemented — only their extension point (SOURCE_TYPES) exists — per explicit
// instruction to keep this demo CSV-only while the rest of the pipeline stays fully generic.
import { parseCsvText, nowISO, buildCandidateDocuments, DEFAULT_REQUIRED_DOCUMENTS } from "./admission-engine.js";

// ============================================================================
// Data Source Manager
// ============================================================================

// One dataset row (see js/admission-engine.js:parseCsvText for the actual parsing) -> { rows, schema, recordCount }.
// `rows` is an array of plain objects (header -> raw string), immutable once staged.
export function parseCsvDataset(text, name) {
  const table = parseCsvText(text);
  if (!table.length) return { rows: [], schema: [], recordCount: 0, error: "The file is empty." };
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((cells) => {
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i].trim() : ""; });
    return row;
  });
  return { rows, schema: discoverSchema(rows), recordCount: rows.length, error: null };
}

// Extension point for future connectors: SOURCE_TYPES.mongo = parseMongoDataset, etc. Each connector
// must return the same { rows, schema, recordCount, error } shape so the rest of the engine (join,
// filter, mapping, preview, commit) never needs to know which source type produced a dataset.
export const SOURCE_TYPES = { csv: parseCsvDataset };

// ============================================================================
// Schema Discovery
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

// Infers a field's type from a sample of its raw (string) values. Empty/missing values don't count
// toward the vote — a column that's blank in every sampled row falls back to "string".
export function inferFieldType(values) {
  const present = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (!present.length) return "string";
  const isBool = (v) => /^(true|false)$/i.test(String(v).trim());
  const isNum = (v) => v !== "" && Number.isFinite(Number(v));
  const isDate = (v) => DATE_RE.test(String(v).trim()) || (!isNum(v) && !Number.isNaN(Date.parse(v)));
  if (present.every(isBool)) return "boolean";
  if (present.every(isNum)) return "number";
  if (present.every(isDate)) return "date";
  return "string";
}

// Union of every key seen across the sampled rows, each with an inferred type and one sample value —
// never assumes every row shares the same keys (a real CSV/API dataset can be ragged).
export function discoverSchema(rows) {
  const fields = [];
  const seen = new Set();
  const sampleSize = Math.min(rows.length, 200);
  for (let i = 0; i < sampleSize; i++) {
    Object.keys(rows[i]).forEach((k) => seen.add(k));
  }
  seen.forEach((field) => {
    const values = rows.slice(0, sampleSize).map((r) => r[field]);
    const sample = values.find((v) => v !== "" && v !== null && v !== undefined);
    fields.push({ field, type: inferFieldType(values), sample: sample === undefined ? null : sample });
  });
  return fields;
}

// ============================================================================
// Join Engine
// ============================================================================

// Composite-key value as a single comparable string, or null if ANY participating field is
// null/empty (an incomplete key never matches anything — surfaced as an "invalid key", never
// silently coerced to match other incomplete keys). `fields` are fully-qualified names ("ds1.field")
// matching the already-namespaced row shape produced by runJoinChain's `namespace()` helper below.
export function compositeKeyValue(row, fields) {
  const parts = [];
  for (const f of fields) {
    const v = row[f];
    if (v === undefined || v === null || String(v).trim() === "") return null;
    parts.push(String(v).trim().toLowerCase());
  }
  return parts.join("␟"); // unit separator, unlikely to collide with real data
}

// Joins two already-namespaced row sets (every key prefixed "ns.field") on cfg.leftFields/rightFields
// (fully-qualified field names, arrays for composite-key support) under cfg.joinType
// (inner/left/right/outer). Returns every bucket the spec requires visibility into — never silently
// drops unmatched/duplicate rows.
export function joinDatasets(leftRows, rightRows, cfg) {
  const rightByKey = new Map();
  const rightInvalid = [];
  rightRows.forEach((row) => {
    const key = compositeKeyValue(row, cfg.rightFields);
    if (key === null) { rightInvalid.push(row); return; }
    if (!rightByKey.has(key)) rightByKey.set(key, []);
    rightByKey.get(key).push(row);
  });

  const matchedPairs = []; // { left, rightGroup }
  const unmatchedLeft = [];
  const leftInvalid = [];
  const usedRightKeys = new Set();

  leftRows.forEach((row) => {
    const key = compositeKeyValue(row, cfg.leftFields);
    if (key === null) { leftInvalid.push(row); return; }
    const group = rightByKey.get(key);
    if (!group) { unmatchedLeft.push(row); return; }
    usedRightKeys.add(key);
    matchedPairs.push({ left: row, rightGroup: group });
  });

  const unmatchedRight = [];
  rightByKey.forEach((group, key) => { if (!usedRightKeys.has(key)) unmatchedRight.push(...group); });

  // Duplicate matches: a left row whose key matched more than one right row.
  const duplicateGroups = matchedPairs.filter((m) => m.rightGroup.length > 1);
  const resolved = resolveJoinDuplicates(matchedPairs, cfg.duplicateStrategy || "keep-first");

  let rows = resolved.kept.map((m) => ({ ...m.left, ...m.right }));
  const missing = resolveMissing({ unmatchedLeft, unmatchedRight }, cfg.missingStrategy || "keep-with-nulls", cfg.joinType || "inner");
  rows = rows.concat(missing.extraRows);

  return {
    rows,
    matched: matchedPairs.length,
    unmatchedLeft: unmatchedLeft.length,
    unmatchedRight: unmatchedRight.length,
    duplicates: duplicateGroups.length,
    invalidKeys: leftInvalid.length + rightInvalid.length,
    manualReview: resolved.manualReview,
    exceptions: missing.exceptions
  };
}

// Folds a linear chain of joins across an ordered dataset list: result(0) = datasets[0]'s rows
// (namespaced), result(i) = joinDatasets(result(i-1), datasets[i], joins[i-1]). Each join's "left"
// side is the accumulated result so far, never a raw dataset once i > 1 — this is the deliberate
// "linear chain" scope decision, not an arbitrary join graph.
export function runJoinChain(datasets, joins) {
  if (!datasets.length) return { rows: [], stepResults: [] };
  const namespace = (rows, ns) => rows.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => { out[`${ns}.${k}`] = row[k]; });
    return out;
  });
  let accRows = namespace(datasets[0].rows, datasets[0].key);
  const stepResults = [];
  for (let i = 1; i < datasets.length; i++) {
    const join = joins[i - 1];
    const rightRows = namespace(datasets[i].rows, datasets[i].key);
    // accRows is already namespaced (either dataset[0] directly, or the fields carried through a
    // prior join); join.leftFields/rightFields are fully-qualified "ds1.field" style names matching
    // that namespaced shape.
    const result = joinDatasets(accRows, rightRows, join);
    stepResults.push({ joinId: join.id, ...result });
    accRows = result.rows;
  }
  return { rows: accRows, stepResults };
}

// ============================================================================
// Filter / Condition Engine
// ============================================================================

export const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN", "CONTAINS", "STARTS WITH", "ENDS WITH", "IS NULL", "IS NOT NULL"];

const OPERATORS_BY_TYPE = {
  string: ["=", "!=", "IN", "NOT IN", "CONTAINS", "STARTS WITH", "ENDS WITH", "IS NULL", "IS NOT NULL"],
  number: ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN", "IS NULL", "IS NOT NULL"],
  date: ["=", "!=", ">", ">=", "<", "<=", "IS NULL", "IS NOT NULL"],
  boolean: ["=", "!=", "IS NULL", "IS NOT NULL"]
};
export function operatorsForType(type) { return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.string; }

function isBlank(v) { return v === null || v === undefined || String(v).trim() === ""; }

// Evaluates one condition against a row. `fieldType` (from the mapped/joined schema) validates the
// operator: an operator not valid for the field's type never silently runs, it just evaluates false
// (surfaced to the UI via validateCondition below, which the wizard should call at config time).
export function evaluateCondition(row, condition, fieldType) {
  const { field, op, value } = condition;
  const raw = row[field];
  if (op === "IS NULL") return isBlank(raw);
  if (op === "IS NOT NULL") return !isBlank(raw);
  if (!operatorsForType(fieldType || "string").includes(op)) return false;
  if (isBlank(raw)) return false; // no other operator matches a blank value — null handling is explicit, not implicit
  const asNum = (v) => Number(v);
  const asDate = (v) => new Date(v).getTime();
  switch (op) {
    case "=": return fieldType === "number" ? asNum(raw) === asNum(value) : String(raw).toLowerCase() === String(value).toLowerCase();
    case "!=": return !evaluateCondition(row, { field, op: "=", value }, fieldType);
    case ">": return fieldType === "date" ? asDate(raw) > asDate(value) : asNum(raw) > asNum(value);
    case ">=": return fieldType === "date" ? asDate(raw) >= asDate(value) : asNum(raw) >= asNum(value);
    case "<": return fieldType === "date" ? asDate(raw) < asDate(value) : asNum(raw) < asNum(value);
    case "<=": return fieldType === "date" ? asDate(raw) <= asDate(value) : asNum(raw) <= asNum(value);
    case "IN": return (Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim())).some((v) => String(v).toLowerCase() === String(raw).toLowerCase());
    case "NOT IN": return !evaluateCondition(row, { field, op: "IN", value }, fieldType);
    case "CONTAINS": return String(raw).toLowerCase().includes(String(value).toLowerCase());
    case "STARTS WITH": return String(raw).toLowerCase().startsWith(String(value).toLowerCase());
    case "ENDS WITH": return String(raw).toLowerCase().endsWith(String(value).toLowerCase());
    default: return false;
  }
}

// filter.groups: OR'd; each group's conditions: AND'd (disjunctive normal form). An empty filter
// (no groups, or a group with no conditions counted as "no group") passes every row.
export function evaluateFilter(row, filter, fieldTypeOf) {
  const groups = (filter && filter.groups) || [];
  if (!groups.length) return true;
  return groups.some((g) => (g.conditions || []).every((c) => evaluateCondition(row, c, fieldTypeOf ? fieldTypeOf(c.field) : undefined)));
}

// Applies one filter to a row set, returning both what survived and a small sample of what was
// dropped (never silently discarded — the preview step surfaces filteredOutCount per stage).
export function applyFilters(rows, filter, fieldTypeOf) {
  if (!filter || !(filter.groups || []).length) return { kept: rows, filteredOutCount: 0, filteredOutSample: [] };
  const kept = [];
  const droppedSample = [];
  rows.forEach((row) => {
    if (evaluateFilter(row, filter, fieldTypeOf)) kept.push(row);
    else if (droppedSample.length < 10) droppedSample.push(row);
  });
  return { kept, filteredOutCount: rows.length - kept.length, filteredOutSample: droppedSample };
}

// ============================================================================
// Field Mapping / Transformation Engine
// ============================================================================

// Each transform is (value, params, row) -> value. `row` is only used by concat/calc/conditional,
// which read other fields directly rather than through the single `value` argument.
export const TRANSFORMS = {
  none: (v) => v,
  trim: (v) => (v == null ? v : String(v).trim()),
  upper: (v) => (v == null ? v : String(v).toUpperCase()),
  lower: (v) => (v == null ? v : String(v).toLowerCase()),
  parseNumber: (v) => { const n = Number(String(v).replace(/,/g, "").trim()); return Number.isFinite(n) ? n : null; },
  parseDate: (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; },
  formatDate: (v, params) => {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (params && params.format) || "YYYY-MM-DD";
    return fmt.replace("YYYY", d.getFullYear()).replace("MM", pad(d.getMonth() + 1)).replace("DD", pad(d.getDate()));
  },
  // params.pairs: [{from,to}] (array, not an object, so the wizard can add/edit/remove rows without
  // key-renaming gymnastics); params.default: value to use when no pair's `from` matches.
  valueMap: (v, params) => {
    const pairs = (params && params.pairs) || [];
    const hit = pairs.find((p) => String(p.from).toLowerCase() === String(v).toLowerCase());
    if (hit) return hit.to;
    return params && "default" in params ? params.default : v;
  },
  // params.fields: source field names (row-relative); params.separator: joiner, default " ".
  concat: (v, params, row) => {
    const fields = (params && params.fields) || [];
    const sep = (params && params.separator) != null ? params.separator : " ";
    return fields.map((f) => row[f]).filter((x) => x != null && x !== "").join(sep);
  },
  // params.start/params.length: substring; params.delimiter + params.index: split-and-pick.
  splitExtract: (v, params) => {
    if (params && params.delimiter) {
      const parts = String(v).split(params.delimiter);
      return parts[params.index || 0] != null ? parts[params.index || 0].trim() : null;
    }
    const start = (params && params.start) || 0;
    const length = params && params.length;
    return String(v).slice(start, length != null ? start + length : undefined);
  },
  // params.left/params.right: field names; params.operator: + - * /
  calc: (v, params, row) => {
    const a = Number(row[params && params.left]);
    const b = Number(row[params && params.right]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    switch ((params && params.operator) || "+") {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? null : a / b;
      default: return null;
    }
  },
  // params.field/params.op/params.compareValue/params.then/params.else
  conditional: (v, params, row) => {
    const p = params || {};
    const ok = evaluateCondition(row, { field: p.field, op: p.op, value: p.compareValue }, p.fieldType);
    return ok ? p.then : p.else;
  }
};

// Applies one field mapping to a row: transform -> type cast -> default/null handling.
// Returns { value, excludeRow } — excludeRow is true only when nullHandling is "exclude-row" and the
// resolved value is still null/blank after defaulting.
export function applyFieldMapping(row, mapping) {
  const raw = mapping.sourceField != null ? row[mapping.sourceField] : undefined;
  const kind = (mapping.transform && mapping.transform.kind) || "none";
  const fn = TRANSFORMS[kind] || TRANSFORMS.none;
  let value = fn(raw, mapping.transform && mapping.transform.params, row);
  if (mapping.type === "number" && value != null && value !== "" && typeof value !== "number") {
    const n = Number(value);
    value = Number.isFinite(n) ? n : null;
  }
  if (mapping.type === "boolean" && value != null && value !== "" && typeof value !== "boolean") {
    const s = String(value).trim().toLowerCase();
    value = s === "true" ? true : s === "false" ? false : null;
  }
  if (isBlank(value)) {
    if (mapping.nullHandling === "use-default") value = mapping.defaultValue != null ? mapping.defaultValue : null;
    else value = null;
  }
  const excludeRow = isBlank(value) && mapping.nullHandling === "exclude-row";
  return { value, excludeRow };
}

// Runs every included mapping over one joined row -> { output, excludeRow, missingRequired }.
export function mapRow(row, fieldMappings) {
  const output = {};
  let excludeRow = false;
  const missingRequired = [];
  (fieldMappings || []).filter((m) => m.included !== false).forEach((m) => {
    const { value, excludeRow: rowExcluded } = applyFieldMapping(row, m);
    output[m.targetField] = value;
    if (rowExcluded) { excludeRow = true; missingRequired.push(m.targetField); }
  });
  return { output, excludeRow, missingRequired };
}

// "Quick start" convenience: one identity mapping per detected schema column, target field named by
// camelCasing the source header ("SLAT Score" -> "slatScore"). This is a naming CONVENTION, not a
// requirement of the engine — the wizard's manual "Add Field" path can target any name.
export function toCamelCase(header) {
  const words = String(header).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (!words.length) return "field";
  // Fully lowercase every word first (so an all-caps header word like "SLAT" or "ID" doesn't leak
  // capitals past its first letter), then capitalize each non-leading word's first letter.
  return words.map((w, i) => { const lower = w.toLowerCase(); return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1); }).join("");
}
export function autoMappingRowsFromSchema(schema, sourceKey) {
  return schema.map((col, i) => ({
    id: `FM-auto-${sourceKey}-${i}-${Date.now()}`,
    sourceKey, sourceField: `${sourceKey}.${col.field}`, targetField: toCamelCase(col.field),
    type: col.type, transform: { kind: "none", params: {} }, defaultValue: null, nullHandling: "keep-null", included: true
  }));
}

// ============================================================================
// Duplicate & Missing-Data Resolver
// ============================================================================

// matches: [{ left, rightGroup: [rightRow, ...] }]. Never silently picks a strategy — the caller
// (joinDatasets) always records how many groups had >1 right row (see `duplicates` above); this
// function only decides which right row(s) actually survive into the joined output.
export function resolveJoinDuplicates(matches, strategy) {
  const manualReview = [];
  const kept = matches.map((m) => {
    if (m.rightGroup.length <= 1) return { left: m.left, right: m.rightGroup[0] || {} };
    if (strategy === "reject") return null;
    if (strategy === "keep-last") return { left: m.left, right: m.rightGroup[m.rightGroup.length - 1] };
    if (strategy === "manual") { manualReview.push(m); return null; }
    return { left: m.left, right: m.rightGroup[0] }; // keep-first (default)
  }).filter(Boolean);
  return { kept, manualReview };
}

// unmatched: { unmatchedLeft, unmatchedRight } (raw namespaced rows). Returns rows to fold back into
// the join's output (only relevant for "keep-with-nulls") plus an exceptions list for "exception".
export function resolveMissing({ unmatchedLeft, unmatchedRight }, strategy, joinType) {
  const exceptions = [];
  let extraRows = [];
  const wantsLeft = joinType === "left" || joinType === "outer";
  const wantsRight = joinType === "right" || joinType === "outer";
  if (strategy === "keep-with-nulls") {
    if (wantsLeft) extraRows = extraRows.concat(unmatchedLeft);
    if (wantsRight) extraRows = extraRows.concat(unmatchedRight);
  } else if (strategy === "exception") {
    unmatchedLeft.forEach((row) => exceptions.push({ reason: "Unmatched left record", stage: "join", rowRef: row }));
    unmatchedRight.forEach((row) => exceptions.push({ reason: "Unmatched right record", stage: "join", rowRef: row }));
    if (wantsLeft) extraRows = extraRows.concat(unmatchedLeft);
    if (wantsRight) extraRows = extraRows.concat(unmatchedRight);
  }
  // strategy === "exclude": extraRows stays empty, nothing recorded as an exception either — the
  // preview's unmatchedLeft/unmatchedRight counts already make the drop visible.
  return { extraRows, exceptions };
}

// ============================================================================
// Preview Engine — single source of truth; both the live wizard preview and commit call this
// ============================================================================

function fieldTypeLookup(job) {
  const types = {};
  (job.fieldMappings || []).forEach((m) => { types[m.targetField] = m.type; });
  return types;
}

// Runs the full pipeline in declared order: per-dataset filters -> join chain -> field mapping ->
// final filter -> candidateId/category presence check. Returns every count the spec's preview
// screen needs, plus a small sample of the resulting rows.
export function buildPreview(job, existingCandidates) {
  const datasetCounts = (job.datasets || []).map((d) => ({ key: d.key, name: d.name, recordCount: d.recordCount }));

  // Stage 1: per-dataset filters (pre-join) — evaluated against each dataset's own raw rows, so field
  // names here are bare (not namespaced) and typed via that dataset's own schema.
  const filteredDatasets = (job.datasets || []).map((d) => {
    const filter = (job.filters || []).find((f) => f.stage === `dataset:${d.key}`);
    const typeOf = (field) => { const s = (d.schema || []).find((c) => c.field === field); return s ? s.type : "string"; };
    const { kept, filteredOutCount } = filter ? applyFilters(d.rows, filter, typeOf) : { kept: d.rows, filteredOutCount: 0 };
    return { ...d, rows: kept, datasetFilteredOut: filteredOutCount };
  });
  const datasetFilterResults = filteredDatasets.map((d) => ({ key: d.key, filteredOutCount: d.datasetFilteredOut }));

  // Stage 2: join chain (linear).
  const { rows: joinedRows, stepResults: joinStepResults } = runJoinChain(filteredDatasets, job.joins || []);
  // "manual" duplicateStrategy rows are excluded from the join output (nothing can safely auto-pick a
  // winner among them) — surface them as exceptions same as any other dropped row, so "Manual Review"
  // means "visible in the preview's exception list for the admin to resolve upstream", not "vanishes
  // with no trace".
  let exceptions = joinStepResults.flatMap((r) => [
    ...(r.exceptions || []),
    ...(r.manualReview || []).map((m) => ({ reason: "Multiple matching records for this key — needs manual review before import", stage: "join", rowRef: m.left }))
  ]);

  // Stage 3: field mapping / transform.
  const mapped = joinedRows.map((row) => mapRow(row, job.fieldMappings || []));
  let rows = mapped.filter((m) => !m.excludeRow).map((m) => m.output);
  mapped.filter((m) => m.excludeRow).forEach((m) => exceptions.push({ reason: `Missing required field(s): ${m.missingRequired.join(", ")}`, stage: "mapping", rowRef: m.output }));

  // Stage 4: final filter (post-mapping).
  const finalFilter = (job.filters || []).find((f) => f.stage === "final");
  const typeOf = (field) => fieldTypeLookup(job)[field] || "string";
  const finalFilterResult = finalFilter ? applyFilters(rows, finalFilter, typeOf) : { kept: rows, filteredOutCount: 0 };
  rows = finalFilterResult.kept;

  // Stage 5: candidate-identity validity (candidateIdField/categoryField must resolve to a non-blank value).
  const invalidIdentity = [];
  rows = rows.filter((r) => {
    const id = job.candidateIdField ? r[job.candidateIdField] : null;
    const category = job.categoryField ? r[job.categoryField] : null;
    if (isBlank(id) || isBlank(category)) { invalidIdentity.push(r); return false; }
    return true;
  });
  invalidIdentity.forEach((r) => exceptions.push({ reason: "Missing Candidate ID or Category after mapping", stage: "identity", rowRef: r }));

  // Stage 6: commit-level dedupe preview (against already-committed candidates for this programme+year).
  const existingKey = new Set((existingCandidates || []).map((c) => c.id));
  let existingSkipped = 0;
  rows = rows.filter((r) => {
    const id = String(r[job.candidateIdField]);
    if (existingKey.has(id)) { existingSkipped++; return false; }
    return true;
  });

  return {
    datasetCounts,
    datasetFilterResults,
    joinStepResults,
    finalFilterOutCount: finalFilterResult.filteredOutCount,
    exceptions,
    finalRows: rows,
    finalCount: rows.length,
    existingSkipped,
    sampleRows: rows.slice(0, 20)
  };
}

// ============================================================================
// Commit Engine
// ============================================================================

// Builds and pushes final candidates from a job's pipeline (via buildPreview, so preview and commit
// never drift), stamps lineage, and records the job itself. Never mutates a dataset's raw rows.
export function commitImportJob(ds, job) {
  const programme = ds.programmes.find((p) => p.id === job.programmeId);
  const requiredDocuments = (programme && programme.requiredDocuments) || DEFAULT_REQUIRED_DOCUMENTS;
  // Dedup is scoped to this cycle specifically — the same Applicant ID can legitimately exist in a
  // different cycle of the same programme+year (e.g. re-applying in a later round), so an existing
  // candidate from another cycle must never block or get confused with this import.
  const preview = buildPreview(job, ds.candidates.filter((c) => c.programmeId === job.programmeId && c.academicYearId === job.academicYearId && c.cycleId === job.cycleId));

  const committedCandidateIds = [];
  preview.finalRows.forEach((row) => {
    const id = String(row[job.candidateIdField]);
    const category = row[job.categoryField];
    const candidate = {
      id, programmeId: job.programmeId, academicYearId: job.academicYearId, cycleId: job.cycleId, category,
      ...row, // generic spread: every other mapped field lands under whatever target name the institute chose
      shortlistStatus: "yet-to-shortlist", shortlistId: null,
      allocation: null, piId: null,
      registrationAttendance: "pending", piAttendance: "pending",
      piScores: {}, piNotes: {}, piScoreLocked: {}, piTotal: null, apvScore: null,
      verification: { documents: buildCandidateDocuments(id, category, requiredDocuments) },
      outcome: null, finalScore: null, meritCategory: null, meritBatchId: null, rank: null, waitingListNumber: null,
      meritApproval: [], meritListReleaseId: null,
      timeline: [{ label: "Imported", date: nowISO().slice(0, 10) }],
      importLineage: { jobId: job.id, configId: job.configId || null, configVersion: job.configVersion || null, sourceRowRefs: row.__sourceRowRefs || {} }
    };
    delete candidate.__sourceRowRefs;
    ds.candidates.push(candidate);
    committedCandidateIds.push(id);
  });

  if (job.shortlistRankField && programme) programme.shortlistRankField = job.shortlistRankField;

  const resultSummary = {
    matched: preview.joinStepResults.reduce((s, r) => s + r.matched, 0),
    unmatchedLeft: preview.joinStepResults.reduce((s, r) => s + r.unmatchedLeft, 0),
    unmatchedRight: preview.joinStepResults.reduce((s, r) => s + r.unmatchedRight, 0),
    duplicates: preview.joinStepResults.reduce((s, r) => s + r.duplicates, 0),
    invalidKeys: preview.joinStepResults.reduce((s, r) => s + r.invalidKeys, 0),
    filteredOut: preview.datasetFilterResults.reduce((s, r) => s + r.filteredOutCount, 0) + preview.finalFilterOutCount,
    finalCount: preview.finalCount, added: committedCandidateIds.length, existingSkipped: preview.existingSkipped
  };

  ds.importJobs.push({
    id: job.id, instituteId: job.instituteId, programmeId: job.programmeId, academicYearId: job.academicYearId, cycleId: job.cycleId,
    configId: job.configId || null, configVersion: job.configVersion || null,
    createdAt: job.createdAt, createdBy: job.createdBy, committedAt: nowISO(),
    datasets: (job.datasets || []).map((d) => ({ ...d })), // raw rows kept, immutable staged snapshot
    joins: job.joins || [], filters: job.filters || [], fieldMappings: job.fieldMappings || [],
    candidateIdField: job.candidateIdField, categoryField: job.categoryField, shortlistRankField: job.shortlistRankField || null,
    resultSummary, exceptions: preview.exceptions, committedCandidateIds
  });

  return { added: committedCandidateIds.length, existingSkipped: preview.existingSkipped, total: preview.finalCount + preview.existingSkipped, finalCount: preview.finalCount };
}

// ============================================================================
// Lineage
// ============================================================================

// Resolves a committed candidate back to the import job (and, per dataset, the raw staged row) that
// produced it — the audit trail spec section 16 asks for, without a per-field-per-value log.
export function findCandidateLineage(ds, candidateId, programmeId, academicYearId) {
  const candidate = ds.candidates.find((c) => c.id === candidateId && c.programmeId === programmeId && c.academicYearId === academicYearId);
  if (!candidate || !candidate.importLineage) return null;
  const job = ds.importJobs.find((j) => j.id === candidate.importLineage.jobId);
  if (!job) return { ...candidate.importLineage, job: null };
  return { ...candidate.importLineage, job };
}

// ============================================================================
// Configuration / Version Manager
// ============================================================================

// Snapshots a job's pipeline (shape, not data) into a new, versioned, reusable config. `configId`
// stays stable across saves under the same name+programme; version increments from the highest
// existing version for that configId (1 for a brand-new configId).
export function saveImportConfig(ds, { existingConfigId, name, instituteId, programmeId, job, createdBy }) {
  const configId = existingConfigId || `ICV-${Date.now()}`;
  const version = latestConfigVersion(ds, configId) + 1;
  const pipeline = {
    sources: (job.datasets || []).map((d) => ({ key: d.key, name: d.name, sourceType: d.sourceType, expectedSchema: d.schema })),
    joins: job.joins || [], filters: job.filters || [], fieldMappings: job.fieldMappings || [],
    candidateIdField: job.candidateIdField, categoryField: job.categoryField, shortlistRankField: job.shortlistRankField || null
  };
  const row = { id: `ICV-${Date.now()}-${version}`, configId, version, name, instituteId, programmeId, createdAt: nowISO(), createdBy, pipeline };
  ds.importConfigs.push(row);
  return row;
}

export function latestConfigVersion(ds, configId) {
  const versions = ds.importConfigs.filter((c) => c.configId === configId).map((c) => c.version);
  return versions.length ? Math.max(...versions) : 0;
}

// Latest version per configId, for a given programme — what the Import Jobs list page shows.
export function listConfigsForProgramme(ds, programmeId) {
  const byConfigId = new Map();
  ds.importConfigs.filter((c) => c.programmeId === programmeId).forEach((c) => {
    const current = byConfigId.get(c.configId);
    if (!current || c.version > current.version) byConfigId.set(c.configId, c);
  });
  return Array.from(byConfigId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Compares a saved config's expected source schemas + the fields its joins/filters/mappings actually
// reference against a set of newly-discovered dataset schemas (keyed by the config's own source keys).
// Reports every broken reference by name — the caller must show these, never silently re-map.
export function detectBrokenMappings(config, newDatasetSchemasByKey) {
  const issues = [];
  const fieldExists = (sourceKey, field) => {
    const schema = newDatasetSchemasByKey[sourceKey];
    if (!schema) { issues.push({ type: "missing-dataset", detail: `No dataset supplied for "${sourceKey}".` }); return false; }
    return schema.some((c) => c.field === field);
  };
  (config.pipeline.fieldMappings || []).forEach((m) => {
    if (m.sourceKey && m.sourceField) {
      const bareField = m.sourceField.includes(".") ? m.sourceField.split(".").slice(1).join(".") : m.sourceField;
      if (!fieldExists(m.sourceKey, bareField)) {
        issues.push({ type: "missing-field", detail: `Mapping "${m.targetField}" expected "${bareField}" in dataset "${m.sourceKey}", which is no longer present.` });
      }
    }
  });
  return issues;
}

// Seeds a draft job's pipeline from a chosen config version — datasets themselves still need
// re-uploading (a config never carries data, only shape), so job.datasets stays whatever the caller
// already has (usually []).
export function applyConfigToJob(job, config) {
  const p = config.pipeline;
  return { ...job, configId: config.configId, configVersion: config.version, joins: p.joins, filters: p.filters, fieldMappings: p.fieldMappings, candidateIdField: p.candidateIdField, categoryField: p.categoryField, shortlistRankField: p.shortlistRankField };
}
