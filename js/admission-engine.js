// Admission Processing System — mock data model + workflow logic (client-side only, no backend).
// Terminology: "Room" in the source docs = Zoom Room (virtual). Exam terminology shown as "SLAT" (docs call it SET).

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260615);
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

export const CATEGORIES = [
  { id: "OPEN", label: "OPEN" },
  { id: "SC", label: "Scheduled Caste (SC)" },
  { id: "ST", label: "Scheduled Tribe (ST)" },
  { id: "DA", label: "Differently Abled (DA)" },
  { id: "KM", label: "Kashmiri Migrants / Kashmiri Pandits" }
];

// No seeded institutes/programmes \u2014 a fresh dataset starts empty except for the Super Admin login.
// Institutes get real login credentials generated when Super Admin creates them (see createInstitute),
// stored on the institute record itself rather than in this static list.
export const SAMPLE_CREDENTIALS = {
  superAdmin: { email: "superadmin@platform.io", password: "Super@123" },
  institutes: []
};

export function parseTimeToMinutes(str) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(str || "").trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (h === 12) h = 0;
  if (ap === "PM") h += 12;
  return h * 60 + min;
}
export function sessionDurationMinutes(startTime, endTime) {
  const s = parseTimeToMinutes(startTime), e = parseTimeToMinutes(endTime);
  if (s == null || e == null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return diff;
}
export function validateSessionDuration(startTime, endTime) {
  const mins = sessionDurationMinutes(startTime, endTime);
  if (mins == null) return { valid: false, minutes: null, message: "Enter valid start/end times, e.g. 10:00 AM." };
  if (mins < 5) return { valid: false, minutes: mins, message: "Session duration must be at least 5 minutes." };
  return { valid: true, minutes: mins, message: null };
}

export const ASSESSMENT_TYPES = [
  { shortName: "PI", name: "Personal Interview", active: true },
  { shortName: "GE", name: "Group Exercise", active: false },
  { shortName: "WAT", name: "Written Ability Test", active: false },
  { shortName: "WE", name: "Written Exercise", active: false }
];

export const RUBRIC = [
  { id: "tech", key: "tech", name: "Technical / Management Aptitude", seq: 1, max: 10, allowZero: "No", allowDecimal: "No" },
  { id: "domain", key: "domain", name: "Domain Knowledge", seq: 2, max: 10, allowZero: "No", allowDecimal: "No" },
  { id: "gk", key: "gk", name: "General Knowledge", seq: 3, max: 10, allowZero: "No", allowDecimal: "No" },
  { id: "comm", key: "comm", name: "Communication Skills", seq: 4, max: 10, allowZero: "No", allowDecimal: "No" }
];

export const SCORE_ENTRY_MODELS = [
  { id: "group-group", label: "Group wise display with group wise score entry", allocationType: "Group wise", description: "Panel members give one common mark for the entire group." },
  { id: "student-student", label: "Student wise display with Student wise score entry", allocationType: "Student wise", description: "Each panelist scores each candidate individually; scores are averaged." },
  { id: "group-student-award", label: "Group wise display with Student wise score entry(award score)", allocationType: "Group wise", description: "Panel members will discuss and give common marks for a candidate." }
];

export function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function nowISO() { return new Date().toISOString(); }

// ---------- Candidate CSV import ----------
function parseCsvText(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export const IMPORT_COLUMNS = [
  { key: "id", header: "Applicant ID", rowRequired: true },
  { key: "name", header: "Name", rowRequired: true },
  { key: "gender", header: "Gender" },
  { key: "category", header: "Category", rowRequired: true },
  { key: "educationBackground", header: "Education Background" },
  { key: "tenthPct", header: "10th %", numeric: true },
  { key: "twelfthPct", header: "12th %", numeric: true },
  { key: "slatScore", header: "SLAT Score", rowRequired: true, numeric: true },
  { key: "slatPercentile", header: "SLAT Percentile", numeric: true }
];

export function parseImportCsv(text) {
  const rows = parseCsvText(text);
  if (!rows.length) return { headerErrors: ["The file is empty."], rows: [], validCount: 0, invalidCount: 0 };
  const normalized = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = {};
  const missing = [];
  IMPORT_COLUMNS.forEach((col) => {
    const idx = normalized.indexOf(col.header.toLowerCase());
    if (idx === -1) missing.push(col.header);
    else colIndex[col.key] = idx;
  });
  if (missing.length) {
    return { headerErrors: [`Missing required column(s): ${missing.join(", ")}.`], rows: [], validCount: 0, invalidCount: 0 };
  }
  const categoryIds = CATEGORIES.map((c) => c.id);
  const parsedRows = rows.slice(1).map((cells, i) => {
    const rowNum = i + 2;
    const get = (key) => (cells[colIndex[key]] || "").trim();
    const numOrNull = (key) => { const v = get(key); if (!v) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
    const errors = [];
    const id = get("id");
    if (!id) errors.push("Applicant ID is required.");
    const name = get("name");
    if (!name) errors.push("Name is required.");
    const category = get("category").toUpperCase();
    if (!categoryIds.includes(category)) errors.push(`Category must be one of ${categoryIds.join(", ")}.`);
    const slatScoreRaw = get("slatScore");
    const slatScore = Number(slatScoreRaw);
    if (!slatScoreRaw || !Number.isFinite(slatScore)) errors.push("SLAT Score must be a number.");
    const data = {
      id, name, gender: get("gender") || null, category,
      educationBackground: get("educationBackground") || null,
      tenthPct: numOrNull("tenthPct"), twelfthPct: numOrNull("twelfthPct"),
      slatScore: Number.isFinite(slatScore) ? slatScore : null,
      slatPercentile: numOrNull("slatPercentile")
    };
    return { rowNum, valid: errors.length === 0, errors, data };
  });
  const validCount = parsedRows.filter((r) => r.valid).length;
  return { headerErrors: [], rows: parsedRows, validCount, invalidCount: parsedRows.length - validCount };
}

// This prototype has no candidate-facing application portal and CSV import carries no file attachments, so
// there's nowhere a real certificate could actually come from before an admin reviews it. To keep the real
// workflow — documents already exist, the admin only approves/rejects them — a placeholder document is
// attached automatically at import time, standing in for whatever was submitted during the real application.
function placeholderDocument(candidateId, label) {
  const text = `Placeholder ${label} document for ${candidateId}. No real file was submitted — this stands in for whatever document would have been uploaded during the actual application, for prototype purposes.`;
  return { fileName: `${candidateId}_${label.replace(/\s+/g, "_")}.pdf`, dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` };
}

export function commitImportedCandidates(ds, programmeId, academicYearId, rowsData) {
  // Applicant ID is the sole primary key candidates are looked up by everywhere in this app, so it must
  // stay globally unique — it can't be scoped to this programme without every other `candidates.find(...)`
  // call risking an ambiguous match. Distinguish the two "already exists" cases so the summary is honest
  // about why a row was skipped, rather than implying it was already imported into this same programme.
  let added = 0, existing = 0, existingOtherProgramme = 0;
  rowsData.forEach((r) => {
    const dup = ds.candidates.find((c) => c.id === r.id);
    if (dup) { if (dup.programmeId === programmeId) existing++; else existingOtherProgramme++; return; }
    ds.candidates.push({
      id: r.id, name: r.name, gender: r.gender, programmeId, academicYearId,
      category: r.category, educationBackground: r.educationBackground,
      tenthPct: r.tenthPct, twelfthPct: r.twelfthPct, slatScore: r.slatScore, slatPercentile: r.slatPercentile,
      shortlistStatus: "yet-to-shortlist", shortlistId: null,
      allocation: null, piId: null,
      registrationAttendance: "pending", piAttendance: "pending",
      piScores: {}, piNotes: {}, piScoreLocked: {}, piTotal: null, apvScore: null,
      verification: {
        categoryVerification: { eligibilityTeam: null, institute: null },
        categoryDocument: r.category !== "OPEN" ? placeholderDocument(r.id, "Category Certificate") : { fileName: null, dataUrl: null },
        daDocument: r.category === "DA" ? placeholderDocument(r.id, "DA Certificate") : { fileName: null, dataUrl: null },
        daVerification: null
      },
      outcome: null, finalScore: null, meritCategory: null, meritBatchId: null, rank: null, waitingListNumber: null,
      meritApproval: { director: null, siu: null }, meritListReleaseId: null,
      timeline: [{ label: "Imported", date: nowISO().slice(0, 10) }]
    });
    added++;
  });
  return { added, existing, existingOtherProgramme, total: rowsData.length };
}

// Fills in any top-level fields missing from a JSON file saved by an older version of this app
// (e.g. a file saved before "shortlists" existed), so opening it never crashes on a missing collection.
export function normalizeDataset(d) {
  d = d || {};
  // Migrate the old "Registrar" second-approval-level naming (pre-SIU) to "siu" so older saved files still work.
  const shortlists = (d.shortlists || []).map((l) => {
    const approvals = { director: null, siu: null, ...(l.approvals || {}) };
    if (approvals.registrar && !approvals.siu) approvals.siu = approvals.registrar;
    delete approvals.registrar;
    return { ...l, approvals, status: l.status === "pending-registrar" ? "pending-siu" : l.status };
  });
  const candidates = (d.candidates || []).map((c) => {
    let cand = c;
    if (cand.meritApproval && cand.meritApproval.registrar && !cand.meritApproval.siu) {
      cand = { ...cand, meritApproval: { director: cand.meritApproval.director || null, siu: cand.meritApproval.registrar } };
    }
    // Migrate the old fixed "p1"/"p2" score-slot shape to the per-panelist-id map: the total score
    // stands, but the old slots can't be mapped to a real panelist id so the breakdown is dropped.
    if (cand.piScores && ("p1" in cand.piScores || "p2" in cand.piScores)) {
      cand = { ...cand, piScores: {} };
    }
    if (!cand.piNotes) cand = { ...cand, piNotes: {} };
    if (!cand.piScoreLocked) cand = { ...cand, piScoreLocked: {} };
    if (cand.apvScore === undefined) cand = { ...cand, apvScore: null };
    // Each document-related field is checked and defaulted independently — a real legacy file could plausibly
    // have only some of these fields (e.g. categoryDocument but not daDocument) rather than all-or-nothing.
    if (cand.verification && !cand.verification.categoryDocument) {
      cand = { ...cand, verification: { ...cand.verification, categoryDocument: { fileName: null, dataUrl: null } } };
    }
    if (cand.verification && !cand.verification.daDocument) {
      cand = { ...cand, verification: { ...cand.verification, daDocument: { fileName: null, dataUrl: null } } };
    }
    if (cand.verification && cand.verification.daVerification === undefined) {
      cand = { ...cand, verification: { ...cand.verification, daVerification: null } };
    }
    // Candidates imported before documents were auto-attached at import time still need one backfilled —
    // otherwise they'd sit on Category Verification with nothing for the admin to actually approve.
    if (cand.verification && cand.category !== "OPEN" && !cand.verification.categoryDocument.fileName) {
      cand = { ...cand, verification: { ...cand.verification, categoryDocument: placeholderDocument(cand.id, "Category Certificate") } };
    }
    if (cand.verification && cand.category === "DA" && !cand.verification.daDocument.fileName) {
      cand = { ...cand, verification: { ...cand.verification, daDocument: placeholderDocument(cand.id, "DA Certificate") } };
    }
    return cand;
  });
  const panelists = (d.panelists || []).map((p) => (p.credentials !== undefined ? p : { ...p, credentials: null }));
  const institutes = (d.institutes || []).map((i) => (i.credentials !== undefined ? i : { ...i, credentials: null }));
  // Migrate sessions saved before Zoom Room links required panelists first: strip any link that has no panelists behind it.
  // Also migrate the old loose "assessmentType" short-code field to a real link to a specific assessment record.
  const sessions = (d.sessions || []).map((s) => {
    let session = s;
    if (!session.assessmentId && session.assessmentType) {
      const match = (d.assessments || []).find((a) => a.programmeId === session.programmeId && a.shortName === session.assessmentType);
      const { assessmentType, ...rest } = session;
      session = { ...rest, assessmentId: match ? match.id : null };
    }
    return {
      ...session,
      groups: (session.groups || []).map((g) => {
        if (g.zoomRoom && g.zoomRoom.link && (!g.zoomRoom.panelistIds || !g.zoomRoom.panelistIds.length)) {
          return { ...g, zoomRoom: { ...g.zoomRoom, link: "" } };
        }
        return g;
      })
    };
  });
  return {
    institutes,
    programmes: d.programmes || [],
    academicYears: d.academicYears || [],
    activeAcademicYearByProgramme: d.activeAcademicYearByProgramme || {},
    activeProgrammeId: d.activeProgrammeId || (d.programmes && d.programmes[0] ? d.programmes[0].id : null),
    categories: d.categories || CATEGORIES,
    assessmentTypes: d.assessmentTypes || ASSESSMENT_TYPES,
    assessmentParams: d.assessmentParams || { PI: RUBRIC, GE: [], WAT: [], WE: [] },
    assessmentParamsDraft: d.assessmentParamsDraft || { PI: null, GE: null, WAT: null, WE: null },
    scoreEntryModels: d.scoreEntryModels || SCORE_ENTRY_MODELS,
    assessments: d.assessments || [],
    sessions,
    panelists,
    candidates,
    shortlists,
    meritBatches: d.meritBatches || [],
    meritListReleases: d.meritListReleases || [],
    approvalRequests: d.approvalRequests || [],
    sentMails: d.sentMails || [],
    auditLog: d.auditLog || []
  };
}

export function generateDataset() {
  return {
    institutes: [],
    programmes: [],
    academicYears: [],
    activeAcademicYearByProgramme: {},
    activeProgrammeId: null,
    categories: CATEGORIES,
    assessmentTypes: ASSESSMENT_TYPES,
    assessmentParams: { PI: RUBRIC, GE: [], WAT: [], WE: [] },
    assessmentParamsDraft: { PI: null, GE: null, WAT: null, WE: null },
    scoreEntryModels: SCORE_ENTRY_MODELS,
    assessments: [],
    sessions: [],
    panelists: [],
    candidates: [],
    shortlists: [],
    meritBatches: [],
    meritListReleases: [],
    approvalRequests: [],
    sentMails: [],
    auditLog: []
  };
}

// ---------- Status metadata (label + tag class + icon) ----------
export const STATUS_META = {
  "yet-to-shortlist": { label: "Yet to be Shortlisted", cls: "tag-neutral" },
  shortlisted: { label: "Shortlisted", cls: "tag-outline" },
  "first-level-approved": { label: "First Level Approved", cls: "tag-outline" },
  "second-level-approved": { label: "Second Level Approved", cls: "tag-accent" },
  "rejected-list": { label: "Rejected", cls: "tag-neutral" },
  pending: { label: "Pending", cls: "tag-neutral" },
  present: { label: "Present", cls: "tag-accent" },
  absent: { label: "Absent", cls: "tag-neutral" },
  approved: { label: "Approved", cls: "tag-accent" },
  disapproved: { label: "Disapproved", cls: "tag-neutral" },
  valid: { label: "Valid", cls: "tag-accent" },
  invalid: { label: "Invalid", cls: "tag-neutral" },
  "n/a": { label: "N/A", cls: "tag-neutral" },
  ineligible: { label: "Ineligible", cls: "tag-neutral" },
  "ready-for-merit": { label: "Ready for Merit", cls: "tag-outline" },
  merit: { label: "Merit", cls: "tag-accent" },
  waiting: { label: "Waiting", cls: "tag-outline" },
  rejected: { label: "Rejected", cls: "tag-neutral" },
  "fee-pending": { label: "Fee Pending", cls: "tag-outline" },
  paid: { label: "Paid", cls: "tag-outline" },
  confirmed: { label: "Confirmed", cls: "tag-accent" },
  expired: { label: "Expired", cls: "tag-neutral" }
};

// ---------- Workflow actions (mutate a cloned dataset, return it) ----------
export function clone(ds) { return JSON.parse(JSON.stringify(ds)); }

export function confirmShortlist(ds, { programmeId, academicYearId, category, criteria, value }) {
  // A negative value would invert `.slice(0, value)` into "everyone but the last N", and NaN/0 has no
  // sane meaning here either — treat anything that isn't a real positive number as "select nothing".
  if (!Number.isFinite(value) || value <= 0) return { count: 0, list: null };
  const pool = ds.candidates.filter((c) => c.programmeId === programmeId && c.category === category && c.shortlistStatus === "yet-to-shortlist");
  pool.sort((a, b) => b.slatScore - a.slatScore);
  const selected = criteria === "count" ? pool.slice(0, value) : pool.filter((c) => c.slatScore >= value);
  if (!selected.length) return { count: 0, list: null };
  const date = nowISO().slice(0, 10);
  const seq = ds.shortlists.filter((l) => l.programmeId === programmeId && l.category === category).length + 1;
  const list = {
    id: `SL-${programmeId}-${category}-${seq}`, programmeId, academicYearId, category, criteria, value,
    candidateIds: selected.map((c) => c.id), createdOn: date,
    approvals: { director: null, siu: null }, status: "pending-director"
  };
  ds.shortlists.push(list);
  selected.forEach((c) => {
    c.shortlistStatus = "shortlisted";
    c.shortlistId = list.id;
    c.timeline.push({ label: `Shortlisted (${list.id})`, date });
  });
  return { count: selected.length, list };
}

export function approveShortlistList(ds, listId, level, decision, comments) {
  const list = ds.shortlists.find((l) => l.id === listId);
  if (!list) return;
  const date = nowISO().slice(0, 10);
  const candidates = list.candidateIds.map((id) => ds.candidates.find((c) => c.id === id)).filter(Boolean);
  if (level === "director") {
    if (list.status !== "pending-director") return;
    list.approvals.director = { status: decision, date, comments };
    if (decision === "approved") {
      list.status = "pending-siu";
      candidates.forEach((c) => { c.shortlistStatus = "first-level-approved"; c.timeline.push({ label: `Director Approved (${listId})`, date }); });
    } else {
      list.status = "rejected";
      candidates.forEach((c) => { c.shortlistStatus = "yet-to-shortlist"; c.shortlistId = null; c.timeline.push({ label: `Director Rejected (${listId}) — returned to pool`, date }); });
    }
  } else {
    if (list.status !== "pending-siu") return;
    list.approvals.siu = { status: decision, date, comments };
    if (decision === "approved") {
      list.status = "approved";
      candidates.forEach((c) => { c.shortlistStatus = "second-level-approved"; c.timeline.push({ label: `SIU Approved (${listId})`, date }); });
    } else {
      list.status = "rejected";
      candidates.forEach((c) => { c.shortlistStatus = "yet-to-shortlist"; c.shortlistId = null; c.timeline.push({ label: `SIU Rejected (${listId}) — returned to pool`, date }); });
    }
  }
}

export function computeReportingTime(startTime, minutesBefore) {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return null;
  const mins = ((start - Number(minutesBefore || 0)) % 1440 + 1440) % 1440;
  let h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function createSession(ds, form, groupInputs) {
  const dur = validateSessionDuration(form.startTime, form.endTime);
  if (!dur.valid) return { error: dur.message };
  const assessment = ds.assessments.find((a) => a.id === form.assessmentId);
  if (!assessment) return { error: "Select an assessment for this session." };
  if (!groupInputs || !groupInputs.length) return { error: "At least one group is required." };
  const bad = groupInputs.find((g) => !g.name.trim() || !g.capacity || Number(g.capacity) < 1);
  if (bad) return { error: "Every group needs a name and a capacity greater than 0." };
  const totalGroupCapacity = groupInputs.reduce((sum, g) => sum + Number(g.capacity), 0);
  if (totalGroupCapacity > form.capacity) {
    return { error: `Group capacities total ${totalGroupCapacity}, which exceeds the session capacity of ${form.capacity}.` };
  }
  const seq = String(ds.sessions.filter((s) => s.programmeId === form.programmeId).length + 1).padStart(2, "0");
  const groups = groupInputs.map((g, i) => {
    const gseq = String(i + 1).padStart(2, "0");
    const groupId = `S${seq}MG${gseq}`;
    return { id: groupId, name: g.name.trim(), capacity: Number(g.capacity), candidateIds: [], zoomRoom: { id: `ZR-${groupId}`, link: "", panelistIds: [] } };
  });
  const programme = ds.programmes.find((p) => p.id === form.programmeId);
  const session = {
    id: `SESS-${form.programmeId}-${seq}`, programmeId: form.programmeId, academicYearId: form.academicYearId,
    assessmentId: assessment.id, date: form.date,
    startTime: form.startTime, endTime: form.endTime, durationMinutes: dur.minutes, reportingTime: form.reportingTime,
    capacity: form.capacity, city: programme.city, centre: programme.centre, groups
  };
  ds.sessions.push(session);
  return { ok: true, session };
}

export function createInstitute(ds, form) {
  const id = form.code ? form.code.toUpperCase().replace(/\s+/g, "") : `INST${ds.institutes.length + 1}`;
  const institute = {
    id, name: form.name, code: id, adminName: form.adminName, adminEmail: form.adminEmail, adminMobile: form.adminMobile, status: "Active",
    credentials: { password: genPassword(), issuedOn: nowISO().slice(0, 10) }
  };
  ds.institutes.push(institute);
  ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: "Super Admin", action: `Created institute ${form.name} (${id}).` });
  return institute;
}
export function setInstituteStatus(ds, instituteId, status) {
  const inst = ds.institutes.find((i) => i.id === instituteId);
  if (inst) { inst.status = status; ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: "Super Admin", action: `Set ${inst.name} to ${status}.` }); }
}

export function createProgramme(ds, form) {
  const id = form.code ? form.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : `PROG${ds.programmes.length + 1}`;
  const programme = { id, instituteId: form.instituteId, name: form.name, code: form.code, description: form.description || "", status: "Active", city: "\u2014", centre: "\u2014" };
  ds.programmes.push(programme);
  const years = [{ id: `AY2026-${id}`, programmeId: id, label: "2026\u201327", status: "Active" }];
  ds.academicYears.push(...years);
  ds.activeAcademicYearByProgramme[id] = years[0].id;
  ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: form.actor || "Institute Admin", action: `Created programme ${form.name}.` });
  return programme;
}

// Per-programme fee structure — feeds the Annexure I fee table on the Provisional Admission Letter.
// Kept on the programme (not the academic year) since the reference letter frames it as "fees for
// the [Programme] programme", and this is a POC with one fee structure per programme, not per intake.
export function setProgrammeFeeConfig(ds, programmeId, form) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return { error: "Programme not found." };
  if (!form.batchLabel || !form.commencementDate || !form.installment2DueDate) {
    return { error: "Batch, Commencement Date, and Installment 2 Due Date are required." };
  }
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  p.feeConfig = {
    batchLabel: form.batchLabel.trim(), commencementDate: form.commencementDate,
    academicFeesInstallment1: num(form.academicFeesInstallment1), academicFeesInstallment2: num(form.academicFeesInstallment2),
    installment2DueDate: form.installment2DueDate, instituteDeposit: num(form.instituteDeposit),
    hostelDeposit: num(form.hostelDeposit), hostelThreeSharing: num(form.hostelThreeSharing),
    hostelFourSharing: num(form.hostelFourSharing), messFees: num(form.messFees)
  };
  return { ok: true };
}

export function createAcademicYear(ds, form) {
  const id = `AY-${Date.now()}`;
  const year = { id, programmeId: form.programmeId, label: form.label, status: form.status || "Upcoming" };
  ds.academicYears.push(year);
  ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: form.actor || "Institute Admin", action: `Created academic year ${form.label}.` });
  return year;
}
export function setActiveAcademicYear(ds, programmeId, academicYearId) {
  ds.academicYears.filter((y) => y.programmeId === programmeId).forEach((y) => { y.status = y.id === academicYearId ? "Active" : (y.status === "Active" ? "Closed" : y.status); });
  ds.activeAcademicYearByProgramme[programmeId] = academicYearId;
}

export function saveAssessment(ds, id, form) {
  if (!form.name.trim() || !form.shortName || !form.sequenceNo || !form.panelistsPerPanel || !form.totalMarks || !form.scoreEntryModelId) {
    return { error: "All mandatory fields must be filled." };
  }
  const scaling = form.scaling === "Yes" ? "Yes" : "No";
  if (scaling === "Yes" && !form.totalMarksScaling) {
    return { error: "Total Marks Scaling (Up / Down) is required when Scaling is Yes." };
  }
  const record = {
    id: id || `AS${ds.assessments.length + 1}-${Date.now()}`,
    programmeId: form.programmeId, academicYearId: form.academicYearId, name: form.name.trim(), shortName: form.shortName,
    sequenceNo: Number(form.sequenceNo), panelistsPerPanel: Number(form.panelistsPerPanel), totalMarks: Number(form.totalMarks),
    scoreType: "Online", scoreEntryModelId: form.scoreEntryModelId, scaling,
    totalMarksScaling: scaling === "Yes" ? Number(form.totalMarksScaling) : null
  };
  if (id) {
    const idx = ds.assessments.findIndex((a) => a.id === id);
    if (idx !== -1) ds.assessments[idx] = record;
  } else {
    ds.assessments.push(record);
  }
  return { ok: true, record };
}
export function deleteAssessment(ds, id) {
  ds.assessments = ds.assessments.filter((a) => a.id !== id);
}

export function saveAssessmentParam(ds, type, id, form) {
  if (!form.name.trim() || !form.sequenceNo || !form.max) return { error: "All mandatory fields must be filled." };
  if (!ds.assessmentParamsDraft[type]) ds.assessmentParamsDraft[type] = ds.assessmentParams[type].map((p) => ({ ...p }));
  const list = ds.assessmentParamsDraft[type];
  const record = {
    id: id || `${type}-${Date.now()}`, key: id ? (list.find((p) => p.id === id) || {}).key || `p${Date.now()}` : `p${Date.now()}`,
    name: form.name.trim(), seq: Number(form.sequenceNo), max: Number(form.max),
    allowZero: form.allowZero === "Yes" ? "Yes" : "No", allowDecimal: form.allowDecimal === "Yes" ? "Yes" : "No"
  };
  if (id) {
    const idx = list.findIndex((p) => p.id === id);
    if (idx !== -1) list[idx] = record;
  } else {
    list.push(record);
  }
  return { ok: true, record };
}
export function deleteAssessmentParam(ds, type, id) {
  if (!ds.assessmentParamsDraft[type]) ds.assessmentParamsDraft[type] = ds.assessmentParams[type].map((p) => ({ ...p }));
  ds.assessmentParamsDraft[type] = ds.assessmentParamsDraft[type].filter((p) => p.id !== id);
}

// ---------- Universal approval flow (Send for Approval -> mail -> OTP, Director then SIU) ----------
function randomToken() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
function randomOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

export function createApprovalRequest(ds, { subjectType, subjectId, programmeId, academicYearId, summary }) {
  const id = `AR-${ds.approvalRequests.length + 1}`;
  const req = {
    id, subjectType, subjectId, programmeId, academicYearId, summary,
    level: "director", status: "pending-director", directorMailId: null, siuMailId: null, createdOn: nowISO().slice(0, 10)
  };
  ds.approvalRequests.push(req);
  return req;
}

export function sendApprovalMail(ds, requestId, { to, subject, body }) {
  const req = ds.approvalRequests.find((r) => r.id === requestId);
  if (!req) return { error: "Approval request not found." };
  if (!to || !to.trim()) return { error: "Recipient email is required." };
  const mail = {
    id: `MAIL-${ds.sentMails.length + 1}`, approvalRequestId: requestId, level: req.level,
    to: to.trim(), subject, body, sentOn: nowISO().slice(0, 10), token: randomToken(), otp: null, status: "pending"
  };
  ds.sentMails.push(mail);
  if (req.level === "director") req.directorMailId = mail.id; else req.siuMailId = mail.id;
  return { ok: true, mail };
}

export function generateMailOtp(ds, mailId) {
  const mail = ds.sentMails.find((m) => m.id === mailId);
  if (!mail) return { error: "Mail not found." };
  if (mail.status !== "pending") return { error: "This approval is no longer pending." };
  mail.otp = randomOtp();
  return { ok: true, otp: mail.otp, to: mail.to };
}

function finalizeApprovalSubject(ds, req, level) {
  if (req.subjectType === "shortlist") approveShortlistList(ds, req.subjectId, level, "approved", "");
  else if (req.subjectType === "merit") approveMeritBatch(ds, req.subjectId, level, "approved", "");
  else if (req.subjectType === "assessment-params" && level === "siu") {
    const type = req.subjectId;
    if (ds.assessmentParamsDraft[type]) { ds.assessmentParams[type] = ds.assessmentParamsDraft[type]; ds.assessmentParamsDraft[type] = null; }
  }
}
function rejectApprovalSubject(ds, req) {
  if (req.subjectType === "shortlist") approveShortlistList(ds, req.subjectId, req.level, "rejected", "");
  else if (req.subjectType === "merit") approveMeritBatch(ds, req.subjectId, req.level, "rejected", "");
  else if (req.subjectType === "assessment-params") ds.assessmentParamsDraft[req.subjectId] = null;
}

export function verifyMailOtp(ds, mailId, entered) {
  const mail = ds.sentMails.find((m) => m.id === mailId);
  if (!mail) return { error: "Mail not found." };
  if (mail.status !== "pending") return { error: "This approval is no longer pending." };
  if (!mail.otp || String(entered || "").trim() !== mail.otp) return { error: "Incorrect OTP. Please try again." };
  mail.status = "approved";
  const req = ds.approvalRequests.find((r) => r.id === mail.approvalRequestId);
  if (!req) return { error: "Approval request not found." };
  if (req.level === "director") {
    req.level = "siu";
    req.status = "pending-siu";
    finalizeApprovalSubject(ds, req, "director");
  } else {
    req.status = "approved";
    finalizeApprovalSubject(ds, req, "siu");
  }
  return { ok: true, request: req };
}

export function rejectMail(ds, mailId) {
  const mail = ds.sentMails.find((m) => m.id === mailId);
  if (!mail) return { error: "Mail not found." };
  if (mail.status !== "pending") return { error: "This approval is no longer pending." };
  mail.status = "rejected";
  const req = ds.approvalRequests.find((r) => r.id === mail.approvalRequestId);
  if (!req) return { error: "Approval request not found." };
  req.status = "rejected";
  rejectApprovalSubject(ds, req);
  return { ok: true, request: req };
}

export function allocateCandidate(ds, candidateId, sessionId, groupId) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!c || !group) return { error: "Not found." };
  if (c.shortlistStatus !== "second-level-approved") return { error: "Candidate must be Second Level Approved before allocation." };
  if (c.allocation) return { error: "Candidate already has an active Session allocation." };
  if (group.candidateIds.length >= group.capacity) return { error: `Group ${group.name} is at capacity (${group.capacity}).` };
  group.candidateIds.push(c.id);
  c.allocation = { sessionId, groupId };
  c.piId = `${groupId}${String(group.candidateIds.length).padStart(2, "0")}`;
  c.timeline.push({ label: "Allocated to Session/Group", date: nowISO().slice(0, 10) });
  return { ok: true };
}

export function allocateCandidatesBatch(ds, candidateIds, sessionId, groupId) {
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!group) return { error: "Session/Group not found." };
  const available = group.capacity - group.candidateIds.length;
  if (candidateIds.length > available) {
    return { error: `Only ${available} slot(s) available in ${group.name}, but ${candidateIds.length} candidate(s) were selected.` };
  }
  let allocated = 0;
  const errors = [];
  candidateIds.forEach((cid) => {
    const res = allocateCandidate(ds, cid, sessionId, groupId);
    if (res && res.ok) allocated++;
    else if (res && res.error) errors.push(`${cid}: ${res.error}`);
  });
  return { ok: true, allocated, errors };
}

export function moveCandidatesAllocation(ds, candidateIds, toSessionId, toGroupId) {
  const toSession = ds.sessions.find((s) => s.id === toSessionId);
  const toGroup = toSession && toSession.groups.find((g) => g.id === toGroupId);
  if (!toGroup) return { error: "Target group not found." };
  const moving = candidateIds.filter((id) => {
    const c = ds.candidates.find((x) => x.id === id);
    return c && c.allocation && !(c.allocation.sessionId === toSessionId && c.allocation.groupId === toGroupId);
  });
  if (!moving.length) return { ok: true, moved: 0 };
  const available = toGroup.capacity - toGroup.candidateIds.length;
  if (moving.length > available) return { error: `Only ${available} slot(s) available in ${toGroup.name}.` };
  const date = nowISO().slice(0, 10);
  moving.forEach((id) => {
    const c = ds.candidates.find((x) => x.id === id);
    const fromSession = ds.sessions.find((s) => s.id === c.allocation.sessionId);
    const fromGroup = fromSession && fromSession.groups.find((g) => g.id === c.allocation.groupId);
    if (fromGroup) fromGroup.candidateIds = fromGroup.candidateIds.filter((x) => x !== id);
    toGroup.candidateIds.push(id);
    c.allocation = { sessionId: toSessionId, groupId: toGroupId };
    c.piId = `${toGroupId}${String(toGroup.candidateIds.length).padStart(2, "0")}`;
    // Any PI attendance/score already recorded belongs to the old group's panel — it means nothing for the
    // new one, so clear it rather than letting a stale score/lock silently ride along to a different panel.
    c.piAttendance = "pending";
    c.piScores = {};
    c.piScoreLocked = {};
    c.piNotes = {};
    c.piTotal = null;
    if (c.outcome === "ready-for-merit") { c.outcome = null; c.finalScore = null; }
    c.timeline.push({ label: `Moved to ${toGroup.name}`, date });
  });
  return { ok: true, moved: moving.length };
}

export function commitAutoAllocation(ds, sessionId, placements) {
  let allocated = 0;
  const errors = [];
  placements.forEach(({ groupId, candidateIds }) => {
    candidateIds.forEach((cid) => {
      const res = allocateCandidate(ds, cid, sessionId, groupId);
      if (res && res.ok) allocated++;
      else if (res && res.error) errors.push(`${cid}: ${res.error}`);
    });
  });
  return { ok: true, allocated, errors };
}

function timesOverlap(aStart, aEnd, bStart, bEnd) {
  const aS = parseTimeToMinutes(aStart), aE = parseTimeToMinutes(aEnd);
  const bS = parseTimeToMinutes(bStart), bE = parseTimeToMinutes(bEnd);
  if (aS == null || aE == null || bS == null || bE == null) return false;
  return aS < bE && bS < aE;
}

function findPanelistConflict(ds, panelistId, sessionId, excludeGroupId) {
  const session = ds.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  for (const s of ds.sessions) {
    for (const g of s.groups) {
      if (s.id === sessionId && g.id === excludeGroupId) continue;
      if (g.zoomRoom.panelistIds.includes(panelistId) && s.date === session.date && timesOverlap(session.startTime, session.endTime, s.startTime, s.endTime)) {
        return { session: s, group: g };
      }
    }
  }
  return null;
}

export function assignPanelist(ds, sessionId, groupId, panelistId) {
  const p = ds.panelists.find((x) => x.id === panelistId);
  if (!p || p.approval.director !== "approved" || p.approval.registrar !== "approved") return { error: "Panelist is not fully approved yet." };
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!group) return { error: "Group not found." };
  if (group.zoomRoom.panelistIds.includes(panelistId)) return { error: "Panelist is already assigned to this group." };
  const assessment = ds.assessments.find((a) => a.id === session.assessmentId);
  if (!assessment) return { error: "This session isn't linked to a valid assessment — fix it in Session Management before assigning panelists." };
  const maxPerPanel = assessment.panelistsPerPanel;
  if (group.zoomRoom.panelistIds.length >= maxPerPanel) {
    return { error: `${group.name} already has the maximum of ${maxPerPanel} panelist(s) configured for ${assessment ? assessment.name : "this assessment"}.` };
  }
  const conflict = findPanelistConflict(ds, panelistId, sessionId, groupId);
  if (conflict) {
    return { error: `${p.name} is already assigned to ${conflict.group.name} on ${conflict.session.date} (${conflict.session.startTime}–${conflict.session.endTime}), which overlaps with this session.` };
  }
  group.zoomRoom.panelistIds.push(panelistId);
  return { ok: true };
}

export function assignZoomRoomLink(ds, sessionId, groupId) {
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!group) return { error: "Group not found." };
  if (!group.zoomRoom.panelistIds.length) return { error: "Assign at least one panelist to this group first, via Panelist Allocation." };
  if (group.zoomRoom.link) return { error: "This group already has a Zoom Room assigned." };
  group.zoomRoom.link = `https://zoom.us/j/${randInt(100000000, 999999999)}`;
  return { ok: true, link: group.zoomRoom.link };
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[randInt(0, chars.length - 1)];
  return out;
}

export function savePanelist(ds, form, existingId) {
  const fields = {
    salutation: form.salutation, name: form.name, email: form.email, mobile: form.mobile, linkedin: form.linkedin,
    type: form.type, qualifications: form.qualifications, organization: form.organization, designation: form.designation,
    industryYears: Number(form.industryYears) || 0, academicYears: Number(form.academicYears) || 0,
    imageDataUrl: form.imageDataUrl || null, remarks: form.remarks || "N/A"
  };
  if (existingId) {
    const p = ds.panelists.find((x) => x.id === existingId);
    if (!p) return { error: "Panelist not found." };
    Object.assign(p, fields, { imageDataUrl: fields.imageDataUrl || p.imageDataUrl || null });
    p.programmeIds = Array.from(new Set([...(p.programmeIds || []), ...form.programmeIds]));
    if (p.credentials) p.credentials.loginId = p.email; // keep the portal login in sync with the current email
    return { ok: true, id: p.id };
  }
  const id = `P${ds.panelists.length + 1}`;
  ds.panelists.push({ id, ...fields, programmeIds: form.programmeIds, approval: { director: "pending", registrar: "pending" } });
  return { ok: true, id };
}

export function approvePanelist(ds, panelistId, level, decision) {
  const p = ds.panelists.find((x) => x.id === panelistId);
  if (!p) return;
  if (level === "director") p.approval.director = decision;
  else { if (p.approval.director !== "approved") return; p.approval.registrar = decision; }
  if (p.approval.director === "approved" && p.approval.registrar === "approved" && !p.credentials) {
    p.credentials = { loginId: p.email, password: genPassword(), issuedOn: nowISO().slice(0, 10) };
    ds.sentMails.push({
      id: `MAIL-${ds.sentMails.length + 1}`, approvalRequestId: null, level: "info",
      to: p.email, subject: `Panelist Portal Access — ${p.name}`,
      body: `Hi ${p.name},\n\nYou have been approved as a panelist. Here are your Panelist Portal login details:\n\nLogin ID: ${p.credentials.loginId}\nPassword: ${p.credentials.password}\n\nLog in from the "Panelist" tab on the login screen.`,
      sentOn: nowISO().slice(0, 10), token: null, otp: null, status: "delivered", summary: `Panelist credentials — ${p.name}`
    });
  }
}

export function markAttendance(ds, candidateId, kind, status) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (kind === "registration") { c.registrationAttendance = status; return; }
  c.piAttendance = status;
  if (status === "absent") {
    // An absent candidate was never actually scored by the panel — any score/lock recorded before
    // this (or left over from a prior Present marking) no longer means anything, so clear it rather
    // than leaving a numeric PI score sitting next to an "Absent" tag everywhere it's displayed.
    c.piScores = {};
    c.piScoreLocked = {};
    c.piNotes = {};
    c.piTotal = null;
    if (c.outcome === "ready-for-merit") { c.outcome = null; c.finalScore = null; }
  } else {
    recomputeOutcome(c);
  }
}

// Each assigned panelist submits their own score independently; piTotal is the
// average across however many panelists have a complete score in for this candidate.
export function submitPanelistScore(ds, candidateId, panelistId, scores) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c || !c.allocation) return;
  const session = ds.sessions.find((s) => s.id === c.allocation.sessionId);
  const group = session && session.groups.find((g) => g.id === c.allocation.groupId);
  if (!group) return;
  const assessment = session && ds.assessments.find((a) => a.id === session.assessmentId);
  const type = assessment ? assessment.shortName : "PI";
  const params = ds.assessmentParams[type] || [];
  if (!c.piScores) c.piScores = {};
  c.piScores[panelistId] = scores;
  const submittedTotals = group.zoomRoom.panelistIds
    .map((pid) => c.piScores[pid])
    .filter((s) => s && params.length && params.every((r) => s[r.key] != null))
    .map((s) => params.reduce((sum, r) => sum + (Number(s[r.key]) || 0), 0));
  // c.piTotal is what the rest of the app (Verification, Merit) treats as "the" PI score, so it must only
  // reflect every currently-assigned panelist's score — not whichever partial subset has submitted so far,
  // which would let a candidate look "ready for merit" off one panelist's number while others are still pending.
  const allPanelistsScored = group.zoomRoom.panelistIds.length > 0 && submittedTotals.length === group.zoomRoom.panelistIds.length;
  const hadTotal = c.piTotal != null;
  if (allPanelistsScored) {
    c.piTotal = Math.round((submittedTotals.reduce((a, b) => a + b, 0) / submittedTotals.length) * 10) / 10;
    if (!hadTotal) c.timeline.push({ label: "PI Scored", date: nowISO().slice(0, 10) });
  } else {
    c.piTotal = null;
  }
  recomputeOutcome(c);
}

export function setPanelistNote(ds, candidateId, panelistId, text) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (!c.piNotes) c.piNotes = {};
  c.piNotes[panelistId] = text;
}

