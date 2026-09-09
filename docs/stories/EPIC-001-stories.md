# EPIC-001 — Authentication, Identity & RBAC: User Stories

**Epic ref:** EPIC-001
**Priority:** P0
**FR coverage:** NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-006; supports every "any role holding the X permission" clause throughout the SRS.
**Build-order position:** First. Nothing else can be built until identity and auth exist.

---

## Story EPIC-001-US-01 — User login with JWT

**As an** institute user (any role), **I want** to authenticate with my credentials and receive a session token, **so that** I can access the platform and have my institute membership resolved for every subsequent request.

**Acceptance Criteria:**
- Given a valid email and password, when the user submits login credentials, then the system issues a short-lived JWT containing only the user identifier (no role names, no permissions, no institute identifiers embedded).
- Given a valid JWT on a subsequent request, when the request arrives, then the system resolves the user's active membership and permissions from the database for that specific request, not from the token payload.
- Given an invalid or expired JWT, when the request arrives, then the system rejects the request with HTTP 401 and does not proceed to authorise any action.
- Given a user whose membership has been revoked since their token was issued, when the user makes a request with a still-valid token, then the system detects the revoked membership via per-request DB verification and rejects the request with HTTP 403.
- Given a failed authorisation resolution (DB unreachable, membership lookup error), when the request is processed, then the system fails closed — rejects the request rather than granting access.

**FR references:** NFR-SEC-002, NFR-SEC-003, NFR-SEC-004
**Size:** M
**Dependencies:** None

---

## Story EPIC-001-US-02 — Permission catalogue definition

**As a** Geta super admin, **I want** a fixed catalogue of named permissions, **so that** institutes can compose roles from permissions without any code referencing fixed role names.

**Acceptance Criteria:**
- Given the system is running, when any code module checks authorisation, then it checks for a named permission (e.g., `candidates.view`, `verification.decide`, `attendance.mark`) — never for a role name string.
- Given the permission catalogue, when a new permission is needed for a feature, then it is added to the catalogue as a named entry with a description; no existing permission is renamed or deleted in a way that invalidates existing role compositions.
- Given the catalogue, when an institute admin is composing a role, then they see the full permission list with descriptions and can select any subset.
- Given a request from a user whose active role does not include the required permission, when the system checks authorisation, then the request is rejected with HTTP 403 and the specific missing permission is logged.

**FR references:** NFR-SEC-002, NFR-SEC-003; SRS §3 actor table
**Size:** S
**Dependencies:** EPIC-001-US-01

---

## Story EPIC-001-US-03 — Role composition from permissions

**As an** institute admin, **I want** to create roles by selecting permissions from the catalogue, **so that** I can define exactly what each type of user can do without being constrained to predefined role types.

**Acceptance Criteria:**
- Given the permission catalogue, when an institute admin creates a role, then they assign a name, a description, and a subset of permissions from the catalogue; the system saves this as an institute-scoped role definition.
- Given an existing role, when an institute admin edits it to add or remove permissions, then the change takes effect for all users holding that role on their next request (per-request resolution means no token reissue is needed).
- Given a role with a name, when any code or API references authorisation, then it never matches on the role name — only on the permissions the role contains.
- Given an attempt to delete a role that is currently assigned to one or more memberships, when the admin submits the deletion, then the system rejects the deletion and reports how many memberships hold the role.

**FR references:** NFR-SEC-002; SRS §3
**Size:** M
**Dependencies:** EPIC-001-US-02, EPIC-002-US-01 (institute scope required)

---

## Story EPIC-001-US-04 — User account creation and membership model

**As a** Geta super admin or institute admin (with the user management permission), **I want** to create user accounts and attach memberships to institutes, **so that** one person can hold memberships at multiple institutes without duplicate accounts.

**Acceptance Criteria:**
- Given a new person to onboard, when the admin creates a user account with an email address, then the system creates one global user record keyed on the email address; if the email already exists, no second account is created and the admin is informed.
- Given an existing global user account, when the admin attaches a membership to an institute, then a membership record is created linking the user, the institute, and the assigned role; the user can now authenticate and operate within that institute.
- Given a user with memberships at two institutes, when they authenticate, then both memberships are available; the active membership for each request is determined by the institute context of the request (e.g., via subdomain or explicit selection).
- Given a membership that is deactivated, when the user makes a request against that institute, then the system treats the deactivated membership as absent and rejects with HTTP 403 even if the token is valid.

**FR references:** NFR-SEC-004; FR-ASM-039 (existing email gets new membership, not second account)
**Size:** M
**Dependencies:** EPIC-001-US-01, EPIC-002-US-01

---

## Story EPIC-001-US-05 — Machine client credential issuance (API credentials)

**As an** institute admin with the credential management permission, **I want** to issue, list, rotate, and revoke API credentials for machine clients (external systems), **so that** external systems can push documents over the authenticated collection API without holding a user identity.

**Acceptance Criteria:**
- Given an institute admin with the credential management permission, when they issue a new API credential, then the system generates a client ID and a secret, displays the secret exactly once (it is not retrievable afterwards), scopes the credential to the single institute, and creates an audit entry.
- Given an issued credential, when it is used to authenticate an API request, then the system resolves the institute from the credential, applies the institute lock identically to user sessions, and grants no user identity, membership, or role.
- Given an issued credential, when the admin rotates it, then a new secret is issued, the old secret is immediately invalidated, and both events are audited.
- Given an issued credential, when the admin revokes it, then all subsequent requests using it are rejected with HTTP 401; the revocation is audited.
- Given the credential list view, when the admin opens it, then they see all credentials for their institute with creation date, last-used timestamp, and status (active/revoked) — but never the secret value.

**FR references:** NFR-SEC-006; FR-EDC-002, FR-EDC-003; SRS §3 (External system actor)
**Size:** M
**Dependencies:** EPIC-001-US-01, EPIC-002-US-01, EPIC-006-US-01 (audit)

---

## Story EPIC-001-US-06 — Per-request authorisation resolution and caching

**As a** platform engineer, **I want** authorisation to be resolved from the database on every request (with a short-lived cache keyed on user and institute), **so that** permission changes and membership revocations take effect promptly without token reissue.

**Acceptance Criteria:**
- Given a request with a valid JWT, when the system resolves authorisation, then it reads the user's active membership and role permissions from the database (or a cache keyed on user ID + institute ID with a TTL not exceeding an agreed threshold).
- Given a cache entry that was populated before a membership was revoked, when the TTL expires and the next request arrives, then the system fetches fresh state from the database and sees the revocation.
- Given a cache invalidation event (role permission change, membership deactivation), when it fires, then the corresponding cache entries are evicted so that the next request for affected users fetches fresh state.
- Given concurrent requests from the same user to the same institute, when they arrive simultaneously, then each resolves authorisation independently — no request proceeds without a valid resolved authorisation.

**FR references:** NFR-SEC-002, NFR-SEC-004; SRS §8 R-15 (cache invalidation risk)
**Size:** S
**Dependencies:** EPIC-001-US-01, EPIC-001-US-03

**[AMBIGUOUS: NFR-PERF-001 states "authorisation overhead per request shall not exceed an agreed threshold" but the threshold value is listed as "unconfirmed." The TTL for the per-request cache cannot be specified without this value. Flag to PM/human for a concrete number before the Architect designs the cache layer.]**
