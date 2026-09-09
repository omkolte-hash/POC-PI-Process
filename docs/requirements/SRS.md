# Geta Admission Workflow Platform
# Software Requirements Specification

**Version:** 5.2
**Date:** 03 September 2026
**Status:** Draft for review
**Supersedes:** v5.1

**Consolidated.** This document folds Amendments 5.1 and 5.2 into the full specification. Changes are marked **[5.1]** or **[5.2]** in place.

---

# 1. Introduction and scope

## 1.1 Purpose

This document specifies the requirements for the Geta Admission Workflow Platform, a multi-tenant system that allows institutes to configure and execute their own admission selection processes without custom development.

## 1.2 Product concept

The platform is not an admission process. It is the machinery for expressing one. Geta supplies a catalogue of reusable components; each institute arranges them on a visual canvas, configures each one, defines the conditions on the connections, validates the graph and publishes it. The engine then executes that process for every candidate.

Two institutes with entirely different admission processes run on the same codebase with no custom code.

**The organising model is a spreadsheet.** Every candidate admission is a row. Import establishes the columns. Every component thereafter either adds columns or reads columns and writes a decision. The admission sequence is data and configuration, never hardcoded application logic.

## 1.3 In scope

Candidate data import, **document collection [5.1]**, **document verification [5.1 — narrowed from document and field verification]**, shortlisting, assessment configuration and execution, attendance, score processing, merit ranking and release, seat management, offer generation, communication, document printing, reporting, approval workflows, and the workflow engine that connects them.

## 1.4 Out of scope for version one

| Item | Reason |
|---|---|
| Offline assessment delivery | Descoped. Removes campus, centre, venue and room entities. |
| Candidate self service portal | Blocked on the candidate access decision. |
| **Field verification [5.1]** | **Verification is scoped to documents only. A claimed value with no supporting document cannot be verified in v1.** |
| **Data import configuration UI [5.1]** | **Descoped. Loading performed by script through the import service layer. The engine remains in scope.** |
| Fee payment processing | Deferred. |
| Scheduled data ingestion | Phase two. |
| Database row level security | Phase two. Enforced by a base repository layer in version one. |
| Multiple roles per user | Phase two. Combined duties need a merged role. |

## 1.5 Definitions

| Term | Meaning |
|---|---|
| Institute | A tenant. The top level customer entity. |
| Programme | A durable course of study. Self referencing, so a sub programme is a programme with a parent. |
| Academic year | A year of intake under a programme. |
| Admission cycle | The execution scope. Multiple concurrent cycles are permitted. |
| Candidate | A person. Institute scoped, deduplicated on merge keys. |
| Candidate admission | One person's journey through one admission cycle. This is the row in the spreadsheet. |
| Component | A reusable capability supplied by Geta. |
| Component configuration | How an institute wants a component to behave. Versioned. |
| Workflow version | An immutable published snapshot of the process graph. |
| Workflow instance | The runtime position of one candidate admission in a published workflow. |
| Condition engine | The single shared expression evaluator used by every component. |

---

# 2. High level system overview

Four layers. Users reach the system through interfaces; the workflow engine orchestrates but contains no business logic; components carry the business logic; platform services support everything.

```
USERS
Institute admin · admissions officer · verifier · scorer · coordinator · approver
                              ↓
INTERFACES
Admin console · workflow builder · scorer portal · coordinator portal · approver inbox
                              ↓
WORKFLOW ENGINE
Starts components · reads outcomes · evaluates transitions · no business logic
                              ↓
COMPONENTS
  Pipeline nodes
    Import · Document collection · Candidates · Verification · Shortlist
    Scheduling · Attendance · Score capture · Scoring
    Merit · Seats · Offer
  Gate and actions — placeable at any point in the graph
    Approval · Communication · Print
                              ↓
PLATFORM SERVICES
Condition engine · Identity and RBAC · Audit · Reports
```

---

# 3. Actors and system interaction

All authorisation is permission based. The names below are conventional role labels; the system enforces permissions, never role names. An institute composes whatever roles it wants from the permission catalogue.

| Actor | Use cases |
|---|---|
| Geta super admin | Manage institutes and catalogue |
| Institute admin | Configure components · design and publish workflow · manage roles and permissions · **issue and revoke API credentials [5.1]** |
| Admissions officer | Import candidates · run shortlist and schedule · process merit and seats |
| Verifier | Decide verification items |
| Scorer | Enter scores |
| Coordinator | Mark attendance |
| Approver | Approve or deny submissions |
| **External system [5.1]** | **Push documents over the authenticated collection API. A machine client, not a user.** |

**Candidates are not actors.** They hold no account and no membership. They are records in the system, not users.

---

# 4. Architecture

## 4.1 Entity model

```
Institute
├── Users and roles
├── Workflow versions
└── Programme  (self referencing, arbitrary depth)
      └── Academic year
            └── Admission cycle  ── binds → workflow version at start
                  └── Candidate admission  ── belongs → Candidate
                        └── Workflow instance
```

A person and their application are separate entities, so one person may apply to two programmes or reapply next year without becoming two unrelated records. Programme sits above academic year because a programme is durable, not recreated annually.

**One workflow configuration per institute in version one.** The data model supports several; the product enforces one. Each admission cycle binds to a specific workflow version at execution start, so editing next year's process does not alter a cycle already running.

## 4.2 Two operating modes

| Mode | Actor | Behaviour |
|---|---|---|
| Design time | Institute admin | Select components, configure them, place on canvas, connect, define outcome conditions, validate, publish. No candidate data moves. Nothing executes. |
| Runtime | Operational users | Candidates traverse the published graph. Configuration freezes for any node whose data has been consumed. |

Design time must never accidentally execute candidate operations. This is enforced by preview before commit in import, shortlist, scoring and merit, and by input locking after commit.

**[5.2] Configuration is split across the two modes.** Not every setting can be known before a round begins. A shortlist cutoff cannot be chosen before the applicant count is known; sessions cannot be scheduled before the shortlisted number is known. The distinction is between a rule's **shape**, which is designed and frozen, and its **parameter**, which an operator supplies when the node runs.

| Node | Designed once, frozen at publication | Supplied at run time |
|---|---|---|
| Shortlist | Rule shape — top N by a named column | The value of N |
| Scheduling | That sessions exist, group structure, capacity rules | Dates, number of sessions, capacities |
| Merit | Bands, their order and outcome types, ranking columns | Band sizes or cutoff values |
| Scoring | Formula shape, weights, variants | — |
| Verification | Document types, blocking flags, outcome actions | — |

FR-WFE-019 is what keeps this honest. Without it, run time configurability becomes an operator rewriting the rule, and a published versioned flow ceases to mean anything.

**[5.2] Node execution has two modes.** A node whose rule is absolute — category equals a value, score at or above a threshold, documents valid — can be evaluated for one candidate alone. A node whose rule is relative — top 500, rank within category, adjustment for scorer leniency — compares candidates against one another and cannot produce a result from a pool of one. FR-WFE-022 requires the second case to refuse rather than return a meaningless answer.

One consequence worth naming: in cohort mode, Scoring's readiness gate blocks the entire run when any candidate is missing data (FR-SCR-015). In individual mode it blocks only that candidate. Both are correct for their mode, and the operator should be told which they are running.

## 4.3 The component contract

Every executable component exposes the same six part contract. This uniformity is what allows the workflow builder to treat different components identically and lets the engine orchestrate without knowing component internals.

- **Configuration** — what the institute has set up. Design time. Versioned.
- **Input** — runtime data received or resolved at execution. Varies per execution.
- **Conditions** — rules evaluated against input and configuration.
- **Processing** — what the component does internally.
- **Output** — data produced, persisted or consumed downstream.
- **Outcome** — the workflow level result the engine uses to select a transition.

**Configuration is not input.** A rubric, panel size and scoring model are configuration. A candidate admission and their scores are input. The test: could this data vary for each execution? If not, it is configuration.

**Output is not outcome.** Output is data — rank 14, band selected, release MR-001. Outcome is a single value the engine reads — SELECTED. The workflow transition itself is never part of output.

## 4.4 Three architectural primitives

**One shared condition engine.** A single expression evaluator serves import filters, verification outcome routing, shortlist conditions, allocation eligibility, scoring variants, merit bands, seat conversion rules, communication recipient selection, workflow transitions, and row level data scope. Ten consumers, one engine.

**Configuration over code, applied uniformly.** Nothing is hardcoded — not the candidate schema, assessment types, rubric parameters, who scores what, merit bands, partitions, approval levels, or the process graph itself.

**Approval and permission as cross cutting concerns.** Any node may require approval. Every action is gated by a permission from a catalogue, never by a fixed role name.

## 4.5 Multi tenancy

Institute A must never access Institute B's data. The authenticated user's active membership determines institute scope. An institute lock is applied automatically to every role, invisible and immutable to institute admins, and injected by a base repository layer rather than by individual queries.

