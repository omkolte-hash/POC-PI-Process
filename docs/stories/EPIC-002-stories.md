# EPIC-002 — Multi-tenancy & Base Repository Layer: User Stories

**Epic ref:** EPIC-002
**Priority:** P0
**FR coverage:** NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, FR-GC-006, FR-EDC-002, FR-ING-030
**Build-order position:** Second (after EPIC-001). All data-touching epics depend on this.
**Risk:** R-07 (HIGH), R-14 (HIGH) — the primary mitigation for cross-tenant exposure.

---

## Story EPIC-002-US-01 — Base repository layer with automatic institute lock

**As a** platform engineer, **I want** all database reads and writes to pass through a base repository layer that automatically applies the institute lock, **so that** no query can access another institute's data regardless of how it is written.

**Acceptance Criteria:**
- Given any read query issued through the base repository, when it executes, then the system automatically appends a filter constraining results to the authenticated user's (or machine client's) active institute — without the calling code explicitly adding that filter.
- Given any write operation issued through the base repository, when it executes, then the system automatically sets the institute identifier on the record to the authenticated institute — without the calling code explicitly setting it.
- Given a developer who writes a query outside the base repository layer (directly via the ORM or raw SQL), when that code is introduced to the codebase, then a test or linter rule flags it as a policy violation (enforcement mechanism required, not just convention).
- Given the institute lock, when an institute admin inspects or introspects the system (e.g., via an admin UI), then the lock is not visible as a configurable or overridable setting — it operates transparently and immutably.

**FR references:** NFR-SEC-001, NFR-SEC-005, FR-GC-006
**Size:** L
**Dependencies:** EPIC-001-US-01 (need authenticated institute context to inject)

---

## Story EPIC-002-US-02 — Scripted data loading goes through the service layer

**As a** developer loading data by script, **I want** the import service layer to be the mandatory path for all candidate data writes, **so that** scripted loads cannot bypass the institute lock, validation, or provenance recording.

**Acceptance Criteria:**
- Given a script that loads candidate data, when it runs, then it calls the import service layer API — it does not write directly to database tables.
- Given the import service layer, when it processes a data record, then it routes the write through the base repository layer, which applies the institute lock identically to writes originating from any other path.
- Given a direct database write to a candidate table (not through the service layer), when it is attempted, then either (a) the repository-layer enforcement makes the result institute-misattributed and caught by tests, or (b) a code review gate catches it — the acceptable outcome is that this path is demonstrably gated, not silently permitted.
- Given the service layer, when it writes a record, then per-field provenance and per-record lineage are recorded; these are not optional and cannot be bypassed by the scripted path.

**FR references:** FR-ING-030, NFR-SEC-005; SRS §4.5, §10.3 rule 8
**Size:** M
**Dependencies:** EPIC-002-US-01

---

## Story EPIC-002-US-03 — Machine client institute isolation

**As a** machine client (external system), **I want** my API credentials to confine my access to exactly one institute, **so that** a credential issued by institute A cannot read or write institute B's data under any circumstance.

**Acceptance Criteria:**
- Given a machine client authenticating with API credentials issued by institute A, when it makes any API request, then the system resolves the institute from the credential and applies the same base repository institute lock as for a user session at institute A.
- Given a machine client credential, when the client attempts to reference an entity (candidate admission, document type, cycle) belonging to institute B, then the base repository layer returns not-found — identical to the response for a nonexistent record — and does not reveal that the entity exists under a different institute.
- Given a machine client with valid credentials, when it attempts an operation that would require a user-level permission (e.g., modifying a workflow configuration), then the system rejects it with HTTP 403 — machine credentials confer no user identity, membership, or role.

**FR references:** NFR-SEC-001, NFR-SEC-006, FR-EDC-002
**Size:** S
**Dependencies:** EPIC-001-US-05, EPIC-002-US-01

---

## Story EPIC-002-US-04 — Cross-tenant data isolation verification

**As a** Geta super admin, **I want** confidence that no institute can access another institute's data even through indirect query paths, **so that** tenant isolation is a provable invariant, not a convention.

**Acceptance Criteria:**
- Given two institutes (A and B) both with candidate records in the system, when a user authenticated to institute A makes any read request, then the response contains zero records belonging to institute B.
- Given two institutes where institute A's user knows institute B's candidate identifier, when institute A's user queries for that identifier, then the system returns not-found (identical to a nonexistent record).
- Given the test suite, when it runs, then it includes at least one cross-tenant isolation test per major entity type (candidate, candidate admission, cycle, document) that asserts the institute-B record is invisible to institute-A's authenticated context.
- Given an attempt to construct a query that joins across institute boundaries, when the base repository layer processes it, then either the join is automatically filtered to the authenticated institute on both sides, or the operation is rejected.

**FR references:** NFR-SEC-001, NFR-SEC-005; R-07
**Size:** M
**Dependencies:** EPIC-002-US-01
