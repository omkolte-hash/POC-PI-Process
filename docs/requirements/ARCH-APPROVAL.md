# `[NEEDS-APPROVAL]` Architecture Approval Ticket

**Source:** SRS v5.2 (03 Sep 2026), §8 and §10
**Owner:** Product Manager → System Architect (after sign-off)
**Date:** 2026-09-04

> **`[NEEDS-APPROVAL]`** — This ticket must be signed off by a human before the
> System Architect designs the modules. It has two parts:
> **(A)** decisions already made in the SRS that need confirmation, and
> **(B)** open questions that must be resolved before (or during) architecture work.
> The architect should not start module design until Part B's blocking items are answered.

---

## Part A — Decisions already made (confirm these still hold)

These are recorded in the SRS as decided. The architect will build on them; the human
should confirm none have changed since v5.2.

### A.1 Stack & platform decisions (SRS §10.1, §10.2)

| Concern | Decision | Rationale (per SRS) |
|---|---|---|
| Server | **Django modular monolith** — one module per component, DB-ownership per module, no cross-module table access | Not microservices; interface-boundary between modules (NFR-MNT-001) |
| Frontend | **React + Next.js** | Admin console, workflow builder, scorer/coordinator portals, approver inbox |
| Condition format | **JsonLogic** | Documented spec, cross-language implementations, existing UI builders emit it |
| Condition evaluation | **Own implementation** (~300 lines) | Dual path — in-memory + SQL compilation — from one grammar (FR-CND-ENG-004) |
| Workflow graph | **Own implementation** | 17 FRs over a bounded problem; BPMN engines import unneeded semantics and conflict with versioning |
| State machines | **`viewflow.fsm`** | Guards one object's transitions through states; commodity, not worth writing |
| Async work | **Celery** | Meeting-link creation, bulk generation, notification dispatch |

**Options evaluated and NOT adopted** (§10.2) — recorded so the architect does not
re-litigate: GoRules ZEN, json-rules-engine, py-rules-engine, durable-rules (rule engines);
Viewflow-BPMN, django-river, django-workflow-kit, SpiffWorkflow (workflow engines). Two
carry an explicit caveat: **django-river** — verify maintenance (published support reaches
Django 2.1); **django-workflow-kit** — read the source before adopting (new, unproven).

### A.2 Design rules (SRS §10.3) — architectural invariants

1. Build a bounded directed graph, **not** a generic process engine (FR-WFE-015; mitigates R-22).
2. **No** microservice per component.
3. Only genuine business capabilities become draggable nodes.
4. Configuration over hardcoded admission rules.
5. One shared condition engine; one common permission model.
6. Workflow versioning always; never overwrite a decision — revise it.
7. Keep orchestration separate from component business logic (FR-WFE-013).
8. All data-entry paths, including scripts, go through the service layer (FR-ING-030; mitigates R-14).

### A.3 Tenancy & security invariants (SRS §4.5, §7)

- Institute lock injected by a **base repository layer**, invisible/immutable to admins, never per-query (NFR-SEC-005).
- Authorisation resolved per request from the DB, cached on user+institute, never in the token; fails closed; membership re-verified per request (NFR-SEC-002/003/004).
- Machine clients scoped to one institute, isolated identically to user sessions (NFR-SEC-006).
- DB row-level security is **phase two** — v1 enforces scope at the repository layer.

### A.4 Build order (SRS §10.4) — confirm sequencing

Auth/identity → platform admin → institute mgmt → programme/cycle setup → candidate
management → **condition engine (early — 10 dependents)** → import service layer + loading
script → workflow model + simple executor → **audit hardening** → shortlist → approval →
document collection → verification → assessment definition → scheduling → score capture →
attendance → scoring → merit → seat allocation → offer → communication → print → reports →
reopen.

Explicit instruction: **do not build the full workflow engine before real components
exist** — build the graph model + simple executor, then harden against actual components.

> **Note for the architect:** an earlier module-architecture document exists at
> `docs/architecture/module-architecture.md` (17 modules), produced before SRS v5.2. It
> predates document collection and the condition-engine-as-platform-service split, and
> assumes database-per-institute (SRS v5.2 specifies repository-layer enforcement, DB RLS
> deferred to phase two). **Reconcile it against this SRS rather than treating it as current.**

---

## Part B — Open questions requiring human sign-off

### B.1 BLOCKING — must be resolved before the dependent modules are designed (SRS §8.1)

