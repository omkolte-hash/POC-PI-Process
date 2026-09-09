# Geta Admission Workflow Platform — Prioritized Epic Backlog

**Source:** SRS v5.2 (03 Sep 2026)
**Owner:** Product Manager
**Date:** 2026-09-04

> **`[NEEDS-APPROVAL]`** — The PRD epic below and the companion `ARCH-APPROVAL.md`
> require human sign-off before build begins. Everything downstream inherits the
> blockers listed there.

---

## How to read this backlog

- **Priority tiers** follow the SRS §10.4 build order, not raw impact/effort scoring.
  The build order is already decided; these tiers reflect it. Within a tier, epics
  are ordered by dependency.
- **Blocking vs. advisory** — a *blocking* open question means the epic cannot be
  built (or cannot be built correctly) until a human resolves it. *Advisory* means
  the team can proceed on a stated assumption but should confirm.
- **FR coverage** lists the effective-v1 requirements. Deferred FRs (import UI:
  FR-ING-005, 019, 020-screen, 024-028) are noted but not scheduled.
- Epics are the "what and why." **User stories and acceptance criteria at the story
  level are the Business Analyst's job** — the acceptance criteria here are
  epic-level completion signals, not story ACs.

---

# `[NEEDS-APPROVAL]` EPIC-000 — Product vision, scope, and blocking decisions

**Priority:** P0 (gate — nothing ships without this signed off)

## Vision

A multi-tenant platform where an institute configures and runs its own admission
selection process on a visual canvas, with zero custom code per tenant. The
organising model is a spreadsheet: every candidate admission is a row, import
establishes the columns, and every component thereafter adds columns or reads
columns and writes a decision. Two institutes with entirely different processes
run on one codebase.

## Goals (v1)

- Configuration over code: candidate schema, assessment types, rubrics, merit
  bands, partitions, approval chains, and the process graph are all data.
- One shared condition engine across ten consumers (import filters through data-scope
  enforcement), with in-memory and SQL execution from one grammar.
- A bounded directed-graph workflow engine — nodes, outcome-keyed edges, conditions,
  versions, instances. **Not** a general process engine.
- Preview-before-commit and lock-once-consumed on every cohort operation that can
  harm a candidate (import, shortlist, scoring, merit, seat conversion).
- Full tenant isolation via a base repository layer, including scripted data loads.

## Non-goals (v1, per SRS §1.4)

Offline assessment delivery; candidate self-service portal; field verification
(documents only); data import configuration UI (engine only, script-driven); fee
payment processing; scheduled ingestion; DB row-level security (repository-layer
enforced instead); multiple roles per user.

## BLOCKING decisions the human must resolve before build (SRS §8)

| Ref | Decision | Why it blocks | Blast radius |
|---|---|---|---|
| **A-3 / R-26** | **Document storage** — where and how candidate documents are held. No decision exists. | Determines retention, residency, and whether Geta is a data processor. Widened by R-29 to cover sample data in unpublished drafts. **"Required before build, not after real documents exist."** | Document collection, verification, print, and the sample-data feature of the builder. |
| **A-6 / R-30** | **Builder starting point** — is an institute's first flow assembled by Geta *with* them, or from a supplied template they adjust? | Determines whether this is a self-service or a configured product, and is the primary mitigation for R-17 (config complexity). | Workflow builder scope, onboarding, and how much guardrail tooling is needed. |
| **§8.3** | **Continuous recompute vs. input locking** — the prototype recomputes outcome after every mutation; FR-SCR-026 locks scoring inputs on commit. **Mutually exclusive.** | Defines the fundamental correctness model of scoring/merit and the meaning of "committed." | Scoring, merit, reopen/correction, and the entire staleness-propagation design. |
| **P-03** | **Per-user data scope placeholders** | Blocks "coordinator sees own sessions" and "scorer sees own candidates." | Attendance, score capture, reports, and row-level data-scope enforcement in the condition engine. |

## ADVISORY / watch-list open questions

- **ADR-026** (candidate access) — no longer needed for document collection; only
  returns if slot booking or online offer acceptance come back into scope. **Watch.**
- **WF-1** (mid-cycle workflow version migration) — no migration path defined for
  candidates already past a changed node. Advisory for v1 (one workflow per institute,
  version binding at cycle start), but must be answered before a second version publishes.
- **Document collection blocking vs. pass-through** (§8.2) — does a candidate stall
  awaiting required documents, or pass through to be caught by Verification's blocking
  flag? Affects EPIC-201/EPIC-102 behaviour.