// Called when a panelist moves past a candidate they scored, so the score can no longer be edited from the portal.
export function lockPanelistScore(ds, candidateId, panelistId) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (!c.piScoreLocked) c.piScoreLocked = {};
  c.piScoreLocked[panelistId] = true;
}

export function setVerification(ds, candidateId, field, value) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (field === "eligibilityTeam") c.verification.categoryVerification.eligibilityTeam = value;
  else if (field === "institute") c.verification.categoryVerification.institute = value;
  else if (field === "da") c.verification.daVerification = value;
  recomputeOutcome(c);
}

// APV (Academic Profile Verification) is a distinct 0-10 score the admin enters directly on the
// candidate's profile — separate from the panelist-scored PI total, combined with it for merit ranking.
export function setApvScore(ds, candidateId, value) {
  const c = ds.candidates.find((x) => x.id === candidateId);
  if (!c) return;
  const n = value === "" || value == null ? NaN : Number(value);
  c.apvScore = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  recomputeOutcome(c);
}

// OPEN candidates have no category document to verify at all (see buildVerification), so they count as
// verified by default. Everyone else needs their institute-reviewed category document marked Valid; DA
// candidates additionally need their DA eligibility certificate marked Valid.
function verificationComplete(c) {
  if (c.category === "OPEN") return true;
  if (c.verification.categoryVerification.institute !== "valid") return false;
  if (c.category === "DA" && c.verification.daVerification !== "valid") return false;
  return true;
}

