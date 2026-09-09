# EPIC-005 — Candidate Management Foundation: User Stories

**Epic ref:** EPIC-005
**Priority:** P0
**FR coverage:** FR-CND-001 through FR-CND-008
**Build-order position:** Fifth (alongside EPIC-004). Every downstream component reads from candidate management as the canonical data source.

---

## Story EPIC-005-US-01 — Candidate and candidate admission as separate records

**As a** platform engineer, **I want** candidate (identity) and candidate admission (per-cycle journey) stored as separate entities, **so that** one person can apply to multiple programmes or reapply in a later year without creating duplicate or unlinked records.

**Acceptance Criteria:**
- Given a person who applies to two different programmes in the same year, when their data is committed from import, then there is exactly one candidate record and two separate candidate admission records, each linked to a distinct admission cycle.
- Given a person who applied last year and applies again this year, when the second year's data is committed, then the same candidate record is reused (matched by merge key) and a new candidate admission record is created for the new cycle — no second candidate record is created.
- Given a candidate record, when it is queried, then it returns the person's identity fields (name, email, merge key, source provenance) without cycle-specific data.
- Given a candidate admission record, when it is queried, then it returns the cycle-specific journey data (workflow state, component outputs, provenance for that cycle) plus a reference to the parent candidate record.
- Given a query for all candidate admissions belonging to one candidate, when it executes, then all admissions across all cycles for that candidate are returned, each identifying its cycle.

**FR references:** FR-CND-001, FR-CND-005; SRS §4.1 entity model
**Size:** M
**Dependencies:** EPIC-002-US-01, EPIC-004-US-03

---

## Story EPIC-005-US-02 — Candidate search

**As an** admissions officer, **I want** to search for candidates by identifier or name, **so that** I can quickly locate a specific person's record without scanning the full list.

**Acceptance Criteria:**
- Given a search query containing a candidate identifier (exact match), when the admissions officer submits it, then the system returns the matching candidate record within the authenticated institute scope; if no match exists, an empty result is returned (not an error).
- Given a search query containing a partial name string (minimum two characters), when submitted, then the system returns all candidates whose name contains the query string (case-insensitive) within the institute scope, paginated.
- Given a search query, when it executes, then results are scoped to the authenticated institute via the base repository layer — no cross-tenant records appear.
- Given a user without the `candidates.view` permission, when they attempt to search, then the system rejects with HTTP 403.

**FR references:** FR-CND-002
**Size:** S
**Dependencies:** EPIC-005-US-01, EPIC-001-US-02

---

## Story EPIC-005-US-03 — Candidate profile with provenance

**As an** admissions officer, **I want** to view a candidate profile showing all schema fields, computed columns, and field-level provenance, **so that** I can see not only what the values are but where each value came from.

**Acceptance Criteria:**
- Given a candidate record, when an authorised user views the profile, then they see all schema fields populated from import, each annotated with its provenance (source dataset, field name in source, import job identifier, and timestamp of ingestion).
- Given computed columns added by downstream components (e.g., shortlist group, score), when the user views the profile, then those columns appear alongside the imported fields, annotated with the component and run that produced them.
- Given a field that has been manually edited, when the user views the profile, then they see the current value, the prior value, the actor who made the edit, and the reason — not just the current value.
- Given a field the requesting user's role does not have the `view` permission for (field masking), when the profile is rendered, then that field is omitted entirely from the response — it is not shown as redacted, and its value is not accessible from the API response.

**FR references:** FR-CND-003, FR-CND-006
**Size:** M
**Dependencies:** EPIC-005-US-01, EPIC-001-US-02

---

## Story EPIC-005-US-04 — Candidate workflow trace

**As an** admissions officer, **I want** to view a candidate's workflow trace showing steps completed, current step, and outcomes recorded, **so that** I can understand exactly where in the process a candidate is and what decisions have been made.

**Acceptance Criteria:**
- Given a candidate admission that has progressed through workflow nodes, when an authorised user views the workflow trace, then they see an ordered list of completed steps, each showing: step name, entry timestamp, exit timestamp, outcome recorded, and the workflow version the step executed under.
- Given a candidate admission currently sitting at a node awaiting action (e.g., awaiting verification), when the trace is viewed, then the current step is identified as the active step with its entry timestamp and no exit timestamp.
- Given a candidate admission where a reopen occurred, when the trace is viewed, then the reopened step appears with its correction event, prior state, correcting actor, and reason — the history is not modified.
- Given a candidate admission with no workflow progress (newly imported), when the trace is viewed, then it shows the first workflow node as the pending starting point with no completed steps.

**FR references:** FR-CND-004
**Size:** M
**Dependencies:** EPIC-005-US-01, EPIC-002-US-01 (workflow data model — can be stubbed until EPIC-102 lands, but the data structure must be consistent)

---

## Story EPIC-005-US-05 — Authorised manual field edit with revision record

**As an** institute admin with the candidate edit permission, **I want** to manually edit a candidate field with a mandatory reason, **so that** data corrections are possible while maintaining a complete audit trail of every change.

**Acceptance Criteria:**
- Given a candidate field, when a user with the `candidates.edit` permission submits a change with a non-empty reason, then the system creates a revision record containing: field name, prior value, new value, actor identifier, timestamp, and reason; the field's current value updates to the new value.
- Given a user without the `candidates.edit` permission, when they attempt to submit a field edit, then the system rejects with HTTP 403; no revision record is created.
- Given a required reason field, when the user submits an edit with an empty reason, then the system rejects the submission and returns a validation error before creating any record.
- Given a field that is locked because a downstream component has consumed it (per FR-SCR-026 once scoring lands), when the user attempts to edit it directly, then the system rejects the edit and instructs the user to use the reopen workflow.
- Given a manual edit, when it completes, then an audit entry (FR-AUD-001) is written in addition to the revision record — the two are separate: the revision records the value change, the audit records the action.

**FR references:** FR-CND-007, FR-AUD-001
**Size:** M
**Dependencies:** EPIC-005-US-01, EPIC-001-US-02, EPIC-006-US-01

---

## Story EPIC-005-US-06 — Candidate columns as canonical downstream data source

**As a** downstream component (shortlist, scoring, merit, etc.), **I want** to read candidate columns from candidate management as the canonical data source, **so that** all components operate on the same authoritative data and not on local copies that could diverge.

**Acceptance Criteria:**
- Given a candidate with both imported fields and computed columns (from shortlist, scoring, etc.), when any downstream component requests the candidate's column set for a specific candidate admission, then it receives the full column set including all schema fields and all columns written by upstream components.
- Given a candidate column that was modified by a manual edit or a reopen-correction, when a downstream component reads it after the modification, then it receives the revised current value — not the original imported value.
- Given a column marked stale (because an upstream input was corrected), when a downstream component reads it, then the system either (a) returns the stale value with an explicit staleness flag, or (b) refuses to return the value until it is recomputed — it does not return stale data silently as current.
- Given the candidate column API, when it is called without a valid authenticated institute context, then it rejects with HTTP 403.

**FR references:** FR-CND-008, FR-CND-006 (field masking applies to downstream reads too)
**Size:** M
**Dependencies:** EPIC-005-US-03, EPIC-002-US-01
