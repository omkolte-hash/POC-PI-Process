# EPIC-006 — Audit (Baseline + Hardening): User Stories

**Epic ref:** EPIC-006
**Priority:** P0
**FR coverage:** FR-AUD-001 through FR-AUD-006; NFR-AUD-001
**Build-order position:** Sixth (alongside EPIC-001 and EPIC-002; must be usable by EPIC-003 onwards). Hardened after import lands (EPIC-101).

---

## Story EPIC-006-US-01 — Audit entry written for every consequential operation

**As a** platform engineer, **I want** every consequential system operation to automatically write an audit entry with a defined field set, **so that** every action taken in the platform is traceable to a specific actor, time, and context without relying on individual developers to remember to log.

**Acceptance Criteria:**
- Given any operation classified as consequential (data write, permission change, status transition, override, revert, reopen, seat conversion, approval decision), when it completes successfully, then an audit entry is written atomically with the operation — if the operation fails, no partial audit entry is created.
- Given a completed audit entry, when it is inspected, then it contains all of: actor (user or machine client identifier), action (operation name), entity type, entity identifier, timestamp (UTC, millisecond precision), reason (where applicable), prior value (serialised, where applicable), new value (serialised, where applicable), workflow version (where executing inside a workflow), execution identifier (where applicable).
- Given an operation that fails before completion (e.g., a validation error), when the failure occurs, then no audit entry is written — the log does not record attempted-but-rejected operations as completed actions.
- Given a machine client operation (e.g., document submission), when it completes, then the audit entry records the machine client credential identifier as the actor — not "anonymous" or a user account.

**FR references:** FR-AUD-001, FR-AUD-002; NFR-AUD-001
**Size:** L
**Dependencies:** EPIC-001-US-01, EPIC-002-US-01

---

## Story EPIC-006-US-02 — Append-only, non-deletable audit log

**As a** Geta super admin, **I want** the audit log to be append-only and non-deletable, **so that** the record of what happened in the platform cannot be altered after the fact.

**Acceptance Criteria:**
- Given an audit entry that has been written, when any user (including the Geta super admin or the actor who created it) attempts to delete it via the API or admin console, then the system rejects the operation with HTTP 405 or HTTP 403 and does not delete the entry.
- Given an audit entry that has been written, when any user attempts to update or overwrite its fields (actor, action, timestamp, prior value, new value), then the system rejects the operation — audit entries are immutable after creation.
- Given the database schema for the audit table, when it is reviewed, then there is no `DELETE` permission granted to the application database user on the audit table, and no `UPDATE` permission on the substantive fields.
- Given a system that has been running for an extended period, when the audit table is queried, then entries from the earliest operations are still present and unchanged.

**FR references:** FR-AUD-003, FR-AUD-004
**Size:** S
**Dependencies:** EPIC-006-US-01

---

## Story EPIC-006-US-03 — Audit query by actor, entity, action, and date range

**As an** institute admin with the audit query permission, **I want** to query the audit log filtered by actor, entity type, action, and date range, **so that** I can investigate specific events without scanning the entire log.

**Acceptance Criteria:**
- Given the audit query interface, when an institute admin submits a query filtered by actor (user identifier), then only entries where the actor field matches are returned, scoped to the authenticated institute.
- Given the audit query interface, when an institute admin submits a query filtered by entity type and entity identifier, then all audit entries for that specific entity are returned in reverse chronological order.
- Given the audit query interface, when an institute admin submits a query filtered by action name and a date range (from ISO timestamp to ISO timestamp), then only entries matching both filters are returned.
- Given a query with multiple filters applied simultaneously (e.g., actor + date range), when it executes, then the system combines the filters with AND logic and returns only entries matching all applied filters.
- Given a very large audit log, when a query returns many results, then the response is paginated; the caller can request subsequent pages by cursor or page number.
- Given an institute admin's audit query, when it executes, then it returns only audit entries for their institute — they cannot query another institute's audit log.

**FR references:** FR-AUD-005, FR-GC-006 (institute scoping)
**Size:** M
**Dependencies:** EPIC-006-US-01, EPIC-002-US-01

---

## Story EPIC-006-US-04 — Mandatory audit coverage for high-sensitivity operations

**As a** platform engineer, **I want** overrides, reverts, reopens, seat conversions, and approval decisions to be audited without exception, **so that** the highest-consequence operations have complete, non-waivable traceability.

**Acceptance Criteria:**
- Given a verification override (advancing past an unresolved blocking item), when it is executed, then an audit entry is written with actor, timestamp, reason, and the specific item overridden — before the override takes effect, not after.
- Given a score revert via the reopen capability, when it executes, then an audit entry records actor, prior score values, reason, and the reopened step — the revert cannot proceed without this entry being written.
- Given a seat conversion (unfilled seats moved between partitions), when it is authorised and executed, then an audit entry records actor, authorising actor, source partition, target partition, quantity converted, and timestamp.
- Given an approval decision (approve or deny) at any level of any approval chain, when it is recorded, then an audit entry captures approver, approval chain identifier, level number, decision (approve/deny), remark, and timestamp.
- Given any of the above operations, when the system is under load and the audit write fails, then the operation itself must also fail — the system does not complete a high-sensitivity operation without a successful audit write.

**FR references:** FR-AUD-006, FR-AUD-001, FR-AUD-002
**Size:** M
**Dependencies:** EPIC-006-US-01, EPIC-006-US-02

**[AMBIGUOUS: FR-AUD-006 lists "reopen, seat conversion and approval decision" as mandatory audit targets. The SRS does not specify whether the audit write must be part of the same database transaction as the operation, or can be a post-commit write. Given FR-AUD-003 (append-only) and NFR-AUD-001, the intended behaviour is same-transaction. Flag to Architect to confirm the transactional guarantee before implementation.]**