- Per-component gaps (§8.2): verification resubmission loop; scheduling capacity
  block-vs-warn; score-capture panel-roster mid-session changes; approval quorum /
  send-back / expiry / delegation; panelist email-existence disclosure.

## Acceptance criteria (epic-level)

- Human sign-off recorded on A-3, A-6, §8.3, and P-03 before any dependent epic starts.
- Vision, goals, non-goals, and the blocking-decision table are approved as written or
  amended.
- Watch-list items are acknowledged with an owner and a "decide-by" trigger.

---

# Foundation epics (P0) — unblock everything

These carry no admission business logic but every pipeline epic depends on them.
Build order within P0: EPIC-001 → 002 → 003 → 004 → 005 → 006 → 007.

---

## EPIC-001 — Authentication, identity & RBAC

**Priority:** P0

Permission-based auth with no fixed role names; an institute composes roles from a
permission catalogue. Authorisation resolves per request from the DB (never from the
token), fails closed, and re-verifies membership every request.

**Key FRs:** NFR-SEC-002, NFR-SEC-003, NFR-SEC-004; supports the permission model
underlying FR-VER-007, FR-ATT-002, FR-APR-002/006, and every "any role holding the X
permission" clause. Machine-client credentials NFR-SEC-006 (issued here, consumed in EPIC-201).

**Acceptance criteria:**
- Roles are composed from a permission catalogue; no code references a fixed role name.
- Authorisation is resolved per request from the DB and cached on user+institute, never in the token.
- Authorisation fails closed; membership is re-verified per request.
- Single account, multiple memberships (needed for FR-ASM-039 panelist reuse).

**Dependencies:** none.
**Blocking questions:** none. (R-15/R-16 cache-invalidation and token-expiry are design risks, not blockers.)

---

## EPIC-002 — Multi-tenancy & base repository layer

**Priority:** P0

Institute A must never access Institute B's data. An immutable, invisible institute
lock is injected by a base repository layer, not by individual queries. **All** write
paths — including scripted loads — route through this layer.

**Key FRs:** NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, FR-GC-006, FR-EDC-002, FR-ING-030.

**Acceptance criteria:**
- Every read and write is institute-scoped by the base repository layer, with no per-query opt-in.
- The institute lock is invisible and immutable to institute admins.
- No code path writes candidate data outside the repository layer (enforces FR-ING-030 / R-14).
- Machine clients are scoped to one institute and isolated identically to user sessions.

**Dependencies:** EPIC-001.
**Blocking questions:** none. **Highest-severity risk mitigation** — R-07, R-14 (HIGH). Non-optional.

---

## EPIC-003 — Platform administration (Geta super admin)

**Priority:** P0

Geta super admin manages institutes and the component catalogue. Top of the tenancy
tree; the surface from which institutes are provisioned.

**Key FRs:** SRS §3 (Geta super admin: "manage institutes and catalogue"). No component-level FR block; this is platform scaffolding above FR-GC-*.

**Acceptance criteria:**
- Super admin can create, list, and manage institutes.
- Super admin manages the component catalogue available to institutes.
- Super admin actions are audited (depends on EPIC-006).

**Dependencies:** EPIC-001, EPIC-002.
**Blocking questions:** none.

---

## EPIC-004 — Global configuration: institute, programme, cycle setup

**Priority:** P0

The scoping hierarchy every other component operates within: programmes (self-referencing,
arbitrary depth) → academic years → admission cycles (multiple concurrent). Operational
views are gated on an active round.

**Key FRs:** FR-GC-001 through FR-GC-007.

**Acceptance criteria:**
- Programmes nest to arbitrary depth via self-reference; academic years and cycles hang off them.
- Multiple concurrent cycles under one academic year; opening one never requires closing another.
- Cycle status draft/active/closed; all config entities institute-scoped.
- No operational stage is presented to a user whose scope has no active round (FR-GC-007).

**Dependencies:** EPIC-002.
**Blocking questions:** none.

---

## EPIC-005 — Candidate management

**Priority:** P0

Owns candidate and candidate-admission records after import commit; the canonical data
source for every downstream component. A person and their application are separate
entities (one person → many admissions).

**Key FRs:** FR-CND-001 through FR-CND-008.

**Acceptance criteria:**
- Candidate (identity) and candidate-admission (per-cycle journey) are separate records.
- Profile shows all schema fields, computed columns, and provenance; workflow trace shows steps/current/outcomes.
- Field masking applies per requesting user's authorisation.
- Manual edits recorded as revisions with actor and reason; candidate columns exposed as canonical source.

**Dependencies:** EPIC-002; feeds from EPIC-101 (import) at commit.
**Blocking questions:** none.

---