// Re-derives merit-readiness from whichever of its inputs (category/DA document status, panelist-recorded
// attendance, completed PI score, APV score) currently holds. Called from every function that can change any
// one of those inputs — not just setVerification — so readiness never depends on something else happening to
// also run setVerification afterwards (e.g. an OPEN-category candidate has no category document step at all, so
// this must fire on its own once they're present, fully scored, and APV-scored).
function recomputeOutcome(c) {
  const cv = c.verification.categoryVerification;
  if (cv.eligibilityTeam === "invalid" || cv.institute === "invalid" || c.verification.daVerification === "invalid") {
    c.outcome = "ineligible";
  } else if (c.piAttendance === "present" && c.piTotal != null && c.apvScore != null && verificationComplete(c)) {
    c.outcome = "ready-for-merit";
    const pi = c.piTotal;
    const apv = c.apvScore;
    c.finalScore = { pi, apv, piApv: pi + apv, slat: c.slatScore, scaledSlat: null, final: pi + apv };
  } else if (!c.meritCategory) {
    // Not ineligible, not (yet) fully ready — e.g. verification still pending. Only reset readiness for
    // candidates merit processing hasn't already assigned a band to; a decided candidate keeps its finalScore.
    c.outcome = null;
    c.finalScore = null;
  }
}


