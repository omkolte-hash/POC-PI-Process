# PM Handoff

**From:** Product Manager
**To:** Business Analyst (next), System Architect (after approval)
**Date:** 2026-09-04
**Source:** SRS v5.2

## What I produced

| Deliverable | Path | Status |
|---|---|---|
| Prioritized epic backlog + PRD | `docs/requirements/EPIC-BACKLOG.md` | Written; PRD epic (EPIC-000) `[NEEDS-APPROVAL]` |
| Architecture approval ticket | `docs/requirements/ARCH-APPROVAL.md` | Written; `[NEEDS-APPROVAL]` — awaiting human sign-off |
| This handoff | `docs/requirements/PM-HANDOFF.md` | — |
| 22 epic tickets in the shared backlog | Tasks #5–#32 | Created; P0 dependency links wired |

**Coverage:** 22 epics spanning the 391 effective-v1 FRs, tiered P0–P4 along the SRS
§10.4 build order. Deferred import-UI FRs (FR-ING-005, 019, 024–028, 020-screen) are noted
but not scheduled.

## Two human checkpoints before build

1. **EPIC-000 (PRD)** and **ARCH-APPROVAL.md** are both `[NEEDS-APPROVAL]`. The approval-gate
   hook correctly blocks marking the ARCH-APPROVAL task complete until a human signs off and
   the file is tagged `[APPROVED]`. I did **not** self-approve.
2. **Four BLOCKING decisions** must be resolved before their dependent epics can be built:
   - **A-3 / R-26** — document storage (blocks EPIC-201 fully; EPIC-103 sample data)
   - **§8.3** — continuous recompute vs. input locking (blocks EPIC-208, EPIC-209)
   - **A-6 / R-30** — builder starting point (shapes EPIC-103)
   - **P-03** — per-user data scope (blocks own-sessions/own-candidates in EPIC-206/207/401)

## What the Business Analyst picks up next

**Start with the P0 epics** (tasks #6–#12: EPIC-001 auth, 002 tenancy, 003 platform admin,
004 global config, 005 candidate mgmt, 006 audit, 007 condition engine). These unblock
everything and carry no blocking open questions of their own — so the BA can write stories
now without waiting on the human checkpoints.

Break each P0 epic into implementation-ready user stories with acceptance criteria at the
story level. The epic-level acceptance criteria in EPIC-BACKLOG.md are completion signals,
not story ACs — that's your layer.

**Sequencing note:** EPIC-007 (condition engine) is P0 and must land early — ten components
depend on it. Its only caveat is that the *row-level data-scope consumer* is gated on P-03;
the engine itself is not. Story-slice it so the engine ships without waiting on P-03.

**Do not start P1+ stories** for epics tagged with a BLOCKING question until the human
resolves it — flag them in your queue but hold. The blocking-question rollup table at the
bottom of EPIC-BACKLOG.md is the authoritative list of what's gated on what.

## Escalation

If a story reveals an ambiguity the SRS doesn't answer, route it to me (PM) — I resolve
product decisions or escalate to the human. Don't let ambiguity bounce between teammates.