## EPIC-006 — Audit (baseline + hardening)

**Priority:** P0

Append-only, non-deletable audit for every consequential operation, capturing actor,
action, entity, before/after, reason, workflow version, and execution id. Built early,
hardened after import lands (per §10.4 "audit hardening" slot).

**Key FRs:** FR-AUD-001 through FR-AUD-006; NFR-AUD-001.

**Acceptance criteria:**
- Every consequential operation writes an audit entry with the full FR-AUD-002 field set.
- Log is append-only and non-deletable.
- Authorised query by actor, entity, action, date range.
- Overrides, reverts, reopens, seat conversions, and approval decisions are audited without exception.

**Dependencies:** EPIC-001, EPIC-002.
**Blocking questions:** none.

---

## EPIC-007 — Condition engine (shared, dual-execution)

**Priority:** P0 — **build early; ten components depend on it (§10.4).**

One expression evaluator (JsonLogic-serialised) for ten consumers, with in-memory
evaluation against a single candidate and SQL-predicate compilation for row filtering
and data-scope enforcement — both derived from one grammar so no divergent
implementations exist.

**Key FRs:** FR-CND-ENG-001 through FR-CND-ENG-007.

**Acceptance criteria:**
- Conditions persist in a documented serialisation supporting nested AND/OR/NOT over typed predicates.
- In-memory and SQL-compiled paths derive from one grammar; no second evaluator exists (FR-CND-ENG-004).
- No dynamic code execution; operators are an explicit allow-list derived per field data type.
- A condition referencing an absent field is rejected at validation time.

**Dependencies:** EPIC-002, EPIC-005 (needs a schema to validate against).
**Blocking questions:** none directly; **P-03** (data-scope placeholders) blocks the
row-level-data-scope *consumer* of this engine, not the engine itself.

---

# Core pipeline epics (P1) — the core loop

Import → workflow model → shortlist → approval. The minimum loop that moves a candidate
through a configured graph.

---

## EPIC-101 — Data import service layer (script-driven)

**Priority:** P1

CSV parsing, schema inference, multi-dataset join engine, filtering, mapping/transforms,
preview, and identity-resolved commit — all through the service layer, invoked by script.
**The configuration UI is descoped**; the engine is fully in scope and accepts the same
config structure the future UI will emit.

**Key FRs:** FR-ING-001–004, 006–018, 021–023, 029, 030, 031.
**Deferred (not scheduled):** FR-ING-005, 019, 024–028, and the *screen* form of FR-ING-020 (preview remains as a script mode).

**Acceptance criteria:**
- Parse CSV, infer types, build and normalise a schema; chainable joins with per-join type and duplicate/unmatched handling.
- Single + nested AND/OR filters; ordered mappings and the full transform set (FR-ING-016).
- Preview runs the full pipeline with nothing persisted; commit creates/matches candidate then creates admission for the target cycle.
- Identity resolution strategy applied per FR-ING-022; per-record lineage and per-field provenance recorded.
- Loading runs entirely through the service layer (FR-ING-030); config structure matches the future UI's output (FR-ING-031).

**Dependencies:** EPIC-002, EPIC-005, EPIC-007.
**Blocking questions:** none blocking. **Advisory:** R-28 (developer-ticket burden) — recommend UI returns immediately after v1, before a second institute onboards.

---

## EPIC-102 — Workflow data model + simple executor

**Priority:** P1

A bounded directed graph of component instances with outcome-keyed edges, optional edge
conditions, immutable published versions, and per-candidate instances. Guarded state
machines for lifecycle/step/run state. **Build the model and a simple executor first;
harden against real components as they land — do not build the full engine up front.**

**Key FRs:** FR-WFE-001–017. (FR-WFE-018–029 — run-time params, cohort/individual
execution, and builder node-testing — split to EPIC-103 as they need the builder UI.)

**Acceptance criteria:**
- Workflow is a directed graph; edges keyed by outcome; each node has a default outgoing edge.
- Pre-publication validation verifies every node's required input columns are produced upstream; rejects unreachable nodes / missing inputs.
- Publication produces an immutable version; a cycle binds a version at execution start and running cycles stay on their bound version.
- Lifecycle, step, and run state are guarded state machines (viewflow.fsm); invalid transitions are rejected, not ignored (FR-WFE-016/017).
- Engine orchestrates only — no component internals (FR-WFE-013); bounded per FR-WFE-015 (R-22 mitigation).

**Dependencies:** EPIC-004, EPIC-005, EPIC-007, EPIC-006.
**Blocking questions:** **WF-1** (mid-cycle version migration) — advisory for v1; must resolve before a second version publishes.

