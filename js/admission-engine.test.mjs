// Plain node --test smoke check for js/admission-engine.js — no framework, run with:
//   node --test js/admission-engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDataset, createInstitute, createProgramme, setApvScore, setScoringFormula,
  moveCandidatesAllocation, confirmShortlist, createApprovalRequest, sendApprovalMail,
  generateMailOtp, verifyMailOtp, createAdmissionCycle, activeCycleId, cyclesForScope,
  setActiveCycle, deleteAdmissionCycle, buildCandidateDocuments, approveShortlistList, revertShortlist
} from "./admission-engine.js";

function makeReadyCandidate(ds, programmeId, academicYearId, overrides) {
  const c = {
    id: overrides.id, programmeId, academicYearId, name: overrides.name || overrides.id,
    category: "OPEN", shortlistStatus: "approved", allocation: { sessionId: "S1", groupId: "G1" },
    piAttendance: "present", piTotal: overrides.piTotal, slatScore: overrides.slatScore || 0,
    apvScore: null, piScores: {}, piNotes: {}, piScoreLocked: {}, piTotal_: undefined,
    verification: { documents: {} }, outcome: null, finalScore: null,
    meritCategory: null, meritBatchId: null, rank: null, waitingListNumber: null,
    meritApproval: [], timeline: []
  };
  ds.candidates.push(c);
  return c;
}

// BUG-FORMULA-01: committing a scoring formula (Formula Builder) used to have zero effect on the
// real merit score — recomputeOutcome hardcoded pi+apv regardless. setScoringFormula now feeds it.
test("setScoringFormula changes finalScore.final for a not-yet-merit-processed candidate", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C1", piTotal: 34, slatScore: 80 });
  setApvScore(ds, "C1", 8, prog.id, ay); // triggers recomputeOutcome -> outcome becomes ready-for-merit

  assert.equal(c.outcome, "ready-for-merit");
  assert.equal(c.finalScore.final, 42, "default formula is still plain PI + APV");

  const res = setScoringFormula(ds, prog.id, { pi: 1, apv: 1, slat: 0.1 });
  assert.ok(res.ok);
  assert.equal(c.finalScore.final, 50, "34 + 8 + 0.1*80 under the committed formula");
});

// A candidate merit processing has already banded keeps the score that decision was made on —
// committing a new formula later must not retroactively rewrite it.
test("setScoringFormula does not touch a candidate merit processing has already decided", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C2", piTotal: 34, slatScore: 80 });
  setApvScore(ds, "C2", 8, prog.id, ay);
  c.meritCategory = "merit"; // already decided by an earlier Merit Processing run

  setScoringFormula(ds, prog.id, { pi: 1, apv: 1, slat: 0.1 });
  assert.equal(c.finalScore.final, 42, "a decided candidate's score must not change retroactively");
});

// BUG-MERIT-01: moving a candidate's PI session/group allocation after merit processing used to
// wipe outcome/finalScore while leaving meritCategory/rank/meritBatchId stale (orphaned record).
test("moveCandidatesAllocation does not orphan an already merit-processed candidate", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  ds.sessions.push(
    { id: "S1", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "10:00 AM", endTime: "11:00 AM", groups: [{ id: "G1", name: "Group 1", capacity: 5, candidateIds: ["C3"], zoomRoom: { id: "ZR1", link: "", panelistIds: [] } }] },
    { id: "S2", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "12:00 PM", endTime: "1:00 PM", groups: [{ id: "G2", name: "Group 2", capacity: 5, candidateIds: [], zoomRoom: { id: "ZR2", link: "", panelistIds: [] } }] }
  );
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C3", piTotal: 34, slatScore: 80 });
  c.allocation = { sessionId: "S1", groupId: "G1" };
  setApvScore(ds, "C3", 8, prog.id, ay);
  c.meritCategory = "merit"; c.rank = 1; c.meritBatchId = "MB1";

  const res = moveCandidatesAllocation(ds, ["C3"], "S2", "G2");
  assert.ok(res.ok);
  assert.equal(c.outcome, "ready-for-merit", "outcome must survive the move for a decided candidate");
  assert.equal(c.finalScore.final, 42, "finalScore must survive the move for a decided candidate");
  assert.equal(c.meritCategory, "merit", "meritCategory must stay intact, not orphaned");
});

// BUG-APPROVAL-01: an admin shortening a programme's approval chain mid-flight used to desync the
// approval-request's live-chain "is this the last level?" check from the shortlist's own approvals
// array, frozen at its own creation time. createApprovalRequest now freezes chainLength the same way.
test("editing the approval chain mid-flight does not desync the approval request from the shortlist", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const p = ds.programmes.find((x) => x.id === prog.id);
  p.approvalChain = [
    { id: "L1", seq: 1, name: "Director", approverEmail: "" },
    { id: "L2", seq: 2, name: "Registrar", approverEmail: "" },
    { id: "L3", seq: 3, name: "SIU", approverEmail: "" }
  ];
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C4", piTotal: 30, slatScore: 50 });
  c.shortlistStatus = "yet-to-shortlist";

  const { list } = confirmShortlist(ds, { programmeId: prog.id, academicYearId: ay, filter: { groups: [] }, rankField: null, mode: "all", value: null });
  assert.equal(list.approvals.length, 3);

  const req = createApprovalRequest(ds, { subjectType: "shortlist", subjectId: list.id, programmeId: prog.id, academicYearId: ay, summary: "test" });
  assert.equal(req.chainLength, 3);

  // Level 0 (Director) approves.
  let mail = sendApprovalMail(ds, req.id, { to: "a@b.com", subject: "s", body: "b" }).mail;
  verifyMailOtp(ds, mail.id, generateMailOtp(ds, mail.id).otp);
  assert.equal(req.levelIndex, 1);
  assert.equal(list.currentLevelIndex, 1);

  // Admin removes a level from the chain while this request is mid-flight (now 2 levels).
  p.approvalChain = [
    { id: "L1", seq: 1, name: "Director", approverEmail: "" },
    { id: "L2", seq: 2, name: "Registrar", approverEmail: "" }
  ];

  // Level 1 (Registrar) approves. Bug: live chain length (2) makes levelIndex 1 look like the
  // last level (1 >= 2-1); the frozen chainLength (3) correctly knows one level still remains.
  mail = sendApprovalMail(ds, req.id, { to: "a@b.com", subject: "s", body: "b" }).mail;
  verifyMailOtp(ds, mail.id, generateMailOtp(ds, mail.id).otp);

  assert.equal(req.status, "pending", "request must not be marked approved — a level still remains");
  assert.equal(req.levelIndex, 2);
  assert.equal(list.status, "pending", "shortlist must agree with the request — still one level to go");
  assert.equal(list.currentLevelIndex, 2);
});