export function runMeritProcessing(ds, { programmeId, academicYearId, category, criteria, value, waitingSize }) {
  // A negative/NaN value makes meritCount negative, which sends the ENTIRE pool to "rejected" (nothing is
  // ever < a negative meritCount) — permanently, since rejected candidates never re-enter a future pool
  // (the `!c.meritCategory` filter above excludes them). Refuse rather than silently reject everyone.
  if (!Number.isFinite(value) || value < 0) return { error: "Enter a valid, non-negative number." };
  if (!Number.isFinite(waitingSize) || waitingSize < 0) return { error: "Enter a valid, non-negative waiting list size." };
  const pool = ds.candidates.filter((c) => c.programmeId === programmeId && c.category === category && c.outcome === "ready-for-merit" && !c.meritCategory);
  pool.sort((a, b) => b.finalScore.final - a.finalScore.final);
  const meritCount = criteria === "count" ? Math.min(value, pool.length) : pool.filter((c) => c.finalScore.final >= value).length;
  // Waiting-list numbers must keep incrementing across separate processing runs for the same
  // programme+category, not restart at 001 each time — otherwise a later run collides with numbers
  // already handed out (and already possibly consumed by a Merit List Release) by an earlier run.
  const existingWaitingCount = ds.candidates.filter((c) => c.programmeId === programmeId && c.category === category && c.meritCategory === "waiting").length;
  const date = nowISO().slice(0, 10);
  const meritCandidates = [];
  pool.forEach((c, i) => {
    if (i < meritCount) { c.meritCategory = "merit"; c.rank = i + 1; meritCandidates.push(c); }
    else if (i < meritCount + waitingSize) { c.meritCategory = "waiting"; c.waitingListNumber = `WL-${category}-${String(existingWaitingCount + (i - meritCount) + 1).padStart(3, "0")}`; }
    else { c.meritCategory = "rejected"; }
    c.timeline.push({ label: `Merit Processing — ${c.meritCategory[0].toUpperCase()}${c.meritCategory.slice(1)}`, date });
  });
  let batch = null;
  if (meritCandidates.length) {
    const seq = ds.meritBatches.filter((b) => b.programmeId === programmeId && b.category === category).length + 1;
    batch = {
      id: `MB-${programmeId}-${category}-${seq}`, programmeId, academicYearId, category, criteria, value,
      candidateIds: meritCandidates.map((c) => c.id), createdOn: date,
      approvals: { director: null, siu: null }, status: "pending-director"
    };
    ds.meritBatches.push(batch);
    meritCandidates.forEach((c) => { c.meritBatchId = batch.id; });
  }
  return { merit: meritCount, waiting: Math.min(waitingSize, pool.length - meritCount), rejected: Math.max(0, pool.length - meritCount - waitingSize), batch };
}