**[5.1] This applies to scripted data loading.** Direct database writes bypass the base repository layer and therefore bypass the institute lock. See FR-ING-030.

---

# 5. Component catalogue

Twenty three items across five classifications. Only pipeline nodes, decision gates and action nodes are placed on the workflow canvas. Configuration surfaces are set up before the process runs. Platform services and lifecycle capabilities are not workflow nodes.

| Component | Classification | Requirements |
|---|---|---|
| Global configuration | Configuration surface | 7 |
| Data import | Pipeline node | 31 |
| **Document collection [5.1]** | **Pipeline node** | **18** |
| Candidate management | Pipeline node | 8 |
| Verification | Decision gate | 18 |
| Shortlist | Decision gate | 15 |
| Assessment definition | Configuration surface | 30 |
| Panelist management | Configuration surface | 6 |
| Scheduling and allocation | Pipeline node | 29 |
| Score capture | Pipeline node | 17 |
| Attendance | Pipeline node | 28 |
| Scoring | Pipeline node | 36 |
| Merit | Pipeline node | 24 |
| Seat allocation | Pipeline node | 14 |
| Offer | Pipeline node | 12 |
| Approval | Decision gate, placeable anywhere | 18 |
| Communication | Action node | 14 |
| Print | Action node | 12 |
| Reports | Platform service | 16 |
| **Condition engine [5.1]** | **Platform service** | **7** |
| Reopen and correction | Lifecycle capability | 8 |
| Audit | Platform service | 6 |
| Workflow engine | Platform service | 29 |

**Total: 403 requirements. 391 effective in v1** (twelve import UI requirements deferred).

**Not yet specified:** exception handling, hold and resume, withdrawal. Referenced in the catalogue but with no defined contract.

## 5.1 Data flow between components

| Component | Consumes | Produces | Outcome |
|---|---|---|---|
| Import | CSV files | Candidate admissions | Committed |
| **Document collection** | **API submissions** | **Attached documents** | **Complete · incomplete** |
| Verification | **Documents** | Decisions, reassigned values | Verified · rejected |
| Shortlist | Candidate columns | Group assignment | Configured group |
| Scheduling | Eligible candidates | Allocation, panel, link | Allocated |
| Attendance | Roster | Attendance columns | Present · absent · partial |
| Score capture | Allocation, attendance | Raw scores | Completed · incomplete |
| Scoring | Raw scores, columns | Final score | Scored · not ready |
| Merit | Final scores, seats | Rank, band, release | Selected · waiting · excluded |
| Seats | Releases, offers | Seat counts | Available · exhausted |
| Offer | Released batch | Offer documents | Generated · released |

---

# 6. Functional requirements by component

## 6.1 Global configuration

Configuration surface. Establishes the scoping hierarchy every other component operates within.

| ID | Requirement |
|---|---|
| FR-GC-001 | System shall allow an institute admin to define programmes under an institute as a self referencing hierarchy with arbitrary nesting depth. |
| FR-GC-002 | System shall allow definition of academic years under a programme. |
| FR-GC-003 | System shall allow definition of admission cycles under an academic year. |
| FR-GC-004 | System shall permit multiple concurrent admission cycles under one academic year. Opening a new cycle shall not require closing a prior one. |
| FR-GC-005 | System shall allow an admission cycle status of draft, active or closed. |
| FR-GC-006 | All configuration entities shall be scoped to the initiating institute. |
| **FR-GC-007** | **[5.2]** Operational views shall be available only for admission rounds in an active state. Where no active round exists within a user's scope, no operational stage shall be presented to them. |

## 6.2 Data import

Pipeline node. Brings candidate data in from spreadsheet files and creates candidate and candidate admission records.

**[5.1] The configuration UI is descoped from v1.** The engine remains in scope and is invoked by script. Configuration is supplied as version-controlled files rather than through screens.

> **Input** — CSV datasets, target admission cycle, existing candidates resolved internally for matching
> **Output** — candidate and candidate admission records, provenance, lineage, run report
> **Outcome** — committed · preview only · failed · partially completed

### Parsing and schema inference

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-001 | System shall parse an uploaded CSV into structured rows. | Engine |
| FR-ING-002 | System shall infer each column's data type from its values. | Engine |
| FR-ING-003 | System shall build a schema of fields and inferred types from a dataset. | Engine |
| FR-ING-004 | System shall normalise raw header names into clean field keys. | Engine |
| FR-ING-005 | System shall allow an admin to review and override inferred names and types before the schema is finalised. | **Deferred** |

### Join engine

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-006 | System shall allow definition of a composite key of one or more fields to match rows across datasets. | Engine |
| FR-ING-007 | System shall join a left and right dataset on the defined key. | Engine |
| FR-ING-008 | System shall allow chaining multiple joins for three or more datasets. | Engine |
| FR-ING-009 | System shall allow selection of join type per join: inner, left or full. | Engine |
| FR-ING-010 | System shall allow configuration of join time duplicate match resolution: first match, last match, expand to multiple rows, or flag as error. | Engine |
| FR-ING-011 | System shall allow configuration of unmatched row handling consistent with join type: drop, keep with nulls, or flag for review. | Engine |

### Filtering

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-012 | System shall determine valid comparison operators per field based on data type. | Engine |
| FR-ING-013 | System shall evaluate a single filter condition against a row. | Engine |
| FR-ING-014 | System shall evaluate a nested AND/OR filter group against a row. | Engine |
| FR-ING-015 | System shall apply a configured filter to a full dataset. | Engine |

### Mapping and transformation

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-016 | System shall support transform operations: date formatting, value to label mapping, concatenation, split and extract, calculated fields, and conditional logic. | Engine |
| FR-ING-017 | System shall apply a single mapping to a row. | Engine |
| FR-ING-018 | System shall apply an ordered list of mappings to a row. | Engine |
| FR-ING-019 | System shall auto generate a starting mapping set from the inferred schema, adjustable by the admin. | **Deferred** |

### Preview and commit

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-020 | System shall run the full pipeline in preview mode with no data persisted. | **Required as a script mode; deferred as a screen** |
| FR-ING-021 | On commit, system shall create or match a candidate, then create a candidate admission for the target admission cycle. | Required |
| FR-ING-022 | Where a row's merge key matches an existing candidate, system shall apply the configured identity resolution strategy: reject, overwrite, merge with new winning, merge with existing winning, merge by source priority, or flag for manual review. | Required |
| FR-ING-023 | System shall record per record import job lineage and per field provenance. Ownership of committed records passes to candidate management. | Required |

### Saved configurations

| ID | Requirement | v1 |
|---|---|---|
| FR-ING-024 | System shall allow saving a configured pipeline as a reusable configuration. | **Deferred** |
| FR-ING-025 | System shall retrieve the latest version of a saved configuration. | **Deferred** |
| FR-ING-026 | Saved configurations shall be scoped to the institute. | **Deferred** |
| FR-ING-027 | System shall detect when a saved configuration references fields absent from a newly uploaded file and surface this before running. | **Deferred** |
| FR-ING-028 | System shall rehydrate a new import job from a saved configuration, pre filled for review. | **Deferred** |
| FR-ING-029 | Each executed import job shall be scoped to one admission cycle. | Required |

### Scripted loading **[5.1]**

| ID | Requirement |
|---|---|
| **FR-ING-030** | All candidate data loading in v1 shall be performed through the import service layer. Direct database writes bypassing that layer shall not be used. |
| **FR-ING-031** | The loading script shall accept the same configuration structure the deferred UI will later produce, so that adding the UI requires no engine change. |

**Why FR-ING-030 exists.** Writing directly to the database bypasses the base repository layer, which is what enforces the institute lock under §4.5. That is R-14 materialising on day one. It also skips validation, per-field provenance and import lineage, so nothing records where a value came from.

**Consequence.** Import is not operator-facing in v1. It remains the graph entry point, but a developer runs it. Acceptable for a first cohort; a support burden at scale, since every re-import and every corrected file becomes a ticket. **Recommend the UI returns in the release immediately following v1, before a second institute onboards.**

## 6.3 Document collection **[5.1 — new]**

Pipeline node, positioned after import. Accepts documents for existing candidate admissions over an authenticated API, pushed by the institute's own portal or another external system.

> **Input** — API request carrying client credentials, identity key value, document type and file
> **Output** — stored documents, receipt reference, per-candidate completeness state, collection report
> **Outcome** — complete · incomplete

**Trust boundary.** The platform authenticates the calling system, not the student. The institute owns applicant authentication. If their portal has a weak session or permits one applicant to reach another's upload path, the platform will accept a document against the wrong candidate and has no means to detect it. This is a reasonable v1 trade, recorded as a stated assumption rather than an oversight.