---

## EPIC-103 — Workflow builder: design/run-time params, cohort/individual, node testing

**Priority:** P1

The design-time authoring surface and its execution semantics: distinguishing frozen
design-time shape from operator-supplied run-time parameters, cohort vs. individual
execution (relative rules refuse a pool of one), and in-builder node testing against
sample data.

**Key FRs:** FR-WFE-018–029.

**Acceptance criteria:**
- Design-time settings freeze at publication; run-time params are constrained to the design shape (operator changes the value, never the column — FR-WFE-019) and recorded against the execution.
- Nodes support cohort and individual execution; relative-rule nodes refuse individual execution with a stated reason (FR-WFE-022); absolute-rule nodes yield the same outcome individually as in cohort (FR-WFE-023).
- Admin can test a single node and a connected sequence against uploaded sample data, seeing output/outcome per row and the path each row takes at each branch.
- Node testing never touches real candidate records; sample data lives only on the unpublished draft, is discardable, and is discarded on publication.

**Dependencies:** EPIC-102.
**Blocking questions:** **A-3 / R-29 (BLOCKING for the sample-data feature)** — sample
data is candidate-shaped and falls under the same storage/retention decision as documents.
**A-6 / R-30** shapes the builder's starting point (self-service vs. template).

---

## EPIC-104 — Shortlist

**Priority:** P1

Categorises every candidate in a cycle into ordered configured groups by condition, in a
single cohort-wide run, with a mandatory default group and optional rank spec. Preview
before commit; submit to approval; clearable on rejection.

**Key FRs:** FR-SHL-001 through FR-SHL-015.

**Acceptance criteria:**
- Ordered groups with condition-engine assignment; candidate lands in the first matching group; mandatory default group with no condition.
- Single cohort-wide run assigns each candidate to exactly one group; rank spec resolves count/cutoff conditions deterministically.
- Pre-commit preview shows counts per group and members; commit persists; assignment readable downstream as a candidate column.
- Committed run goes to approval (bypassable); rejection clears all assignments and restores pre-run state; effective downstream only on approval or bypass.

**Dependencies:** EPIC-005, EPIC-007, EPIC-102, EPIC-105 (approval).
**Blocking questions:** **§8.3** (recompute vs. lock) — affects what "restore pre-run state" means. **R-18** mitigation (preview + lock) is load-bearing.

---

## EPIC-105 — Approval (generic decision gate)

**Priority:** P1

A subject-agnostic ordered approval chain attachable to any node, enabled/bypassable per
node, with immutable per-decision history. Consumed by shortlist, assessment drafts,
panelist onboarding, merit batches, and promotions.

**Key FRs:** FR-APR-001 through FR-APR-018.

**Acceptance criteria:**
- Ordered chain of one-or-more levels; each level names approvers by permission and/or user; chain attaches per node and is reusable; enable/bypass per node.
- Accepts a request from any component (item ref + originating node); presents full item content; approve/deny with mandatory deny remark.
- Levels clear strictly in order; denial terminates and notifies the origin; approved only when every level clears; origin notified on final approval.
- Per-decision record (approver, level, decision, remark, timestamp) is immutable; pending reported by level/age/node.

**Dependencies:** EPIC-001, EPIC-006, EPIC-102.
**Blocking questions:** **Advisory (§8.2):** quorum when a level names several approvers, send-back to an earlier level, request expiry, delegation — all undefined.

---

# Assessment cluster epics (P2)

Document collection → verification → assessment definition → scheduling → score capture →
attendance → scoring. Where candidates are evaluated.

---

## EPIC-201 — Document collection (authenticated API)

**Priority:** P2

An authenticated API accepting documents for existing candidate admissions, pushed by the
institute's portal or another system. The platform authenticates the *calling system*, not
the student — the institute owns applicant authentication (stated trust boundary).

**Key FRs:** FR-EDC-001 through FR-EDC-018; NFR-SEC-006 (isolation); FR-EDC-003 credential lifecycle audited (EPIC-006).

**Acceptance criteria:**
- Authenticated endpoint accepts submissions for existing admissions; service credentials scoped to one institute, conferring no user identity.
- Admin can issue/list/rotate/revoke credentials (each audited); configure accepted types (required/optional), formats, size, identity key, collection window, replace-vs-revision, and rate limits.
- Rejects submissions matching zero or >1 admission, unconfigured types, constraint violations, and out-of-window; rejected submissions logged with reason, no partial records.
- Returns a receipt; records client identity/timestamp/source; tracks per-candidate required-type receipt; exposes documents to verification; reports complete/incomplete + missing types.

