// Admission Processing System — mock data model + workflow logic (client-side only, no backend).
// Terminology: "Room" in the source docs = Zoom Room (virtual). Exam terminology shown as "SLAT" (docs call it SET).
import { evaluateFilter } from "./import-engine.js";

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

// Default per-programme document requirements — reproduces the app's original hardcoded behavior
// (a category document for every non-OPEN candidate, plus a DA certificate for DA candidates) as
// the starting config for every new programme. Institute admins edit this per programme from there.
export const DEFAULT_REQUIRED_DOCUMENTS = [
  { id: "RD-default-category", key: "category", seq: 1, label: "Category / Medical Certificate", appliesToCategories: ["SC", "ST", "DA", "KM"] },
  { id: "RD-default-da", key: "da", seq: 2, label: "DA Eligibility Certificate", appliesToCategories: ["DA"] }
];

// Default per-programme approval chain — reproduces the app's original hardcoded Director-then-SIU
// two-level chain as the starting config for every new programme. No stable "key" field like
// requiredDocuments rows: nothing references a level by persistent key, every reference is positional
// (levelIndex into the chain sorted by seq).
export const DEFAULT_APPROVAL_CHAIN = [
  { id: "AC-default-director", seq: 1, name: "Director", approverEmail: "" },
  { id: "AC-default-siu", seq: 2, name: "SIU", approverEmail: "" }
];
export function effectiveApprovalChain(programme) {
  return ((programme && programme.approvalChain) || DEFAULT_APPROVAL_CHAIN).slice().sort((a, b) => a.seq - b.seq);
}

// Panelist approval is dataset-global, not per-programme: a panelist can be linked to several
// programmes at once (see savePanelist), but has a single approval array on their own record — a
// per-programme chain would leave that ambiguous whenever a panelist's linked programmes disagree on
// chain length. No approverEmail: panelist approval is a direct toggle, no mail/OTP step exists for it.
export const DEFAULT_PANELIST_APPROVAL_CHAIN = [
  { id: "PAC-default-director", seq: 1, name: "Director" },
  { id: "PAC-default-registrar", seq: 2, name: "Registrar" }
];
export function effectivePanelistApprovalChain(ds) {
  return ((ds && ds.panelistApprovalChain) || DEFAULT_PANELIST_APPROVAL_CHAIN).slice().sort((a, b) => a.seq - b.seq);
}

// Institute-staff RBAC: each role names which nav pages (see index.html's instituteNavGroups(),
// the single source of truth both the sidebar and the Roles & Permissions checkbox list read from)
// its members may see. "roles-mgmt"/"user-memberships" are never included here — those two pages
// are reserved for the institute's own admin login (auth.role === "institute"), not any
// configurable staff role, per explicit product requirement. These are starting defaults seeded
// per-institute (see seedDefaultRoles) and freely editable afterward by that institute's admin.
// "workflow-builder" and the whole Settings section (Academic Years, Assessment Config, Admission
// Cycles, Fee Structure, Required Documents, Roles & Permissions, User Memberships, Email/Print
// Templates) are Institute-Admin-only — never granted to any staff role, per explicit product
// decision, not just an omission (see the "Settings" nav group filtered out in navSpec()).
export const DEFAULT_INSTITUTE_ROLES = [
  { name: "Director", pages: ["programmes", "candidate-list", "shortlist", "shortlist-approvals", "sessions", "candidate-allocation", "zoom-rooms", "panelists", "panelist-allocation", "barcode-labels", "pi-attendance", "pi-scoring", "verification", "final-scores", "merit-processing", "merit-approval", "merit-releases", "waiting-list", "provisional-letters", "seat-allocation", "formula-builder", "offer-management", "workflow-instances", "document-collection", "reports-dashboard", "reports-candidates", "reports-sessions", "sent-mail", "pending-approvals", "reopen-corrections", "condition-builder"] },
  { name: "Registrar", pages: ["programmes", "candidate-list", "shortlist", "shortlist-approvals", "verification", "final-scores", "merit-processing", "merit-approval", "merit-releases", "waiting-list", "provisional-letters", "seat-allocation", "offer-management", "workflow-instances", "document-collection", "reports-dashboard", "reports-candidates", "reports-sessions", "sent-mail", "pending-approvals", "reopen-corrections"] },
  { name: "Admission Officer", pages: ["candidate-list", "shortlist", "shortlist-approvals", "sessions", "candidate-allocation", "zoom-rooms", "panelists", "panelist-allocation", "barcode-labels", "pi-attendance", "pi-scoring", "verification", "document-collection"] },
  // Coordinator's whole job is the join-meeting-and-mark-attendance screen — nothing else.
  { name: "Coordinator", pages: ["pi-attendance"] },
  { name: "Panelist", pages: ["candidate-list", "pi-attendance", "pi-scoring"] },
  // Observer needs to see and drop into any scheduled Zoom Room for quality monitoring.
  { name: "Observer", pages: ["reports-dashboard", "reports-candidates", "reports-sessions", "candidate-list", "zoom-rooms", "final-scores", "merit-releases", "waiting-list"] },
  { name: "Document Verification Team", pages: ["candidate-list", "verification", "document-collection"] },
  { name: "SIU", pages: ["reports-dashboard", "reports-candidates", "reports-sessions", "candidate-list", "verification", "final-scores", "merit-releases", "waiting-list"] }
];
export function seedDefaultRoles(ds, instituteId) {
  DEFAULT_INSTITUTE_ROLES.forEach((r, i) => {
    ds.roles.push({ id: `ROLE-${instituteId}-${i + 1}`, instituteId, name: r.name, pages: [...r.pages], isDefault: true });
  });
}
export function saveRole(ds, instituteId, id, form) {
  if (!form.name || !form.name.trim()) return { error: "Role name is required." };
  const pages = (form.pages || []).filter((p) => p !== "roles-mgmt" && p !== "user-memberships");
  if (id) {
    const idx = ds.roles.findIndex((r) => r.id === id && r.instituteId === instituteId);
    if (idx === -1) return { error: "Role not found." };
    ds.roles[idx] = { ...ds.roles[idx], name: form.name.trim(), pages };
    return { ok: true, record: ds.roles[idx] };
  }
  const record = { id: `ROLE-${instituteId}-${Date.now()}`, instituteId, name: form.name.trim(), pages, isDefault: false };
  ds.roles.push(record);
  return { ok: true, record };
}
export function deleteRole(ds, instituteId, id) {
  if (ds.staff.some((s) => s.instituteId === instituteId && s.roleId === id)) {
    return { error: "This role is still assigned to a staff member — reassign them first." };
  }
  ds.roles = ds.roles.filter((r) => !(r.id === id && r.instituteId === instituteId));
  return { ok: true };
}