| ID | Requirement |
|---|---|
| FR-EDC-001 | System shall expose an authenticated API endpoint accepting document submissions for existing candidate admissions. |
| FR-EDC-002 | API clients shall authenticate using service credentials scoped to a single institute. Credentials shall confer no user identity, membership or role. |
| FR-EDC-003 | System shall allow an admin to issue, list, rotate and revoke API credentials, each action audited. |
| FR-EDC-004 | System shall allow configuration of accepted document types, each marked required or optional. |
| FR-EDC-005 | System shall allow configuration of permitted file formats and maximum file size per document type. |
| FR-EDC-006 | System shall allow configuration of the identity key used to match inbound submissions to candidate admissions. |
| FR-EDC-007 | System shall reject a submission whose identity key matches zero or more than one candidate admission in the target cycle. |
| FR-EDC-008 | System shall reject a submission for a document type not configured for that cycle. |
| FR-EDC-009 | System shall reject a file violating the configured format or size constraints. |
| FR-EDC-010 | System shall allow configuration of a collection window and shall reject submissions outside it. |
| FR-EDC-011 | System shall allow configuration of whether a repeat submission for the same document type replaces the prior file or is retained as a new revision. |
| FR-EDC-012 | System shall return a receipt reference for every accepted submission. |
| FR-EDC-013 | System shall record client identity, timestamp and source address against every submission. |
| FR-EDC-014 | System shall track per candidate which required document types have been received. |
| FR-EDC-015 | System shall expose collected documents to the verification component. |
| FR-EDC-016 | System shall report collection status per cycle: complete, incomplete and the specific missing types. |
| FR-EDC-017 | System shall rate limit submissions per client. |
| FR-EDC-018 | Rejected submissions shall be logged with the reason and shall not create partial records. |

**Open:** whether collection blocks a candidate awaiting required documents, or passes through to be caught by Verification's blocking flag. Also unresolved: document storage, which determines retention, residency and processor status.

## 6.4 Candidate management

Pipeline node. Owns candidate records after import and serves as the canonical data source for all downstream components.

| ID | Requirement |
|---|---|
| FR-CND-001 | System shall own candidate and candidate admission records after import commit. |
| FR-CND-002 | System shall allow search of candidates by identifier or name. |
| FR-CND-003 | System shall present a candidate profile showing all schema fields, computed columns and provenance. |
| FR-CND-004 | System shall present a candidate's workflow trace: steps completed, current step and outcomes recorded. |
| FR-CND-005 | System shall present all candidate admissions belonging to one candidate. |
| FR-CND-006 | System shall apply field masking per the requesting user's authorisation. |
| FR-CND-007 | System shall allow authorised manual editing of candidate fields, recorded as a revision with actor and reason. |
| FR-CND-008 | System shall expose candidate columns to all downstream components as the canonical data source. |

## 6.5 Verification

Decision gate. **[5.1] Verifies documents and applies configured outcome actions. Field verification is out of scope.**

> **Input** — candidate admission, documents collected for that candidate, verifier decision
> **Output** — decisions, reassigned field values, override records, status report
> **Outcome** — verified · rejected · overridden

**Verification is not a boolean gate.** A failed verification may reclassify a candidate — for instance moving them from a reserved category to general — rather than rejecting them. The reassign outcome action survives the narrowing: that is a document check with a field consequence, which is different from verifying a field directly.

| ID | Requirement |
|---|---|
| **FR-VER-001** | **[5.1 revised]** System shall allow definition of verification items targeting **documents** collected for a candidate admission. |
| FR-VER-003 | System shall allow items to be grouped into a unified queue or separate queues. |
| FR-VER-004 | System shall allow each item to be marked blocking or non blocking for stage exit. |
| FR-VER-005 | System shall allow configuration of outcome actions per result: proceed unchanged, reject candidate, or reassign a field value. |
| FR-VER-006 | System shall allow the target field and replacement value for a reassign action to be configured per item. |
| FR-VER-007 | Verification shall be permitted to any role holding the verification permission. No fixed verifier role type shall exist. |
| FR-VER-008 | System shall provide a separate override permission allowing advancement past a blocking unresolved item. |
| FR-VER-009 | Every override shall be recorded with actor, timestamp and reason, and shall be non deletable. |
| FR-VER-010 | System shall present pending candidates as a queue scoped to the admission cycle. |
| FR-VER-011 | A verification item shall be decided by a single verifier. |
| FR-VER-012 | System shall allow marking an item valid or invalid, with a mandatory reason on invalid. |
| FR-VER-013 | Verification decisions shall be recorded one item at a time. |
| FR-VER-014 | System shall record verifier identity, decision, reason and timestamp per item. |
| FR-VER-015 | On an invalid decision, system shall execute the configured outcome action. |
| FR-VER-016 | A candidate shall not exit the verification node until all blocking items are decided. |
| FR-VER-017 | Non blocking items may remain undecided without preventing exit. |
| FR-VER-018 | A candidate may exit with blocking items unresolved only via an authorised override. |
| FR-VER-019 | System shall report per cycle verification status: pending, valid, invalid, overridden. |

**Withdrawn [5.1]:** FR-VER-002 — an item may target a data field, an uploaded document, or both.

**Scope gap [5.1].** Any institute rule that depends on checking a *claimed value* rather than a *document* has no home in v1. Two examples that will arise: verifying a self-reported marks value against a source, and verifying a claimed domicile without a supporting certificate. Where the check has a document behind it, it still works. Where it does not, the institute must attach a document type for it or handle it outside the system.

## 6.6 Shortlist

Decision gate. Categorises candidates into configured groups by condition, in a single cohort wide run.

> **Input** — all candidate admissions in the cycle, columns referenced by group conditions and rank specification
> **Output** — group assignment per candidate, run identifier, downstream column
> **Outcome** — the configured group identifier, not a fixed binary

| ID | Requirement |
|---|---|
| FR-SHL-001 | System shall allow definition of shortlist groups, each with a name and an assignment condition via the shared condition engine. |
| FR-SHL-002 | System shall support any number of groups. A two group configuration is the common case, not a constraint. |
| FR-SHL-003 | Groups shall be ordered. A candidate is assigned to the first group whose condition matches. |
| FR-SHL-004 | System shall require a default group with no condition. |
| FR-SHL-005 | System shall allow an optional rank specification enabling count based and cutoff based conditions to resolve deterministically. |
| FR-SHL-006 | Group conditions shall support field predicates, headcount limits, threshold cutoffs and combined AND/OR expressions. |
| FR-SHL-007 | System shall evaluate all candidates in the admission cycle in a single run. |
| FR-SHL-008 | System shall assign each candidate to exactly one group. |
| FR-SHL-009 | System shall record the assigned group with run identifier and timestamp. |
| FR-SHL-010 | System shall present a pre commit preview showing counts per group and the candidates in each. |
| FR-SHL-011 | System shall persist group assignments on commit. |
| FR-SHL-012 | A committed run shall be submitted to the approval component, configurable and bypassable. |
| FR-SHL-013 | On rejection, all assignments from the run shall be cleared and candidates returned to their pre run state. |
| FR-SHL-014 | Assignments shall become effective downstream only on approval, or immediately where bypassed. |
| FR-SHL-015 | Shortlist group assignment shall be readable downstream as a candidate column. |

## 6.7 Assessment definition

Configuration surface, not a workflow node. Read by both scheduling and score capture. Owns what gets scored and by whom; owns no transformation.

### Assessment record

| ID | Requirement |
|---|---|
| FR-ASM-001 | System shall allow creation of an assessment scoped to a programme. |
| FR-ASM-002 | Assessment types shall come from a configurable, institute extensible catalogue. The system shall not be limited to interview, group discussion or written test. |
| FR-ASM-003 | System shall capture per assessment: name, short code and type. |
| FR-ASM-004 | System shall allow a sequence number defining execution order across multiple assessments. |
| FR-ASM-005 | System shall allow configuration of panel size as any positive integer, with no upper bound. |
| FR-ASM-006 | System shall allow configuration of total marks per assessment. |
| FR-ASM-007 | Delivery shall be online in version one. Offline delivery is out of scope. |
| FR-ASM-008 | System shall allow selection of a score entry model: single shared group score, independent per scorer averaged, or a single panel deliberated score. |
| FR-ASM-010 | System shall list assessments per programme with edit and delete actions. |
| FR-ASM-011 | Selecting edit shall repopulate the creation form in update mode. |
| FR-ASM-012 | System shall validate mandatory fields on save. |

*FR-ASM-009, scaling, has moved to the scoring component. Assessment definition owns no transformation.*

### Rubric

| ID | Requirement |
|---|---|
| FR-ASM-013 | System shall allow definition of scoring parameters per assessment forming the rubric. |
| FR-ASM-014 | Each assessment type shall maintain its own parameter set, presented as tabs. |
| FR-ASM-015 | System shall capture per parameter: name, sequence, maximum weightage, allow zero flag and allow decimal flag. |
| FR-ASM-016 | System shall display the linked assessment's score entry model and total marks as context during parameter configuration. |
| FR-ASM-017 | System shall list parameters in sequence order with edit and delete actions. |
| FR-ASM-063 | Each rubric parameter shall specify which role or permission is authorised to score it. |
| FR-ASM-064 | One rubric may contain parameters scored by different roles, including roles outside the interview panel. |
| FR-ASM-065 | System shall present each scorer only the parameters they are authorised to score. |
| FR-ASM-066 | A candidate's aggregate shall be computed only when every parameter has been scored by an authorised scorer. |
| FR-ASM-067 | Assessment shall output only raw scores, attributed to parameter, scorer and candidate. |
| FR-ASM-082 | System shall allow configuration of which candidate columns appear as scorer context per assessment. |