// Admission Cycles: a programme+year can run multiple cycles (Round 1, Round 2, ...); the first
// one created for a scope becomes active automatically, later ones don't, and switching/deleting
// behave as CYCLE_GATED_PAGES and the Admission Cycles page expect.
test("createAdmissionCycle auto-selects only the first cycle for a programme+year", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  assert.equal(activeCycleId(ds, prog.id, ay), null, "no cycle exists yet");

  const r1 = createAdmissionCycle(ds, { programmeId: prog.id, academicYearId: ay, name: "Round 1" });
  assert.ok(r1.ok);
  assert.equal(activeCycleId(ds, prog.id, ay), r1.cycle.id, "first cycle auto-selected");

  const r2 = createAdmissionCycle(ds, { programmeId: prog.id, academicYearId: ay, name: "Round 2" });
  assert.ok(r2.ok);
  assert.equal(activeCycleId(ds, prog.id, ay), r1.cycle.id, "second cycle does not steal the active slot");
  assert.equal(cyclesForScope(ds, prog.id, ay).length, 2);

  setActiveCycle(ds, prog.id, ay, r2.cycle.id);
  assert.equal(activeCycleId(ds, prog.id, ay), r2.cycle.id, "explicit switch works");
});

test("deleteAdmissionCycle refuses to delete a cycle with candidates, and reassigns the active slot when deleting it", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  const r1 = createAdmissionCycle(ds, { programmeId: prog.id, academicYearId: ay, name: "Round 1" }).cycle;
  const r2 = createAdmissionCycle(ds, { programmeId: prog.id, academicYearId: ay, name: "Round 2" }).cycle;
  ds.candidates.push({ id: "C1", programmeId: prog.id, academicYearId: ay, cycleId: r1.id });

  const blocked = deleteAdmissionCycle(ds, r1.id);
  assert.ok(blocked.error, "cycle with a candidate must not be deletable");
  assert.equal(cyclesForScope(ds, prog.id, ay).length, 2);

  const res = deleteAdmissionCycle(ds, r2.id);
  assert.ok(res.ok);
  assert.equal(cyclesForScope(ds, prog.id, ay).length, 1);
  assert.equal(activeCycleId(ds, prog.id, ay), r1.id, "active slot still points at the remaining cycle");
});

// Category Verification's "View Document" opens verification.documents[key].dataUrl directly in a new
// tab — it must be an actual, openable document (not a plaintext stub) for the preview to look valid.
test("buildCandidateDocuments seeds a real PDF, not a plaintext stub", () => {
  const docs = buildCandidateDocuments("C1", "SC", [{ key: "category", label: "Category Certificate", appliesToCategories: ["SC"] }]);
  const doc = docs.category;
  assert.match(doc.dataUrl, /^data:application\/pdf;base64,/, "must be a PDF data URL, not data:text/plain");
  const pdfBytes = Buffer.from(doc.dataUrl.split(",")[1], "base64").toString("latin1");
  assert.match(pdfBytes, /^%PDF-1\.4/, "decoded bytes must start with the PDF magic header");
  assert.ok(pdfBytes.includes("%%EOF"), "decoded bytes must have a PDF end-of-file marker");
});

// Feedback: once any approval level rejects a shortlist, Director/SIU can click "Revert Shortlist"
// to put its candidates back to Draft (yet-to-shortlist), and can't do it twice or on a live list.
test("revertShortlist resets a rejected shortlist's candidates to yet-to-shortlist", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C5", piTotal: 30, slatScore: 50 });
  c.shortlistStatus = "yet-to-shortlist";

  const { list } = confirmShortlist(ds, { programmeId: prog.id, academicYearId: ay, filter: { groups: [] }, rankField: null, mode: "all", value: null });

  const blocked = revertShortlist(ds, list.id);
  assert.ok(blocked.error, "cannot revert a shortlist that hasn't been rejected");

  approveShortlistList(ds, list.id, 0, "rejected", "");
  assert.equal(list.status, "rejected");
  assert.equal(c.shortlistStatus, "yet-to-shortlist", "rejection already returns candidates to the pool");

  const res = revertShortlist(ds, list.id);
  assert.ok(res.ok);
  assert.equal(res.count, 1);
  assert.equal(c.shortlistStatus, "yet-to-shortlist", "reverted candidate lands in the Draft/yet-to-shortlist bucket");
  assert.equal(c.shortlistId, null);
  assert.ok(list.reverted, "list is flagged reverted so the button doesn't offer itself again");
});