// Institute staff directory (User Memberships) — a real, loggable identity per staff member,
// distinct from the institute's own single admin login. Credentials are issued immediately on
// creation (mirrors how a panelist gets credentials the moment their approval chain completes) so
// the new member can log in right away; see index.html's onLogin for how these are checked.
export function saveStaffMember(ds, instituteId, id, form) {
  if (!form.name || !form.name.trim()) return { error: "Name is required." };
  if (!form.email || !form.email.trim()) return { error: "Email is required." };
  if (!form.roleId) return { error: "Select a role." };
  const email = form.email.trim().toLowerCase();
  if (ds.staff.some((s) => s.instituteId === instituteId && s.email === email && s.id !== id)) {
    return { error: "A staff member with this email already exists." };
  }
  const fields = { name: form.name.trim(), email, mobile: form.mobile || "", roleId: form.roleId, status: form.status || "Active" };
  if (id) {
    const idx = ds.staff.findIndex((s) => s.id === id && s.instituteId === instituteId);
    if (idx === -1) return { error: "Staff member not found." };
    ds.staff[idx] = { ...ds.staff[idx], ...fields };
    if (ds.staff[idx].credentials) ds.staff[idx].credentials.loginId = email;
    return { ok: true, id, credentials: null };
  }
  const newId = `STAFF-${instituteId}-${Date.now()}`;
  const credentials = { loginId: email, password: genPassword(), issuedOn: nowISO().slice(0, 10) };
  ds.staff.push({ id: newId, instituteId, ...fields, credentials });
  ds.sentMails.push({
    id: `MAIL-${ds.sentMails.length + 1}`, approvalRequestId: null, levelIndex: null, levelLabel: "Info",
    to: email, subject: `Institute Portal Access — ${fields.name}`,
    body: `Hi ${fields.name},\n\nYou have been added as a staff member. Here are your login details:\n\nLogin ID: ${credentials.loginId}\nPassword: ${credentials.password}\n\nLog in from the "Institute" tab on the login screen.`,
    sentOn: nowISO().slice(0, 10), token: null, otp: null, status: "delivered", summary: `Staff credentials — ${fields.name}`
  });
  return { ok: true, id: newId, credentials };
}
export function deleteStaffMember(ds, instituteId, id) {
  ds.staff = ds.staff.filter((s) => !(s.id === id && s.instituteId === instituteId));
}

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
// Same as fmtDate but with the decision time, for approval displays — pass an ISO timestamp
// (e.g. approvals[i].decidedAt); returns "" for a falsy input rather than "Invalid Date".
export function fmtDateTime(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function nowISO() { return new Date().toISOString(); }

// ---------- Candidate CSV import ----------
// Generic RFC4180-ish CSV parser, reused by js/import-engine.js's CSV data-source connector — this
// module has no other opinion about import (see js/import-engine.js for the configurable pipeline).
export function parseCsvText(text) {
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

// This prototype has no candidate-facing application portal and CSV import carries no file attachments, so
// there's nowhere a real certificate could actually come from before an admin reviews it. To keep the real
// workflow — documents already exist, the admin only approves/rejects them — a placeholder document is
// attached automatically at import time, standing in for whatever was submitted during the real application.
// It's a real minimal PDF (hand-built, no library) rather than a text stub, so "View Document" opens an
// actual document in the browser's PDF viewer instead of a bare disclaimer string.
function placeholderDocument(candidateId, label) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);
  const lines = [esc(label), `Candidate: ${esc(candidateId)}`, "Placeholder document for prototype purposes.", "No real file was submitted for this candidate."];
  const content = lines.map((line, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 50 ${700 - i * 22} Td (${line}) Tj ET`).join("\n");
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 612 792]/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return { fileName: `${candidateId}_${label.replace(/\s+/g, "_")}.pdf`, dataUrl: `data:application/pdf;base64,${btoa(pdf)}` };
}

// Builds the verification.documents map for one candidate: one entry per programme.requiredDocuments
// row applicable to the candidate's category, each seeded with a placeholder file (see placeholderDocument).
// A candidate with no applicable documents (e.g. OPEN category under the default config) gets {}.
export function buildCandidateDocuments(candidateId, category, requiredDocuments) {
  const documents = {};
  (requiredDocuments || []).forEach((doc) => {
    if (doc.appliesToCategories.includes(category)) {
      documents[doc.key] = { ...placeholderDocument(candidateId, doc.label), status: null };
    }
  });
  return documents;
}

// Fills in any top-level fields missing from a JSON file saved by an older version of this app
// (e.g. a file saved before "shortlists" existed), so opening it never crashes on a missing collection.
export function normalizeDataset(d) {
  d = d || {};
  // Migrate the old fixed-two-level {director,siu} approvals shape (itself already migrated from an
  // even older "Registrar" naming, pre-SIU) to the new chain-length-agnostic array shape: approvals[i]
  // is level i's {status,date,comments} or null. currentLevelIndex is derived from the old status string
  // (pending-siu meant level 0 was done, level 1 pending); status collapses to pending/approved/rejected.
  const migrateApprovals = (rec) => {
    if (Array.isArray(rec.approvals)) return rec; // already migrated
    const approvals = { director: null, siu: null, ...(rec.approvals || {}) };
    if (approvals.registrar && !approvals.siu) approvals.siu = approvals.registrar;
    const oldStatus = rec.status === "pending-registrar" ? "pending-siu" : rec.status;
    const currentLevelIndex = oldStatus === "pending-siu" ? 1 : 0;
    const status = oldStatus === "approved" ? "approved" : oldStatus === "rejected" ? "rejected" : "pending";
    return { ...rec, approvals: [approvals.director, approvals.siu], currentLevelIndex, status };
  };
  // Migrate the old fixed {category, criteria, value} shortlist shape (one hardcoded category dimension,
  // ranked against the programme's single global shortlistRankField) to the generic {filter, rankField,
  // mode, value} shape confirmShortlist now uses — category becomes an ordinary "category = X" filter
  // condition instead of a required top-level field, using the same DNF shape import's filter engine
  // reads. rankField is backfilled from the programme's old shortlistRankField default since that's what
  // every legacy shortlist was actually ranked against, even though it wasn't stored on the record itself.
  const migrateShortlistCriteria = (rec) => {
    if (rec.filter !== undefined) return rec; // already migrated
    const programme = (d.programmes || []).find((p) => p.id === rec.programmeId);
    const rankField = (programme && programme.shortlistRankField) || "slatScore";
    const filter = { groups: [{ id: "FG-legacy", conditions: [{ id: "FC-legacy", field: "category", op: "=", value: rec.category }] }] };
    const { category, criteria, ...rest } = rec;
    return { ...rest, filter, rankField, mode: criteria === "count" ? "count" : "cutoff" };
  };
  const shortlists = (d.shortlists || []).map(migrateApprovals).map(migrateShortlistCriteria);
  const meritBatches = (d.meritBatches || []).map(migrateApprovals);
  const candidates = (d.candidates || []).map((c) => {
    let cand = c;
    // meritApproval: old {director,siu|registrar} object -> chain-length-agnostic array (write-only
    // field, nothing reads it, so this is just a shape match with meritBatches.approvals above).
    if (cand.meritApproval && !Array.isArray(cand.meritApproval)) {
      const ma = cand.meritApproval;
      cand = { ...cand, meritApproval: [ma.director || null, ma.siu || ma.registrar || null] };
    }
    // shortlistStatus: the two approval-level-specific labels collapse into one "pending-approval"
    // bucket (see recomputeOutcome-adjacent reasoning: nothing actually branches on "first" vs "second"
    // level specifically — only not-started / mid-chain / fully-done). The dead "rejected-list" value
    // (never actually written by any function) needs no migration since nothing ever held it.
    if (cand.shortlistStatus === "shortlisted" || cand.shortlistStatus === "first-level-approved") {
      cand = { ...cand, shortlistStatus: "pending-approval" };
    } else if (cand.shortlistStatus === "second-level-approved") {
      cand = { ...cand, shortlistStatus: "approved" };
    }
    // Migrate the old fixed "p1"/"p2" score-slot shape to the per-panelist-id map: the total score
    // stands, but the old slots can't be mapped to a real panelist id so the breakdown is dropped.
    if (cand.piScores && ("p1" in cand.piScores || "p2" in cand.piScores)) {
      cand = { ...cand, piScores: {} };
    }
    if (!cand.piNotes) cand = { ...cand, piNotes: {} };
    if (!cand.piScoreLocked) cand = { ...cand, piScoreLocked: {} };
    if (cand.apvScore === undefined) cand = { ...cand, apvScore: null };
    if (cand.importLineage === undefined) cand = { ...cand, importLineage: null };
    // Old files store verification as { categoryVerification: {eligibilityTeam, institute}, categoryDocument,
    // daDocument, daVerification } — collapse onto the new { documents: { <key>: {fileName,dataUrl,status} } }
    // shape, mapping the same two document types onto DEFAULT_REQUIRED_DOCUMENTS' keys ("category"/"da"), which
    // is what every migrated programme defaults to below. `eligibilityTeam` is dropped: it was never actually
    // settable from any UI (only "institute"/"da" statuses ever got written), so there's nothing to migrate.
    // Already-migrated files (verification.documents present) pass through untouched.
    if (cand.verification && !cand.verification.documents) {
      const documents = {};
      if (cand.category !== "OPEN") {
        const doc = cand.verification.categoryDocument || {};
        documents.category = { fileName: doc.fileName || null, dataUrl: doc.dataUrl || null, status: (cand.verification.categoryVerification || {}).institute || null };
        if (!documents.category.fileName) documents.category = { ...placeholderDocument(cand.id, "Category Certificate"), status: documents.category.status };
      }
      if (cand.category === "DA") {
        const doc = cand.verification.daDocument || {};
        documents.da = { fileName: doc.fileName || null, dataUrl: doc.dataUrl || null, status: cand.verification.daVerification || null };
        if (!documents.da.fileName) documents.da = { ...placeholderDocument(cand.id, "DA Certificate"), status: documents.da.status };
      }
      cand = { ...cand, verification: { documents } };
    } else if (!cand.verification) {
      cand = { ...cand, verification: { documents: {} } };
    }
    return cand;
  });
  const panelists = (d.panelists || []).map((p) => {
    let panelist = p.credentials !== undefined ? p : { ...p, credentials: null };
    // approval: old {director,registrar} object -> array indexed by levelIndex, matching
    // effectivePanelistApprovalChain. Bare strings (no {status,date}) since nothing displays a date here.
    if (panelist.approval && !Array.isArray(panelist.approval)) {
      panelist = { ...panelist, approval: [panelist.approval.director || "pending", panelist.approval.registrar || "pending"] };
    }
    return panelist;
  });
  const institutes = (d.institutes || []).map((i) => (i.credentials !== undefined ? i : { ...i, credentials: null }));
  // Backfill the default role catalogue for any institute saved before this feature existed
  // (createInstitute seeds it for every new one going forward — see seedDefaultRoles).
  const roles = (d.roles || []).slice();
  institutes.forEach((inst) => {
    if (!roles.some((r) => r.instituteId === inst.id)) {
      DEFAULT_INSTITUTE_ROLES.forEach((r, i) => roles.push({ id: `ROLE-${inst.id}-${i + 1}`, instituteId: inst.id, name: r.name, pages: [...r.pages], isDefault: true }));
    }
  });
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
  // Programme-level config defaults — reproduce today's behavior exactly for any programme saved before
  // these fields existed (two-document category/DA verification, no import-column overrides, SLAT-ranked
  // shortlisting).
  // Each programme gets its OWN copy of the defaults, not a shared reference to the DEFAULT_* constant:
  // saveRequiredDocument/saveApprovalLevel mutate p.requiredDocuments/p.approvalChain in place (index
  // assignment, push), so two programmes sharing one array by reference would silently corrupt each
  // other the moment either one is edited (safe in the running app, which always clones the whole
  // dataset before any mutation — but not safe for anything that touches the engine directly).
  const programmes = (d.programmes || []).map((p) => ({
    ...p,
    requiredDocuments: p.requiredDocuments || DEFAULT_REQUIRED_DOCUMENTS.map((doc) => ({ ...doc })),
    shortlistRankField: p.shortlistRankField || "slatScore",
    approvalChain: p.approvalChain || DEFAULT_APPROVAL_CHAIN.map((lvl) => ({ ...lvl }))
  }));
  // approvalRequests: old {level:"director"|"siu", status, directorMailId, siuMailId} -> chain-length-
  // agnostic {levelIndex, status, mailIds}. sentMails: old {level:"director"|"siu"|"info"} -> adds
  // levelIndex + a snapshotted levelLabel (the popup approval tab has no dataset access to resolve a
  // chain lookup itself, and a historical mail shouldn't retroactively relabel if a level is renamed).
  const approvalRequests = (d.approvalRequests || []).map((r) => {
    if (r.levelIndex !== undefined && r.chainLength !== undefined) return r;
    // Backfill chainLength for requests saved before it existed — best-effort against the
    // programme's chain as it stands right now, same live lookup verifyMailOtp used to do inline.
    const chainLength = effectiveApprovalChain(programmes.find((p) => p.id === r.programmeId)).length;
    if (r.levelIndex !== undefined) return { ...r, chainLength };
    const levelIndex = r.level === "siu" ? 1 : 0;
    const status = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
    return { ...r, levelIndex, status, mailIds: [r.directorMailId || null, r.siuMailId || null], chainLength };
  });
  const sentMails = (d.sentMails || []).map((m) => {
    if (m.levelLabel !== undefined) return m;
    if (m.level === "info" || !m.approvalRequestId) return { ...m, levelIndex: null, levelLabel: "Info" };
    const levelIndex = m.level === "siu" ? 1 : 0;
    return { ...m, levelIndex, levelLabel: levelIndex === 1 ? "SIU" : "Director" };
  });
  // assessmentParams/assessmentParamsDraft used to be global ({PI,GE,WAT,WE}); now they're per-programme
  // ({[programmeId]: {PI,GE,WAT,WE}}). Both shapes are plain objects, so detect the old one by checking for
  // an array directly under a known assessment-type key, and if found, copy it onto every programme (that's
  // what "global" meant in practice — every programme shared the same rubric).
  const oldFlatParams = d.assessmentParams && ["PI", "GE", "WAT", "WE"].some((t) => Array.isArray(d.assessmentParams[t]));
  const assessmentParams = {}, assessmentParamsDraft = {};
  programmes.forEach((p) => {
    assessmentParams[p.id] = oldFlatParams ? d.assessmentParams : ((d.assessmentParams && d.assessmentParams[p.id]) || { PI: RUBRIC, GE: [], WAT: [], WE: [] });
    assessmentParamsDraft[p.id] = oldFlatParams ? { PI: null, GE: null, WAT: null, WE: null } : ((d.assessmentParamsDraft && d.assessmentParamsDraft[p.id]) || { PI: null, GE: null, WAT: null, WE: null });
  });
  return {
    institutes,
    programmes,
    academicYears: d.academicYears || [],
    activeAcademicYearByProgramme: d.activeAcademicYearByProgramme || {},
    activeProgrammeId: d.activeProgrammeId || (programmes[0] ? programmes[0].id : null),
    categories: d.categories || CATEGORIES,
    assessmentTypes: d.assessmentTypes || ASSESSMENT_TYPES,
    assessmentParams,
    assessmentParamsDraft,
    scoreEntryModels: d.scoreEntryModels || SCORE_ENTRY_MODELS,
    assessments: d.assessments || [],
    sessions,
    panelists,
    candidates,
    shortlists,
    meritBatches,
    meritListReleases: d.meritListReleases || [],
    approvalRequests,
    sentMails,
    panelistApprovalChain: d.panelistApprovalChain || DEFAULT_PANELIST_APPROVAL_CHAIN,
    auditLog: d.auditLog || [],
    importConfigs: d.importConfigs || [],
    importJobs: d.importJobs || [],
    roles,
    staff: d.staff || [],
    // Cycles are a hard prerequisite going forward (see cycleScopeKey/createAdmissionCycle) — a file
    // saved before this feature existed has none, and none are invented for it retroactively; every
    // programme+year in it will show the "create a cycle first" gate until one is made fresh.
    admissionCycles: d.admissionCycles || [],
    activeCycleByProgYear: d.activeCycleByProgYear || {}
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
    // Empty: no programmes exist yet in a brand-new dataset. createProgramme() seeds each new programme's
    // entry here, the same way it already seeds activeAcademicYearByProgramme.
    assessmentParams: {},
    assessmentParamsDraft: {},
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
    panelistApprovalChain: DEFAULT_PANELIST_APPROVAL_CHAIN,
    auditLog: [],
    importConfigs: [],
    importJobs: [],
    roles: [],
    staff: [],
    admissionCycles: [],
    activeCycleByProgYear: {}
  };
}

// ---------- Status metadata (label + tag class + icon) ----------
export const STATUS_META = {
  "yet-to-shortlist": { label: "Yet to be Shortlisted", cls: "tag-neutral" },
  "pending-approval": { label: "Pending Approval", cls: "tag-outline" },
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

// Infers a candidate field's type the same way js/import-engine.js's evaluateCondition needs it
// (which operators are legal for the field) — purely from the JS value's own typeof, since by the
// time a field lands on a committed candidate it's already gone through the import mapping's
// transform step (parseNumber etc.), unlike raw CSV text which is why the import engine itself
// needs a declared schema instead of inference.
function candidateFieldType(ds, programmeId, academicYearId, field) {
  const sample = ds.candidates.find((c) => c.programmeId === programmeId && c.academicYearId === academicYearId && c[field] != null);
  return sample && typeof sample[field] === "number" ? "number" : "string";
}

// Shortlisting is a generic filter + optional rank/limit over whatever fields an institute's import
// mapped onto the candidate — category is just one filterable field among others now, not a required
// dimension (see js/import-engine.js's DNF filter engine, reused here via evaluateFilter so the same
// AND/OR condition model works identically in Import and Shortlisting).
// mode: "all" (everyone matching filter) | "count" (top N by rankField) | "cutoff" (rankField >= value).
export function confirmShortlist(ds, { programmeId, academicYearId, cycleId, filter, rankField, mode, value }) {
  // count/cutoff need a rank field and a real positive value to mean anything; a negative value would
  // invert `.slice(0, value)` into "everyone but the last N", and NaN/0 has no sane meaning either —
  // treat anything malformed as "select nothing" rather than guessing.
  if (mode !== "all" && (!rankField || !Number.isFinite(value) || value <= 0)) return { count: 0, list: null };
  const programme = ds.programmes.find((p) => p.id === programmeId);
  const typeOf = (field) => candidateFieldType(ds, programmeId, academicYearId, field);
  let pool = ds.candidates.filter((c) => c.programmeId === programmeId && c.academicYearId === academicYearId && c.cycleId === cycleId && c.shortlistStatus === "yet-to-shortlist" && evaluateFilter(c, filter, typeOf));
  if (rankField) {
    const rank = (c) => (c[rankField] == null ? -Infinity : c[rankField]);
    pool.sort((a, b) => rank(b) - rank(a));
    if (mode === "cutoff") pool = pool.filter((c) => rank(c) >= value);
  }
  const selected = mode === "count" ? pool.slice(0, value) : pool;
  if (!selected.length) return { count: 0, list: null };
  const date = nowISO().slice(0, 10);
  const seq = ds.shortlists.filter((l) => l.programmeId === programmeId).length + 1;
  // Approval level count is frozen at creation time from the programme's chain as it stands right now —
  // an admin editing the chain later never puts an in-flight shortlist out of bounds; new shortlists
  // pick up the new chain, in-flight ones finish under the one they started with.
  const chain = effectiveApprovalChain(programme);
  const list = {
    id: `SL-${programmeId}-${seq}`, programmeId, academicYearId, cycleId, filter, rankField: rankField || null, mode, value: mode === "all" ? null : value,
    candidateIds: selected.map((c) => c.id), createdOn: date,
    approvals: new Array(chain.length).fill(null), currentLevelIndex: 0, status: "pending"
  };
  ds.shortlists.push(list);
  selected.forEach((c) => {
    c.shortlistStatus = "pending-approval";
    c.shortlistId = list.id;
    c.timeline.push({ label: `Shortlisted (${list.id})`, date });
  });
  return { count: selected.length, list };
}

export function approveShortlistList(ds, listId, levelIndex, decision, comments) {
  const list = ds.shortlists.find((l) => l.id === listId);
  if (!list) return;
  if (list.status !== "pending" || list.currentLevelIndex !== levelIndex) return;
  const decidedAt = nowISO();
  const date = decidedAt.slice(0, 10);
  const candidates = list.candidateIds
    .map((id) => ds.candidates.find((c) => c.id === id && c.programmeId === list.programmeId && c.academicYearId === list.academicYearId && c.cycleId === list.cycleId))
    .filter(Boolean);
  list.approvals[levelIndex] = { status: decision, date, decidedAt, comments };
  if (decision === "approved") {
    const isLast = levelIndex === list.approvals.length - 1;
    if (isLast) {
      list.status = "approved";
      candidates.forEach((c) => { c.shortlistStatus = "approved"; c.timeline.push({ label: `Shortlist Approved (${listId})`, date }); });
    } else {
      list.currentLevelIndex = levelIndex + 1;
      candidates.forEach((c) => c.timeline.push({ label: `Level ${levelIndex + 1} Approved (${listId})`, date }));
    }
  } else {
    list.status = "rejected";
    candidates.forEach((c) => { c.shortlistStatus = "yet-to-shortlist"; c.shortlistId = null; c.timeline.push({ label: `Level ${levelIndex + 1} Rejected (${listId}) — returned to pool`, date }); });
  }
}

// Explicit Director/SIU action once a shortlist has been rejected at any level — puts every candidate
// on it back into the "yet-to-shortlist" pool (the same bucket confirmShortlist draws from), i.e. Draft.
export function revertShortlist(ds, listId) {
  const list = ds.shortlists.find((l) => l.id === listId);
  if (!list) return { error: "Shortlist not found." };
  if (list.status !== "rejected") return { error: "Only a rejected shortlist can be reverted." };
  const date = nowISO().slice(0, 10);
  const candidates = list.candidateIds
    .map((id) => ds.candidates.find((c) => c.id === id && c.programmeId === list.programmeId && c.academicYearId === list.academicYearId && c.cycleId === list.cycleId))
    .filter(Boolean);
  candidates.forEach((c) => { c.shortlistStatus = "yet-to-shortlist"; c.shortlistId = null; c.timeline.push({ label: `Shortlist Reverted (${listId}) — status set to Draft`, date }); });
  list.reverted = true;
  return { ok: true, count: candidates.length };
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
    return { error: `Group capacities total ${totalGroupCapacity}, which exceeds the total session capacity of ${form.capacity}.` };
  }
  const seq = String(ds.sessions.filter((s) => s.programmeId === form.programmeId).length + 1).padStart(2, "0");
  const groups = groupInputs.map((g, i) => {
    const gseq = String(i + 1).padStart(2, "0");
    const groupId = `S${seq}MG${gseq}`;
    return { id: groupId, name: g.name.trim(), capacity: Number(g.capacity), candidateIds: [], zoomRoom: { id: `ZR-${groupId}`, link: "", panelistIds: [] } };
  });
  const programme = ds.programmes.find((p) => p.id === form.programmeId);
  const session = {
    id: `SESS-${form.programmeId}-${seq}`, programmeId: form.programmeId, academicYearId: form.academicYearId, cycleId: form.cycleId,
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
  seedDefaultRoles(ds, id);
  ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: "Super Admin", action: `Created institute ${form.name} (${id}).` });
  return institute;
}
export function setInstituteStatus(ds, instituteId, status) {
  const inst = ds.institutes.find((i) => i.id === instituteId);
  if (inst) { inst.status = status; ds.auditLog.unshift({ date: nowISO().slice(0, 10), actor: "Super Admin", action: `Set ${inst.name} to ${status}.` }); }
}

export function createProgramme(ds, form) {
  const id = form.code ? form.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : `PROG${ds.programmes.length + 1}`;
  const programme = {
    id, instituteId: form.instituteId, name: form.name, code: form.code, description: form.description || "", status: "Active", city: "\u2014", centre: "\u2014",
    requiredDocuments: DEFAULT_REQUIRED_DOCUMENTS.map((doc) => ({ ...doc })), shortlistRankField: "slatScore",
    approvalChain: DEFAULT_APPROVAL_CHAIN.map((lvl) => ({ ...lvl }))
  };
  ds.programmes.push(programme);
  const years = [{ id: `AY2026-${id}`, programmeId: id, label: "2026\u201327", status: "Active" }];
  ds.academicYears.push(...years);
  ds.activeAcademicYearByProgramme[id] = years[0].id;
  ds.assessmentParams[id] = { PI: RUBRIC, GE: [], WAT: [], WE: [] };
  ds.assessmentParamsDraft[id] = { PI: null, GE: null, WAT: null, WE: null };
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

// Per-programme required-document config — drives Category Verification (see verificationComplete /
// recomputeOutcome / commitImportedCandidates). Same add/edit/delete-one-row shape as saveAssessmentParam /
// deleteAssessmentParam below, minus the draft/approval staging — these apply immediately.
export function saveRequiredDocument(ds, programmeId, id, form) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return { error: "Programme not found." };
  if (!form.label || !form.label.trim()) return { error: "Label is required." };
  if (!form.appliesToCategories || !form.appliesToCategories.length) return { error: "Select at least one applicable category." };
  if (!p.requiredDocuments) p.requiredDocuments = [];
  const record = {
    id: id || `RD-${Date.now()}`,
    key: id ? (p.requiredDocuments.find((d) => d.id === id) || {}).key || `doc-${Date.now()}` : `doc-${Date.now()}`,
    seq: Number(form.seq) || p.requiredDocuments.length + 1,
    label: form.label.trim(), appliesToCategories: form.appliesToCategories
  };
  if (id) {
    const idx = p.requiredDocuments.findIndex((d) => d.id === id);
    if (idx !== -1) p.requiredDocuments[idx] = record;
  } else {
    p.requiredDocuments.push(record);
  }
  return { ok: true, record };
}
export function deleteRequiredDocument(ds, programmeId, id) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return;
  p.requiredDocuments = (p.requiredDocuments || []).filter((d) => d.id !== id);
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

// ---------- Admission Cycles ----------
// A programme can run multiple admission cycles within the same academic year (Round 1, Round 2,
// ...). cycleId joins programmeId+academicYearId as part of the identity of every candidate-pipeline
// record (candidates, sessions/groups/panelist allocation, shortlists, merit batches/releases,
// approval requests) — the same candidate could legitimately have separate records in different
// cycles (e.g. re-applying in a later round). Creating a cycle is a hard prerequisite: every
// cycle-scoped page in index.html gates on cycleGateOk() before rendering its real content.
export function cycleScopeKey(programmeId, academicYearId) { return `${programmeId}::${academicYearId}`; }

export function cyclesForScope(ds, programmeId, academicYearId) {
  return ds.admissionCycles.filter((c) => c.programmeId === programmeId && c.academicYearId === academicYearId);
}

export function activeCycleId(ds, programmeId, academicYearId) {
  return ds.activeCycleByProgYear[cycleScopeKey(programmeId, academicYearId)] || null;
}

export function createAdmissionCycle(ds, { programmeId, academicYearId, name }) {
  if (!name || !name.trim()) return { error: "Cycle name is required." };
  // Sequential, not Date.now()-based — two cycles created in fast succession (or programmatically,
  // as in tests) would otherwise land in the same millisecond and collide on id.
  const id = `CYC-${programmeId}-${academicYearId}-${ds.admissionCycles.length + 1}`;
  const cycle = { id, programmeId, academicYearId, name: name.trim(), status: "Draft", createdOn: nowISO().slice(0, 10) };
  ds.admissionCycles.push(cycle);
  // The first cycle created for a programme+year becomes the active one automatically — otherwise
  // every cycle-scoped page would still show the gate even though a cycle now exists.
  const key = cycleScopeKey(programmeId, academicYearId);
  if (!ds.activeCycleByProgYear[key]) ds.activeCycleByProgYear[key] = id;
  ds.auditLog.unshift({ date: cycle.createdOn, actor: "Institute Admin", action: `Created admission cycle ${cycle.name}.` });
  return { ok: true, cycle };
}
export function setActiveCycle(ds, programmeId, academicYearId, cycleId) {
  ds.activeCycleByProgYear[cycleScopeKey(programmeId, academicYearId)] = cycleId;
}
export function setCycleStatus(ds, cycleId, status) {
  const cycle = ds.admissionCycles.find((c) => c.id === cycleId);
  if (cycle) cycle.status = status;
}
export function deleteAdmissionCycle(ds, cycleId) {
  const cycle = ds.admissionCycles.find((c) => c.id === cycleId);
  if (!cycle) return;
  const inUse = ds.candidates.some((c) => c.cycleId === cycleId) || ds.sessions.some((s) => s.cycleId === cycleId);
  if (inUse) return { error: "This cycle already has candidates or sessions — it can't be deleted." };
  ds.admissionCycles = ds.admissionCycles.filter((c) => c.id !== cycleId);
  const key = cycleScopeKey(cycle.programmeId, cycle.academicYearId);
  if (ds.activeCycleByProgYear[key] === cycleId) {
    const remaining = cyclesForScope(ds, cycle.programmeId, cycle.academicYearId).filter((c) => c.id !== cycleId);
    ds.activeCycleByProgYear[key] = remaining[0] ? remaining[0].id : null;
  }
  return { ok: true };
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

export function saveAssessmentParam(ds, programmeId, type, id, form) {
  if (!form.name.trim() || !form.sequenceNo || !form.max) return { error: "All mandatory fields must be filled." };
  if (!ds.assessmentParamsDraft[programmeId][type]) ds.assessmentParamsDraft[programmeId][type] = ds.assessmentParams[programmeId][type].map((p) => ({ ...p }));
  const list = ds.assessmentParamsDraft[programmeId][type];
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
export function deleteAssessmentParam(ds, programmeId, type, id) {
  if (!ds.assessmentParamsDraft[programmeId][type]) ds.assessmentParamsDraft[programmeId][type] = ds.assessmentParams[programmeId][type].map((p) => ({ ...p }));
  ds.assessmentParamsDraft[programmeId][type] = ds.assessmentParamsDraft[programmeId][type].filter((p) => p.id !== id);
}

// ---------- Universal approval flow (Send for Approval -> mail -> OTP, Director then SIU) ----------
function randomToken() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
function randomOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

export function createApprovalRequest(ds, { subjectType, subjectId, programmeId, academicYearId, cycleId, summary }) {
  const id = `AR-${ds.approvalRequests.length + 1}`;
  // chainLength is frozen here, the same way a shortlist/merit batch freezes its own approvals
  // array length at creation (see confirmShortlist/runMeritProcessing) — so an admin editing the
  // programme's approval chain while this request is mid-flight can't desync "is this the last
  // level?" from what the underlying shortlist/merit batch actually finishes on.
  const chainLength = effectiveApprovalChain(ds.programmes.find((p) => p.id === programmeId)).length;
  const req = {
    id, subjectType, subjectId, programmeId, academicYearId, cycleId, summary, chainLength,
    levelIndex: 0, status: "pending", mailIds: [], createdOn: nowISO().slice(0, 10)
  };
  ds.approvalRequests.push(req);
  return req;
}

export function sendApprovalMail(ds, requestId, { to, subject, body }) {
  const req = ds.approvalRequests.find((r) => r.id === requestId);
  if (!req) return { error: "Approval request not found." };
  if (!to || !to.trim()) return { error: "Recipient email is required." };
  // levelLabel is snapshotted at send time, not resolved live: the popup approval tab that drives OTP
  // entry has no dataset access of its own (see handlePopupMessage), and a historical mail shouldn't
  // retroactively relabel itself if the chain is renamed later anyway.
  const chain = effectiveApprovalChain(ds.programmes.find((p) => p.id === req.programmeId));
  const levelLabel = (chain[req.levelIndex] || {}).name || `Level ${req.levelIndex + 1}`;
  const mail = {
    id: `MAIL-${ds.sentMails.length + 1}`, approvalRequestId: requestId, levelIndex: req.levelIndex, levelLabel,
    to: to.trim(), subject, body, sentOn: nowISO().slice(0, 10), token: randomToken(), otp: null, status: "pending"
  };
  ds.sentMails.push(mail);
  req.mailIds[req.levelIndex] = mail.id;
  return { ok: true, mail };
}

export function generateMailOtp(ds, mailId) {
  const mail = ds.sentMails.find((m) => m.id === mailId);
  if (!mail) return { error: "Mail not found." };
  if (mail.status !== "pending") return { error: "This approval is no longer pending." };
  mail.otp = randomOtp();
  return { ok: true, otp: mail.otp, to: mail.to };
}

function finalizeApprovalSubject(ds, req, levelIndex, isLast) {
  if (req.subjectType === "shortlist") approveShortlistList(ds, req.subjectId, levelIndex, "approved", "");
  else if (req.subjectType === "merit") approveMeritBatch(ds, req.subjectId, levelIndex, "approved", "");
  else if (req.subjectType === "assessment-params" && isLast) {
    // subjectId is "<programmeId>:<type>" — the rubric is per-programme, so the bare type alone (e.g.
    // "PI") isn't unique across programmes; see saveAssessmentParam for where this key is built.
    const [programmeId, type] = req.subjectId.split(":");
    if (ds.assessmentParamsDraft[programmeId] && ds.assessmentParamsDraft[programmeId][type]) {
      ds.assessmentParams[programmeId][type] = ds.assessmentParamsDraft[programmeId][type];
      ds.assessmentParamsDraft[programmeId][type] = null;
    }
  }
}
function rejectApprovalSubject(ds, req) {
  if (req.subjectType === "shortlist") approveShortlistList(ds, req.subjectId, req.levelIndex, "rejected", "");
  else if (req.subjectType === "merit") approveMeritBatch(ds, req.subjectId, req.levelIndex, "rejected", "");
  else if (req.subjectType === "assessment-params") {
    const [programmeId, type] = req.subjectId.split(":");
    if (ds.assessmentParamsDraft[programmeId]) ds.assessmentParamsDraft[programmeId][type] = null;
  }
}

export function verifyMailOtp(ds, mailId, entered) {
  const mail = ds.sentMails.find((m) => m.id === mailId);
  if (!mail) return { error: "Mail not found." };
  if (mail.status !== "pending") return { error: "This approval is no longer pending." };
  if (!mail.otp || String(entered || "").trim() !== mail.otp) return { error: "Incorrect OTP. Please try again." };
  mail.status = "approved";
  const req = ds.approvalRequests.find((r) => r.id === mail.approvalRequestId);
  if (!req) return { error: "Approval request not found." };
  // Frozen at request creation (req.chainLength) rather than read live — see createApprovalRequest.
  const isLast = req.levelIndex >= req.chainLength - 1;
  finalizeApprovalSubject(ds, req, req.levelIndex, isLast);
  if (isLast) {
    req.status = "approved";
  } else {
    req.levelIndex += 1;
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
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  const c = session && ds.candidates.find((x) => x.id === candidateId && x.programmeId === session.programmeId && x.academicYearId === session.academicYearId && x.cycleId === session.cycleId);
  if (!c || !group) return { error: "Not found." };
  if (c.shortlistStatus !== "approved") return { error: "Candidate must be fully approved before allocation." };
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
  const findCandidate = (id) => ds.candidates.find((x) => x.id === id && x.programmeId === toSession.programmeId && x.academicYearId === toSession.academicYearId && x.cycleId === toSession.cycleId);
  const moving = candidateIds.filter((id) => {
    const c = findCandidate(id);
    return c && c.allocation && !(c.allocation.sessionId === toSessionId && c.allocation.groupId === toGroupId);
  });
  if (!moving.length) return { ok: true, moved: 0 };
  const available = toGroup.capacity - toGroup.candidateIds.length;
  if (moving.length > available) return { error: `Only ${available} slot(s) available in ${toGroup.name}.` };
  const date = nowISO().slice(0, 10);
  moving.forEach((id) => {
    const c = findCandidate(id);
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
    // Only claw back readiness for a candidate merit processing hasn't already assigned a band to —
    // once meritCategory is set, resetting outcome/finalScore here would orphan the merit batch/rank/
    // waiting-list entry that already points at this candidate (see recomputeOutcome's matching guard).
    if (c.outcome === "ready-for-merit" && !c.meritCategory) { c.outcome = null; c.finalScore = null; }
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
  if (!p || !p.approval.length || p.approval.some((a) => a !== "approved")) return { error: "Panelist is not fully approved yet." };
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

// Undo of assignPanelist. Refuses once the panelist has put in (or had locked) a score for any
// candidate in this group — piTotal/allPanelistsScored (see submitPanelistScore) trust panelistIds
// to line up with who actually scored, so silently dropping a scored panelist would let the
// remaining panelists' partial totals pass as "everyone scored." We don't recompute piTotal here
// either way: an unscored panelist leaving never changes an already-computed total, and leaving the
// recompute to the next submitPanelistScore call (rather than doing it here) avoids finalizing a
// candidate's score as a side effect of an unassign click.
export function unassignPanelist(ds, sessionId, groupId, panelistId) {
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!group) return { error: "Group not found." };
  if (!group.zoomRoom.panelistIds.includes(panelistId)) return { error: "Panelist is not assigned to this group." };
  const hasScored = group.candidateIds.some((cid) => {
    const c = ds.candidates.find((x) => x.id === cid && x.programmeId === session.programmeId && x.academicYearId === session.academicYearId && x.cycleId === session.cycleId);
    return c && ((c.piScores && c.piScores[panelistId] != null) || (c.piScoreLocked && c.piScoreLocked[panelistId]));
  });
  if (hasScored) return { error: "Can't unassign: this panelist has already scored candidates in this group." };
  group.zoomRoom.panelistIds = group.zoomRoom.panelistIds.filter((id) => id !== panelistId);
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
// A real institute has an actual Zoom account and pastes its own meeting link in rather than using
// a fake auto-generated one — unlike assignZoomRoomLink, this can overwrite an existing link.
export function setZoomRoomLink(ds, sessionId, groupId, link) {
  const session = ds.sessions.find((s) => s.id === sessionId);
  const group = session && session.groups.find((g) => g.id === groupId);
  if (!group) return { error: "Group not found." };
  if (!link || !link.trim()) return { error: "Enter a meeting link." };
  group.zoomRoom.link = link.trim();
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
  ds.panelists.push({ id, ...fields, programmeIds: form.programmeIds, approval: effectivePanelistApprovalChain(ds).map(() => "pending") });
  return { ok: true, id };
}

export function approvePanelist(ds, panelistId, levelIndex, decision) {
  const p = ds.panelists.find((x) => x.id === panelistId);
  if (!p) return;
  const chain = effectivePanelistApprovalChain(ds);
  // Self-healing pad: unlike a shortlist/merit batch (a fresh snapshot every time), a panelist record
  // persists indefinitely — if the global chain grows after this panelist was created, extend their
  // approval array to match on next use rather than going out of bounds.
  if (p.approval.length < chain.length) p.approval = [...p.approval, ...new Array(chain.length - p.approval.length).fill("pending")];
  if (levelIndex > 0 && p.approval[levelIndex - 1] !== "approved") return;
  p.approval[levelIndex] = decision;
  // Parallel to p.approval (kept a plain string array so every existing `=== "approved"` check
  // stays valid) — decision timestamps live here instead, indexed the same way.
  if (!p.approvalDecidedAt) p.approvalDecidedAt = [];
  p.approvalDecidedAt[levelIndex] = nowISO();
  if (p.approval.length === chain.length && p.approval.every((a) => a === "approved") && !p.credentials) {
    p.credentials = { loginId: p.email, password: genPassword(), issuedOn: nowISO().slice(0, 10) };
    ds.sentMails.push({
      id: `MAIL-${ds.sentMails.length + 1}`, approvalRequestId: null, levelIndex: null, levelLabel: "Info",
      to: p.email, subject: `Panelist Portal Access — ${p.name}`,
      body: `Hi ${p.name},\n\nYou have been approved as a panelist. Here are your Panelist Portal login details:\n\nLogin ID: ${p.credentials.loginId}\nPassword: ${p.credentials.password}\n\nLog in from the "Panelist" tab on the login screen.`,
      sentOn: nowISO().slice(0, 10), token: null, otp: null, status: "delivered", summary: `Panelist credentials — ${p.name}`
    });
  }
}

export function saveApprovalLevel(ds, programmeId, id, form) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return { error: "Programme not found." };
  if (!form.name || !form.name.trim()) return { error: "Level name is required." };
  if (!p.approvalChain) p.approvalChain = [];
  const record = {
    id: id || `AC-${Date.now()}`, seq: Number(form.seq) || p.approvalChain.length + 1,
    name: form.name.trim(), approverEmail: (form.approverEmail || "").trim()
  };
  if (id) { const idx = p.approvalChain.findIndex((l) => l.id === id); if (idx !== -1) p.approvalChain[idx] = record; }
  else p.approvalChain.push(record);
  return { ok: true, record };
}
export function deleteApprovalLevel(ds, programmeId, id) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return;
  if ((p.approvalChain || []).length <= 1) return { error: "A programme must keep at least one approval level." };
  p.approvalChain = (p.approvalChain || []).filter((l) => l.id !== id);
}

export function savePanelistApprovalLevel(ds, id, form) {
  if (!form.name || !form.name.trim()) return { error: "Level name is required." };
  if (!ds.panelistApprovalChain) ds.panelistApprovalChain = [];
  const record = { id: id || `PAC-${Date.now()}`, seq: Number(form.seq) || ds.panelistApprovalChain.length + 1, name: form.name.trim() };
  if (id) { const idx = ds.panelistApprovalChain.findIndex((l) => l.id === id); if (idx !== -1) ds.panelistApprovalChain[idx] = record; }
  else ds.panelistApprovalChain.push(record);
  return { ok: true, record };
}
export function deletePanelistApprovalLevel(ds, id) {
  if ((ds.panelistApprovalChain || []).length <= 1) return { error: "At least one panelist approval level is required." };
  ds.panelistApprovalChain = (ds.panelistApprovalChain || []).filter((l) => l.id !== id);
}

export function markAttendance(ds, candidateId, kind, status, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
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
    // Same guard as moveCandidatesAllocation: don't orphan an already-decided merit record.
    if (c.outcome === "ready-for-merit" && !c.meritCategory) { c.outcome = null; c.finalScore = null; }
  } else {
    recomputeOutcome(ds, c);
  }
}

// Each assigned panelist submits their own score independently; piTotal is the
// average across however many panelists have a complete score in for this candidate.
export function submitPanelistScore(ds, candidateId, panelistId, scores, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
  if (!c || !c.allocation) return;
  const session = ds.sessions.find((s) => s.id === c.allocation.sessionId);
  const group = session && session.groups.find((g) => g.id === c.allocation.groupId);
  if (!group) return;
  const assessment = session && ds.assessments.find((a) => a.id === session.assessmentId);
  const type = assessment ? assessment.shortName : "PI";
  const params = (ds.assessmentParams[programmeId] && ds.assessmentParams[programmeId][type]) || [];
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
  recomputeOutcome(ds, c);
}

export function setPanelistNote(ds, candidateId, panelistId, text, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
  if (!c) return;
  if (!c.piNotes) c.piNotes = {};
  c.piNotes[panelistId] = text;
}

// Called when a panelist moves past a candidate they scored, so the score can no longer be edited from the portal.
export function lockPanelistScore(ds, candidateId, panelistId, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
  if (!c) return;
  if (!c.piScoreLocked) c.piScoreLocked = {};
  c.piScoreLocked[panelistId] = true;
}

export function setVerification(ds, candidateId, docKey, value, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
  if (!c || !c.verification.documents[docKey]) return;
  c.verification.documents[docKey].status = value;
  recomputeOutcome(ds, c);
}

// APV (Academic Profile Verification) is a distinct 0-10 score the admin enters directly on the
// candidate's profile — separate from the panelist-scored PI total, combined with it for merit ranking.
export function setApvScore(ds, candidateId, value, programmeId, academicYearId, cycleId) {
  const c = ds.candidates.find((x) => x.id === candidateId && x.programmeId === programmeId && x.academicYearId === academicYearId && x.cycleId === cycleId);
  if (!c) return;
  const n = value === "" || value == null ? NaN : Number(value);
  c.apvScore = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  recomputeOutcome(ds, c);
}

// Institute-configurable merit scoring (Formula Builder). Committing a formula only re-derives
// finalScore.final for candidates recomputeOutcome would still touch on its own (ready-for-merit,
// not yet merit-processed) — a candidate merit processing has already banded keeps the score that
// decision was actually made on, same restraint recomputeOutcome already applies everywhere else.
export function setScoringFormula(ds, programmeId, weights) {
  const p = ds.programmes.find((x) => x.id === programmeId);
  if (!p) return { error: "Programme not found." };
  p.scoringFormula = { weights: { pi: Number(weights.pi) || 0, apv: Number(weights.apv) || 0, slat: Number(weights.slat) || 0 } };
  ds.candidates
    .filter((c) => c.programmeId === programmeId && c.outcome === "ready-for-merit" && !c.meritCategory)
    .forEach((c) => recomputeOutcome(ds, c));
  return { ok: true };
}

// A candidate with no applicable documents at all (e.g. OPEN category under the default config) counts
// as verified by default. Every document that applies to this candidate's category (see
// programme.requiredDocuments) must be marked Valid.
function verificationComplete(c, requiredDocuments) {
  return (requiredDocuments || []).every((doc) => {
    if (!doc.appliesToCategories.includes(c.category)) return true;
    const entry = c.verification.documents[doc.key];
    return !!entry && entry.status === "valid";
  });
}

// Re-derives merit-readiness from whichever of its inputs (document statuses, panelist-recorded
// attendance, completed PI score, APV score) currently holds. Called from every function that can change any
// one of those inputs — not just setVerification — so readiness never depends on something else happening to
// also run setVerification afterwards (e.g. an OPEN-category candidate has no document step at all, so
// this must fire on its own once they're present, fully scored, and APV-scored).
function recomputeOutcome(ds, c) {
  const programme = ds.programmes.find((p) => p.id === c.programmeId);
  const requiredDocuments = (programme && programme.requiredDocuments) || [];
  const anyDocumentInvalid = requiredDocuments.some((doc) => {
    if (!doc.appliesToCategories.includes(c.category)) return false;
    const entry = c.verification.documents[doc.key];
    return !!entry && entry.status === "invalid";
  });
  if (anyDocumentInvalid) {
    c.outcome = "ineligible";
  } else if (c.piAttendance === "present" && c.piTotal != null && c.apvScore != null && verificationComplete(c, requiredDocuments)) {
    c.outcome = "ready-for-merit";
    const pi = c.piTotal;
    const apv = c.apvScore;
    // Default final score is PI + APV, same as always — a programme only deviates from that once
    // its institute admin explicitly commits a custom weighting via Formula Builder (setScoringFormula).
    const formula = programme && programme.scoringFormula;
    const final = formula
      ? Math.round((pi * (formula.weights.pi || 0) + apv * (formula.weights.apv || 0) + (c.slatScore || 0) * (formula.weights.slat || 0)) * 10) / 10
      : pi + apv;
    c.finalScore = { pi, apv, piApv: pi + apv, slat: c.slatScore, scaledSlat: null, final };
  } else if (!c.meritCategory) {
    // Not ineligible, not (yet) fully ready — e.g. verification still pending. Only reset readiness for
    // candidates merit processing hasn't already assigned a band to; a decided candidate keeps its finalScore.
    c.outcome = null;
    c.finalScore = null;
  }
}


export function runMeritProcessing(ds, { programmeId, academicYearId, cycleId, category, criteria, value, waitingSize }) {
  // A negative/NaN value makes meritCount negative, which sends the ENTIRE pool to "rejected" (nothing is
  // ever < a negative meritCount) — permanently, since rejected candidates never re-enter a future pool
  // (the `!c.meritCategory` filter above excludes them). Refuse rather than silently reject everyone.
  if (!Number.isFinite(value) || value < 0) return { error: "Enter a valid, non-negative number." };
  if (!Number.isFinite(waitingSize) || waitingSize < 0) return { error: "Enter a valid, non-negative waiting list size." };
  const pool = ds.candidates.filter((c) => c.programmeId === programmeId && c.academicYearId === academicYearId && c.cycleId === cycleId && c.category === category && c.outcome === "ready-for-merit" && !c.meritCategory);
  pool.sort((a, b) => b.finalScore.final - a.finalScore.final);
  const meritCount = criteria === "count" ? Math.min(value, pool.length) : pool.filter((c) => c.finalScore.final >= value).length;
  // Waiting-list numbers must keep incrementing across separate processing runs for the same
  // programme+category, not restart at 001 each time — otherwise a later run collides with numbers
  // already handed out (and already possibly consumed by a Merit List Release) by an earlier run.
  const existingWaitingCount = ds.candidates.filter((c) => c.programmeId === programmeId && c.academicYearId === academicYearId && c.cycleId === cycleId && c.category === category && c.meritCategory === "waiting").length;
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
    const chain = effectiveApprovalChain(ds.programmes.find((p) => p.id === programmeId));
    batch = {
      id: `MB-${programmeId}-${category}-${seq}`, programmeId, academicYearId, cycleId, category, criteria, value,
      candidateIds: meritCandidates.map((c) => c.id), createdOn: date,
      approvals: new Array(chain.length).fill(null), currentLevelIndex: 0, status: "pending"
    };
    ds.meritBatches.push(batch);
    meritCandidates.forEach((c) => { c.meritBatchId = batch.id; });
  }
  return { merit: meritCount, waiting: Math.min(waitingSize, pool.length - meritCount), rejected: Math.max(0, pool.length - meritCount - waitingSize), batch };
}

export function approveMeritBatch(ds, batchId, levelIndex, decision, comments) {
  const batch = ds.meritBatches.find((b) => b.id === batchId);
  if (!batch) return;
  if (batch.status !== "pending" || batch.currentLevelIndex !== levelIndex) return;
  const decidedAt = nowISO();
  const date = decidedAt.slice(0, 10);
  const candidates = batch.candidateIds
    .map((id) => ds.candidates.find((c) => c.id === id && c.programmeId === batch.programmeId && c.academicYearId === batch.academicYearId && c.cycleId === batch.cycleId))
    .filter(Boolean);
  batch.approvals[levelIndex] = { status: decision, date, decidedAt, comments };
  if (decision === "approved") {
    candidates.forEach((c) => { if (!c.meritApproval) c.meritApproval = []; c.meritApproval[levelIndex] = { status: "approved", date }; });
    const isLast = levelIndex === batch.approvals.length - 1;
    if (isLast) {
      batch.status = "approved";
      candidates.forEach((c) => c.timeline.push({ label: `Merit List Approved (${batchId})`, date }));
    } else {
      batch.currentLevelIndex = levelIndex + 1;
      candidates.forEach((c) => c.timeline.push({ label: `Merit List — Level ${levelIndex + 1} Approved (${batchId})`, date }));
    }
  } else {
    batch.status = "rejected";
    candidates.forEach((c) => { c.meritCategory = null; c.rank = null; c.meritBatchId = null; c.meritApproval = []; c.timeline.push({ label: `Merit List — Level ${levelIndex + 1} Rejected (${batchId}) — returned to pool`, date }); });
  }
}

// Releases an entire Director+SIU-approved merit batch in one shot — no partial headcount/cutoff selection.
// Only candidates from this batch not already covered by an earlier release go out (covers the case of a
// batch that was partially released under the old per-release-headcount flow).
export function releaseMeritBatch(ds, batchId, lastFeeDate, nextReleaseDate) {
  const batch = ds.meritBatches.find((b) => b.id === batchId);
  if (!batch) return { error: "Merit batch not found." };
  if (batch.status !== "approved") return { error: "This merit batch hasn't completed its full approval chain yet." };
  if (!lastFeeDate || !nextReleaseDate) return { error: "Enter both the Last Date to Pay Fees and the Next Merit List Release Date." };
  const candidates = batch.candidateIds
    .map((id) => ds.candidates.find((c) => c.id === id && c.programmeId === batch.programmeId && c.academicYearId === batch.academicYearId && c.cycleId === batch.cycleId))
    .filter((c) => c && !c.meritListReleaseId);
  if (!candidates.length) return { error: "Every candidate in this batch has already been released." };
  const priorCount = ds.meritListReleases.filter((r) => r.programmeId === batch.programmeId && r.category === batch.category).length;
  const date = nowISO().slice(0, 10);
  const release = {
    id: `MLR-${batch.programmeId}-${batch.category}-${priorCount + 1}`, releaseNumber: priorCount + 1,
    programmeId: batch.programmeId, academicYearId: batch.academicYearId, cycleId: batch.cycleId, category: batch.category, method: "Approved Merit List", source: "Direct",
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
  const picked = ds.candidates.filter((c) => c.programmeId === form.programmeId && c.academicYearId === form.academicYearId && c.cycleId === form.cycleId && c.category === form.category && c.meritCategory === "waiting" && !c.meritListReleaseId)
    .sort((a, b) => (a.waitingListNumber > b.waitingListNumber ? 1 : -1)).slice(0, form.count);
  if (!picked.length) return { error: "No Waiting List candidates available for this category." };
  const priorCount = ds.meritListReleases.filter((r) => r.programmeId === form.programmeId && r.category === form.category).length;
  const date = nowISO().slice(0, 10);
  const release = {
    id: `MLR-${form.programmeId}-${form.category}-${priorCount + 1}`, releaseNumber: priorCount + 1,
    programmeId: form.programmeId, academicYearId: form.academicYearId, cycleId: form.cycleId, category: form.category, method: "Number of Candidates", source: "Waiting List",
    count: picked.length, lastFeeDate: form.lastFeeDate, nextReleaseDate: form.nextReleaseDate, createdOn: date
  };
  // Waiting-list promotion bypasses the approval chain entirely (never went through Director/SIU as a
  // batch), so stamp every configured level "approved" directly rather than leaving meritApproval empty.
  const chainLength = effectiveApprovalChain(ds.programmes.find((p) => p.id === form.programmeId)).length;
  picked.forEach((c) => {
    c.meritCategory = "merit";
    c.meritApproval = Array.from({ length: chainLength }, () => ({ status: "approved", date }));
    c.meritListReleaseId = release.id;
    c.timeline.push({ label: `Merit List Released (${release.id})`, date });
  });
  ds.meritListReleases.push(release);
  return { ok: true, release };
}