### Draft and approval

| ID | Requirement |
|---|---|
| FR-ASM-018 | Parameter changes shall write to a draft revision, not the live rubric. |
| FR-ASM-019 | System shall indicate when an unapproved draft exists. |
| FR-ASM-020 | Draft submission shall invoke the approval component. |
| FR-ASM-021 | A draft shall merge into the live rubric only on full approval. |
| FR-ASM-022 | System shall retain rubric revision history with actor and timestamp. |
| FR-ASM-024 | System shall allow each module's configuration to specify whether the approval step is enabled or bypassed. |
| FR-ASM-025 | System shall lock an assessment's rubric once any score is recorded against it. |

## 6.8 Panelist management

Configuration surface. Panelists are users with a membership, never a separate entity type.

| ID | Requirement |
|---|---|
| FR-ASM-038 | Panelists shall be users with a panelist role via membership. No separate panelist entity type shall exist. |
| FR-ASM-039 | Where a panelist's email already exists globally, system shall attach a new membership rather than create a second account. |
| FR-ASM-040 | Panelist onboarding shall invoke the approval component with configurable levels, bypassable per configuration. |
| FR-ASM-041 | System shall provision credentials only after approval completes. |
| FR-ASM-079 | System shall maintain a panelist profile capturing salutation, name, email, mobile, professional network link, qualifications, present organisation, present designation, years of industry experience, years of academic experience, photograph, associated programmes and remarks. |
| FR-ASM-080 | System shall allow classification of a panelist as internal or external to the institute. |

## 6.9 Scheduling and allocation

Pipeline node. Places eligible candidates into sessions and groups, staffs those groups, and resolves meeting resources.

> **Input** — candidate admissions, columns referenced by the eligibility condition, panelist approval state
> **Internally managed** — sessions, groups, panel assignments, meeting links. Resources, not workflow input
> **Output** — allocation record, assessment identifier, panel roster, meeting link, reallocation records
> **Outcome** — allocated · not eligible

### Sessions and groups

| ID | Requirement |
|---|---|
| FR-ASM-027 | System shall allow creation of a session linked to an assessment, capturing date, start time, end time, reporting time and capacity. |
| FR-ASM-028 | System shall express reporting time as an offset in minutes before session start. |
| FR-ASM-029 | System shall allow a session to be divided into groups, each with a name and candidate capacity. |
| FR-ASM-030 | System shall validate that the sum of group capacities does not exceed session capacity. |
| FR-ASM-031 | System shall validate that session duration meets a configurable minimum. |
| FR-ASM-032 | Meeting links shall be generated through a provider agnostic interface. No provider shall be hardcoded. |
| FR-ASM-033 | A group's meeting link shall be generated only after at least one panelist is assigned. |
| FR-ASM-054 | Sessions shall be scoped to an admission cycle. |
| FR-ASM-055 | System shall allow configuration of whether a session runs one assessment or several in sequence. |
| FR-ASM-075 | System shall present a session list showing session window, capacity and per session edit and delete actions. |

### Allocation

| ID | Requirement |
|---|---|
| FR-ASM-034 | System shall allow candidate allocation individually, in batch, by system auto placement, and by moving between groups. |
| FR-ASM-035 | A candidate shall belong to exactly one group of one session per assessment. |
| FR-ASM-036 | System shall generate a per candidate assessment identifier from group code plus a running number. |
| FR-ASM-037 | On moving a candidate between groups, system shall clear scores, notes and locks recorded under the previous group. |
| FR-ASM-056 | Allocation eligibility shall be a configurable condition. By default the candidate must have cleared the preceding workflow node. |
| FR-ASM-076 | System shall permit reallocation only for candidates whose attendance is unmarked or marked absent for the relevant assessment. |
| FR-ASM-077 | System shall allow bulk reallocation from one group to another, with a mandatory comment. |
| FR-ASM-078 | System shall produce a reallocation report showing previous group and identifier, new group and identifier, and new session. |
| FR-ASM-085 | System shall perform a pre allocation capacity check comparing eligible pool size against total available group capacity, and shall block allocation reporting the shortfall where capacity is insufficient. |

### Panel assignment

| ID | Requirement |
|---|---|
| FR-ASM-042 | Only fully approved panelists shall be assignable to a group. |
| FR-ASM-043 | System shall reject assignment exceeding the configured panel size. |
| FR-ASM-044 | System shall reject assigning the same panelist twice to one group. |
| FR-ASM-045 | System shall reject assigning a panelist to two groups whose sessions overlap in time. |

*A candidate cannot reach score capture without an assigned panel, since no meeting link is generated for an unstaffed group.*

## 6.10 Score capture

Pipeline node. Captures raw scores against the configured rubric. Two entry paths: panel scorers reach candidates through the group queue, non panel scorers through a cycle scoped list.

> **Input** — allocation seam or cycle candidate list, attendance state read live, scorer context columns, submitted values
> **Output** — assessment attempt, raw score per parameter per scorer, remarks, timestamps, raw aggregate
> **Outcome** — completed · incomplete · absent

| ID | Requirement |
|---|---|
| FR-ASM-046 | System shall present an assigned scorer their upcoming and in progress groups with date, time, group name and assessment name. |
| FR-ASM-047 | System shall present a group's candidates as an ordered queue. |
| FR-ASM-048 | System shall require every authorised rubric parameter to be scored before advancing. |
| FR-ASM-049 | System shall lock a submitted score against edit from the scorer interface. |
| FR-ASM-050 | Under the independent model, the aggregate shall be computed only when every currently assigned scorer has submitted a complete score. Until then it shall remain null. |
| FR-ASM-051 | System shall support all three score entry models. |
| FR-ASM-052 | Score capture shall output raw scores. Combination, scaling and eligibility are owned by scoring and merit. |
| FR-ASM-053 | Admin facing monitoring views shall be read only. |
| FR-ASM-057 | Under shared group and panel deliberated models, one designated lead shall enter the score, assignable manually or auto designated. |
| FR-ASM-058 | Under the independent model, scorers shall not see other scorers' values for a candidate until all have submitted. |
| FR-ASM-059 | System shall allow configuration of commit behaviour: immediate lock on submit, or deferred confirmation of the full candidate list before locking. |
| FR-ASM-060 | Score revert shall be performed through the reopen capability, inheriting its audit and staleness propagation. |
| FR-ASM-061 | Attendance shall be owned by the attendance component. Score capture reads attendance state rather than capturing it. |
| FR-ASM-062 | Where attendance marks a candidate absent, score capture shall skip that candidate and exclude them from aggregate computation. |
| FR-ASM-081 | System shall present the scorer contextual candidate information alongside score fields, comprising configurable columns such as identifier, name, photograph, category, programme, specialisation, highest qualification and any exemption flags. |
| FR-ASM-083 | System shall display a running computed total per candidate as parameters are scored. |
| FR-ASM-084 | System shall allow a free text remark per candidate per scorer. |
| FR-ASM-086 | Where attendance is unmarked, system shall present the candidate for scoring with an explicit indication that attendance has not been recorded. |
| FR-ASM-087 | Partial score entry shall be retained as a draft that survives session exit under deferred commit behaviour. |

## 6.11 Attendance

Pipeline node. Records attendance state per candidate per assessment and exposes it as candidate columns. Records state only; it does not alter candidate outcome.

> **Input** — session and group selection, candidate roster, marker's state selection, assignment scope
> **Output** — state per assessment, derived overall and partial states, attendance report, candidate columns
> **Outcome** — present · absent · partially attended · unmarked

