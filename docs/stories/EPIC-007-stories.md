# EPIC-007 — Condition Engine (Shared, Dual-Execution): User Stories

**Epic ref:** EPIC-007
**Priority:** P0 — build early; ten components depend on it (SRS §10.4).
**FR coverage:** FR-CND-ENG-001 through FR-CND-ENG-007
**Build-order position:** Sixth (alongside audit; before any component that uses conditions). Platform decision: JsonLogic serialisation, own ~300-line implementation for dual execution.

**Architectural constraint (FR-CND-ENG-004):** In-memory and SQL-compiled execution paths must derive from one grammar. No divergent implementations. Every story involving execution must reflect this constraint in its ACs.

**Scope note:** The row-level data-scope consumer of the engine is gated on open question P-03 (per-user data scope). Stories EPIC-007-US-05 and EPIC-007-US-06 cover the engine capability for data-scope compilation but note the consumer-side dependency separately. The engine itself ships without waiting on P-03.

---

## Story EPIC-007-US-01 — Condition serialisation format (JsonLogic)

**As a** platform engineer, **I want** conditions persisted in a documented JsonLogic-based serialisation format supporting nested AND, OR, and NOT over typed field predicates, **so that** conditions authored by configuration tools, imported from external systems, and stored in the database share a single unambiguous wire format.

**Acceptance Criteria:**
- Given a condition composed of nested AND/OR/NOT nodes over typed field predicates, when it is serialised, then the output is valid JsonLogic JSON: AND nodes use `{"and": [...]}`, OR nodes use `{"or": [...]}`, NOT uses `{"!": [...]}`, and field predicates use `{"operator": [{"var": "field_key"}, value]}`.
- Given a serialised condition, when it is deserialised by the engine, then the engine reconstructs the same logical tree without loss of nesting depth or predicate detail.
- Given the serialisation format, when a condition references a field, then the field is referenced by its schema key name (not a display label), so the reference remains stable even if the display name changes.
- Given a condition that is stored in the database and later retrieved, when the engine loads and validates it, then the condition is structurally valid (well-formed JsonLogic) and passes field validation against the current schema.

**FR references:** FR-CND-ENG-001
**Size:** S
**Dependencies:** EPIC-002-US-01

---

## Story EPIC-007-US-02 — In-memory evaluation against a single candidate context

**As a** component (import filter, verification router, shortlist, scoring variant, etc.), **I want** to evaluate a condition against a single candidate's field values in memory, **so that** per-candidate decisions can be made without issuing a database query per evaluation.

**Acceptance Criteria:**
- Given a condition expressed in the serialised format and a candidate context (a flat map of field key → typed value), when the engine evaluates the condition, then it returns a boolean result: `true` if the candidate satisfies the condition, `false` otherwise.
- Given a condition with nested AND/OR/NOT, when evaluated in memory, then the engine evaluates sub-conditions lazily: AND short-circuits on the first `false`, OR short-circuits on the first `true`.
- Given a field referenced in the condition that is absent from the candidate context, when the engine evaluates, then it treats the field as having no value; the result depends on the predicate (e.g., an equality check on an absent field returns `false`; an `is-null` check returns `true`).
- Given the same condition and context evaluated via the in-memory path and the SQL-compiled path (EPIC-007-US-03), when both are run against the same data, then they return the same logical result — this is the primary invariant of FR-CND-ENG-004.
- Given a condition evaluation, when it executes, then no dynamic code execution (eval, exec, compile) is used; the engine dispatches only through its explicit operator allow-list.

**FR references:** FR-CND-ENG-002, FR-CND-ENG-004, FR-CND-ENG-005
**Size:** M
**Dependencies:** EPIC-007-US-01

---

## Story EPIC-007-US-03 — SQL predicate compilation from the same grammar

**As a** component (communication recipient selection, data-scope enforcement), **I want** to compile a condition to a SQL WHERE predicate from the same grammar used for in-memory evaluation, **so that** large-pool filtering and data-scope enforcement run at the database level without a second evaluator implementation.

**Acceptance Criteria:**
- Given a condition expressed in the serialised format and a target database table alias, when the engine compiles it to SQL, then it outputs a parameterised SQL WHERE clause fragment with no string interpolation of user-controlled values (no SQL injection surface).
- Given a nested AND/OR/NOT condition, when compiled to SQL, then the output uses `AND`, `OR`, and `NOT` / `<> ALL(...)` SQL constructs that match the logical structure of the source condition.
- Given the compiled SQL predicate, when appended to a base query and executed, then it returns the same set of rows that the in-memory evaluator would select were it applied row-by-row to the same dataset — this is the FR-CND-ENG-004 invariant for the database path.
- Given a field referenced in the condition, when compiled, then the field is mapped to the correct column in the target table; if the field does not exist in the schema at compile time, compilation is rejected (not deferred to query execution time).
- Given the compiled SQL, when it is reviewed, then all literal values are passed as query parameters, not embedded in the SQL string.