**Dependencies:** EPIC-001 (credentials), EPIC-002, EPIC-005.
**Blocking questions:** **A-3 / R-26 (BLOCKING)** — document storage undecided. **Advisory:** blocking-vs-pass-through (§8.2); R-27 trust-boundary (stated assumption).

---

## EPIC-202 — Verification (documents only)

**Priority:** P2

A decision gate that verifies collected documents and applies configured outcome actions
(proceed / reject / reassign a field value). Not a boolean gate — a failed check may
reclassify rather than reject. **Field verification is out of scope.**

**Key FRs:** FR-VER-001, 003–019. (FR-VER-002 withdrawn.)

**Acceptance criteria:**
- Verification items target documents; grouped into unified or separate queues; each blocking or non-blocking for stage exit.
- Per-result outcome actions: proceed unchanged / reject / reassign a configured target field to a configured value.
- Any role with the verification permission decides; separate override permission advances past a blocking unresolved item; every override recorded (actor/time/reason), non-deletable.
- Item decided by a single verifier, one at a time, valid/invalid with mandatory reason on invalid; candidate cannot exit until all blocking items decided (or authorised override); status reported per cycle.

**Dependencies:** EPIC-201, EPIC-005, EPIC-007, EPIC-102.
**Blocking questions:** **Advisory (§8.2):** claimed-value checks with no document have no v1 home; resubmission-loop mechanics undefined.

---

## EPIC-203 — Assessment definition & rubric

**Priority:** P2

Configuration surface (not a node) read by scheduling and score capture. Owns what gets
scored and by whom: assessment records (extensible type catalogue, panel size, total
marks, score-entry model) and rubrics (per-parameter weightage, per-parameter scoring
authorisation, draft/approval).

**Key FRs:** FR-ASM-001–008, 010–025, 063–067, 082.

**Acceptance criteria:**
- Assessments scoped to a programme; type from an extensible catalogue (not fixed to interview/GD/test); capture name/code/type/sequence/panel size/total marks/score-entry model.
- Rubric parameters carry name/sequence/max weightage/allow-zero/allow-decimal, and specify the role or permission authorised to score each; one rubric may mix scorers, including non-panel.
- Scorers see only parameters they may score; aggregate computed only when every parameter is scored by an authorised scorer; assessment outputs raw scores attributed to parameter/scorer/candidate.
- Parameter changes write to a draft; draft submission invokes approval; merges to live only on full approval; rubric locks once any score is recorded.

**Dependencies:** EPIC-004, EPIC-105.
**Blocking questions:** none blocking. R-17 (config complexity) mitigation via templates/defaults.

---

## EPIC-204 — Panelist management

**Priority:** P2

Panelists are users with a membership, never a separate entity type. Onboarding invokes
approval (bypassable); credentials provisioned only after approval; profile captures
professional context and internal/external classification.

**Key FRs:** FR-ASM-038, 039, 040, 041, 079, 080.

**Acceptance criteria:**
- Panelists are users-with-membership; an existing global email gets a new membership, not a second account.
- Onboarding invokes approval with configurable, bypassable levels; credentials provisioned only after approval.
- Profile captures the FR-ASM-079 field set; classifiable internal/external.

**Dependencies:** EPIC-001, EPIC-105.
**Blocking questions:** **Advisory (§8.2):** email-existence disclosure on linking is an information-disclosure concern.

---

## EPIC-205 — Scheduling & allocation

**Priority:** P2

Places eligible candidates into sessions/groups, staffs groups with approved panelists,
and resolves meeting links via a provider-agnostic interface. Sessions/groups/panels/links
are internally-managed resources, not workflow input.

**Key FRs:** FR-ASM-027–037, 042–045, 054–056, 075–078, 085.

**Acceptance criteria:**
- Sessions linked to assessments (date/times/reporting offset/capacity), divisible into capacity-validated groups; provider-agnostic meeting links generated only after a panelist is assigned.
- Allocation individually/batch/auto/by-move; one candidate → one group per assessment; per-candidate assessment id from group code + running number; configurable eligibility condition (default: cleared preceding node).
- Only fully-approved panelists assignable; rejects over-panel-size, duplicate, and time-overlapping assignments; pre-allocation capacity check blocks on shortfall.
- Reallocation only for unmarked/absent candidates; bulk reallocation with mandatory comment; reallocation report; moving a candidate clears prior group's scores/notes/locks.

**Dependencies:** EPIC-203, EPIC-204, EPIC-102, EPIC-007.
**Blocking questions:** **Advisory (§8.2):** capacity check block-vs-warn; slot-booking parked. **R-01** (provider rate limits → async queued creation).