| ID | Requirement |
|---|---|
| FR-ATT-001 | Attendance shall be captured against an assessment session and group. |
| FR-ATT-002 | Attendance shall be recorded by any role holding the attendance permission. |
| FR-ATT-003 | Attendance shall be positionable in the workflow builder before or during assessment. |
| FR-ATT-004 | System shall present the candidate roster for a selected session and group. |
| FR-ATT-005 | System shall allow marking each candidate with a configurable attendance state. |
| FR-ATT-006 | System shall record attendance state with actor identity and timestamp. |
| FR-ATT-007 | System shall allow configuration of whether a reason is required for non present states. |
| FR-ATT-008 | Attendance shall record state only and shall not itself alter candidate outcome. |
| FR-ATT-009 | Correction shall require a correction permission and shall be audited with actor, prior value, reason and timestamp. |
| FR-ATT-010 | Corrections after a scoring node has consumed the data shall be performed through the reopen capability. |
| FR-ATT-011 | System shall report attendance status per session and group. |
| FR-ATT-012 | System shall indicate unmarked candidates before a session is considered complete. |
| FR-ATT-013 | System shall allow assignment of one or more coordinators to a session or group. |
| FR-ATT-014 | Coordinators shall be users with a coordinator role via membership. |
| FR-ATT-015 | System shall present a coordinator only the sessions and groups assigned to them. |
| FR-ATT-016 | System shall present a coordinator's assigned sessions with date, time, group name, meeting link and assessment name. |
| FR-ATT-017 | System shall allow a coordinator to open an assigned session or group and mark its roster. |
| FR-ATT-018 | System shall present the meeting link so the coordinator can join the session. |
| FR-ATT-019 | System shall reject attendance marking for sessions not assigned to that coordinator. |
| FR-ATT-020 | System shall record coordinator identity against every mark. |
| FR-ATT-021 | System shall support a configurable set of attendance states, with present and absent mandatory and additional states such as late, excused and rescheduled available per institute configuration. |
| FR-ATT-022 | Attendance shall be recorded independently per assessment where a session runs multiple assessments in sequence. |
| FR-ATT-023 | System shall derive an overall present state for a candidate across all assessments in a session, per a configurable rule. |
| FR-ATT-024 | System shall derive a partially attended state for candidates present at some but not all assessments in a session. |
| FR-ATT-025 | System shall produce an attendance report per session showing allocated count, present count, absent count, unmarked count, overall present count and partially attended count. |
| FR-ATT-026 | The attendance report shall break these counts down per assessment where a session runs multiple assessments. |
| FR-ATT-027 | System shall expose attendance state and derived states as candidate columns readable by downstream components. |
| FR-ATT-028 | System shall allow bulk marking of a roster where permitted by configuration. |

## 6.12 Scoring

Pipeline node. Transforms raw scores and other candidate columns into computed values, producing one designated final score. Pure computation — it captures no human input.

> **Input** — candidate admissions, raw scores per parameter per scorer, imported and attendance derived columns
> **Output** — intermediate columns, final score, variant applied, formula version, adjustment records
> **Outcome** — scored · not ready

### Formula definition

| ID | Requirement |
|---|---|
| FR-SCR-001 | System shall allow definition of one or more formulas within a scoring node via a formula builder. |
| FR-SCR-002 | A formula shall take existing candidate columns as input and write to a named output column. |
| FR-SCR-003 | Available inputs shall include imported fields, raw scores per parameter per scorer, attendance derived columns, and columns produced by earlier formulas. |
| FR-SCR-004 | System shall support arithmetic, weighted combination, scaling factors and rounding rules. |
| FR-SCR-005 | System shall support conditional logic reusing the shared condition engine. |
| FR-SCR-006 | Formulas shall be ordered by sequence, each executing against prior outputs. |
| FR-SCR-007 | Exactly one output column shall be designated the final score. |
| FR-SCR-008 | System shall reject forward or circular column references. |
| FR-SCR-037 | System shall allow configuration of an optional scaling factor applied to an assessment's contribution, replacing the previous assessment level scaling setting. |

### Execution and readiness

| ID | Requirement |
|---|---|
| FR-SCR-009 | System shall execute the formula sequence across candidates in the admission cycle. |
| FR-SCR-010 | System shall provide a preview of computed columns without persisting. |
| FR-SCR-011 | System shall persist computed columns on commit. |
| FR-SCR-012 | System shall retain all intermediate computed columns, not only the final score. |
| FR-SCR-013 | System shall record which formula version produced each computed column. |
| FR-SCR-014 | System shall resolve each candidate to their applicable formula variant, then evaluate readiness against only that variant's required inputs. |
| FR-SCR-015 | System shall block execution while any candidate lacks an input required by their resolved variant. |
| FR-SCR-016 | System shall report unready candidates, their resolved variant and the specific missing inputs. |
| FR-SCR-017 | System shall re evaluate readiness on demand. |
| FR-SCR-018 | Approval, where required, shall be a separate workflow node. Scoring shall embed no approval step. |

### Conditional formula variants

| ID | Requirement |
|---|---|
| FR-SCR-019 | System shall allow multiple formula variants producing the same output column. |
| FR-SCR-020 | Each variant shall carry an applicability condition evaluated per candidate. |
| FR-SCR-021 | Variants shall be ordered by priority. The first matching variant applies. |
| FR-SCR-022 | System shall require a default variant with no condition. |
| FR-SCR-023 | Variants may reference different inputs and weightings provided each writes the same output column. |
| FR-SCR-024 | System shall record per candidate which variant was applied. |
| FR-SCR-025 | System shall report candidate counts resolved to each variant before commit. |

*Worked example: default variant = 70% interview + 30% entrance score. Exempt variant, condition `entrance_exempt = true`, = 70% interview + 30% academic profile score. Both write `final_score`.*

### Locking and cohort operations

| ID | Requirement |
|---|---|
| FR-SCR-026 | System shall lock all input columns referenced by a scoring node once committed. |
| FR-SCR-027 | Corrections shall be permitted only via reopen, which marks downstream computed columns stale and retains superseded values as revisions. |
| FR-SCR-028 | System shall support cohort operations executing across all candidates in scope rather than per candidate row. |
| FR-SCR-029 | Cohort operations shall be disabled by default. |
| FR-SCR-030 | System shall allow the grouping dimension to be configured: per scorer, panel, session, group or day. |
| FR-SCR-031 | System shall support methods: z score standardisation, mean shift, percentile conversion, min max rescale, and outlier flagging without adjustment. |
| FR-SCR-032 | System shall allow a minimum group size threshold below which normalisation is not applied. |
| FR-SCR-033 | Cohort operations shall write to a new output column, preserving the raw score column unchanged. |
| FR-SCR-034 | System shall record method, grouping and adjustment magnitude per candidate. |
| FR-SCR-035 | System shall present a pre commit comparison of raw versus adjusted distributions, including candidates whose rank position changes. |
| FR-SCR-036 | Cohort operations shall execute after per row formulas and before final score designation. |

## 6.13 Merit

Pipeline node. Ranks eligible candidates within partitions, assigns bands, and releases approved batches.

> **Input** — eligible candidates, final scores, partition columns, seat state, prior run history
> **Output** — rank, band, sequence number, merit batch, merit release, stamped fields
> **Outcome** — selected · waiting · excluded

| ID | Requirement |
|---|---|
| FR-MRT-001 | System shall allow definition of partition dimensions by selecting candidate columns. Values derive from data, not a fixed list. |
| FR-MRT-002 | System shall support composite partitions and an undivided single pool. |
| FR-MRT-003 | System shall allow definition of an ordered list of bands, each with a name and outcome type of selected, waiting or excluded. |
| FR-MRT-004 | System shall support any number of bands, including multiple waiting tiers. |
| FR-MRT-005 | Band selection rules shall support headcount, threshold, proportion of pool, combined conditions and a remainder rule. |
| FR-MRT-006 | System shall allow an ordered rank specification, with subsequent entries resolving ties. |
| FR-MRT-007 | System shall allow an eligibility condition determining pool entry. |
| FR-MRT-008 | System shall allow configuration of the identifier pattern issued per band. |
| FR-MRT-009 | System shall execute a run per partition value over eligible candidates not already processed. |
| FR-MRT-010 | System shall rank the pool per the rank specification. |
| FR-MRT-011 | System shall assign candidates to bands in order, contiguously. |
| FR-MRT-012 | Sequence numbers shall continue across runs within a partition and never collide with earlier runs. |
| FR-MRT-013 | System shall bundle selected type band candidates into a merit batch. |
| FR-MRT-014 | System shall present a pre commit preview of band assignment and rank order. |
| FR-MRT-015 | A merit batch shall be submitted to the approval component. |
| FR-MRT-016 | On rejection, every candidate shall be returned to the pool with band and rank cleared and the batch unlinked. |
| FR-MRT-017 | A batch shall become releasable only on approval completion. |
| FR-MRT-018 | System shall release an approved batch as a whole. Partial release shall not be permitted. |
| FR-MRT-019 | System shall allow configuration of the field set stamped at release, including a last date to pay fees and a next release date. |
| FR-MRT-020 | System shall stamp each released candidate with a release identifier and configured values. |
| FR-MRT-021 | Release records shall be readable by print, communication, seat allocation and offer. |
| FR-MRT-022 | System shall allow promotion of waiting band candidates into a new release in strict sequence order, only after at least one release exists for that partition. |
| FR-MRT-023 | System shall allow configuration of whether promotions require approval. Approval shall be required by default. |
| FR-MRT-024 | System shall provide a read only view of the current waiting band per partition in sequence order. |

## 6.14 Seat allocation

Pipeline node. Tracks seat capacity per partition and manages conversion of unfilled seats. Seat state is read back by merit as runtime input.

