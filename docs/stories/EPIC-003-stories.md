# EPIC-003 — Platform Administration (Geta Super Admin): User Stories

**Epic ref:** EPIC-003
**Priority:** P0
**FR coverage:** SRS §3 (Geta super admin: "manage institutes and catalogue"). No dedicated FR-block; this is the platform scaffolding above FR-GC-*.
**Build-order position:** Third (after EPIC-001, EPIC-002). Institute provisioning must exist before institute-scoped work begins.

---

## Story EPIC-003-US-01 — Institute creation and provisioning

**As a** Geta super admin, **I want** to create and provision a new institute, **so that** the institute becomes a tenant with its own isolated data space, ready for its admin to configure.

**Acceptance Criteria:**
- Given the super admin console, when the super admin creates a new institute, then the system creates an institute record with a unique identifier, a name, and an active status; the record is immediately visible in the institute list.
- Given a newly created institute, when the super admin views it, then the institute has zero users, zero programmes, and zero cycles — it is a clean slate.
- Given the institute creation action, when it completes, then an audit entry is written capturing actor (super admin), action (institute created), institute identifier, and timestamp.
- Given an institute name that already exists, when the super admin attempts to create a duplicate, then the system rejects the creation and returns a clear error naming the conflict — it does not silently create a second record.
- Given a created institute, when the super admin deactivates it, then all user sessions for that institute are rejected on the next per-request membership verification; the institute data is retained but inaccessible to its users.

**FR references:** SRS §3 (super admin use case); FR-AUD-001, FR-AUD-002 (audit); EPIC-006-US-01
**Size:** M
**Dependencies:** EPIC-001-US-01, EPIC-002-US-01, EPIC-006-US-01

---

## Story EPIC-003-US-02 — Institute listing and management

**As a** Geta super admin, **I want** to view and manage all institutes in the platform, **so that** I can monitor tenant status and take administrative action when needed.

**Acceptance Criteria:**
- Given the super admin console, when the super admin opens the institute list, then they see all institutes with name, unique identifier, creation date, and status (active/inactive).
- Given an institute in the list, when the super admin selects it, then they see the institute detail: creation date, admin users attached, programme count, and cycle count.
- Given an active institute, when the super admin deactivates it, then its status changes to inactive; the deactivation is audited.
- Given an inactive institute, when the super admin reactivates it, then its status changes to active; the reactivation is audited.
- Given many institutes, when the super admin views the list, then it paginates at a configurable page size rather than loading all records at once.

**FR references:** SRS §3 (super admin use case); FR-AUD-001
**Size:** S
**Dependencies:** EPIC-003-US-01

---

## Story EPIC-003-US-03 — Institute admin user assignment

**As a** Geta super admin, **I want** to assign an institute admin user to a newly created institute, **so that** the institute has at least one user who can configure it without requiring Geta to do the configuration.

**Acceptance Criteria:**
- Given a created institute with no users, when the super admin assigns a user as institute admin, then the system either creates a new global user account (if the email is new) or attaches a new membership to the existing account (if the email already exists) — it never creates a duplicate account.
- Given the assigned institute admin membership, when the institute admin logs in, then they can access the institute console and see their institute's data only — the base repository institute lock applies.
- Given the assignment action, when it completes, then an audit entry records actor (super admin), action (membership created), user identifier, institute identifier, and timestamp.
- Given an institute admin membership, when the super admin revokes it, then the former admin's next request against that institute is rejected at the per-request membership verification.

**FR references:** SRS §3; FR-ASM-039 (one account, multiple memberships); FR-AUD-001
**Size:** S
**Dependencies:** EPIC-001-US-04, EPIC-003-US-01, EPIC-006-US-01

---

## Story EPIC-003-US-04 — Super admin audit trail

**As a** Geta super admin, **I want** all platform administration actions to be audited, **so that** every institute creation, deactivation, and admin assignment is traceable to a specific actor and time.

**Acceptance Criteria:**
- Given any super admin action (create institute, deactivate institute, assign admin, revoke admin), when it completes, then an audit entry is written with the full FR-AUD-002 field set: actor, action, entity type, entity identifier, timestamp, prior value, new value.
- Given the audit log, when the super admin queries it filtered by actor or by entity (institute), then they receive the matching entries in reverse chronological order.
- Given an audit entry, when any user (including super admin) attempts to delete or modify it, then the system rejects the operation — the log is append-only and entries are non-deletable.

**FR references:** FR-AUD-001, FR-AUD-002, FR-AUD-003, FR-AUD-004, FR-AUD-005
**Size:** S
**Dependencies:** EPIC-006-US-01, EPIC-003-US-01