| Ref | Question | Consequence of not deciding | Design impact |
|---|---|---|---|
| **A-3 / R-26** | **Document storage.** Where/how are candidate documents held? No decision exists. | Holding documents likely makes Geta a **data processor** — retention, residency, and processor status all follow. "Required before build, not after real documents exist." Widened by **R-29** to cover candidate-shaped **sample data in unpublished builder drafts** (never passed through import, not governed by retention, not in the audit trail). | Document collection module, verification's document access, print output storage, and the builder's sample-data handling. |
| **§8.3** | **Continuous recompute vs. input locking.** The prototype recomputes outcome after every mutation; FR-SCR-026 locks scoring inputs on commit. **Mutually exclusive.** | Defines the core correctness model and the meaning of "committed." | Scoring, merit, reopen/correction, and the entire staleness-propagation design (R-23). |
| **A-6 / R-30** | **Builder starting point.** First flow assembled by Geta *with* the institute, or from a supplied template they adjust? | Determines self-service vs. configured product; primary R-17 mitigation. The "blank canvas" is the most concrete form of R-17. | Workflow builder scope, onboarding tooling, template/defaults infrastructure. |
| **P-03** | **Per-user data-scope placeholders.** | Blocks "coordinator sees own sessions" and "scorer sees own candidates." | Row-level data-scope enforcement in the condition engine (a named consumer); attendance, score capture, reports scoping. |

### B.2 BLOCKING — architectural conflict (SRS §8.3)

Restated for emphasis: **continuous recompute vs. input locking is an architectural fork,
not a feature toggle.** Whichever is chosen shapes the persistence model, the revision/
staleness machinery, and reopen semantics across scoring, merit, and every locked-data
component. The architect cannot design these modules consistently without the answer.

### B.3 ADVISORY / watch-list (SRS §8.1, §8.2) — can proceed on stated assumptions

- **ADR-026** (candidate access) — not needed for document collection (machine auth); only
  returns if slot booking or online offer acceptance re-enter scope. **Watch.**
- **WF-1** (mid-cycle workflow version migration) — no migration path for candidates past a
  changed node. Safe for v1 (one workflow/institute, version binding at cycle start); must
  resolve before a second version publishes.
- **Document collection** blocking vs. pass-through (does a candidate stall awaiting
  documents, or pass through to Verification's blocking flag?).
- **Scheduling** capacity check block-vs-warn.
- **Score capture** panel-roster mid-session change; open-pace scorers holding candidates incomplete.
- **Approval** quorum / send-back / expiry / delegation — all undefined.
- **Panelist** email-existence disclosure on link.
- **R-27** collection trust boundary (platform authenticates the calling system, not the
  student) — accepted as a stated v1 assumption; confirm.

### B.4 Never asked (SRS §8.4) — needed to size NFRs

Several NFRs carry **"value unconfirmed"** (NFR-PERF-001 auth overhead, NFR-PERF-002 import
batch size/window, NFR-AVL-001 peak availability, NFR-CMP-001 residency/retention). These
depend on unanswered inputs: year-1/year-3 institute count and candidate volume, concurrent
sessions, compliance/residency jurisdiction, team size and timeline. **The architect needs
at least rough scale figures to make DB-tenancy and async-capacity decisions.**

---

## Human decisions recorded — 2026-09-04

| Question | Decision | Notes |
|----------|----------|-------|
| A-3 / R-26 Document storage | **Deferred** | EPIC-201 (Document Collection) blocked until decided. Do not build the collection API before storage call is made. |
| §8.3 Recompute vs. locking | **Input locking (FR-SCR-026)** | Corrections go through Reopen → stale propagation. Continuous recompute rejected. |
| A-6 / R-30 Builder starting point | **Geta builds with the institute** | Configured product, not self-service. No blank canvas onboarding. Scope EPIC-103 accordingly. |
| P-03 Per-user data scope | **Scoped — own assignments only** | P-03 must ship before coordinator/scorer portals. Stub those views until implemented. |
| NFR-PERF-001 Auth latency | **No target yet — benchmark in staging** | Proceed with best-effort design. Instrument and set threshold from real numbers. |
| FR-CND-ENG-005 Operator allow-list | **Start minimal, extend as needed** | v1 ships: `equals, not_equals, in, not_in, gt, gte, lt, lte`. String operators added only when a component needs them. |

## Sign-off checklist

- [ ] Part A confirmed (stack, design rules, tenancy invariants, build order still hold).
- [ ] `docs/architecture/module-architecture.md` reconciliation acknowledged.
- [x] **A-3 / R-26** document storage — deferred; EPIC-201 blocked.
- [x] **§8.3** recompute-vs-locking — input locking confirmed.
- [x] **A-6 / R-30** builder starting point — Geta-assisted onboarding.
- [x] **P-03** data-scope model — scoped to own assignments; P-03 required before portal views.
- [x] **NFR-PERF-001** auth latency — benchmark in staging; no hard target yet.
- [x] **FR-CND-ENG-005** operator allow-list — minimal set for v1.
- [x] Part A stack — **prototype only for now**. Production stack (Django/React/etc.) not committed. Revisit when moving from POC to build.
- [x] Scale — conservative assumptions: 5,000 candidates/cycle, single-digit institutes. Confirm before second institute onboards.
- [x] Availability — best-effort, no SLA for v1 prototype phase.
- [ ] Watch-list items (B.3) acknowledged with decide-by triggers.
