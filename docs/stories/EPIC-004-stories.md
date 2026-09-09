# EPIC-004 — Global Configuration (Institute, Programme, Cycle Setup): User Stories

**Epic ref:** EPIC-004
**Priority:** P0
**FR coverage:** FR-GC-001 through FR-GC-007
**Build-order position:** Fourth (after EPIC-001, EPIC-002, EPIC-003). Every pipeline component operates within this scoping hierarchy.

---

## Story EPIC-004-US-01 — Programme hierarchy definition

**As an** institute admin, **I want** to define programmes as a self-referencing hierarchy of arbitrary depth, **so that** the institute's course structure (including sub-programmes) is accurately modelled without artificial depth limits.

**Acceptance Criteria:**
- Given the programme configuration screen, when an institute admin creates a programme with no parent, then a root-level programme is created, scoped to the institute, with a name and unique identifier.
- Given an existing programme, when an institute admin creates a child programme with that programme as its parent, then a sub-programme is created one level deeper; this can be repeated to any depth.
- Given a programme hierarchy of five levels deep, when the admin views the hierarchy, then all levels are navigable and all programmes are retrievable by their identifier.
- Given a programme that has child programmes or academic years attached, when the admin attempts to delete it, then the system rejects the deletion and lists the dependent entities.
- Given a newly created programme, when any other component queries for it, then it is returned with its full ancestry path (parent chain), so upstream components can filter by hierarchy level.

**FR references:** FR-GC-001, FR-GC-006
**Size:** M
**Dependencies:** EPIC-002-US-01

---

## Story EPIC-004-US-02 — Academic year definition under a programme

**As an** institute admin, **I want** to define academic years under a programme, **so that** intake cohorts for different years are separated without colliding records.

**Acceptance Criteria:**
- Given an existing programme, when an institute admin creates an academic year under it, then an academic year record is created with a name (e.g., "2026–2027"), scoped to the institute and linked to the programme.
- Given a programme with one academic year already, when the admin creates another academic year under it, then both coexist; creating the second year does not alter or close the first.
- Given an academic year that has admission cycles attached, when the admin attempts to delete the academic year, then the system rejects the deletion and lists the dependent cycles.
- Given a query for all academic years under a programme, when it executes, then only years belonging to that programme (and thus the authenticated institute) are returned.

**FR references:** FR-GC-002, FR-GC-006
**Size:** S
**Dependencies:** EPIC-004-US-01

---

## Story EPIC-004-US-03 — Admission cycle definition and status management

**As an** institute admin, **I want** to create admission cycles under an academic year and manage their status (draft, active, closed), **so that** the execution scope for each intake round is clearly bounded and multiple rounds can run concurrently.

**Acceptance Criteria:**
- Given an academic year, when an institute admin creates an admission cycle, then a cycle record is created with status `draft`, scoped to the institute, linked to the academic year, with a name and unique identifier.
- Given a cycle in `draft` status, when the admin transitions it to `active`, then its status becomes `active` and it becomes eligible for operational workflow views.
- Given a cycle in `active` status, when the admin transitions it to `closed`, then its status becomes `closed` and operational views for it are no longer presented (per FR-GC-007).
- Given one `active` cycle under an academic year, when the admin creates and activates a second cycle under the same academic year, then both cycles are `active` simultaneously; the first is not closed automatically.
- Given a cycle in any status, when the admin attempts to transition it to an invalid status (e.g., `closed` directly to `active`), then the system rejects the transition with a clear error stating the permitted transitions.

**FR references:** FR-GC-003, FR-GC-004, FR-GC-005, FR-GC-006
**Size:** M
**Dependencies:** EPIC-004-US-02

---

## Story EPIC-004-US-04 — Operational view gating on active cycle

**As an** admissions officer, **I want** operational workflow stages to be presented only when there is an active admission cycle within my scope, **so that** I cannot accidentally operate on a draft or closed cycle.

**Acceptance Criteria:**
- Given a user whose institute has no `active` admission cycle within their programme scope, when they navigate to any operational stage (shortlist, scheduling, score capture, etc.), then the system presents an empty state or a "no active round" message — it does not display an operational interface with stale or draft data.
- Given a user whose institute has one `active` cycle and one `draft` cycle, when they view operational stages, then only the `active` cycle's data is presented; the `draft` cycle's operational views are not accessible.
- Given a cycle that transitions from `active` to `closed`, when a user who was previously operating on it navigates back to an operational stage, then the operational interface for that cycle is no longer presented.
- Given a user scoped to a specific programme (e.g., via role/permission), when they view operational stages, then only cycles under programmes within their scope are considered; a cycle active in a programme outside their scope does not satisfy the "active round" condition for their view.

**FR references:** FR-GC-007
**Size:** M
**Dependencies:** EPIC-004-US-03, EPIC-001-US-03 (permission-based scoping)

**[AMBIGUOUS: FR-GC-007 says "where no active round exists within a user's scope, no operational stage shall be presented." It is silent on whether a user scoped to multiple programmes sees operational stages if at least one programme has an active round, or only the stages for the programmes with active rounds. Flag to PM: should inactive-programme stages be hidden or just empty within the same view?]**
