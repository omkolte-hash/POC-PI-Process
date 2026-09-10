// Plain node --test smoke check for js/admission-engine.js — no framework, run with:
//   node --test js/admission-engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDataset, createInstitute, createProgramme, setApvScore, setScoringFormula,
  moveCandidatesAllocation, confirmShortlist, createApprovalRequest, sendApprovalMail,
  generateMailOtp, verifyMailOtp, createAdmissionCycle, activeCycleId, cyclesForScope,
  setActiveCycle, deleteAdmissionCycle, buildCandidateDocuments, approveShortlistList, revertShortlist,
  runMeritProcessing, approveMeritBatch, savePanelist, approvePanelist, fmtDateTime,
  unassignPanelist, panelistInstituteId, panelistServesProgramme,
  sendGroupMeetingNotification, placeholderCandidateEmail, markAttendance, editLockedAttendance
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

// Groups drawer "Change Group": move one or more candidates from their current group into another
// group in the same session, and refuse the move if the target group doesn't have enough free seats.
test("moveCandidatesAllocation moves multiple candidates into a group with enough capacity", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  ds.sessions.push({
    id: "S1", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "10:00 AM", endTime: "11:00 AM",
    groups: [
      { id: "G1", name: "Group 1", capacity: 5, candidateIds: ["C10", "C11"], zoomRoom: { id: "ZR1", link: "", panelistIds: [] } },
      { id: "G2", name: "Group 2", capacity: 5, candidateIds: [], zoomRoom: { id: "ZR2", link: "", panelistIds: [] } }
    ]
  });
  const c10 = makeReadyCandidate(ds, prog.id, ay, { id: "C10", piTotal: 30, slatScore: 70 });
  c10.allocation = { sessionId: "S1", groupId: "G1" };
  const c11 = makeReadyCandidate(ds, prog.id, ay, { id: "C11", piTotal: 32, slatScore: 60 });
  c11.allocation = { sessionId: "S1", groupId: "G1" };

  const res = moveCandidatesAllocation(ds, ["C10", "C11"], "S1", "G2");
  assert.ok(res.ok);
  assert.equal(res.moved, 2);
  assert.equal(c10.allocation.groupId, "G2");
  assert.equal(c11.allocation.groupId, "G2");
  const [g1, g2] = ds.sessions[0].groups;
  assert.deepEqual(g1.candidateIds, [], "candidates must be removed from the source group");
  assert.deepEqual(g2.candidateIds.sort(), ["C10", "C11"], "candidates must be added to the target group");
});

test("moveCandidatesAllocation rejects a move that would exceed the target group's capacity", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  ds.sessions.push({
    id: "S1", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "10:00 AM", endTime: "11:00 AM",
    groups: [
      { id: "G1", name: "Group 1", capacity: 5, candidateIds: ["C12"], zoomRoom: { id: "ZR1", link: "", panelistIds: [] } },
      { id: "G2", name: "Group 2", capacity: 2, candidateIds: ["C13", "C14"], zoomRoom: { id: "ZR2", link: "", panelistIds: [] } }
    ]
  });
  const c12 = makeReadyCandidate(ds, prog.id, ay, { id: "C12", piTotal: 30, slatScore: 70 });
  c12.allocation = { sessionId: "S1", groupId: "G1" };

  const res = moveCandidatesAllocation(ds, ["C12"], "S1", "G2");
  assert.ok(res.error, "a full target group must refuse the move");
  assert.equal(c12.allocation.groupId, "G1", "candidate must stay put when the move is rejected");
  const [g1, g2] = ds.sessions[0].groups;
  assert.deepEqual(g1.candidateIds, ["C12"]);
  assert.deepEqual(g2.candidateIds, ["C13", "C14"]);
});

// PI Attendance page's confirm-and-mark flow (see index.html buildAttendance) passes lock=true —
// once locked, markAttendance must refuse further changes until a re-allocation clears the lock.
test("markAttendance locks the candidate when marked with lock=true, and a locked candidate can't be changed again", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C20" });

  const res = markAttendance(ds, "C20", "pi", "absent", prog.id, ay, undefined, true);
  assert.equal(res, undefined, "a successful mark returns no error");
  assert.equal(c.piAttendance, "absent");
  assert.equal(c.piAttendanceLocked, true);

  const res2 = markAttendance(ds, "C20", "pi", "present", prog.id, ay, undefined);
  assert.ok(res2 && res2.error, "a locked candidate's PI attendance must be refused");
  assert.equal(c.piAttendance, "absent", "attendance must stay whatever it was locked at");
});