export function approveMeritBatch(ds, batchId, level, decision, comments) {
  const batch = ds.meritBatches.find((b) => b.id === batchId);
  if (!batch) return;
  const date = nowISO().slice(0, 10);
  const candidates = batch.candidateIds.map((id) => ds.candidates.find((c) => c.id === id)).filter(Boolean);
  if (level === "director") {
    if (batch.status !== "pending-director") return;
    batch.approvals.director = { status: decision, date, comments };
    if (decision === "approved") {
      batch.status = "pending-siu";
      candidates.forEach((c) => { c.meritApproval.director = { status: "approved", date }; c.timeline.push({ label: `Merit List — Director Approved (${batchId})`, date }); });
    } else {
      batch.status = "rejected";
      candidates.forEach((c) => { c.meritCategory = null; c.rank = null; c.meritBatchId = null; c.meritApproval = { director: null, siu: null }; c.timeline.push({ label: `Merit List — Director Rejected (${batchId}) — returned to pool`, date }); });
    }
  } else {
    if (batch.status !== "pending-siu") return;
    batch.approvals.siu = { status: decision, date, comments };
    if (decision === "approved") {
      batch.status = "approved";
      candidates.forEach((c) => { c.meritApproval.siu = { status: "approved", date }; c.timeline.push({ label: `Merit List — SIU Approved (${batchId})`, date }); });
    } else {
      batch.status = "rejected";
      candidates.forEach((c) => { c.meritCategory = null; c.rank = null; c.meritBatchId = null; c.meritApproval = { director: null, siu: null }; c.timeline.push({ label: `Merit List — SIU Rejected (${batchId}) — returned to pool`, date }); });
    }
  }
}