| ID | Requirement |
|---|---|
| FR-SEA-001 | System shall allow configuration of a sanctioned intake per partition value per admission cycle. |
| FR-SEA-002 | System shall track per partition: sanctioned intake, offered count, accepted count, admitted count and vacant seats. |
| FR-SEA-003 | System shall derive vacant seats as sanctioned intake less admitted count. |
| FR-SEA-004 | System shall present a vacant seat report per partition, exportable. |
| FR-SEA-005 | System shall allow configuration of seat conversion rules permitting unfilled seats in one partition to be transferred to another. |
| FR-SEA-006 | Conversion rules shall be expressed via the shared condition engine and shall specify source partition, target partition, and quantity or proportion. |
| FR-SEA-007 | System shall require explicit authorisation to execute a conversion, recorded with actor, reason and timestamp. |
| FR-SEA-008 | System shall present a pre commit preview of a conversion showing resulting seat counts per partition. |
| FR-SEA-009 | Conversion shall be reversible only via an audited correction, never by silent edit. |
| FR-SEA-010 | System shall allow configuration of a break even admission count per programme for reporting. |
| FR-SEA-011 | System shall present admitted counts broken down by configurable candidate columns. |
| FR-SEA-012 | System shall prevent a merit release exceeding available seats where a hard seat limit is configured. |
| FR-SEA-013 | System shall allow the seat limit to be configured as advisory rather than blocking. |
| FR-SEA-014 | Seat state shall be readable by merit for waiting list promotion decisions. |

## 6.15 Offer

Pipeline node. Converts a merit selection into an admission offer. Terminal in version one, since acceptance requires candidate access.

| ID | Requirement |
|---|---|
| FR-OFR-001 | System shall generate offers for candidates in a released merit batch. |
| FR-OFR-002 | System shall track offer lifecycle: generated, released, viewed, accepted, declined, expired, revoked. |
| FR-OFR-003 | System shall allow configuration of an offer template per programme. |
| FR-OFR-004 | Offer content shall merge candidate columns, release stamped fields and programme level configuration such as a fee schedule. |
| FR-OFR-005 | System shall allow configuration of a fee structure per programme, referenced by offer templates. |
| FR-OFR-006 | System shall allow bulk generation of offers filtered by merit release and payment deadline. |
| FR-OFR-007 | System shall allow selection of specific candidates or all candidates for generation. |
| FR-OFR-008 | System shall paginate large candidate selections. |
| FR-OFR-009 | System shall record offer generation with actor and timestamp. |
| FR-OFR-010 | Offer revocation shall require authorisation and shall be audited. |
| FR-OFR-011 | Offer state shall be readable by seat allocation. |
| FR-OFR-012 | Candidate facing offer acceptance is deferred pending the candidate access decision. |

*Viewed, accepted and declined states in FR-OFR-002 are unreachable in version one. Only the institute side portion of the lifecycle executes.*

## 6.16 Approval

Decision gate placeable at any node. Generic and subject agnostic. Does not own what happens after approval.

| ID | Requirement |
|---|---|
| FR-APR-001 | System shall allow definition of an approval chain of one or more ordered levels. |
| FR-APR-002 | Each level shall specify approvers by permission, by named users, or both. |
| FR-APR-003 | A chain shall attach to a workflow node. Different nodes may use different chains. |
| FR-APR-004 | A chain may be reused across nodes. |
| FR-APR-005 | Approval shall be enabled or bypassed per node. |
| FR-APR-006 | Approvers shall be users authenticated through membership. No out of band verification shall be used. |
| FR-APR-007 | System shall accept an approval request from any component, carrying item reference and originating node. |
| FR-APR-008 | System shall present pending requests to each authorised approver on login. |
| FR-APR-009 | System shall present the full content of the submitted item, not a summary alone. |
| FR-APR-010 | System shall allow approve or deny, with an optional remark on approve and a mandatory remark on deny. |
| FR-APR-011 | Levels shall clear strictly in order. |
| FR-APR-012 | System shall present each approver the decisions and remarks from prior levels. |
| FR-APR-013 | On denial at any level, the request shall terminate and the originating component shall be notified. |
| FR-APR-014 | A request shall be marked approved only once every level has cleared. |
| FR-APR-015 | System shall notify the originating component on final approval. |
| FR-APR-016 | System shall record per decision: approver, level, decision, remark, timestamp. |
| FR-APR-017 | Approval history shall be immutable and retained against the item. |
| FR-APR-018 | System shall report pending requests by level, age and originating node. |

## 6.17 Communication

Action node. Provides the sending mechanism. It does not decide when communication occurs — workflow configuration does.

| ID | Requirement |
|---|---|
| FR-COM-001 | System shall allow definition of message templates with merge fields drawn from candidate columns. |
| FR-COM-002 | System shall support email in version one. The delivery layer shall be channel agnostic to permit further channels later. |
| FR-COM-003 | System shall allow recipient selection via the shared condition engine over candidate columns. |
| FR-COM-004 | System shall provide preset recipient groups derived from workflow state, such as shortlisted, merit listed and waitlisted candidates. |
| FR-COM-005 | System shall allow manual triggering of a send to a selected recipient set. |
| FR-COM-006 | System shall allow communication to be invoked as an action from any workflow transition. |
| FR-COM-007 | System shall present a preview of the rendered message with sample merge data before sending. |
| FR-COM-008 | System shall present the recipient count before sending. |
| FR-COM-009 | System shall require confirmation before a send exceeding a configurable recipient threshold. |
| FR-COM-010 | System shall record per message: recipient, template, trigger, actor, timestamp and delivery status. |
| FR-COM-011 | System shall report send history filterable by template, date and status. |
| FR-COM-012 | Communication shall not decide when communication occurs. It provides the sending mechanism. |
| FR-COM-013 | System shall apply field masking to merge fields per the triggering context's authorisation. |
| FR-COM-014 | System shall support retry of failed deliveries. |

## 6.18 Print

Action node. Generates templated documents from candidate and release data.

| ID | Requirement |
|---|---|
| FR-PRN-001 | System shall allow definition of document templates per programme. |
| FR-PRN-002 | Templates shall support merge fields drawn from candidate columns and release stamped fields. |
| FR-PRN-003 | System shall support generation of admit cards, offer letters and score sheets. |
| FR-PRN-004 | System shall generate a machine readable code encoding the candidate identifier where configured. |
| FR-PRN-005 | System shall allow bulk generation filtered by workflow state, merit release or session. |
| FR-PRN-006 | System shall allow selection of individual candidates or all matching candidates. |
| FR-PRN-007 | System shall paginate large selections with configurable records per page. |
| FR-PRN-008 | System shall produce printable output in a stable paginated format. |
| FR-PRN-009 | System shall allow score sheets to be generated per session, group and scorer. |
| FR-PRN-010 | System shall record generation events with actor, template, candidate set and timestamp. |
| FR-PRN-011 | System shall apply field masking per the requesting user's authorisation. |
| FR-PRN-012 | Generated documents shall reflect data at generation time and shall record the revision used. |

## 6.19 Reports

Platform service, not a workflow node. A read layer over component output columns.

| ID | Requirement |
|---|---|
| FR-RPT-001 | System shall provide a live operational dashboard per admission cycle. |
| FR-RPT-002 | The dashboard shall present per partition value: applied count, shortlisted count, appeared count, approved counts per approval level, rejected count, merit listed count, waitlisted count and cutoff scores. |
| FR-RPT-003 | System shall provide an attendance report per session with the counts specified in the attendance component. |
| FR-RPT-004 | System shall provide a seat report presenting the counts tracked by seat allocation. |
| FR-RPT-005 | System shall provide a candidate level report filterable by any candidate column. |
| FR-RPT-006 | System shall provide a score report filterable by session, group, scorer and partition. |
| FR-RPT-007 | System shall provide an approval status report per submitted item. |
| FR-RPT-008 | System shall provide a reallocation report. |
| FR-RPT-009 | All reports shall be exportable to CSV. |
| FR-RPT-010 | All reports shall be exportable to a printable document format. |
| FR-RPT-011 | System shall provide graphical presentation of aggregate counts where configured. |
| FR-RPT-012 | Reports shall respect the requesting user's report subset authorisation. |
| FR-RPT-013 | Reports shall respect the requesting user's data scope and field masking. |
| FR-RPT-014 | Reports shall paginate with configurable records per page. |
| FR-RPT-015 | Reports shall read from component output columns via a schema registry, not via direct cross module table access. |
| FR-RPT-016 | System shall indicate when a report includes columns marked stale. |

## 6.20 Condition engine **[5.1 — new]**

Platform service. Evaluates configured conditions consistently across every consumer, in both in-memory and database execution contexts.

### Consumers

| Consumer | Execution |
|---|---|
| Import row filters | In-memory |
| Verification outcome routing | In-memory |
| Shortlist group assignment | In-memory |
| Allocation eligibility | In-memory |
| Scoring formula variant applicability | In-memory |
| Merit band selection and eligibility | Both |
| Seat conversion rules | In-memory |
| Communication recipient selection | Database |
| Workflow edge transitions | In-memory |
| Row level data scope enforcement | Database |

### Requirements