// Follow-up: Institute Admin can override a locked PI attendance record (see index.html
// canEditLockedAttendance) via editLockedAttendance, without weakening markAttendance's lock for
// everyone else.
test("editLockedAttendance overrides a locked candidate's status, keeps it locked, and logs a timeline entry", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C22" });

  markAttendance(ds, "C22", "pi", "present", prog.id, ay, undefined, true);
  assert.equal(c.piAttendanceLocked, true);

  const res = editLockedAttendance(ds, "C22", "absent", prog.id, ay, undefined);
  assert.equal(res, undefined, "a successful override returns no error");
  assert.equal(c.piAttendance, "absent");
  assert.equal(c.piAttendanceLocked, true, "the override must not unlock the candidate");
  assert.deepEqual(c.piScores, {}, "switching to absent must clear scores, same as markAttendance");
  assert.equal(c.piTotal, null);
  assert.ok(
    c.timeline.some((t) => t.label === "Attendance changed to Absent by Institute Admin"),
    "the override must be logged on the candidate's timeline"
  );

  // markAttendance itself must still refuse the (still-locked) candidate.
  const res2 = markAttendance(ds, "C22", "pi", "present", prog.id, ay, undefined);
  assert.ok(res2 && res2.error, "the normal mark path must still be refused for a locked candidate");
  assert.equal(c.piAttendance, "absent", "attendance must stay whatever the override left it at");
});

// moveCandidatesAllocation already clears piAttendance back to "pending" for a re-allocated
// candidate (a stale score/lock belongs to the old panel) — the lock must go with it, or the new
// panel/coordinator would never be able to mark the re-allocated candidate again.
test("moveCandidatesAllocation clears the attendance lock so a re-allocated candidate can be marked again", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];

  ds.sessions.push(
    { id: "S1", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "10:00 AM", endTime: "11:00 AM", groups: [{ id: "G1", name: "Group 1", capacity: 5, candidateIds: ["C21"], zoomRoom: { id: "ZR1", link: "", panelistIds: [] } }] },
    { id: "S2", programmeId: prog.id, academicYearId: ay, date: "2026-01-01", startTime: "12:00 PM", endTime: "1:00 PM", groups: [{ id: "G2", name: "Group 2", capacity: 5, candidateIds: [], zoomRoom: { id: "ZR2", link: "", panelistIds: [] } }] }
  );
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C21" });
  c.allocation = { sessionId: "S1", groupId: "G1" };
  markAttendance(ds, "C21", "pi", "present", prog.id, ay, undefined, true);
  assert.equal(c.piAttendanceLocked, true);

  const res = moveCandidatesAllocation(ds, ["C21"], "S2", "G2");
  assert.ok(res.ok);
  assert.equal(c.piAttendance, "pending");
  assert.equal(c.piAttendanceLocked, false, "the lock must not survive a re-allocation");

  const res2 = markAttendance(ds, "C21", "pi", "present", prog.id, ay, undefined);
  assert.equal(res2, undefined, "the re-allocated candidate can be marked again");
  assert.equal(c.piAttendance, "present");
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

// Feedback: approval displays ("approved by: Director") must also show when the decision was made.
// approveShortlistList/approveMeritBatch/approvePanelist now stamp a decision timestamp alongside
// their existing status value, without changing the shape/value other code already compares against.
test("approveShortlistList records a decision timestamp alongside the existing date field", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C6", piTotal: 30, slatScore: 50 });
  c.shortlistStatus = "yet-to-shortlist";

  const { list } = confirmShortlist(ds, { programmeId: prog.id, academicYearId: ay, filter: { groups: [] }, rankField: null, mode: "all", value: null });
  approveShortlistList(ds, list.id, 0, "approved", "");

  assert.equal(list.approvals[0].status, "approved", "decision value is unchanged");
  assert.ok(list.approvals[0].decidedAt, "decision timestamp recorded");
  assert.equal(list.approvals[0].date, list.approvals[0].decidedAt.slice(0, 10), "existing date field stays in sync with decidedAt");
});

test("approveMeritBatch records a decision timestamp alongside the existing date field", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  const ay = ds.activeAcademicYearByProgramme[prog.id];
  const c = makeReadyCandidate(ds, prog.id, ay, { id: "C7", piTotal: 34, slatScore: 80 });
  setApvScore(ds, "C7", 8, prog.id, ay);

  const { batch } = runMeritProcessing(ds, { programmeId: prog.id, academicYearId: ay, cycleId: undefined, category: "OPEN", criteria: "count", value: 5, waitingSize: 0 });
  assert.ok(batch, "a merit batch must be created for a non-empty pool");

  approveMeritBatch(ds, batch.id, 0, "approved", "");
  assert.equal(batch.approvals[0].status, "approved", "decision value is unchanged");
  assert.ok(batch.approvals[0].decidedAt, "decision timestamp recorded");
  assert.equal(batch.approvals[0].date, batch.approvals[0].decidedAt.slice(0, 10), "existing date field stays in sync with decidedAt");
});