// Releases an entire Director+SIU-approved merit batch in one shot — no partial headcount/cutoff selection.
// Only candidates from this batch not already covered by an earlier release go out (covers the case of a
// batch that was partially released under the old per-release-headcount flow).
export function releaseMeritBatch(ds, batchId, lastFeeDate, nextReleaseDate) {
  const batch = ds.meritBatches.find((b) => b.id === batchId);
  if (!batch) return { error: "Merit batch not found." };
  if (batch.status !== "approved") return { error: "This merit batch hasn't completed Director + SIU approval yet." };
  if (!lastFeeDate || !nextReleaseDate) return { error: "Enter both the Last Date to Pay Fees and the Next Merit List Release Date." };
  const candidates = batch.candidateIds.map((id) => ds.candidates.find((c) => c.id === id)).filter((c) => c && !c.meritListReleaseId);
  if (!candidates.length) return { error: "Every candidate in this batch has already been released." };
  const priorCount = ds.meritListReleases.filter((r) => r.programmeId === batch.programmeId && r.category === batch.category).length;
  const date = nowISO().slice(0, 10);
  const release = {
    id: `MLR-${batch.programmeId}-${batch.category}-${priorCount + 1}`, releaseNumber: priorCount + 1,
    programmeId: batch.programmeId, category: batch.category, method: "Approved Merit List", source: "Direct",
    count: candidates.length, lastFeeDate, nextReleaseDate, createdOn: date, meritBatchId: batch.id
  };
  candidates.forEach((c) => { c.meritListReleaseId = release.id; c.timeline.push({ label: `Merit List Released (${release.id})`, date }); });
  ds.meritListReleases.push(release);
  return { ok: true, release };
}