| ID | Requirement |
|---|---|
| FR-CND-ENG-001 | Conditions shall be persisted in a documented serialisation format supporting nested AND, OR and NOT over typed field predicates. |
| FR-CND-ENG-002 | The condition engine shall provide in-memory evaluation against a single candidate context. |
| FR-CND-ENG-003 | The condition engine shall compile a condition to a database predicate for row filtering and data scope enforcement. |
| FR-CND-ENG-004 | Both execution paths shall derive from one grammar. Divergent implementations shall not exist. |
| FR-CND-ENG-005 | Condition evaluation shall not use dynamic code execution. Permitted operators shall be an explicit allow-list. |
| FR-CND-ENG-006 | The engine shall derive valid operators per field from the field's data type. |
| FR-CND-ENG-007 | The engine shall reject a condition referencing a field not present in the schema at validation time. |

**Why this is specified separately.** The engine has two consumers with different execution models — in-memory evaluation against one candidate, and compilation to a SQL predicate for data scope and large-pool filtering. Nearly every available rules engine serves the first only. Adopting one means writing a second evaluator for the second, then maintaining two implementations of one grammar that will drift. FR-CND-ENG-004 exists to prevent that.

## 6.21 Reopen and correction

Lifecycle capability, not a workflow node. The single sanctioned path for correcting locked data.

| ID | Requirement |
|---|---|
| FR-RPN-001 | System shall allow an authorised user to reopen a completed step for a specified candidate. |
| FR-RPN-002 | Reopen shall require a mandatory reason. |
| FR-RPN-003 | Reopen shall record actor, prior state, reason and timestamp, immutably. |
| FR-RPN-004 | Reopen shall store the correction as a new revision, preserving the prior value. |
| FR-RPN-005 | System shall identify every downstream computed column derived from the corrected input and mark it stale. |
| FR-RPN-006 | Stale values shall never be served as current. |
| FR-RPN-007 | System shall make affected downstream components re executable. |
| FR-RPN-008 | Re execution shall produce a new revision, never an overwrite. |

## 6.22 Audit

| ID | Requirement |
|---|---|
| FR-AUD-001 | System shall record an audit entry for every consequential operation. |
| FR-AUD-002 | Each entry shall capture actor, action, entity, entity identifier, timestamp, reason, prior value, new value, workflow version and execution identifier. |
| FR-AUD-003 | The audit log shall be append only. |
| FR-AUD-004 | Audit entries shall be non deletable. |
| FR-AUD-005 | System shall allow authorised querying of audit entries by actor, entity, action and date range. |
| FR-AUD-006 | System shall audit every override, revert, reopen, seat conversion and approval decision without exception. |

## 6.23 Workflow engine

Platform service. Orchestrates only. It knows step identity, input contract, outcome value and transition mapping — nothing about component internals.

| ID | Requirement |
|---|---|
| FR-WFE-001 | System shall allow an institute admin to compose a workflow as a directed graph of component instances. |
| FR-WFE-002 | Edges shall be keyed by component outcome. |
| FR-WFE-003 | An edge may carry an additional condition evaluated via the shared condition engine. |
| FR-WFE-004 | System shall require a default outgoing edge per node. |
| FR-WFE-005 | System shall validate a graph before publication, verifying that every component's required input columns are produced by an upstream node. |
| FR-WFE-006 | System shall reject publication of a graph with unreachable nodes or missing required inputs. |
| FR-WFE-007 | Publication shall produce an immutable workflow version. |
| FR-WFE-008 | An admission cycle shall bind to a workflow version at execution start. |
| FR-WFE-009 | Running cycles shall continue on their bound version when a new version is published. |
| FR-WFE-010 | System shall report which cycles are bound to which version. |
| FR-WFE-011 | System shall open a workflow instance per candidate admission. |
| FR-WFE-012 | System shall record step execution history per instance. |
| FR-WFE-013 | The engine shall not implement component internals. It shall start components and evaluate their reported outcomes. |
| FR-WFE-014 | System shall allow configuration of whether a candidate advances automatically on node completion or requires an operator trigger. |
| **FR-WFE-015** | **[5.1]** The workflow engine shall be implemented as a bounded directed graph, not a general purpose process engine. Constructs beyond nodes, outcome keyed edges, conditions, versions and instances shall not be introduced. |
| **FR-WFE-016** | **[5.1]** Candidate admission lifecycle, step execution and run state shall each be implemented as a guarded state machine with explicit permitted transitions. |
| **FR-WFE-017** | **[5.1]** An invalid state transition shall be rejected, not silently ignored. |

### Design time and run time parameters **[5.2]**

| ID | Requirement |
|---|---|
| **FR-WFE-018** | A node's configuration shall distinguish design time settings, frozen at publication, from run time parameters supplied by an operator at execution. |
| **FR-WFE-019** | Run time parameters shall be constrained by the design time shape. An operator shall not be able to change which column a rule applies to, only the value it compares against. |
| **FR-WFE-020** | Run time parameters shall be recorded against the execution, so that a completed run shows the values used. |

### Cohort and individual execution **[5.2]**

| ID | Requirement |
|---|---|
| **FR-WFE-021** | Nodes shall support both cohort execution over all candidates in scope and individual execution for a single candidate. |
| **FR-WFE-022** | Where a node's configured rule is relative to other candidates, individual execution shall be refused with the reason stated, rather than producing a result from an incomplete pool. |
| **FR-WFE-023** | Where a node is configured with absolute rules only, individual execution shall produce the same outcome the candidate would receive in a cohort run. |

### Node testing in the builder **[5.2]**

| ID | Requirement |
|---|---|
| **FR-WFE-024** | The builder shall allow an admin to upload a sample data file and execute a single node against it without leaving the builder. |
| **FR-WFE-025** | Node testing shall display the node's output and outcome for each sample row. |
| **FR-WFE-026** | Node testing shall never create, modify or read real candidate records. |
| **FR-WFE-027** | The builder shall allow a sequence of connected nodes to be tested against sample data, showing which path each sample row takes at every branch. |
| **FR-WFE-028** | Sample data shall be retained against the unpublished draft only, surviving a design session, and shall be discarded on publication. It shall not form part of the published flow. |
| **FR-WFE-029** | Sample data shall be discardable by the admin at any point during design. |

---

# 7. Non functional requirements

| ID | Requirement |
|---|---|
| NFR-SEC-001 | Institute A shall never access Institute B's data. |
| NFR-SEC-002 | Authorisation shall be resolved per request from the database and cached on user and institute, never embedded in the token. |
| NFR-SEC-003 | Authorisation resolution shall fail closed. |
| NFR-SEC-004 | Membership validity shall be re verified per request, not only at token issue. |
| NFR-SEC-005 | The institute lock and scope conditions shall be injected by a base repository layer, not by individual queries. |
| **NFR-SEC-006** | **[5.1]** Machine clients shall authenticate with credentials scoped to a single institute and shall be subject to the same tenant isolation as user sessions. |
| NFR-PERF-001 | Authorisation overhead per request shall not exceed an agreed threshold. **Value unconfirmed.** |
| NFR-PERF-002 | Import shall process a batch of at least an agreed size within an agreed window. **Values unconfirmed.** |
| NFR-AUD-001 | Every consequential action shall be auditable to an individual actor. |
| NFR-AVL-001 | The system shall remain available during peak assessment scheduling windows. **Target unconfirmed.** |
| NFR-MNT-001 | Each backend module shall own its business data and expose it through an interface, never via cross module table access. |
| NFR-CMP-001 | The system shall support data residency and retention requirements applicable to the operating jurisdiction. **Requirements unconfirmed.** |

---

# 8. Open questions

## 8.1 Blocking

| ID | Question |
|---|---|
| ADR-026 | Candidate access mechanism. **[5.1] No longer needed for document collection, which uses machine authentication.** Still required if slot booking or online offer acceptance return. |
| P-03 | Per user data scope placeholders. Blocks coordinator sees own sessions and scorer sees own candidates. |
| WF-1 | Mid cycle workflow version migration. Blocked, or is there a migration path for candidates already past a changed node? |
| ~~WF-4~~ | **[5.2] Resolved.** Nodes support both cohort and individual execution (FR-WFE-021). Nodes whose rules are relative to other candidates refuse individual execution rather than producing a result from an incomplete pool (FR-WFE-022). |
| **A-3 [5.1]** | **Document storage.** No decision exists. Retention, residency and processor status all follow from it. Required before build. Now widened by R-29: sample data in unpublished drafts falls under the same decision. |
| **A-6 [5.2]** | **Builder starting point.** Whether an institute's first flow is assembled by Geta alongside them, or from a supplied template they adjust. Determines whether this is a self service or a configured product, and how R-17 is mitigated. |

## 8.2 Per component