---

## EPIC-206 — Score capture

**Priority:** P2

Captures raw scores against the rubric. Two entry paths: panel scorers via the group
queue, non-panel scorers via a cycle-scoped list. Reads attendance live; outputs raw
scores only — combination/scaling belong to scoring/merit.

**Key FRs:** FR-ASM-046–053, 057–062, 081, 083, 084, 086, 087.

**Acceptance criteria:**
- Scorer sees upcoming/in-progress groups and an ordered candidate queue with configurable context columns; running total shown as parameters are scored; free-text remark per candidate per scorer.
- All three score-entry models supported; independent model hides other scorers' values until all submit and aggregates only when all submit; shared/deliberated models use a designated lead.
- Every authorised parameter scored before advancing; submitted score locked from the scorer UI; configurable immediate-lock vs. deferred-confirm commit; partial entry retained as draft under deferred commit.
- Reads attendance live: absent candidates skipped and excluded from aggregate; unmarked candidates shown with explicit indication; revert only via reopen.

**Dependencies:** EPIC-203, EPIC-205, EPIC-207 (attendance read), EPIC-208 (reopen).
**Blocking questions:** **P-03 (BLOCKING for "scorer sees own candidates")**. **Advisory (§8.2):** panel-roster mid-session change; open-pace scorers holding candidates incomplete.

---

## EPIC-207 — Attendance

**Priority:** P2

Records attendance state per candidate per assessment and exposes it as candidate columns.
Records state only — never alters outcome. Coordinators (users-with-membership) mark only
their assigned sessions/groups.

**Key FRs:** FR-ATT-001 through FR-ATT-028.

**Acceptance criteria:**
- Captured against session+group by any role with the attendance permission; configurable state set (present/absent mandatory, plus late/excused/rescheduled etc.); configurable reason-required for non-present.
- Records state + actor + timestamp; state only, never alters outcome; corrections need a correction permission (audited), and post-consumption corrections go via reopen.
- Coordinators are users-with-membership assigned to sessions/groups, see only their own, join via meeting link, and are rejected for unassigned sessions; identity recorded per mark.
- Per-assessment independence in multi-assessment sessions; derived overall-present and partially-attended states; per-session (and per-assessment) report; states exposed as downstream candidate columns; bulk marking where permitted.

**Dependencies:** EPIC-205, EPIC-102.
**Blocking questions:** **P-03 (BLOCKING for "coordinator sees own sessions")**.

---

## EPIC-208 — Reopen & correction (lifecycle capability)