// Promotes the next `count` candidates off a category's Waiting List into a new release, once that
// category's approved merit list has already gone out at least once (see mrWlEnabled in buildMeritReleases) —
// waiting-list promotion is meant to backfill seats after the initial release, not stand in for it.
export function releaseFromWaitingList(ds, form) {
  if (!Number.isFinite(form.count) || form.count <= 0) return { error: "Enter a valid number of candidates to release." };
  if (!form.lastFeeDate || !form.nextReleaseDate) return { error: "Enter both the Last Date to Pay Fees and the Next Merit List Release Date." };
  const picked = ds.candidates.filter((c) => c.programmeId === form.programmeId && c.category === form.category && c.meritCategory === "waiting" && !c.meritListReleaseId)
    .sort((a, b) => (a.waitingListNumber > b.waitingListNumber ? 1 : -1)).slice(0, form.count);
  if (!picked.length) return { error: "No Waiting List candidates available for this category." };
  const priorCount = ds.meritListReleases.filter((r) => r.programmeId === form.programmeId && r.category === form.category).length;
  const date = nowISO().slice(0, 10);
  const release = {
    id: `MLR-${form.programmeId}-${form.category}-${priorCount + 1}`, releaseNumber: priorCount + 1,
    programmeId: form.programmeId, category: form.category, method: "Number of Candidates", source: "Waiting List",
    count: picked.length, lastFeeDate: form.lastFeeDate, nextReleaseDate: form.nextReleaseDate, createdOn: date
  };
  picked.forEach((c) => {
    c.meritCategory = "merit";
    c.meritApproval = { director: { status: "approved", date }, siu: { status: "approved", date } };
    c.meritListReleaseId = release.id;
    c.timeline.push({ label: `Merit List Released (${release.id})`, date });
  });
  ds.meritListReleases.push(release);
  return { ok: true, release };
}