test("approvePanelist records a decision timestamp per level without changing the approval string values", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });

  const saved = savePanelist(ds, { name: "Dr. Test", email: "t@x.com", programmeIds: [prog.id] });
  const p = ds.panelists.find((x) => x.id === saved.id);
  assert.deepEqual(p.approval, ["pending", "pending"], "default panelist approval chain has 2 levels");

  approvePanelist(ds, p.id, 0, "approved");
  assert.equal(p.approval[0], "approved", "approval value itself must stay the plain string other code compares against");
  assert.ok(p.approvalDecidedAt && p.approvalDecidedAt[0], "level 0 decision time recorded");
  assert.equal(p.approvalDecidedAt[1], undefined, "level 1 still pending, no time recorded yet");

  approvePanelist(ds, p.id, 1, "approved");
  assert.equal(p.approval[1], "approved");
  assert.ok(p.approvalDecidedAt[1], "level 1 decision time recorded");
});

test("fmtDateTime formats an ISO timestamp and returns empty string for no value", () => {
  assert.equal(fmtDateTime(null), "");
  assert.equal(fmtDateTime(""), "");
  assert.ok(fmtDateTime("2026-09-10T10:15:00.000Z").length > 0);
});

// Feedback: Panelist Allocation needs a way to undo assignPanelist.
function makeSessionWithGroup(ds, overrides) {
  const session = {
    id: "S1", programmeId: "P1", academicYearId: "AY1", date: "2026-01-01",
    startTime: "10:00 AM", endTime: "11:00 AM",
    groups: [{ id: "G1", name: "Group 1", capacity: 5, candidateIds: [], zoomRoom: { id: "ZR1", link: "", panelistIds: [] }, ...overrides }]
  };
  ds.sessions.push(session);
  return session.groups[0];
}

test("unassignPanelist removes an unscored panelist from the group", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { zoomRoom: { id: "ZR1", link: "", panelistIds: ["PAN1"] } });

  const res = unassignPanelist(ds, "S1", "G1", "PAN1");
  assert.ok(res.ok);
  const group = ds.sessions[0].groups[0];
  assert.ok(!group.zoomRoom.panelistIds.includes("PAN1"));
});

test("unassignPanelist refuses once the panelist has scored a candidate in the group", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { candidateIds: ["C1"], zoomRoom: { id: "ZR1", link: "", panelistIds: ["PAN1"] } });
  const c = makeReadyCandidate(ds, "P1", "AY1", { id: "C1", piTotal: null });
  c.piScores = { PAN1: { technical: 10 } };

  const res = unassignPanelist(ds, "S1", "G1", "PAN1");
  assert.ok(res.error);
  assert.ok(ds.sessions[0].groups[0].zoomRoom.panelistIds.includes("PAN1"), "refused unassign must not touch panelistIds");
});

test("unassignPanelist errors when the panelist isn't assigned to the group", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { zoomRoom: { id: "ZR1", link: "", panelistIds: ["PAN2"] } });

  const res = unassignPanelist(ds, "S1", "G1", "PAN1");
  assert.ok(res.error);
});

function makePanelistForm(overrides) {
  return {
    salutation: "Dr.", name: "Test Panelist", email: "tp@test.local", mobile: "9800000000", linkedin: "",
    type: "Internal", qualifications: "PhD", organization: "Org", designation: "Professor",
    industryYears: 3, academicYears: 3, programmeIds: [], imageDataUrl: null, remarks: "N/A",
    ...overrides
  };
}

// FB-PANELISTS-01: panelist creation no longer offers a New/Existing choice or a required programme
// pick — a panelist is institute-global by default, so an empty programmeIds selection must be valid.
test("savePanelist records instituteId and allows an empty programmeIds (institute-global panelist)", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });

  const res = savePanelist(ds, makePanelistForm({ instituteId: inst.id }));
  assert.ok(res.ok);
  const p = ds.panelists.find((x) => x.id === res.id);
  assert.equal(p.instituteId, inst.id);
  assert.deepEqual(p.programmeIds, []);
});