**Priority:** P2 (must precede scoring's lock semantics being useful)

The single sanctioned path for correcting locked data: reopen a completed step with a
mandatory reason, store the correction as a new revision, mark every downstream computed
column stale, and make affected components re-executable.

**Key FRs:** FR-RPN-001 through FR-RPN-008. Related: FR-ASM-060, FR-ATT-010, FR-SCR-027.

**Acceptance criteria:**
- Authorised reopen of a completed step for a candidate with a mandatory reason; records actor/prior-state/reason/timestamp immutably.
- Correction stored as a new revision preserving the prior value; never an overwrite.
- Every downstream computed column derived from the corrected input is identified and marked stale; stale values never served as current.
- Affected downstream components become re-executable; re-execution produces a new revision.

**Dependencies:** EPIC-006, EPIC-007; consumed by EPIC-206, EPIC-207, EPIC-209.
**Blocking questions:** **§8.3 (BLOCKING)** — recompute-vs-lock defines the whole
staleness model. **R-23** (missed downstream dependency serves stale-as-current) is load-bearing.

---

## EPIC-209 — Scoring

**Priority:** P2

Pure computation: transforms raw scores and candidate columns into a designated final
score via ordered formulas, conditional variants, and optional cohort normalisation.
Captures no human input. Readiness gate blocks on missing inputs (cohort: whole run;
individual: that candidate).

**Key FRs:** FR-SCR-001 through FR-SCR-037.

**Acceptance criteria:**
- Formula builder over existing columns writing named outputs; arithmetic/weighted/scaling/rounding + condition-engine conditionals; ordered execution; exactly one final score; forward/circular refs rejected.
- Conditional variants share one output column, ordered by priority with a mandatory default; per-candidate resolved variant recorded and counts reported pre-commit; readiness evaluated against the resolved variant's inputs only.
- Preview without persisting; commit persists and retains all intermediate columns + formula version; blocks execution while any candidate lacks a required input; reports unready candidates/variant/missing inputs; re-evaluable on demand.
- Cohort operations (off by default) after per-row formulas and before final designation, writing new columns and preserving raw; methods per FR-SCR-031; pre-commit raw-vs-adjusted distribution + rank-change display; inputs locked on commit; corrections only via reopen.

**Dependencies:** EPIC-203, EPIC-206, EPIC-007, EPIC-208.
**Blocking questions:** **§8.3 (BLOCKING)** — recompute-vs-lock (FR-SCR-026 vs. continuous
recompute). **R-18/R-20** mitigations (variant recording, raw preservation, rank-change display) are load-bearing.

---

# Outcome cluster epics (P3)

Merit → seat allocation → offer → communication → print. Turning scores into decisions
and artefacts.

---

## EPIC-301 — Merit

**Priority:** P3

Ranks eligible candidates within data-derived partitions, assigns ordered bands
(selected/waiting/excluded), and releases approved batches as a whole. Sequence numbers
continue across runs and never collide; waiting-band promotion in strict sequence order.

**Key FRs:** FR-MRT-001 through FR-MRT-024.

**Acceptance criteria:**
- Data-derived partition dimensions (composite or single pool); ordered bands with selection rules (headcount/threshold/proportion/combined/remainder); ordered rank spec with tie-breakers; eligibility condition.
- Per-partition run over unprocessed eligible candidates; contiguous band assignment; sequence numbers continue across runs without collision; selected-band candidates bundled into a batch.
- Pre-commit preview of band/rank; batch to approval; rejection returns all to pool with band/rank cleared; releasable only on approval; released whole (no partial).
- Configurable release-stamped field set; release records readable by print/communication/seats/offer; waiting promotion in strict sequence after ≥1 release, approval-required by default; read-only waiting-band view.

**Dependencies:** EPIC-209, EPIC-105, EPIC-302 (seat state read), EPIC-007.
**Blocking questions:** **§8.3** (recompute-vs-lock affects re-run semantics). **Advisory (§8.2):** cross-partition spillover beyond seat conversion.

---

## EPIC-302 — Seat allocation

**Priority:** P3

Tracks sanctioned intake, offered/accepted/admitted/vacant per partition, and manages
audited conversion of unfilled seats between partitions. Seat state is read back by merit
for waiting-list decisions. Conversion is irreversible in effect — preview/authorise/audit.

**Key FRs:** FR-SEA-001 through FR-SEA-014.

**Acceptance criteria:**
- Sanctioned intake per partition per cycle; tracks offered/accepted/admitted; derives vacant = sanctioned − admitted; exportable vacant-seat report.
- Condition-engine conversion rules (source/target/quantity-or-proportion) requiring explicit audited authorisation; pre-commit preview of resulting counts; reversible only via audited correction.
- Configurable break-even count per programme; admitted counts broken down by configurable columns.
- Hard seat limit prevents merit release beyond available seats; limit configurable as advisory instead; seat state readable by merit.

**Dependencies:** EPIC-004, EPIC-007, EPIC-006; two-way with EPIC-301.
**Blocking questions:** none blocking. **R-24** (irreversible conversion) — preview/authorisation/audit are the mitigation and must survive scope cuts.

---

## EPIC-303 — Offer

**Priority:** P3

Converts a released merit selection into an admission offer. Terminal in v1 — candidate-facing
acceptance is deferred pending the candidate-access decision, so only the institute-side
lifecycle executes.

**Key FRs:** FR-OFR-001 through FR-OFR-012 (viewed/accepted/declined unreachable in v1).

**Acceptance criteria:**
- Generates offers for a released merit batch; tracks the institute-side lifecycle (generated/released/revoked); template per programme merging candidate columns + release fields + programme config (e.g., fee schedule).
- Configurable per-programme fee structure referenced by templates; bulk generation filtered by release/deadline; select specific or all candidates; paginated.
- Generation recorded with actor/timestamp; revocation authorised and audited; offer state readable by seat allocation.

**Dependencies:** EPIC-301, EPIC-302, EPIC-004.
**Blocking questions:** **ADR-026 (watch)** — candidate-facing acceptance blocked on
candidate access; only returns if online acceptance comes back into scope.

---

## EPIC-304 — Communication

**Priority:** P3

An action node providing the sending mechanism (email in v1, channel-agnostic layer).
It does not decide *when* to send — workflow configuration does. Recipient selection via
the condition engine and preset workflow-state groups.

**Key FRs:** FR-COM-001 through FR-COM-014.

**Acceptance criteria:**
- Templates with candidate-column merge fields; email in v1 over a channel-agnostic layer; recipient selection via condition engine + preset groups (shortlisted/merit-listed/waitlisted).
- Manual send to a selected set; invokable as an action from any transition; rendered preview with sample merge data; recipient count shown; confirmation required above a configurable threshold.
- Per-message record (recipient/template/trigger/actor/timestamp/delivery status); history filterable; field masking applied to merge fields per triggering context; failed-delivery retry.

**Dependencies:** EPIC-005, EPIC-007, EPIC-102.
**Blocking questions:** none blocking.

---

## EPIC-305 — Print

**Priority:** P3

An action node generating templated documents (admit cards, offer letters, score sheets)
from candidate and release data, with optional machine-readable codes, bulk generation,
and field masking. Documents reflect data at generation time and record the revision used.

**Key FRs:** FR-PRN-001 through FR-PRN-012.

**Acceptance criteria:**
- Per-programme templates with candidate-column + release-field merge; generates admit cards/offer letters/score sheets; optional machine-readable identifier code.
- Bulk generation filtered by workflow state/release/session; select individual or all; configurable pagination; stable paginated printable output; score sheets per session/group/scorer.
- Generation events recorded (actor/template/set/timestamp); field masking per authorisation; documents reflect generation-time data and record the revision used.

**Dependencies:** EPIC-005, EPIC-301, EPIC-102.
**Blocking questions:** **A-3 / R-26 (advisory here)** — generated-document storage falls under the same storage decision.

---

# Reporting & ops epics (P4)

---

## EPIC-401 — Reports

**Priority:** P4

A read layer over component output columns via a schema registry (never cross-module table
access). Operational dashboard, attendance/seat/candidate/score/approval/reallocation
reports, CSV + printable export, respecting data scope, field masking, and staleness flags.

**Key FRs:** FR-RPT-001 through FR-RPT-016; NFR-MNT-001.

**Acceptance criteria:**
- Live per-cycle dashboard with the FR-RPT-002 per-partition counts; attendance/seat/candidate/score/approval/reallocation reports as specified.
- All reports export to CSV and a printable format; optional graphical aggregates; configurable pagination.
- Reports respect report-subset authorisation, data scope, and field masking; read via a schema registry, not direct cross-module tables (NFR-MNT-001); staleness-flagged columns indicated.

**Dependencies:** all producing epics (EPIC-101 through EPIC-305), EPIC-007 (data scope).
**Blocking questions:** **P-03** (data scope) affects per-user report scoping.

---

## Epic dependency summary

```
P0:  001 → 002 → 003
                 ├→ 004 → (pipeline scoping)
                 ├→ 005 ←── import commit (101)
                 ├→ 006 (audit, hardened after 101)
                 └→ 007 (condition engine, early)

P1:  101 (import) ──→ 005
     102 (wf model) ──→ 004,005,006,007
     103 (builder)  ──→ 102          [A-3/R-29 blocks sample data]
     104 (shortlist)──→ 005,007,102,105
     105 (approval) ──→ 001,006,102

P2:  201 (doc collect) ──→ 001,002,005     [A-3/R-26 BLOCKING]
     202 (verify)      ──→ 201,102,007
     203 (assessment)  ──→ 004,105
     204 (panelist)    ──→ 001,105
     205 (scheduling)  ──→ 203,204,102,007
     206 (score cap)   ──→ 203,205,207,208 [P-03 blocks own-candidates]
     207 (attendance)  ──→ 205,102          [P-03 blocks own-sessions]
     208 (reopen)      ──→ 006,007          [§8.3 BLOCKING]
     209 (scoring)     ──→ 203,206,207,208  [§8.3 BLOCKING]

P3:  301 (merit) ⇄ 302 (seats) ; 303 (offer) ; 304 (comm) ; 305 (print)
P4:  401 (reports) ──→ everything upstream  [P-03 affects scoping]
```

## Blocking-question rollup (which epics cannot proceed until resolved)

| Open question | Type | Epics gated |
|---|---|---|
| **A-3 / R-26** document storage | BLOCKING | EPIC-201 (fully), EPIC-103 (sample data), EPIC-305 (advisory) |
| **§8.3** recompute vs. input locking | BLOCKING | EPIC-208, EPIC-209; affects EPIC-104, EPIC-301 |
| **P-03** per-user data scope | BLOCKING (feature-level) | EPIC-206 (own candidates), EPIC-207 (own sessions), EPIC-401 (scoped reports) |
| **A-6 / R-30** builder starting point | BLOCKING (scope-level) | EPIC-103 (builder shape / onboarding) |
| **WF-1** mid-cycle version migration | Advisory (v1) | EPIC-102 (before 2nd version publishes) |
| **ADR-026** candidate access | Watch | EPIC-303 (only if online acceptance returns) |