**FR references:** FR-CND-ENG-003, FR-CND-ENG-004, FR-CND-ENG-005
**Size:** M
**Dependencies:** EPIC-007-US-01, EPIC-007-US-02

---

## Story EPIC-007-US-04 — Operator allow-list derived from field data types

**As a** component author or configuration tool, **I want** the engine to derive valid comparison operators per field from the field's data type, **so that** semantically nonsensical conditions (e.g., `greater_than` on a string field) are rejected before they are stored or evaluated.

**Acceptance Criteria:**
- Given a schema with fields of types string, number, date, boolean, and enum, when the engine returns the valid operators for each field type, then: string fields allow `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`, `is_null`, `is_not_null`; number and date fields add `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`; boolean fields allow `equals`, `not_equals`, `is_null`, `is_not_null`; enum fields allow `equals`, `not_equals`, `in`, `not_in`, `is_null`, `is_not_null`.
- Given a predicate using an operator not in the allow-list for the field's type (e.g., `contains` on a date field), when the engine validates the condition, then it rejects the condition with an error naming the invalid operator and the field's type.
- Given a condition builder UI (future) or a script constructing a condition, when it calls the engine to get valid operators for a field, then the engine returns the allow-list for that field's type — not all operators.
- Given a condition that was valid when created but whose field type has since changed (schema evolution), when the engine validates it on load, then it re-validates operator compatibility against the current type and surfaces any violations.

**FR references:** FR-CND-ENG-005, FR-CND-ENG-006
**Size:** S
**Dependencies:** EPIC-007-US-01

**[AMBIGUOUS: The SRS lists operator allow-list as a requirement (FR-CND-ENG-005) but does not enumerate the full operator set. The table in EPIC-007-US-04 AC-1 is my derivation from standard database operator sets and JsonLogic conventions. This must be reviewed and explicitly approved by the Architect before the allow-list is implemented — it determines the expressible power of every condition across all ten consumers.]**

---

## Story EPIC-007-US-05 — Condition validation against the field schema

**As a** platform engineer or component, **I want** the engine to reject conditions that reference fields not present in the active schema at validation time, **so that** configuration errors are caught at save time, not at evaluation time when they silently produce wrong results.

**Acceptance Criteria:**
- Given a condition referencing a field key, when the engine validates the condition against a provided schema, then if the field key is not present in the schema, the engine rejects the condition with an error naming the missing field.
- Given a condition validated against schema version N, when the schema advances to version N+1 and a field is removed, then re-validation of the stored condition against the new schema surfaces the now-missing field reference.
- Given a condition with valid field references, when validation succeeds, then the engine also validates that each operator is valid for the referenced field's type (FR-CND-ENG-006 coupling).
- Given a component that saves a condition, when the save operation is submitted, then the engine's validation runs before the condition is persisted; invalid conditions are never written to the database.

**FR references:** FR-CND-ENG-007, FR-CND-ENG-006
**Size:** S
**Dependencies:** EPIC-007-US-01, EPIC-007-US-04

---

## Story EPIC-007-US-06 — Data-scope condition compilation (stub for P-03)

**As a** platform engineer, **I want** the engine to compile data-scope conditions (row-level access control) to SQL predicates using the same grammar as all other conditions, **so that** per-user data scope enforcement (e.g., coordinator sees only their sessions) does not require a separate evaluator once P-03 is resolved.

**Acceptance Criteria:**
- Given a data-scope condition associated with a user context, when compiled by the engine, then it produces a SQL WHERE fragment that, when applied to a candidate or session query, restricts results to those the user is permitted to see.
- Given the compilation result, when appended to a base query, then it does not change the query for a user with unrestricted scope (the fragment reduces to a no-op predicate or is omitted entirely).
- Given the same data-scope condition, when evaluated in-memory against a single record, then the result matches what the SQL predicate would return for that record — FR-CND-ENG-004 invariant holds for data-scope conditions as well.
- Given that open question P-03 is unresolved, when this story is implemented, then it delivers the engine capability (compilation of data-scope predicates) but the consumer-side integration (coordinator sees own sessions, scorer sees own candidates) is left as a stub wired to unrestricted scope until P-03 is resolved by a human decision.

**FR references:** FR-CND-ENG-003, FR-CND-ENG-004; SRS §8.1 P-03 (data-scope consumer — blocked on human resolution)
**Size:** S
**Dependencies:** EPIC-007-US-03
**Open question:** P-03 (per-user data scope placeholders) must be resolved by the PM/human before the consumer-side integration can be completed. This story delivers the engine capability only.