- **Verification [5.1]** — field verification is out of scope; institute rules depending on unsupported claimed values have no v1 home. Resubmission loop mechanics undefined.
- **Document collection [5.1]** — blocking or pass-through: does a candidate stall awaiting required documents, or proceed to be caught by Verification's blocking flag?
- **Data import [5.1]** — UI reinstatement recommended for the release immediately after v1, before a second institute onboards.
- **Scheduling** — whether the capacity check blocks or warns. Slot booking detail, parked.
- **Score capture** — panel roster changes mid session: does removing a scorer complete a pending aggregate? Direct path scorers working at their own pace can hold a candidate incomplete indefinitely, blocking the scoring readiness gate.
- **Merit** — cross partition spillover beyond the conversion rules in seat allocation.
- **Approval** — quorum when a level names several approvers, send back to an earlier level, request expiry, delegation.
- **Panelist management** — linking a panelist by email reveals whether that account already exists, an information disclosure concern.

## 8.3 Unresolved conflict

Continuous recompute versus input locking. The prototype recomputes candidate outcome after every mutation; FR-SCR-026 locks scoring inputs on commit. Both are defensible. They are mutually exclusive. **A decision is required.**

## 8.4 Never asked

- Scale: institutes in year one and year three, concurrent sessions, candidate volume
- Compliance and data residency specifics
- Team size, timeline, who runs operations

---

# 9. Risk register

| ID | Severity | Risk |
|---|---|---|
| R-07 | High | Cross tenant exposure via an unlocked institute role. Mitigations unconfirmed. |
| R-14 | **High [5.1 — raised from medium]** | A query written outside the base repository layer bypasses tenant isolation silently. **Scripted data loading makes this an immediate rather than a future risk. FR-ING-030 is the mitigation and is not optional.** |
| R-17 | High | Configuration surface complexity may exceed what an admissions office can operate unassisted. Configurable schemas, joins, filters, transforms, rubrics, formulas, bands, partitions, approval chains and the process graph itself. Each is justified individually. Mitigation: templates and defaults. |
| R-18 | High | Misconfiguration harms candidates. A merit list ranked on the wrong column, or a scoring variant silently routing candidates down an unintended path. Consequences land on applicants. Preview before commit, lock once consumed, variant recording and pre commit rank change display are load bearing and should survive any scope cut. |
| R-22 | High | Workflow engine over generalisation. A fully generic process engine is a multi year project. The design bounds it to a directed graph; the risk is scope creep back toward generality. FR-WFE-015 is the mitigation. |
| R-24 | High | Seat conversion is irreversible in effect. Converting an unfilled reserved seat changes who can be admitted. Preview, authorisation and audit exist to make this defensible. |
| **R-26** | **High [5.1 — new]** | **Document storage undecided while the collection API is specified. Holding candidate documents likely makes the platform a data processor, with retention and residency consequences. Must be resolved before build, not after real documents exist.** |
| **R-27** | **Medium [5.1 — new]** | **Collection trust boundary. The platform authenticates the calling system, not the student. A weak session in the institute's portal results in documents accepted against the wrong candidate, undetectably.** |
| **R-29** | **Medium [5.2 — new]** | **Sample data in the builder is candidate shaped. An admin will test with a real extract because that is what is to hand, so an unpublished draft may hold real personal data that never passed through import, is not governed by retention rules and is not in the audit trail. Belongs with R-26 as one data handling decision.** |
| **R-30** | **Medium [5.2 — new]** | **The blank canvas. An admissions officer facing an empty canvas and a palette of stage types has no starting point. This is the most concrete form of R-17. Whether the first flow is built by Geta with the institute, or from a supplied template the institute adjusts, determines whether this is a self service product or a configured one. Not yet decided.** |
| R-19 | Medium | Shared candidate schema across programmes leaves empty columns where programmes genuinely differ. |
| R-20 | Medium | Normalisation defensibility. Preserving raw scores and showing rank changes pre commit is what allows a result to be justified when challenged. |
| R-21 | Medium | Config version drift. One workflow per institute means an edit touches every running cycle. Version binding is the mitigation. |
| R-23 | Medium | Staleness propagation is easy to get wrong. A missed downstream dependency serves a stale value as current — a correctness bug presenting as a data bug. |
| R-25 | Medium | Descoping offline delivery is reversible only at cost. If offline returns, campus, centre, venue and room entities must be added to a live schema. |
| **R-28** | **Medium [5.1 — new]** | **Import without an operator UI makes every re-import and corrected file a developer ticket. Acceptable for one cohort; a support burden at scale.** |
| R-01 | Medium | Meeting provider rate limits break naive bulk scheduling. Needs asynchronous queued creation with retry. |
| R-03 | Medium | Document and recording storage may make the platform a data processor for candidate media. |
| R-04 | Medium | Composite role proliferation, accepted debt from the one role per user constraint. |
| R-15 | Medium | Missed cache invalidation presents as stale permissions — a security bug wearing a performance bug's clothes. |
| R-16 | Low | Revoked membership survives until token expiry unless re verified per request. |

---

# 10. Implementation notes

## 10.1 Stack

Django modular monolith on the server, React and Next.js for the interfaces. Not microservices — one module per component with clear database ownership. A module owns its business data and exposes it through an interface, never through cross module table access.

## 10.2 Platform decisions **[5.1]**

| Concern | Decision | Rationale |
|---|---|---|
| Condition format | **JsonLogic** | Documented spec, implementations across many languages, existing UI builders emit it. |
| Condition evaluation | **Own implementation** | Dual execution path — in-memory and SQL compilation — from one grammar. Roughly 300 lines. |
| Workflow graph | **Own implementation** | The requirement set is 17 FRs over a bounded problem. BPMN engines import unneeded semantics and conflict with the versioning model. |
| State machines | **`viewflow.fsm`** | Guards transitions of one object through a set of states. Commodity; not worth writing. |
| Async work | **Celery** | Meeting link creation, bulk generation, notification dispatch. |

### Options evaluated and not adopted

**Rule engines.** GoRules ZEN — Rust core with a Python SDK and a visual editor emitting the same JSON the engine runs; strongest option if a rule-building UI is wanted early, but in-memory only. json-rules-engine — well established nested boolean logic, but Node-based. py-rules-engine — thin and lightly maintained. durable-rules — forward-chaining inference, more power than needed and the wrong shape for row filtering.

**Workflow engines.** Viewflow — Django-native BPMN engine, but flows are code rather than data and the visual frontend is commercial; the premise here is admins editing the graph without a deploy. django-river — states and transitions editable at any time with no redeploy, philosophically closest, but published support reaches Django 2.1; verify maintenance before considering. django-workflow-kit — declarative definitions with version-bound executions that never change mid-flight, matching FR-WFE-008/009 closely; new and unproven, **read the source before adopting**. SpiffWorkflow — BPMN 2.0 in pure Python, requires BPMN XML, conflicts with a bespoke builder.

## 10.3 Design rules

1. Do not build a generic process engine. Build a bounded directed graph.
2. Do not create a microservice per component.
3. Only genuine business capabilities become draggable nodes.
4. Configuration over hardcoded admission rules.
5. One shared condition engine. One common permission model.
6. Workflow versioning, always. Never overwrite a decision — revise it.
7. Keep orchestration separate from component business logic.
8. **[5.1]** All data entry paths, including scripts, go through the service layer.

## 10.4 Build order

Authentication and identity, platform administration, institute management, programme and cycle setup, candidate management, **condition engine**, data import service layer and loading script, workflow data model with a simple executor, audit hardening, shortlist, approval, **document collection**, verification, assessment definition, scheduling, score capture, attendance, scoring, merit, seat allocation, offer, communication, print, reports, reopen.

Do not build the full workflow engine before real components exist. Build the graph model and a simple executor, then harden it against actual components as they land.

**[5.1] Build the condition engine early.** Ten components depend on it. Building it late means ten components carrying temporary condition code that has to be unpicked.

---

# 11. Change log

| Version | Change |
|---|---|
| 5.1 | Verification scoped to documents only. FR-VER-001 revised, FR-VER-002 withdrawn. |
| 5.1 | Data import configuration UI descoped from v1. FR-ING-030 and FR-ING-031 added. Twelve requirements deferred. |
| 5.1 | Document collection added as a component. FR-EDC-001 to FR-EDC-018. |
| 5.1 | Condition engine specified as a platform service. FR-CND-ENG-001 to FR-CND-ENG-007. |
| 5.1 | Workflow engine bounded explicitly. FR-WFE-015 to FR-WFE-017 added. |
| 5.1 | NFR-SEC-006 added for machine client isolation. |
| 5.1 | R-14 raised to high. R-26, R-27, R-28 added. |
| 5.1 | Platform decisions recorded: JsonLogic, own condition and graph implementations, `viewflow.fsm`, Celery. |
| 5.2 | Design time and run time parameters distinguished. FR-WFE-018 to FR-WFE-020 added. |
| 5.2 | Cohort and individual node execution specified. FR-WFE-021 to FR-WFE-023 added. WF-4 resolved. |
| 5.2 | Node testing against sample data in the builder. FR-WFE-024 to FR-WFE-029 added. |
| 5.2 | Operational views gated on an active admission round. FR-GC-007 added. |
| 5.2 | R-29 and R-30 added. |
