# BA Handoff — P0 User Stories

**From:** Business Analyst
**To:** System Architect, Developer (via team lead)
**Date:** 2026-09-04
**Source epics:** EPIC-001 through EPIC-007 (SRS v5.2, P0 tier)

---

## What is ready

Seven story files covering all P0 epics. Total: 30 user stories.

| File | Epic | Stories | Total size |
|---|---|---|---|
| `EPIC-001-stories.md` | Auth, Identity & RBAC | US-01 to US-06 | 3×M, 2×S, 1×S |
| `EPIC-002-stories.md` | Multi-tenancy & base repository | US-01 to US-04 | 2×M, 1×M, 1×S |
| `EPIC-003-stories.md` | Platform administration | US-01 to US-04 | 2×M, 2×S |
| `EPIC-004-stories.md` | Global configuration | US-01 to US-04 | 2×M, 2×S |
| `EPIC-005-stories.md` | Candidate management | US-01 to US-06 | 4×M, 1×S, 1×M |
| `EPIC-006-stories.md` | Audit | US-01 to US-04 | 1×L, 2×M, 1×S |
| `EPIC-007-stories.md` | Condition engine | US-01 to US-06 | 2×M, 3×S, 1×S |

All stories follow: Story ID, actor/capability/benefit, Given/When/Then ACs (3–6 per story), FR references, size estimate, and dependencies.

---

## Recommended build sequence (SRS §10.4 mapped to stories)

1. **EPIC-001-US-01, US-02** (JWT auth, permission catalogue) — nothing else can start; authentication is the gate.
2. **EPIC-002-US-01** (base repository layer) — must exist before any data is written; EPIC-001 and EPIC-002 should be built together as a single sprint zero deliverable.
3. **EPIC-006-US-01, US-02** (audit baseline) — needed by EPIC-003 onward; wire it before provisioning stories.
4. **EPIC-003-US-01** (institute creation) — unlocks institute-scoped work for all downstream.
5. **EPIC-001-US-03, US-04, US-05** + **EPIC-002-US-03, US-04** — role composition, membership, machine credentials, cross-tenant isolation verification. These can run alongside EPIC-003.
6. **EPIC-004** (programme, year, cycle) — sets up the scoping hierarchy all components operate within.
7. **EPIC-005** (candidate and candidate admission records) — canonical data source. US-01 (entity model) must land before any import work starts.
8. **EPIC-007** (condition engine) — build immediately after candidate management establishes the schema; ten components depend on this and building it late forces temporary condition code in every one of them. US-01 → US-02 → US-03 in sequence; US-04 and US-05 can follow in parallel.

---

## Ambiguities flagged for human/PM resolution

Three ambiguities were identified and marked `[AMBIGUOUS: ...]` inline in the story files. They need a decision before the affected stories can be implemented.

| Location | Ambiguity | Who resolves |
|---|---|---|
| EPIC-001-stories.md, US-06 | NFR-PERF-001: authorisation overhead threshold "unconfirmed" — the cache TTL and cache invalidation design cannot be finalised without a concrete number. | Human (SRS §8.4 acknowledges this is unanswered) |
| EPIC-004-stories.md, US-04 | FR-GC-007 is silent on whether a user scoped to multiple programmes sees all operational stages if any one programme has an active round, or only the stages for active-round programmes. | PM |
| EPIC-007-stories.md, US-04 | The SRS requires an explicit operator allow-list (FR-CND-ENG-005) but does not enumerate it. The allow-list proposed in the story ACs is a BA derivation from JsonLogic conventions — it must be reviewed and approved by the Architect before implementation, since it determines the expressible power of every condition across all ten consumers. | System Architect |

One additional design question flagged for the Architect:

| Location | Question | Who resolves |
|---|---|---|
| EPIC-006-stories.md, US-04 | FR-AUD-006 requires audit of high-sensitivity operations "without exception," but the SRS does not specify whether the audit write must be in the same database transaction as the operation. Given FR-AUD-003 (append-only) and NFR-AUD-001, same-transaction is the correct interpretation — but the Architect must confirm the transactional guarantee explicitly. | System Architect |

---

## P-03 data-scope story (EPIC-007-US-06)

EPIC-007-US-06 delivers the engine's data-scope compilation capability but leaves the consumer-side wiring (coordinator sees own sessions, scorer sees own candidates) as a stub until human open question P-03 is resolved. The Architect and Developer should not attempt to complete the consumer wiring until PM/human provides the per-user scope definition.

---

## P1+ stories

P1+ stories are not written yet. EPIC-101 (import), EPIC-102 (workflow model), EPIC-104 (shortlist), EPIC-105 (approval) can be story-sliced next — none carry blocking open questions at the epic level. EPIC-103 (builder), EPIC-208 (reopen), and EPIC-209 (scoring) are blocked on human decisions (A-3/R-29 and §8.3) and should not be started until those are resolved.