test("savePanelist on an existing panelist replaces programmeIds outright rather than merging", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog1 = createProgramme(ds, { instituteId: inst.id, name: "Programme 1", code: "P1" });
  const prog2 = createProgramme(ds, { instituteId: inst.id, name: "Programme 2", code: "P2" });

  const created = savePanelist(ds, makePanelistForm({ instituteId: inst.id, programmeIds: [prog1.id] }));
  savePanelist(ds, makePanelistForm({ programmeIds: [prog2.id] }), created.id);
  const p = ds.panelists.find((x) => x.id === created.id);
  assert.deepEqual(p.programmeIds, [prog2.id], "edit replaces the selection, it doesn't union with the old one");
});

// A panelist with no programmes selected is available to every programme of their own institute,
// but not to another institute's programme.
test("panelistServesProgramme treats a global (no-programmeIds) panelist as available institute-wide only", () => {
  const ds = generateDataset();
  const instA = createInstitute(ds, { name: "Institute A", code: "IA" });
  const instB = createInstitute(ds, { name: "Institute B", code: "IB" });
  const progA = createProgramme(ds, { instituteId: instA.id, name: "Programme A", code: "PA" });
  const progB = createProgramme(ds, { instituteId: instB.id, name: "Programme B", code: "PB" });

  const res = savePanelist(ds, makePanelistForm({ instituteId: instA.id, programmeIds: [] }));
  const p = ds.panelists.find((x) => x.id === res.id);

  assert.ok(panelistServesProgramme(ds, p, progA.id), "global panelist covers every programme in their own institute");
  assert.ok(!panelistServesProgramme(ds, p, progB.id), "global panelist does not leak into another institute's programme");
});

// Sample-data panelists predate the instituteId field and only ever carried programmeIds — their
// institute must still be derivable without a data migration.
test("panelistInstituteId falls back to a linked programme's institute when instituteId is absent", () => {
  const ds = generateDataset();
  const inst = createInstitute(ds, { name: "Test Institute", code: "TI" });
  const prog = createProgramme(ds, { instituteId: inst.id, name: "Test Programme", code: "TP" });
  ds.panelists.push({ id: "P-legacy", name: "Legacy Panelist", programmeIds: [prog.id] });

  const p = ds.panelists.find((x) => x.id === "P-legacy");
  assert.equal(panelistInstituteId(ds, p), inst.id);
});

// Feedback: Zoom Rooms "Send Notification" — candidates have no email field on file, so mails go to
// a placeholder@example.invalid address (see placeholderCandidateEmail's ponytail comment).
test("sendGroupMeetingNotification sends one mail per candidate with link/session/slot in the body", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { candidateIds: ["C1", "C2"], zoomRoom: { id: "ZR1", link: "https://zoom.us/j/123", panelistIds: ["PAN1"] } });
  makeReadyCandidate(ds, "P1", "AY1", { id: "C1" });
  makeReadyCandidate(ds, "P1", "AY1", { id: "C2" });
  const before = ds.sentMails.length;

  const res = sendGroupMeetingNotification(ds, "S1", "G1");

  assert.ok(res.ok);
  assert.equal(res.sent, 2);
  assert.equal(ds.sentMails.length, before + 2);
  const mails = ds.sentMails.slice(before);
  assert.equal(mails[0].to, placeholderCandidateEmail({ id: "C1" }));
  assert.equal(mails[1].to, placeholderCandidateEmail({ id: "C2" }));
  for (const mail of mails) {
    assert.ok(mail.body.includes("https://zoom.us/j/123"), "body must include the meeting link");
    assert.ok(mail.body.includes("Group 1"), "body must include the group name");
    assert.ok(mail.body.includes("10:00 AM") && mail.body.includes("11:00 AM"), "body must include the slot (session start-end)");
  }
});

test("sendGroupMeetingNotification refuses when the group has no saved link", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { candidateIds: ["C1"], zoomRoom: { id: "ZR1", link: "", panelistIds: ["PAN1"] } });
  const before = ds.sentMails.length;

  const res = sendGroupMeetingNotification(ds, "S1", "G1");

  assert.ok(res.error);
  assert.equal(ds.sentMails.length, before, "refusal must not send any mail");
});

test("sendGroupMeetingNotification refuses when the group has no candidates", () => {
  const ds = generateDataset();
  makeSessionWithGroup(ds, { candidateIds: [], zoomRoom: { id: "ZR1", link: "https://zoom.us/j/123", panelistIds: ["PAN1"] } });
  const before = ds.sentMails.length;

  const res = sendGroupMeetingNotification(ds, "S1", "G1");

  assert.ok(res.error);
  assert.equal(ds.sentMails.length, before, "refusal must not send any mail");
});
