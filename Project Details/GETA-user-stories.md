# Geta Admission Workflow Platform
# User Stories

**Version:** 1.0
**Derived from:** SRS v5.2
**Format:** P1/P2/P3 priorities, Given/When/Then acceptance scenarios, independent tests

---

## How this is organised

One section per feature area — the operational stages, and the design-time work that configures them. Each has 2–5 stories following the priority distribution guidance: 1–2 P1 stories for the essential core, 2–3 P2 for the complete experience, 0–2 P3 as future enhancements.

**Note on platform services.** The condition engine, audit log and workflow engine are infrastructure with no direct user journey. Their stories are written from the perspective of the person who benefits from them, not from a developer's perspective. Where a capability genuinely has no user-facing journey, it is noted rather than forced into story format.

---

# Feature: Global configuration

### User Story 1 - Set up the admission structure (Priority: P1)

An institute admin joining the platform for the first time needs to describe how their institution is organised before anything else can happen. They create their courses, add the year of intake, and open an admission round that candidates will be processed under.

**Why this priority**: Nothing else in the platform can run without this structure. Candidates cannot be imported, assessments cannot be created, and merit lists cannot be produced until there is an admission round to attach them to. Every other feature depends on this existing.

**Independent Test**: Create a course, add an academic year beneath it, open an admission round, and verify the round appears as an available target when starting any other activity.

**Acceptance Scenarios**:
1. **Given** an institute admin has no courses set up, **When** they create a course named "MBA" and save, **Then** the course appears in their course list and can have academic years added to it.
2. **Given** a course exists with a 2026 academic year, **When** the admin opens an admission round, **Then** the round is available for selection when importing candidates.
3. **Given** an admission round is already open for a course, **When** the admin opens a second round for the same course and year, **Then** both rounds run concurrently and neither affects the other.

### User Story 2 - Organise courses into specialisations (Priority: P2)

An institute runs a course with several specialisations underneath it — an MBA with Finance, Marketing and Operations streams. The admin nests these under the parent course so candidates can be scoped to a specialisation while still belonging to the parent.

**Why this priority**: Many institutes run flat course structures and can operate without nesting. Institutes that do have specialisations would find a flat structure workable but awkward, listing each stream as an unrelated course. Expected in a complete implementation but not blocking.

**Independent Test**: Create a parent course, add two specialisations beneath it, open an admission round against one specialisation, and verify candidates imported to that round are scoped to the specialisation and not to the sibling.

**Acceptance Scenarios**:
1. **Given** a course exists, **When** the admin adds a specialisation beneath it, **Then** the specialisation appears indented under its parent in the course list.
2. **Given** a specialisation exists, **When** the admin adds a further level beneath it, **Then** the nesting is accepted with no depth limit imposed.
3. **Given** an admission round is opened against a specialisation, **When** candidates are imported, **Then** those candidates are associated with that specialisation only.

### User Story 3 - Close a completed admission round (Priority: P2)

Once an admission round has finished, the admin marks it closed so staff do not accidentally add candidates or run processes against a round that is over.

**Why this priority**: Without this, finished rounds stay visible and selectable indefinitely, and a staff member could import a new cohort into last year's round. It reduces a real class of operational error, but the platform functions without it.

**Independent Test**: Open a round, mark it closed, then attempt to start an import against it and verify the round is not offered as a target.

**Acceptance Scenarios**:
1. **Given** an admission round is active, **When** the admin marks it closed, **Then** the round shows a closed status in the round list.
2. **Given** a round is closed, **When** a staff member starts an import, **Then** the closed round is not available for selection.
3. **Given** a round is in draft, **When** the admin attempts to import candidates into it, **Then** the system indicates the round is not yet active.

---

# Feature: Data import

### User Story 1 - Load a candidate list into an admission round (Priority: P1)

An admissions team has received a spreadsheet of applicants from an entrance exam board. The list is loaded into the platform, creating a record for each applicant under the correct admission round, ready for the rest of the process to act on.

**Why this priority**: This is the entry point for every candidate. Without it there is no data in the system and no subsequent stage has anything to work on. Every downstream feature depends on candidate records existing.

**Independent Test**: Load a spreadsheet of 50 applicants into an open admission round, then open the candidate list and verify 50 records appear, each carrying the columns from the source file.

**Acceptance Scenarios**:
1. **Given** an open admission round and a candidate spreadsheet, **When** the list is loaded, **Then** one candidate record is created per valid row and the count matches the file.
2. **Given** a spreadsheet where three rows are missing a required value, **When** the list is loaded, **Then** the valid rows are created, the three are reported as rejected with the reason, and the load is not abandoned.
3. **Given** a candidate list has been loaded, **When** an admissions officer opens any candidate record, **Then** they can see which file and which load the record came from.

### User Story 2 - See what will be created before committing (Priority: P1)

Before committing a candidate list, the team runs it in preview to see exactly what will be created — how many records, how many rejections, and which rows will merge with existing candidates. Nothing is saved until they are satisfied.

**Why this priority**: A bad load into a live admission round is expensive to unwind and affects real applicants. Preview is what makes the load safe to attempt. It is a data integrity requirement, not a convenience.

**Independent Test**: Run a preview on a spreadsheet containing both valid rows and deliberate errors, verify the counts and rejections are shown accurately, then confirm no candidate records were created.

**Acceptance Scenarios**:
1. **Given** a spreadsheet ready to load, **When** a preview is run, **Then** the counts of records to be created, rejected and merged are shown and no records are saved.
2. **Given** a preview has been run and reviewed, **When** the load is committed, **Then** the records created match exactly the counts shown in the preview.
3. **Given** a preview shows unexpected rejections, **When** the operator abandons the load, **Then** no candidate records exist for that attempt.

### User Story 3 - Combine lists from more than one source (Priority: P2)

An institute receives applicant data in two files — one from the exam board with scores, one from their own enquiry form with contact details. The two are matched on a shared value and combined into one record per applicant.

**Why this priority**: Institutes drawing from a single source are fully served without this. Where two sources exist, the alternative is manual spreadsheet work before loading, which is error-prone but possible. Expected in a complete implementation.

**Independent Test**: Load two files sharing a common identifier, verify that applicants present in both produce a single record carrying columns from each, and that the handling of applicants present in only one file matches what was configured.

**Acceptance Scenarios**:
1. **Given** two candidate files sharing an email column, **When** they are combined and loaded, **Then** applicants appearing in both files produce one record containing columns from both.
2. **Given** an applicant appears in the first file but not the second, **When** the files are combined with unmatched rows configured to be kept, **Then** the applicant is created with the second file's columns left empty.
3. **Given** the same applicant appears twice within one file, **When** the files are combined, **Then** the duplicate is handled as configured and reported in the load summary.

### User Story 4 - Handle an applicant who already exists (Priority: P2)

An updated list arrives containing applicants already in the system. Rather than creating duplicates, the team chooses what should happen — skip them, replace them, or fill in only the blanks.

**Why this priority**: Without this, a second load creates duplicate applicants and corrupts every downstream count and merit list. It is only P2 rather than P1 because a first cohort can be loaded once from one clean file; the problem appears on the second load.

**Independent Test**: Load a list, then load an overlapping list with the strategy set to fill blanks only, and verify existing values are preserved while previously empty fields are populated.

**Acceptance Scenarios**:
1. **Given** an applicant already exists and the strategy is set to skip, **When** an overlapping list is loaded, **Then** the existing record is unchanged and the row is reported as skipped.
2. **Given** an applicant already exists and the strategy is set to fill blanks only, **When** an overlapping list is loaded, **Then** empty fields are populated and populated fields keep their original values.
3. **Given** an applicant matches but the two sources disagree on a value and the strategy is manual review, **When** the list is loaded, **Then** the applicant is flagged for a person to resolve rather than being changed automatically.

---

# Feature: Document collection

### User Story 1 - Receive documents from the institute's own portal (Priority: P1)

Applicants upload their certificates through the institute's existing website. That website passes each document through to the platform, where it attaches to the right applicant's record and becomes available for checking.

**Why this priority**: Verification has nothing to check without this. In the earlier prototype, documents were represented by empty placeholders because no upload path existed, which made the entire verification stage theatre. This is what makes verification real.

**Independent Test**: Submit a document for a known applicant through the collection interface, then open that applicant's record and verify the document is attached and available to a verifier.

**Acceptance Scenarios**:
1. **Given** an applicant exists in an open admission round, **When** a document is submitted for them, **Then** the document is attached to their record and a receipt reference is returned.
2. **Given** a document is submitted for an identifier matching no applicant, **When** the submission is processed, **Then** it is rejected with the reason and no partial record is created.
3. **Given** a document is submitted, **When** a verifier opens the applicant's record, **Then** the document is available to open and decide on.

### User Story 2 - Know which applicants are still missing documents (Priority: P1)

The admissions team needs to see, at any point, which applicants have supplied everything required and which are still outstanding, so they can chase the gaps before verification begins.

**Why this priority**: Without visibility of what is missing, the team discovers gaps one at a time during verification, when it is too late to chase efficiently. This is the operational half of collection and the feature has little value without it.

**Independent Test**: Configure three required document types, submit two for one applicant, and verify that applicant appears as incomplete with the third type named as missing.

**Acceptance Scenarios**:
1. **Given** three document types are required and an applicant has submitted two, **When** the collection status is viewed, **Then** the applicant shows as incomplete with the missing type named.
2. **Given** an applicant has submitted all required types, **When** the collection status is viewed, **Then** they show as complete.
3. **Given** several applicants are missing documents, **When** the collection report is opened, **Then** the outstanding applicants and their specific missing types are listed together.

### User Story 3 - Control what can be submitted and when (Priority: P2)

The admin defines which document types are accepted, what file formats and sizes are allowed, and the window during which submissions are open — so unusable or late files are rejected at the point of submission rather than discovered later.

**Why this priority**: The feature works without constraints, accepting whatever arrives. But an unbounded upload endpoint accumulates unusable files that surface as problems during verification. Expected in a complete implementation.

**Independent Test**: Configure a document type accepting only a specific format, submit a file in a different format, and verify it is rejected with a stated reason and does not attach to the applicant.

**Acceptance Scenarios**:
1. **Given** a document type accepts only a specified format, **When** a file in another format is submitted, **Then** it is rejected with the reason and does not attach.
2. **Given** the collection window has closed, **When** a document is submitted, **Then** it is rejected with the window stated as the reason.
3. **Given** a document type is not configured for the admission round, **When** a submission names that type, **Then** it is rejected rather than attached under an unknown type.

### User Story 4 - Replace a document that was submitted in error (Priority: P2)

An applicant uploads the wrong file. A corrected version is submitted for the same document type, and the institute decides in advance whether that replaces the original or is kept alongside it.

**Why this priority**: Wrong uploads are common enough that the team will hit this in the first cohort. Without it, either the wrong document stays or a support request is needed. It does not block the core flow, so it can follow the initial release.

**Independent Test**: Submit a document, submit a second for the same type with replacement configured, and verify the verifier sees only the newer file.

**Acceptance Scenarios**:
1. **Given** a document exists for a type and replacement is configured, **When** a second document is submitted for the same type, **Then** the newer file is what the verifier sees.
2. **Given** a document exists and revisions are configured to be kept, **When** a second is submitted, **Then** both are retained and the newer is presented as current.
3. **Given** a replacement is submitted, **When** the applicant's record is viewed, **Then** the submission history shows when each version arrived.

---

# Feature: Document verification

### User Story 1 - Check a candidate's documents and record the decision (Priority: P1)

A verification officer works through a queue of candidates, opening each required document, checking it against what the candidate claimed, and marking it valid or invalid with a reason.

**Why this priority**: Category and eligibility claims determine which merit pool a candidate competes in. Without verification, unverified claims flow into merit lists and affect who is admitted. This is the core of the feature and a data integrity requirement.

**Independent Test**: Open a candidate with two required documents, mark one valid and one invalid with a reason, and verify both decisions are recorded against the candidate with the officer's name and time.

**Acceptance Scenarios**:
1. **Given** a candidate has documents awaiting checking, **When** the verifier marks a document valid, **Then** the decision is recorded with the verifier's identity and time.
2. **Given** a verifier marks a document invalid, **When** they attempt to move on without giving a reason, **Then** they are prevented from proceeding until a reason is supplied.
3. **Given** a verifier opens the pending queue, **When** they view it, **Then** only candidates awaiting a decision in the current admission round are listed.

### User Story 2 - Move a candidate to a different category when a claim is not proven (Priority: P1)

A candidate claims a reserved category but their supporting certificate cannot be verified. Rather than rejecting them outright, the institute has configured the system to move them into the general category, where they still compete.

**Why this priority**: This is what distinguishes verification from a simple pass-or-fail check. Rejecting every candidate with an unproven category claim would exclude people who are legitimately eligible on general merit, which is both unfair and not how institutes operate.

**Independent Test**: Configure an invalid category certificate to reassign the candidate to general, mark a candidate's certificate invalid, and verify their category field now reads general and they remain active in the process.

**Acceptance Scenarios**:
1. **Given** a document type is configured to reassign category on failure, **When** a verifier marks it invalid, **Then** the candidate's category changes to the configured value and they remain in the process.
2. **Given** a document type is configured to reject on failure, **When** a verifier marks it invalid, **Then** the candidate is marked ineligible and does not proceed.
3. **Given** a candidate's category has been reassigned, **When** a merit list is later produced, **Then** the candidate is ranked within the reassigned category.

### User Story 3 - Prevent a candidate proceeding without essential checks (Priority: P2)

Some documents are essential and some are supporting. The admin marks the essential ones as blocking, so no candidate can move to the interview stage until those are decided, while non-essential ones can stay open.

**Why this priority**: Without this, a candidate with an undecided essential document can be scheduled and scored, and the gap is found at merit time. The team could enforce this by discipline instead, but the control removes a real risk. Expected in a complete implementation.

**Independent Test**: Mark one document type as blocking and one as not, leave the blocking one undecided, and verify the candidate cannot be allocated to a session while the non-blocking gap does not stop them.

**Acceptance Scenarios**:
1. **Given** a candidate has an undecided blocking document, **When** an officer attempts to allocate them to a session, **Then** the candidate is not eligible for allocation.
2. **Given** a candidate has an undecided non-blocking document but all blocking ones decided, **When** allocation runs, **Then** the candidate is allocated normally.
3. **Given** all blocking documents are decided, **When** the candidate's verification status is viewed, **Then** it shows as complete regardless of open non-blocking items.

### User Story 4 - Let an authorised person push a candidate through a stuck check (Priority: P2)

A candidate's certificate is genuinely delayed through no fault of their own and the interview is tomorrow. A senior staff member with the right permission advances them past the blocking check, recording why, so the decision is defensible afterwards.

**Why this priority**: Without an override, the only options are to lose the candidate or edit data behind the scenes. An audited override keeps the exception visible. It is P2 because the first cohort can be run without exceptions, but the need appears quickly.

**Independent Test**: Attempt an override as a user without the permission and verify it is refused; repeat as an authorised user with a reason and verify the candidate proceeds and the override is recorded.

**Acceptance Scenarios**:
1. **Given** a user lacks the override permission, **When** they attempt to advance a candidate past a blocking check, **Then** the action is refused.
2. **Given** an authorised user overrides a blocking check with a reason, **When** the candidate's record is viewed, **Then** the override is shown with who did it, when and why.
3. **Given** an override has been recorded, **When** anyone attempts to remove it, **Then** it cannot be deleted.

---

# Feature: Shortlisting

### User Story 1 - Select candidates who go forward to assessment (Priority: P1)

The admissions team defines the rule for who progresses — everyone above a score, or the top few hundred by rank — and applies it to the whole cohort in one run, sorting every candidate into a group.

**Why this priority**: This is the gate between the applicant pool and the assessment stage. Without it there is no way to reduce a large pool to an interviewable number, and scheduling has no defined input.

**Independent Test**: With a cohort of 500 candidates, define a rule selecting the top 100 by score, run it, and verify exactly 100 candidates are marked shortlisted and 400 are not.

**Acceptance Scenarios**:
1. **Given** a cohort of candidates with scores, **When** a rule selecting the top 100 by score is applied, **Then** exactly 100 candidates are placed in the shortlisted group.
2. **Given** a rule uses a score cutoff, **When** it is applied, **Then** every candidate at or above the cutoff is shortlisted and every candidate below is not.
3. **Given** a candidate matches no defined rule, **When** the run completes, **Then** they are placed in the default group rather than left unassigned.

### User Story 2 - Check the shortlist before it takes effect (Priority: P1)

Before committing, the team sees how many candidates fall into each group and who they are. If the numbers look wrong, they change the rule and try again without anything having been recorded.

**Why this priority**: A shortlist rule referencing the wrong column produces a plausible-looking but wrong list, and the error is only visible if someone can see the outcome before it is applied. Given the consequences fall on applicants, this is a correctness requirement.

**Independent Test**: Define a rule, view the preview counts, then deliberately change the rule and confirm the preview updates and no candidate was marked from the first attempt.

**Acceptance Scenarios**:
1. **Given** a shortlist rule has been defined, **When** the preview is viewed, **Then** the count per group and the candidates in each are shown with nothing saved.
2. **Given** a preview has been reviewed and committed, **When** the candidate list is opened, **Then** the group assignments match the preview exactly.
3. **Given** a preview is abandoned, **When** the candidate list is opened, **Then** no candidate carries a group assignment from that attempt.

### User Story 3 - Get the shortlist signed off before it is acted on (Priority: P2)

The committed shortlist goes to a director for approval. Only once approved can candidates be scheduled. If it is rejected, every assignment is undone and the team starts again.

**Why this priority**: Many institutes require sign-off on who progresses, and doing it outside the system means the record of approval lives in email. Institutes with delegated authority can operate without it, so it can follow the core capability.

**Independent Test**: Commit a shortlist, have it rejected at approval, and verify no candidate carries a group assignment and none can be allocated to a session.

**Acceptance Scenarios**:
1. **Given** a shortlist has been committed and approval is required, **When** an officer attempts to schedule a candidate, **Then** the candidate is not yet eligible.
2. **Given** an approver rejects the shortlist, **When** the candidate list is viewed, **Then** all assignments from that run are cleared and candidates are back in the pool.
3. **Given** an approver approves the shortlist, **When** scheduling begins, **Then** shortlisted candidates are eligible for allocation.

### User Story 4 - Sort candidates into more than two groups (Priority: P3)

An institute wants a primary shortlist and a reserve list rather than a simple in-or-out split, so they define three groups with different rules.

**Why this priority**: Nearly all institutes need only shortlisted and not shortlisted. Multiple tiers serve a narrower set of institutions that hold a reserve pool. The feature is fully usable with two groups, making this an enhancement.

**Independent Test**: Define three groups with distinct rules, run the shortlist, and verify each candidate lands in exactly one group according to the first rule they match.

**Acceptance Scenarios**:
1. **Given** three groups are defined in priority order, **When** the shortlist runs, **Then** each candidate is placed in the first group whose rule they satisfy.
2. **Given** a candidate satisfies two group rules, **When** the shortlist runs, **Then** they are placed only in the higher priority group.

---

# Feature: Scheduling and allocation

### User Story 1 - Place shortlisted candidates into interview slots (Priority: P1)

The team plans interview days, splits each into panels, and places shortlisted candidates into them. Each candidate receives an interview identifier and knows which panel and time they belong to.

**Why this priority**: Interviews cannot happen without candidates assigned to a time and a panel. Score capture depends entirely on this allocation existing, so nothing downstream works without it.

**Independent Test**: Create a session with three groups of 20, allocate 60 shortlisted candidates, and verify each candidate appears in exactly one group with a unique interview identifier.

**Acceptance Scenarios**:
1. **Given** a session with defined groups and a pool of shortlisted candidates, **When** allocation runs, **Then** each candidate is placed in exactly one group and receives an interview identifier.
2. **Given** a candidate is already allocated for an assessment, **When** allocation runs again, **Then** they are not allocated a second time.
3. **Given** a candidate has not been shortlisted, **When** allocation runs, **Then** they are not placed into any group.

### User Story 2 - Know before allocating whether there is enough capacity (Priority: P1)

Before placing anyone, the team is told whether the sessions they have planned can hold the whole shortlisted pool. If they are short by 40 seats, they are told so and can add a session before proceeding.

**Why this priority**: Without this check, allocation places as many as fit and silently leaves the remainder stranded mid-process, discovered only when someone notices a count mismatch. Catching it before placement is what prevents candidates being lost.

**Independent Test**: Plan sessions holding 500 seats, attempt to allocate 540 shortlisted candidates, and verify allocation is refused with the shortfall stated and no candidate placed.

**Acceptance Scenarios**:
1. **Given** planned capacity is less than the shortlisted pool, **When** allocation is attempted, **Then** it is refused and the size of the shortfall is stated.
2. **Given** a shortfall is reported and a further session is added, **When** allocation is attempted again, **Then** it proceeds and all candidates are placed.
3. **Given** capacity exactly matches the pool, **When** allocation runs, **Then** every candidate is placed and no session exceeds its stated capacity.

### User Story 3 - Assign interviewers to panels without clashes (Priority: P1)

The team assigns approved interviewers to each panel. The system refuses assignments that would put someone on two panels at once, on the same panel twice, or on a panel that is already full.

**Why this priority**: An interviewer double-booked across two simultaneous sessions cannot attend both, and the failure surfaces on the interview day with candidates waiting. These constraints prevent a class of error that is expensive to recover from in real time.

**Independent Test**: Assign an interviewer to a panel, then attempt to assign the same person to a different panel running at an overlapping time, and verify the second assignment is refused.

**Acceptance Scenarios**:
1. **Given** an interviewer is assigned to a session at a given time, **When** they are assigned to another session overlapping that time, **Then** the assignment is refused.
2. **Given** a panel has reached its configured size, **When** a further interviewer is assigned, **Then** the assignment is refused.
3. **Given** an interviewer has not completed onboarding approval, **When** they are assigned to a panel, **Then** the assignment is refused.

### User Story 4 - Move a candidate to a different panel (Priority: P2)

A candidate requests a different day. The team moves them to another group — but only while nothing has been recorded for them, so no scores are silently discarded.

**Why this priority**: Reschedule requests arrive in every admission cycle and the alternative is manual data correction. It is P2 because the first cycle can proceed without moves, and because the restriction protecting scored candidates matters more than the move itself.

**Independent Test**: Move an unmarked candidate between groups and verify their identifier updates; then attempt to move a candidate who has been scored and verify the move is refused.

**Acceptance Scenarios**:
1. **Given** a candidate has no attendance marked, **When** they are moved to another group, **Then** the move succeeds and they receive an identifier for the new group.
2. **Given** a candidate has already been scored, **When** a move is attempted, **Then** it is refused.
3. **Given** candidates have been moved, **When** the reallocation report is viewed, **Then** it shows each candidate's previous and new group and session.

---

# Feature: Attendance

### User Story 1 - Record who attended on the day (Priority: P1)

A coordinator opens the session assigned to them, sees the list of candidates expected, and marks each one present or absent as the day progresses.

**Why this priority**: Absent candidates must be excluded from scoring and from merit consideration. Without an attendance record there is no way to distinguish an absent candidate from one whose scores are merely late, and both look identical at merit time.

**Independent Test**: Assign a coordinator to a session, have them mark ten candidates present and two absent, and verify the record shows the correct counts and identifies who marked them.

**Acceptance Scenarios**:
1. **Given** a coordinator opens an assigned session, **When** they mark a candidate present, **Then** the state is recorded with their identity and the time.
2. **Given** a session has candidates still unmarked, **When** the session status is viewed, **Then** the unmarked candidates are identified.
3. **Given** a candidate is marked absent, **When** an interviewer opens their scoring queue, **Then** that candidate is skipped.

### User Story 2 - See only the sessions I am responsible for (Priority: P1)

A coordinator logs in and sees only their own sessions — not every session running across the institute — with the details they need to join and start marking.

**Why this priority**: A coordinator presented with every session in the institute may mark the wrong one, and can see scheduling information for cohorts they have no involvement in. Restricting the view is both an error-prevention and an access-control requirement.

**Independent Test**: Assign a coordinator to one of three sessions, log in as them, and verify only the assigned session is listed and the other two cannot be opened.

**Acceptance Scenarios**:
1. **Given** a coordinator is assigned to one session, **When** they log in, **Then** only that session appears in their list.
2. **Given** a coordinator attempts to mark attendance for a session not assigned to them, **When** the action is submitted, **Then** it is refused.
3. **Given** a coordinator opens an assigned session, **When** the details are shown, **Then** they include the date, time, group and the link to join.

### User Story 3 - Track attendance separately for each activity (Priority: P2)

A day runs a written test in the morning and interviews in the afternoon. Attendance is recorded separately for each, so the team can see who attended everything and who attended only part.

**Why this priority**: Institutes running a single activity per day are fully served by a single mark. Where two activities run, a single mark hides the case of a candidate who sat the test and left before the interview, which affects how they should be treated. Expected where multi-activity days occur.

**Independent Test**: Run a session with two activities, mark a candidate present for the first and absent for the second, and verify they are reported as partially attended.

**Acceptance Scenarios**:
1. **Given** a session runs two activities, **When** attendance is marked, **Then** each activity carries its own record for each candidate.
2. **Given** a candidate attended one activity but not the other, **When** the attendance report is viewed, **Then** they are shown as partially attended.
3. **Given** a candidate attended all activities, **When** the report is viewed, **Then** they are shown as fully present.

### User Story 4 - Correct an attendance mark made in error (Priority: P2)

A candidate was marked absent but had in fact arrived late. An authorised staff member corrects the record, and the correction is kept alongside the original rather than replacing it invisibly.

**Why this priority**: Marking errors happen in busy sessions and an uncorrectable record forces workarounds. It is P2 because errors are recoverable in the short window before scoring, and because the correction path only becomes essential once results depend on it.

**Independent Test**: Mark a candidate absent, correct the mark to present with a reason, and verify both the current state and the record of the change are visible.

**Acceptance Scenarios**:
1. **Given** a user without the correction permission, **When** they attempt to change a recorded mark, **Then** the action is refused.
2. **Given** an authorised user corrects a mark with a reason, **When** the candidate's record is viewed, **Then** the current state and the prior value are both visible.
3. **Given** a candidate's scores have already been used to produce results, **When** a correction is attempted, **Then** it requires the formal reopening process rather than a direct change.

---

# Feature: Score capture

### User Story 1 - Score a candidate against the interview criteria (Priority: P1)

An interviewer opens their panel, works through candidates one at a time, and enters a mark for each criterion along with any remarks. Once submitted, that candidate's marks are fixed.

**Why this priority**: This is where the assessment actually produces a result. Every downstream stage — score processing, merit, admission — depends on marks existing. The feature has no value without it.

**Independent Test**: Log in as an assigned interviewer, score a candidate against all criteria, submit, and verify the marks are recorded and can no longer be edited from the interviewer's screen.

**Acceptance Scenarios**:
1. **Given** an interviewer opens their assigned panel, **When** they view it, **Then** the candidates appear as an ordered queue with one presented at a time.
2. **Given** an interviewer has left one criterion blank, **When** they attempt to move to the next candidate, **Then** they are prevented until every criterion is filled.
3. **Given** an interviewer has submitted a candidate's marks, **When** they return to that candidate, **Then** the marks are shown but cannot be changed.

### User Story 2 - Prevent a partial panel producing a result (Priority: P1)

Three interviewers score each candidate independently. The candidate's total is only produced once all three have finished — never from a partial subset — so nobody appears ready for the merit list on incomplete information.

**Why this priority**: A total calculated from two of three interviewers looks identical to a complete one but is not comparable with other candidates. If that number reached a merit list, candidates would be ranked against each other on different bases. This is a correctness requirement with direct consequences for applicants.

**Independent Test**: With three interviewers assigned, have two submit marks and verify no total is shown for the candidate; have the third submit and verify the total then appears.

**Acceptance Scenarios**:
1. **Given** three interviewers are assigned and two have submitted, **When** the candidate's record is viewed, **Then** no total is shown.
2. **Given** the final assigned interviewer submits, **When** the candidate's record is viewed, **Then** the total appears.
3. **Given** interviewers are scoring independently, **When** one opens a candidate another has already scored, **Then** the other interviewer's marks are not visible until all have submitted.

### User Story 3 - See who I am scoring (Priority: P2)

Alongside the mark fields, the interviewer sees the candidate's details — name, identifier, qualification, category, and any exemptions that apply — so they are not scoring an anonymous row.

**Why this priority**: Interviewers can score from the fields alone, so the feature works without this. But context reduces mis-scoring and lets the panel account for exemptions that change how a candidate should be assessed. Expected in a complete implementation.

**Independent Test**: Configure the context fields to include qualification and category, open a candidate as an interviewer, and verify those values are shown next to the mark fields.

**Acceptance Scenarios**:
1. **Given** context fields have been configured, **When** an interviewer opens a candidate, **Then** those fields are shown alongside the scoring criteria.
2. **Given** a candidate carries an exemption, **When** the interviewer opens them, **Then** the exemption is visible.
3. **Given** an interviewer enters marks, **When** they view the candidate, **Then** a running total is shown as criteria are completed.

### User Story 4 - Keep partial work when a session is interrupted (Priority: P2)

An interviewer scores eight of ten candidates and is interrupted. When they return, their entered marks are still there and they continue from where they stopped.

**Why this priority**: Losing an afternoon's marks because a session dropped is a serious operational failure, but the alternative is re-entry rather than data loss, since the interview itself has happened. Expected in a complete implementation rather than blocking.

**Independent Test**: Enter marks for several candidates without confirming, leave and return to the panel, and verify the entered marks are still present.

**Acceptance Scenarios**:
1. **Given** an interviewer has entered marks without confirming, **When** they leave and return to the panel, **Then** their entered marks are still present.
2. **Given** an interviewer has scored all candidates in draft, **When** they confirm the list, **Then** all marks are fixed together.

### User Story 5 - Let a non-panel scorer record their own assessment (Priority: P2)

An academic profile score is given by an admissions officer, not by the interview panel. They work through candidates at their own pace from their own list, entering only the criterion they are responsible for.

**Why this priority**: Where an institute uses a separately-assessed component, the alternative is entering it as a data column outside the assessment, which loses the audit trail and the completeness check. Institutes using only panel-scored criteria are unaffected.

**Independent Test**: Configure one criterion scorable by an admissions officer, log in as that officer, and verify they see only that criterion and only for candidates in the round.

**Acceptance Scenarios**:
1. **Given** a criterion is assigned to a non-panel role, **When** a user in that role opens a candidate, **Then** they see only the criterion they are authorised to score.
2. **Given** an interviewer opens the same candidate, **When** they view the criteria, **Then** the non-panel criterion is not theirs to score.
3. **Given** the panel has scored all their criteria but the non-panel criterion is outstanding, **When** the candidate's record is viewed, **Then** the candidate is not shown as fully scored.

---

# Feature: Score processing

### User Story 1 - Produce a single comparable score for each candidate (Priority: P1)

The admissions team defines how the components combine — a weighted mix of interview and entrance exam — and the system applies it across the cohort to produce one final score per candidate.

**Why this priority**: Merit ranking needs one comparable number per candidate. Raw marks from different components on different scales cannot be ranked directly. Without this there is no merit list.

**Independent Test**: Define a formula weighting two components, run it across a cohort, and verify each candidate's final score matches the weighted calculation of their component marks.

**Acceptance Scenarios**:
1. **Given** a formula weighting two components has been defined, **When** it is run, **Then** each candidate receives a final score matching that calculation.
2. **Given** several formulas run in sequence, **When** a later formula uses the result of an earlier one, **Then** the calculation uses the earlier result.
3. **Given** scores have been produced, **When** a candidate's record is viewed, **Then** the intermediate values are visible alongside the final score.

### User Story 2 - Refuse to run when data is missing (Priority: P1)

If any candidate is missing something their formula needs, the run does not start. The team is told exactly which candidates and which values, so they can chase the gap rather than publish a half-computed list.

**Why this priority**: A partially computed merit list is worse than no merit list, because it looks complete. Candidates with missing components would be ranked below their true position through no fault of their own. This is a correctness requirement affecting real admission outcomes.

**Independent Test**: Leave two candidates without an interview score, attempt to run processing, and verify the run is refused and those two candidates and the missing component are named.

**Acceptance Scenarios**:
1. **Given** two candidates are missing a required component, **When** processing is attempted, **Then** the run is refused and both candidates and the missing component are named.
2. **Given** the missing values are supplied, **When** processing is attempted again, **Then** the run proceeds.
3. **Given** the run is refused, **When** the candidate list is viewed, **Then** no candidate carries a partially computed score.

### User Story 3 - Score a group of candidates differently (Priority: P2)

Some candidates are exempt from the entrance exam and are assessed on an academic profile instead. The team defines a second formula for them, and the system applies the right one to each candidate automatically.

**Why this priority**: Without this, exempt candidates either block the run or must be processed outside the system. Institutes with no exemption categories are unaffected, which is why it is not P1 — but for institutes that have them, it is the difference between working and not.

**Independent Test**: Mark a subset of candidates as exempt, define a formula for them and a default for everyone else, run processing, and verify each candidate's score was produced by the correct formula.

**Acceptance Scenarios**:
1. **Given** a rule identifies exempt candidates and a formula is defined for them, **When** processing runs, **Then** exempt candidates are scored by that formula and everyone else by the default.
2. **Given** an exempt candidate has no entrance exam mark, **When** readiness is checked, **Then** the missing mark does not block the run because their formula does not use it.
3. **Given** processing has run, **When** a candidate's record is viewed, **Then** it shows which formula was applied to them.

### User Story 4 - Check the effect before the scores are fixed (Priority: P2)

Before committing, the team sees the computed scores and, if any adjustment has been applied, which candidates change rank as a result.

**Why this priority**: A formula referencing the wrong column produces plausible numbers, and the mistake is only visible by inspecting the output. It is P2 rather than P1 because the readiness gate already prevents the most damaging failure, but this catches the subtler one.

**Independent Test**: Run a preview, note the top ten candidates, change a weighting, re-run the preview, and verify the ordering changes and nothing was saved from the first attempt.

**Acceptance Scenarios**:
1. **Given** a formula has been defined, **When** a preview is run, **Then** the computed scores are shown with nothing saved.
2. **Given** an adjustment for scorer differences has been applied, **When** the preview is viewed, **Then** candidates whose rank position changes are identified.
3. **Given** a preview is committed, **When** the candidate list is opened, **Then** the saved scores match the preview.

### User Story 5 - Adjust for interviewers who mark harder than others (Priority: P3)

Where one panel marks consistently lower than another, the institute applies an adjustment so a candidate's result reflects their performance rather than which panel they happened to draw.

**Why this priority**: Many institutes accept the variation and do not adjust for it. The adjustment also carries a defensibility cost, since a candidate's final score no longer matches what the panel wrote down. It is an enhancement for institutes that specifically want it, not a general requirement.

**Independent Test**: With two panels showing clearly different average marks, apply an adjustment, and verify the original marks are still visible alongside the adjusted ones.

**Acceptance Scenarios**:
1. **Given** an adjustment has been applied, **When** a candidate's record is viewed, **Then** both the original and adjusted marks are visible.
2. **Given** a panel scored fewer candidates than the configured minimum, **When** the adjustment runs, **Then** no adjustment is applied to that panel.
3. **Given** an adjustment is previewed, **When** the team reviews it, **Then** the candidates whose rank changes are listed before anything is committed.

---

# Feature: Merit list

### User Story 1 - Rank candidates and decide who is selected (Priority: P1)

The team ranks eligible candidates within each category and splits them into selected, waiting and rejected according to the rules they have set — a headcount, a cutoff mark, or a proportion.

**Why this priority**: This is the decision the entire platform exists to support. Without it, the process produces scores but no admission outcome.

**Independent Test**: With 200 eligible candidates in a category, apply a rule selecting the top 50 with a waiting list of 20, and verify 50 are selected, 20 are waiting with sequence numbers, and 130 are rejected.

**Acceptance Scenarios**:
1. **Given** eligible candidates in a category, **When** a rule selecting the top 50 is applied, **Then** exactly 50 are placed in the selected band in rank order.
2. **Given** a waiting list size has been set, **When** the run completes, **Then** waiting candidates receive sequence numbers in rank order.
3. **Given** a further run is made later for the same category, **When** waiting numbers are issued, **Then** they continue from the previous run and do not repeat earlier numbers.

### User Story 2 - Break ties predictably (Priority: P1)

Two candidates finish on the same score at the cutoff. The team has defined in advance what decides between them — the interview mark, then date of birth — so the outcome is consistent and explicable.

**Why this priority**: With hundreds of candidates on a bounded score range, ties at the cutoff are near-certain. Without a stated rule the outcome depends on incidental ordering, which cannot be defended if a candidate challenges their position.

**Independent Test**: Create two candidates with identical final scores at a cutoff boundary, run the merit list, and verify the one ranked higher is the one favoured by the configured tie-break rule.

**Acceptance Scenarios**:
1. **Given** two candidates share a final score, **When** the merit list runs with a tie-break on interview mark, **Then** the candidate with the higher interview mark ranks above the other.
2. **Given** two candidates match on both score and the first tie-break, **When** a second tie-break is configured, **Then** it decides the order.
3. **Given** a merit list has been produced, **When** the ranking is viewed, **Then** the order is reproducible on a repeat run with the same data.

### User Story 3 - Get the merit list approved before releasing it (Priority: P2)

The selected list goes to the director for approval. If it is rejected, every candidate in it returns to the pool with their rank cleared, and the team reruns the process rather than editing the list.

**Why this priority**: Merit lists are consequential enough that most institutes require sign-off, and the all-or-nothing rollback prevents a partially unwound list. Institutes with delegated authority can release without it, so it follows the core capability.

**Independent Test**: Produce a merit list, have it rejected, and verify no candidate in that batch carries a rank or band and the list cannot be released.

**Acceptance Scenarios**:
1. **Given** a merit list awaits approval, **When** release is attempted, **Then** it is refused until approval completes.
2. **Given** an approver rejects the list, **When** the candidate records are viewed, **Then** every candidate in the batch has their rank and band cleared.
3. **Given** an approver approves the list, **When** release is attempted, **Then** it proceeds.

### User Story 4 - Fill seats from the waiting list (Priority: P2)

Selected candidates decline and seats become free. The team promotes waiting candidates in strict order into a new release, without disturbing the original list.

**Why this priority**: Declines are certain in every admission cycle and seats would otherwise go unfilled. It is P2 because the first release must exist and be working before promotion has any meaning, so it can follow in sequence.

**Independent Test**: Release a merit list, promote the first three waiting candidates, and verify they are promoted in sequence order and the original release is unchanged.

**Acceptance Scenarios**:
1. **Given** a release exists and candidates are waiting, **When** promotion runs, **Then** candidates are drawn in strict sequence order.
2. **Given** no release yet exists for a category, **When** promotion is attempted, **Then** it is refused.
3. **Given** promotions require approval, **When** a promotion is made, **Then** it awaits sign-off in the same way as the original list.

### User Story 5 - Split the merit list by more than one characteristic (Priority: P3)

An institute allocates seats by category and gender together rather than by category alone, so the merit process runs across a matrix rather than a single dimension.

**Why this priority**: Most institutes rank by a single category dimension. Multi-dimensional allocation serves institutions with more complex reservation structures. The feature is fully usable with one dimension, making this an extension.

**Independent Test**: Configure two dimensions, run the merit process, and verify a separate ranked list is produced for each combination of values.

**Acceptance Scenarios**:
1. **Given** two dimensions are configured, **When** the merit process runs, **Then** a separate ranked pool exists for each combination present in the data.
2. **Given** a combination has no candidates, **When** the process runs, **Then** no empty list is produced for it.

---

# Feature: Seat management

### User Story 1 - Track how many seats remain (Priority: P1)

The team records how many seats exist in each category and sees, at any point, how many have been offered, accepted and filled, and how many remain.

**Why this priority**: Merit decisions depend on knowing how many seats there are. Without this the team is tracking seat counts on paper alongside the system, and the two diverge.

**Independent Test**: Record a sanctioned intake of 60 for a category, admit 45 candidates, and verify the system reports 15 vacant.

**Acceptance Scenarios**:
1. **Given** a sanctioned intake has been recorded, **When** candidates are admitted, **Then** the vacant count reduces accordingly.
2. **Given** several categories exist, **When** the seat report is viewed, **Then** each category shows its intake, admitted count and vacancies separately.
3. **Given** the seat report is open, **When** it is exported, **Then** the exported figures match what is displayed.

### User Story 2 - Move unfilled reserved seats to another category (Priority: P2)

Reserved seats remain unfilled after the final round. Under the institute's rules these convert to another category. An authorised person previews what the counts will become, confirms with a reason, and the conversion is permanently recorded.

**Why this priority**: Unconverted seats are seats nobody occupies, which institutes cannot accept. It is P2 rather than P1 because the first cycle can complete without conversion — the seats simply stay empty — but the consequences of an unreviewed conversion are severe enough that the safeguards are not optional.

**Independent Test**: Attempt a conversion as an unauthorised user and verify it is refused; repeat as an authorised user, check the preview counts, confirm with a reason, and verify the record shows who converted what and why.

**Acceptance Scenarios**:
1. **Given** a user lacks conversion authority, **When** they attempt a conversion, **Then** it is refused.
2. **Given** an authorised user requests a conversion, **When** they view the preview, **Then** the resulting seat counts for both categories are shown before anything changes.
3. **Given** a conversion is confirmed with a reason, **When** the seat history is viewed, **Then** it shows who performed it, when and why, and the entry cannot be removed.

### User Story 3 - Stop a merit list exceeding available seats (Priority: P2)

Where the institute has set a hard limit, a merit release that would admit more candidates than there are seats is refused rather than allowed through.

**Why this priority**: Over-admitting is a serious problem to unwind and affects real applicants who were told they had a place. It is P2 because careful operators will not over-release, and because some institutes deliberately over-offer expecting declines and need the limit to be advisory.

**Independent Test**: Set a hard limit of 60, attempt to release a merit batch of 70, and verify the release is refused with the overage stated.

**Acceptance Scenarios**:
1. **Given** a hard seat limit is configured, **When** a release would exceed it, **Then** the release is refused and the overage is stated.
2. **Given** the limit is configured as advisory, **When** a release would exceed it, **Then** a warning is shown and the release may proceed.

---

# Feature: Approvals

### User Story 1 - Review and decide on a submitted list (Priority: P1)

A director logs in and finds the items awaiting their decision. They see the full content of what they are approving — not a summary — and approve or reject with a comment.

**Why this priority**: Several parts of the process are configured to require sign-off and cannot proceed without it. If approvers cannot act, shortlists and merit lists stall permanently.

**Independent Test**: Submit a merit list for approval, log in as the approver, verify the candidate list is visible in full, approve with a comment, and verify the list becomes releasable.

**Acceptance Scenarios**:
1. **Given** an item awaits an approver's decision, **When** they log in, **Then** the item appears in their pending list.
2. **Given** an approver opens a pending item, **When** they view it, **Then** the full content is shown rather than a summary alone.
3. **Given** an approver rejects an item, **When** they attempt to submit without a comment, **Then** they are prevented until a reason is given.

### User Story 2 - Route approvals through more than one person in order (Priority: P2)

An institute requires a director's approval followed by a registrar's. The second is only asked once the first has approved, and each can see what the previous decided.

**Why this priority**: Single-approver institutes are fully served without this. Multi-level sign-off reflects how many institutions actually govern admission decisions, and doing it informally by email loses the record. Expected in a complete implementation.

**Independent Test**: Configure two levels, submit an item, verify only the first approver sees it, have them approve, and verify it then appears for the second with the first decision visible.

**Acceptance Scenarios**:
1. **Given** two approval levels are configured, **When** an item is submitted, **Then** only the first level approver sees it as pending.
2. **Given** the first level has approved, **When** the second approver opens the item, **Then** they see the first decision and comment.
3. **Given** the second level rejects, **When** the originating list is viewed, **Then** it is rejected outright rather than returning to the first level.

### User Story 3 - Turn approval off where it is not needed (Priority: P2)

An institute that does not require sign-off on shortlists configures that step to skip approval, so committed shortlists take effect immediately.

**Why this priority**: Forcing approval on institutes that do not want it creates a step someone must click through with no value, which trains people to approve without reading. Making it optional per step keeps approval meaningful where it is used.

**Independent Test**: Configure a step to skip approval, commit a shortlist, and verify the assignments take effect with no approval request created.

**Acceptance Scenarios**:
1. **Given** a step is configured to skip approval, **When** a list is committed, **Then** it takes effect immediately and no approval request is created.
2. **Given** a step requires approval, **When** a list is committed, **Then** it does not take effect until approved.

### User Story 4 - See what is waiting and how long it has waited (Priority: P3)

An administrator monitoring progress sees everything currently awaiting a decision, at which level, and how long it has been sitting there, so stalled items can be chased.

**Why this priority**: Approvers can be chased informally and items are visible in their own inboxes. This is a management convenience that becomes valuable at scale, not something the first cycle requires.

**Independent Test**: Leave three items pending at different levels for different durations, open the pending view, and verify each is listed with its level and waiting time.

**Acceptance Scenarios**:
1. **Given** several items are pending, **When** the pending view is opened, **Then** each is shown with the level it awaits and how long it has waited.
2. **Given** an item is approved, **When** the pending view is refreshed, **Then** it no longer appears.

---

# Feature: Communication

### User Story 1 - Email a group of candidates about their result (Priority: P1)

The team selects a group — everyone shortlisted, or everyone on the merit list — writes from a template that fills in each candidate's details, checks how many will receive it, and sends.

**Why this priority**: Candidates have no access to the system, so email is the only way they learn they have been shortlisted or selected. Without it the process produces decisions nobody is told about.

**Independent Test**: Create a template with a candidate's name merged in, select the shortlisted group, verify the recipient count matches the shortlist size, send, and confirm the log records each recipient.

**Acceptance Scenarios**:
1. **Given** a template and a recipient group are selected, **When** the send is prepared, **Then** the recipient count is shown before anything is sent.
2. **Given** a template contains merged candidate details, **When** a preview is viewed, **Then** the merged values are shown for a sample candidate.
3. **Given** a send has completed, **When** the history is viewed, **Then** each recipient and the delivery outcome is recorded.

### User Story 2 - Confirm before sending to a large group (Priority: P2)

Sending to several hundred candidates cannot be undone. Above a threshold the team must explicitly confirm before the messages go out.

**Why this priority**: A mistaken send to a whole cohort is unrecoverable and damaging — candidates told they were selected in error cannot be untold. The threshold is a small safeguard against a large mistake, but careful operators can avoid it, making it P2.

**Independent Test**: Set a confirmation threshold, prepare a send exceeding it, and verify an explicit confirmation is required before any message is sent.

**Acceptance Scenarios**:
1. **Given** a send exceeds the configured threshold, **When** the operator submits it, **Then** an explicit confirmation is required before sending.
2. **Given** the operator declines the confirmation, **When** the history is viewed, **Then** no messages were sent.

### User Story 3 - Send automatically when a stage completes (Priority: P2)

Rather than remembering to email after every shortlist, the team configures the message to send automatically when the shortlist is approved.

**Why this priority**: Manual sending works but relies on someone remembering at the right moment, and delays candidate notification. Automation removes a recurring manual step. Expected once the manual capability is proven.

**Independent Test**: Configure a message to send on shortlist approval, approve a shortlist, and verify the messages are sent to the shortlisted group without further action.

**Acceptance Scenarios**:
1. **Given** a message is configured to send on shortlist approval, **When** a shortlist is approved, **Then** the message is sent to the configured group without manual action.
2. **Given** an automatic send has occurred, **When** the history is viewed, **Then** it shows the send was triggered by the workflow rather than by a person.

---

# Feature: Printing

### User Story 1 - Produce admission letters for selected candidates (Priority: P1)

Once a merit list is released, the team generates admission letters for the selected candidates, merging in each candidate's details, the fee schedule and the payment deadline.

**Why this priority**: The letter is the formal admission offer. Without it the institute has a decision recorded in a system but nothing to give the candidate.

**Independent Test**: Release a merit list, generate letters for all selected candidates, and verify each letter carries the correct candidate details, fee schedule and payment deadline.

**Acceptance Scenarios**:
1. **Given** a merit list has been released, **When** letters are generated, **Then** one letter is produced per selected candidate with their details merged in.
2. **Given** a fee schedule is configured for the course, **When** a letter is generated, **Then** the schedule appears in the letter.
3. **Given** letters have been generated, **When** the record is viewed, **Then** it shows who generated them and when.

### User Story 2 - Produce admit cards for scheduled candidates (Priority: P2)

After allocation, the team produces admit cards carrying the candidate's identifier, session details and a scannable code.

**Why this priority**: Candidates need to know when and where to attend, which could be communicated by email instead. The scannable code becomes valuable when attendance is taken by scanning, which is not yet how attendance works. Expected but not blocking.

**Independent Test**: Allocate candidates to a session, generate admit cards, and verify each card shows the correct candidate identifier and session details.

**Acceptance Scenarios**:
1. **Given** candidates have been allocated, **When** admit cards are generated, **Then** each card shows the candidate's identifier and their session details.
2. **Given** a card template includes a scannable code, **When** a card is generated, **Then** the code encodes the candidate identifier.

### User Story 3 - Generate documents for a selected subset (Priority: P2)

Rather than reprinting everything, the team selects specific candidates — those whose letters were lost, or a single late addition — and generates only those.

**Why this priority**: Regenerating a whole cohort to reissue three letters is wasteful but workable. This is a practical convenience the team will want quickly, without which the feature still functions.

**Independent Test**: Select three candidates from a released list, generate letters, and verify exactly three documents are produced.

**Acceptance Scenarios**:
1. **Given** a released merit list, **When** three candidates are selected and letters generated, **Then** exactly three documents are produced.
2. **Given** a large candidate set, **When** documents are generated, **Then** the output is paginated at the configured size.

---

# Feature: Reporting

### User Story 1 - See where the admission round stands (Priority: P1)

An administrator opens a dashboard showing, for each category, how many applied, how many were shortlisted, how many attended, how many were selected and what the cutoff was.

**Why this priority**: Without a live view, the team compiles figures manually from several screens, which is slow and produces inconsistent numbers in the meetings where decisions are made. This is the primary way anyone understands the state of the round.

**Independent Test**: With a round part-way through, open the dashboard and verify the counts for each stage match the counts obtained by inspecting the underlying candidate lists.

**Acceptance Scenarios**:
1. **Given** an admission round is in progress, **When** the dashboard is opened, **Then** counts per category are shown for each stage of the process.
2. **Given** a merit list has been produced, **When** the dashboard is viewed, **Then** the cutoff score for each category is shown.
3. **Given** a report contains values that have been superseded by a correction, **When** it is viewed, **Then** those values are identified as out of date.

### User Story 2 - Export figures for use outside the system (Priority: P2)

The team exports a report to work on it in a spreadsheet or to attach to a governance paper.

**Why this priority**: Institutes need to circulate figures to people who do not use the platform. Without export, someone retypes them, introducing errors. Expected in a complete implementation.

**Independent Test**: Open a report, export it, and verify the exported figures match those shown on screen.

**Acceptance Scenarios**:
1. **Given** a report is displayed, **When** it is exported, **Then** the exported figures match what was displayed.
2. **Given** a user has restricted visibility of some fields, **When** they export a report, **Then** the restricted fields are excluded from the export as they are from the display.

### User Story 3 - See only the data I am permitted to see (Priority: P2)

A staff member with responsibility for one course sees figures for that course, and personal details they are not authorised to view are hidden.

**Why this priority**: Reports draw together data from across the platform, which makes them the easiest place to accidentally expose information a user should not see. Institutes with a small trusted team can operate without restriction, so it is not blocking, but it becomes necessary as staff numbers grow.

**Independent Test**: Restrict a user to one course, open a report as them, and verify only that course's candidates appear and restricted fields are hidden.

**Acceptance Scenarios**:
1. **Given** a user is restricted to one course, **When** they open a candidate report, **Then** only that course's candidates are listed.
2. **Given** a user is not authorised to see contact details, **When** they open a report including them, **Then** those values are hidden.

---

# Feature: Correcting a decision after the fact

### User Story 1 - Correct a mark after results have been calculated (Priority: P2)

An error in a recorded mark is found after scores have been processed. An authorised person reopens the record, corrects it with a reason, and everything calculated from it is flagged as out of date until recalculated.

**Why this priority**: Marks are locked once used, which is correct — but "this will never happen" is not an implementation. Without a sanctioned path, an urgent correction becomes a direct data change with no record. It is P2 because a first cycle can complete without corrections, but the path must exist before results are relied on.

**Independent Test**: Process scores, reopen a candidate's mark with a reason, and verify the original value is retained, the correction is recorded, and the candidate's final score is flagged as out of date.

**Acceptance Scenarios**:
1. **Given** a mark has been used to calculate results, **When** an authorised user reopens it, **Then** a reason is required before the correction is accepted.
2. **Given** a correction has been made, **When** the candidate's record is viewed, **Then** both the corrected and original values are visible with who changed it and why.
3. **Given** a correction has been made, **When** results derived from that mark are viewed, **Then** they are identified as out of date rather than presented as current.

### User Story 2 - Understand why a candidate received the result they did (Priority: P2)

A candidate challenges their merit position months later. A staff member opens their record and can see every decision that produced the outcome — the marks, who gave them, the formula applied, and any corrections.

**Why this priority**: Admission decisions are challenged, sometimes formally. An institution that cannot explain how a result was reached is in a poor position to defend it. It is P2 because the record accumulates automatically during normal operation, so the need only arises later.

**Independent Test**: Take a candidate through the full process, then open their record and verify the marks, the scorer, the formula applied and any corrections are all visible.

**Acceptance Scenarios**:
1. **Given** a candidate has completed the process, **When** their record is opened, **Then** each stage they passed through and its outcome is visible.
2. **Given** a candidate's score was adjusted, **When** their record is opened, **Then** the original value is visible alongside the adjusted one.
3. **Given** an override or correction was applied to a candidate, **When** their record is opened, **Then** the person responsible and their stated reason are visible.

---

# Feature: Building the admission process

The canvas is not documentation of how the institute works — it **is** how the institute works. What the admin assembles here is the definition the platform executes for every candidate. One flow exists per institute, and every course and every admission round beneath it follows that flow.

### User Story 1 - Assemble the institute's own process on a canvas (Priority: P1)

An institute admin opens a blank canvas and a palette of available stages. They drag the stages their institution uses onto the canvas, drag a connection from one stage's output to the next stage's input, and build up their admission process visually. What they assemble becomes the process the platform runs.

**Why this priority**: This is the core proposition of the platform. Without it every institute needs custom development, which is precisely what the product exists to avoid. Every other design-time story depends on the canvas existing.

**Independent Test**: Drag four stages onto a blank canvas, connect them in sequence, and verify the connections are shown on the canvas and the sequence is retained when the canvas is reopened.

**Acceptance Scenarios**:
1. **Given** an admin opens a blank canvas, **When** they view the palette, **Then** every stage available to their institute is listed and can be placed on the canvas.
2. **Given** two stages are on the canvas, **When** the admin drags a connection from the first stage's output to the second stage's input, **Then** the connection is drawn and retained.
3. **Given** an admin is arranging stages on the canvas, **When** they move or connect anything, **Then** no candidate data is affected and nothing executes.

### User Story 2 - Decide what happens at each branch (Priority: P1)

Stages do not simply lead to one next step. A verification stage can end in verified, rejected or overridden, and each of those needs somewhere to go. The admin connects each outcome to its own next stage, so a rejected candidate follows a different path from a verified one.

**Why this priority**: Without branching, every candidate follows one line and there is nowhere for a rejected or absent candidate to go. Real admission processes are full of branches, so a single-path builder cannot express any institute's actual process.

**Independent Test**: Place a verification stage, connect its verified outcome to one stage and its rejected outcome to another, publish, then take one candidate through each path and verify each follows the connection defined for their outcome.

**Acceptance Scenarios**:
1. **Given** a stage produces several possible outcomes, **When** the admin views it on the canvas, **Then** each outcome is shown as a separate connection point.
2. **Given** an admin connects two outcomes of one stage to two different next stages, **When** candidates reach that stage, **Then** each candidate follows the connection matching their outcome.
3. **Given** a stage has an outcome with no connection drawn, **When** publication is attempted, **Then** it is refused until every outcome has somewhere to go.

### User Story 3 - Configure a stage without leaving the canvas (Priority: P1)

The admin clicks a stage on the canvas and a panel opens showing everything that stage needs configured — for a shortlist stage, the groups and their rules; for a merit stage, the bands and the ranking. They fill it in, close the panel, and the stage shows as configured.

**Why this priority**: A stage on the canvas with no configuration cannot run. Connecting stages and configuring them are two halves of one job, and separating them into different parts of the product means the admin never has a single place where the process is complete.

**Independent Test**: Place a shortlist stage, click it, define two groups with rules in the panel, close it, and verify the stage no longer shows as unconfigured.

**Acceptance Scenarios**:
1. **Given** a stage has been placed on the canvas, **When** the admin clicks it, **Then** a panel opens showing the settings that stage requires.
2. **Given** a stage has required settings still empty, **When** the admin views the canvas, **Then** that stage is visibly marked as incomplete.
3. **Given** all required settings for a stage are filled in, **When** the admin closes the panel, **Then** the stage no longer shows as incomplete.

### User Story 4 - Be told the process cannot work before publishing it (Priority: P1)

Before the process can go live, the platform checks that each stage will actually have what it needs. A merit stage placed before scoring is refused, with the reason named, because it would have no scores to rank.

**Why this priority**: An invalid process fails part-way through with real candidates stranded at a stage that cannot complete, and unpicking that mid-cycle is severe. Catching it at design time, when nothing is at stake, is what makes the canvas safe to use at all.

**Independent Test**: Assemble a process placing merit before scoring, attempt to publish, and verify publication is refused with the missing dependency named.

**Acceptance Scenarios**:
1. **Given** a stage needs information no earlier stage produces, **When** publication is attempted, **Then** it is refused and the missing dependency is named.
2. **Given** a stage cannot be reached from the start of the process, **When** publication is attempted, **Then** it is refused and the unreachable stage is identified.
3. **Given** the reported problems have been fixed, **When** publication is attempted again, **Then** it succeeds.

### User Story 5 - Change the process without disturbing a round in progress (Priority: P2)

The admin revises the process for the coming intake while the current round is still running. Candidates already part-way through continue under the rules their round started with, and the revision applies only to rounds opened afterwards.

**Why this priority**: Because one flow governs the whole institute, an edit would otherwise change the rules for every candidate currently in progress — silently and mid-process. It is P2 because a first institute running a single round is not exposed, but the risk appears the moment a second round overlaps.

**Independent Test**: Start a round, revise and publish the process, and verify candidates in the running round still follow the original version while a newly opened round follows the revision.

**Acceptance Scenarios**:
1. **Given** a round is running, **When** the process is revised and published, **Then** candidates in that round continue under the version it started with.
2. **Given** a new round is opened after a revision, **When** candidates enter it, **Then** they follow the revised version.
3. **Given** several rounds are running, **When** the admin reviews them, **Then** each round shows which version of the process it is following.

### User Story 6 - Test a stage against sample data before publishing (Priority: P1)

While building the process, the admin uploads a small sample file of made-up or extracted candidate rows and runs a single stage against it, seeing exactly what each row produces and which outcome it reaches. Nothing real is touched.

**Why this priority**: A rule that references the wrong column produces plausible results and the mistake is invisible until real candidates are affected. Testing at design time, when nothing is at stake, is the only point at which such an error is cheap to find. This is the primary defence against the risk that misconfiguration harms applicants.

**Independent Test**: Configure a shortlist stage with a cutoff rule, upload ten sample rows spanning the cutoff, run the test, and verify the rows above the cutoff are shown as shortlisted and those below are not, with no candidate records created.

**Acceptance Scenarios**:
1. **Given** a configured stage and an uploaded sample file, **When** the admin runs the test, **Then** each sample row's result and outcome is displayed.
2. **Given** a test has been run, **When** the admin opens the real candidate list, **Then** no records were created or changed by the test.
3. **Given** a test produces unexpected results, **When** the admin changes the rule and reruns, **Then** the updated results are shown against the same sample.

### User Story 7 - Follow sample candidates through the whole process (Priority: P2)

Beyond testing one stage, the admin runs sample rows through several connected stages and watches which path each one takes at every branch — confirming that a candidate failing verification actually ends up where intended.

**Why this priority**: Testing a single stage proves the rule works. Testing a chain proves the connections are right, which is a different and equally damaging class of error — a branch wired to the wrong destination sends candidates down a path nobody intended. It is P2 because single-stage testing catches the more common mistake first.

**Independent Test**: Build a three-stage sequence with a branch, run sample rows including one designed to fail at the branch, and verify each row's path through the sequence is shown.

**Acceptance Scenarios**:
1. **Given** several stages are connected, **When** the admin tests the sequence against sample data, **Then** each sample row's path through the stages is shown.
2. **Given** a sample row fails at a branching stage, **When** the test runs, **Then** the row is shown following the connection defined for that outcome.
3. **Given** the sequence test has completed, **When** the admin opens the real candidate list, **Then** nothing was created or changed.

### User Story 8 - Keep sample data while building, discard it on publishing (Priority: P2)

Building a process takes more than one sitting. The sample file stays with the draft so the admin can return and continue testing, and it is discarded when the process is published rather than following it into live use.

**Why this priority**: Re-uploading a test file on every visit would make iterative building tedious enough that admins stop testing, which defeats the purpose. It is P2 because testing works without persistence, just more awkwardly.

**Independent Test**: Upload sample data, leave the builder and return, verify the sample is still available, then publish the process and verify the sample is no longer held.

**Acceptance Scenarios**:
1. **Given** sample data has been uploaded to a draft, **When** the admin returns to the builder later, **Then** the sample is still available for testing.
2. **Given** a process is published, **When** the published process is examined, **Then** the sample data is not part of it.
3. **Given** an admin no longer needs the sample, **When** they discard it, **Then** it is removed from the draft.

---

# Feature: Running a stage during an admission round

### User Story 1 - Supply the numbers that could not be known in advance (Priority: P1)

The process was designed months ago with a rule saying candidates are shortlisted by taking the top so-many by score. Now that applications have closed and the officer knows 4,000 applied, they enter the number when they run the stage.

**Why this priority**: A shortlist cutoff cannot be chosen before the applicant count is known, and sessions cannot be scheduled before the shortlisted count is known. If every value had to be fixed at design time, the process could not be built until after the round it governs. This is what makes a pre-designed process usable.

**Independent Test**: Publish a process with a top-N shortlist rule, open a round, run the shortlist supplying 500 as the number, and verify exactly 500 candidates are selected.

**Acceptance Scenarios**:
1. **Given** a stage was designed with a rule requiring a number, **When** an officer runs it, **Then** they are asked for that number before the stage executes.
2. **Given** an officer supplies a value, **When** the stage completes, **Then** the value used is recorded against that run.
3. **Given** an officer is supplying a run time value, **When** they attempt to change which column the rule applies to, **Then** they cannot — only the value is theirs to set.

### User Story 2 - Work only the round that is currently open (Priority: P2)

An admissions officer logs in and sees the work in front of them for the round the super admin has opened. Where no round is open, they see nothing to act on rather than a set of empty screens.

**Why this priority**: Presenting every stage regardless of whether there is anything to do invites staff to act against a round that is closed or not yet started. It is P2 because a disciplined team will not do this, but the guard removes a real class of error as more staff use the system.

**Independent Test**: With no active round, log in as an admissions officer and verify no operational stage is presented; open a round and verify the stages appear.

**Acceptance Scenarios**:
1. **Given** no admission round is active in a user's scope, **When** they log in, **Then** no operational stage is presented to them.
2. **Given** a round is opened, **When** the officer logs in, **Then** the stages of the process become available for that round.

### User Story 3 - Handle a single candidate outside the batch (Priority: P2)

A candidate's documents arrive late, after the cohort has moved on. Rather than rerunning the whole stage, the officer processes that one candidate through it individually.

**Why this priority**: Late arrivals and corrections happen in every cycle, and rerunning a cohort stage for one person is disruptive where it is possible at all. It is P2 because the first cycle can handle exceptions manually, but the need appears quickly.

**Independent Test**: Complete a verification stage for a cohort, then run one late candidate through it individually and verify they receive the same treatment the cohort did.

**Acceptance Scenarios**:
1. **Given** a stage judges each candidate against fixed criteria, **When** an officer runs one candidate through it individually, **Then** that candidate receives the same outcome they would have in the cohort run.
2. **Given** a stage ranks candidates against each other, **When** an officer attempts to run one candidate individually, **Then** it is refused with the reason that ranking requires the full pool.
3. **Given** a candidate has been processed individually, **When** their record is viewed, **Then** the outcome is recorded in the same way as a cohort run.

---

# Feature: Configuring how each stage behaves

### User Story 1 - Define the rules a stage applies (Priority: P1)

Wherever a stage needs to decide something — who is shortlisted, which candidates are eligible for interview, which formula applies to which group — the admin builds the rule from the candidate's own fields, combining conditions with and and or, without writing anything technical.

**Why this priority**: Almost every stage in the platform depends on a rule the institute defines. Shortlisting, eligibility, scoring variants, merit bands and recipient selection are all unusable until an admin can express a condition. This blocks more stories than any other single capability.

**Independent Test**: Build a rule combining two conditions with and, apply it in a shortlist stage, run against a known cohort, and verify exactly the candidates satisfying both conditions are selected.

**Acceptance Scenarios**:
1. **Given** an admin is building a rule, **When** they choose a candidate field, **Then** only the comparisons that make sense for that field's type are offered.
2. **Given** an admin combines two conditions with and, **When** the rule is applied, **Then** only candidates satisfying both are matched.
3. **Given** a rule references a field that no longer exists, **When** the admin saves it, **Then** they are told which field is missing rather than the rule silently failing later.

### User Story 2 - Define how scores are calculated (Priority: P1)

The admin builds the formula that turns component marks into a final score — a weighted mix, with rounding — choosing from the candidate fields available at that point in the process.

**Why this priority**: Every institute weights its components differently, and hardcoding one weighting is exactly what the platform exists to avoid. No merit list can be produced until a formula exists.

**Independent Test**: Build a formula weighting two components, run it against a candidate with known marks, and verify the final score matches the weighted calculation by hand.

**Acceptance Scenarios**:
1. **Given** an admin is building a formula, **When** they select input fields, **Then** only fields produced by earlier stages are offered.
2. **Given** a formula refers to a field produced by a later stage, **When** the admin saves it, **Then** it is refused with the reason.
3. **Given** several formulas are defined in sequence, **When** the admin builds a later one, **Then** the results of earlier formulas are available as inputs.

### User Story 3 - Define the checks a verification stage performs (Priority: P2)

The admin lists which documents must be checked, marks which are essential, and decides what happens when one fails — reject the candidate, move them to another category, or note it and continue.

**Why this priority**: Verification cannot function without knowing what to verify. It is P2 rather than P1 because an institute could run its first cycle with a single hardcoded document list, but every institute requires different documents so the configuration is needed almost immediately.

**Independent Test**: Configure two document types, one essential and one not, with the essential one set to reassign category on failure, and verify a candidate failing it is reassigned rather than rejected.

**Acceptance Scenarios**:
1. **Given** an admin is configuring a verification stage, **When** they add a document type, **Then** they can mark it essential or not and choose what happens if it fails.
2. **Given** a document type is set to reassign category on failure, **When** the admin saves it, **Then** they must specify which value the candidate is moved to.
3. **Given** the configuration is saved, **When** a verifier works the queue, **Then** they see the document types the admin configured.

### User Story 4 - Define how the merit list is divided and ranked (Priority: P2)

The admin chooses which candidate field divides the merit pool — category, or category and gender together — names the bands, sets each band's rule, and defines what breaks a tie.

**Why this priority**: Every institute divides and ranks differently, and reservation structures vary by jurisdiction. It is P2 rather than P1 because an institute could produce a single undivided ranked list in a first cycle, but almost none would want to.

**Independent Test**: Configure a category split with three bands and a two-level tie-break, run the merit process, and verify each category produces its own ranked list with ties resolved by the configured rule.

**Acceptance Scenarios**:
1. **Given** an admin selects a candidate field as the dividing dimension, **When** the merit process runs, **Then** the values found in the data become the separate pools.
2. **Given** three bands have been named with rules, **When** the process runs, **Then** candidates fill the bands in the configured order.
3. **Given** a tie-break sequence has been defined, **When** two candidates share a score, **Then** the sequence decides their order.

### User Story 5 - Decide which stages need sign-off (Priority: P2)

The admin decides which points in the process require approval before proceeding, who approves at each level, and which stages can go ahead without any sign-off at all.

**Why this priority**: Governance differs sharply between institutions — some require two levels of sign-off on a shortlist, others none. Forcing approval everywhere trains people to click through without reading, which is worse than no approval. It follows the core capability rather than blocking it.

**Independent Test**: Configure a shortlist stage to require two levels of approval and a merit stage to require none, and verify each behaves accordingly when run.

**Acceptance Scenarios**:
1. **Given** an admin configures a stage to require approval, **When** that stage completes, **Then** it does not take effect until approved.
2. **Given** an admin configures a stage to skip approval, **When** it completes, **Then** it takes effect immediately with no request raised.
3. **Given** an approval chain has been defined with two levels, **When** an item is submitted, **Then** the second level is asked only after the first has approved.

---

# Feature: Roles and permissions

### User Story 1 - Create the roles this institute actually uses (Priority: P1)

The institute super admin builds the roles their organisation uses — a document verifier, an interview coordinator, a scores officer — choosing for each one exactly what it can do, rather than accepting a fixed set of job titles.

**Why this priority**: No user can do anything until a role exists granting them permission. Every operational story depends on this, and institutions structure their admissions offices too differently for fixed roles to work.

**Independent Test**: Create a role permitted only to record attendance, assign a user to it, log in as them, and verify they can mark attendance and cannot open verification or scoring.

**Acceptance Scenarios**:
1. **Given** a super admin is creating a role, **When** they view the available permissions, **Then** every action the platform supports is offered individually.
2. **Given** a role permits only attendance marking, **When** a user in that role attempts to open verification, **Then** the action is refused.
3. **Given** a role has been created, **When** a user is assigned to it, **Then** they can perform exactly the actions the role permits.

### User Story 2 - Add staff and give them their access (Priority: P1)

The super admin adds a member of staff, assigns them a role, and they can log in and do their job. Staff at other institutes are unaffected and invisible.

**Why this priority**: Roles are useless without people in them. This is the point where the platform becomes usable by anyone other than the person who set it up.

**Independent Test**: Add a user, assign a role, verify they can log in and perform that role's actions, and verify they cannot see any data belonging to a different institute.

**Acceptance Scenarios**:
1. **Given** a super admin adds a staff member and assigns a role, **When** that person logs in, **Then** they see only the areas their role permits.
2. **Given** a staff member's role is changed, **When** they next act, **Then** their permissions reflect the new role.
3. **Given** a staff member's access is withdrawn, **When** they attempt to act, **Then** they are refused.

### User Story 3 - Restrict which candidates a staff member can see (Priority: P2)

A staff member responsible for one course should see that course's candidates and no others. The super admin sets that restriction on their role.

**Why this priority**: A small trusted admissions office can operate without restriction. As the team grows, or where several courses are administered separately, unrestricted visibility becomes both an access-control problem and a source of error.

**Independent Test**: Restrict a role to one course, log in as a user holding it, and verify only that course's candidates are listed anywhere in the platform.

**Acceptance Scenarios**:
1. **Given** a role is restricted to one course, **When** a user in that role opens the candidate list, **Then** only that course's candidates appear.
2. **Given** a restricted user opens a report, **When** it is displayed, **Then** it covers only the candidates they are permitted to see.

### User Story 4 - Hide personal details from staff who do not need them (Priority: P2)

Interviewers and coordinators do not need candidates' phone numbers or email addresses. The super admin hides those fields for the roles that should not see them.

**Why this priority**: Contact details are the most sensitive data the platform holds and the least necessary for most operational roles. It is P2 because the platform functions without masking, but the exposure grows with every additional user.

**Independent Test**: Hide contact fields for the interviewer role, open a candidate as an interviewer, and verify those fields are not shown while the rest of the record is.

**Acceptance Scenarios**:
1. **Given** contact fields are hidden for a role, **When** a user in that role opens a candidate, **Then** those fields are not displayed.
2. **Given** a user with hidden fields exports a report, **When** the export is opened, **Then** the hidden fields are absent from it.

---

# Feature: Defining assessments and their marking scheme

### User Story 1 - Set up an assessment and what it is worth (Priority: P1)

The admin defines the assessments their institute runs — an interview, a group discussion, a written test — giving each a name, a total mark, how many people sit on a panel, and how the panel's marks combine.

**Why this priority**: Nothing about the assessment stage can be configured or run until the assessment itself exists. Sessions attach to it, rubrics belong to it, and scores are recorded against it.

**Independent Test**: Create an assessment with a total mark and panel size, then create a session and verify the session inherits the panel size as its limit.

**Acceptance Scenarios**:
1. **Given** an admin creates an assessment, **When** they save it, **Then** it becomes available when creating sessions and defining a marking scheme.
2. **Given** an assessment specifies a panel size, **When** interviewers are assigned to a group, **Then** that number is enforced as the limit.
3. **Given** an institute runs an assessment type not supplied as standard, **When** the admin defines it, **Then** it behaves the same as the supplied types.

### User Story 2 - Build the marking scheme (Priority: P1)

The admin defines what interviewers actually mark — communication, subject knowledge, and so on — with a maximum for each, and whether zero and decimal marks are allowed.

**Why this priority**: Interviewers have nothing to fill in without a marking scheme. The assessment cannot produce a result, and every downstream stage depends on those marks existing.

**Independent Test**: Define four criteria with maximum marks, open a candidate as an interviewer, and verify exactly those four fields appear with the configured limits enforced.

**Acceptance Scenarios**:
1. **Given** an admin defines criteria with maximum marks, **When** an interviewer opens a candidate, **Then** exactly those criteria appear as fields.
2. **Given** a criterion has a maximum of 15, **When** an interviewer enters 20, **Then** the entry is refused.
3. **Given** decimal marks are not allowed for a criterion, **When** an interviewer enters a decimal, **Then** the entry is refused.

### User Story 3 - Assign different criteria to different people (Priority: P2)

Most criteria are marked by the interview panel, but one — an academic profile assessment — is given by an admissions officer instead. The admin says who marks what, and each person sees only their own criteria.

**Why this priority**: Institutes assessing everything through the panel are fully served without this. Where a component is assessed separately, the alternative is recording it outside the assessment, which loses the completeness check and the audit trail.

**Independent Test**: Assign one criterion to an admissions officer and the rest to the panel, then log in as each and verify each sees only their own criteria for the same candidate.

**Acceptance Scenarios**:
1. **Given** a criterion is assigned to a non-panel role, **When** an interviewer opens the candidate, **Then** that criterion is not among the fields they are asked to fill.
2. **Given** the panel has completed their criteria but the separately-assessed one is outstanding, **When** the candidate's record is viewed, **Then** they are not shown as fully scored.

### User Story 4 - Change a marking scheme safely (Priority: P2)

A change to the marking scheme goes into a draft first and needs sign-off before it takes effect. Once any candidate has been marked against a scheme, it locks and cannot be changed at all.

**Why this priority**: Changing a marking scheme mid-cycle would make candidates scored before and after the change incomparable, which is a direct fairness problem. It is P2 because a carefully run first cycle will not attempt it, but the lock is what makes that guarantee rather than a hope.

**Independent Test**: Score one candidate against a scheme, then attempt to change a criterion, and verify the change is refused because scoring has begun.

**Acceptance Scenarios**:
1. **Given** an admin changes a criterion, **When** they save, **Then** the change is held as a draft and the live scheme is unchanged.
2. **Given** a draft change has been approved, **When** interviewers next open a candidate, **Then** they see the revised criteria.
3. **Given** any candidate has been scored against a scheme, **When** a change to it is attempted, **Then** the change is refused.

---

# Feature: Managing interviewers

### User Story 1 - Bring an interviewer onto the platform (Priority: P1)

The admin records an interviewer's details, the interviewer is approved, and only then do they receive access to score the candidates assigned to them.

**Why this priority**: Interviewers cannot be assigned to panels or score anyone until they exist and are approved. The assessment stage cannot run without them.

**Independent Test**: Add an interviewer, complete their approval, verify they receive access, and verify an unapproved interviewer cannot be assigned to a panel.

**Acceptance Scenarios**:
1. **Given** an admin adds an interviewer, **When** the interviewer has not yet been approved, **Then** they cannot be assigned to a panel.
2. **Given** an interviewer's approval completes, **When** the admin views them, **Then** they are available for panel assignment and have been given access.
3. **Given** an interviewer is approved, **When** they log in, **Then** they see only the panels assigned to them.

### User Story 2 - Record an interviewer's background (Priority: P2)

The admin records an interviewer's qualifications, current organisation, designation and years of experience, and marks whether they are internal to the institute or brought in externally.

**Why this priority**: Institutes need to show who assessed their candidates, particularly where external examiners are a regulatory or accreditation expectation. The scoring itself works without this, so it follows the core capability.

**Independent Test**: Record an interviewer with full background details, mark them external, and verify the details are retrievable and the internal or external classification is visible.

**Acceptance Scenarios**:
1. **Given** an admin records an interviewer's background, **When** the interviewer's record is opened, **Then** those details are shown.
2. **Given** an interviewer is marked as external, **When** the interviewer list is viewed, **Then** internal and external interviewers can be told apart.

### User Story 3 - Reuse an interviewer who already works with another institute (Priority: P3)

An interviewer already registered by a different institute is added here. Rather than creating a second account for the same person, their existing account is given access to this institute as well.

**Why this priority**: This only matters once the platform hosts several institutes sharing an interviewer pool, which is not the first-release situation. It also touches an unresolved question about whether adding someone by email should reveal that they already exist elsewhere.

**Independent Test**: Add an interviewer whose email is already registered elsewhere, and verify they gain access to this institute without a second account being created.

**Acceptance Scenarios**:
1. **Given** an interviewer's email is already registered, **When** an admin adds them, **Then** the existing account gains access to this institute rather than a new one being created.
2. **Given** an interviewer serves two institutes, **When** they log in, **Then** they can act in one institute at a time and see nothing belonging to the other.

---

# Coverage notes

## Components without user-facing stories

Three parts of the platform have no direct user journey and are not written as user stories, in line with the guidance against technical stories:

| Component | Why | Where its value appears |
|---|---|---|
| Condition engine | Infrastructure. Users configure rules through the features that use it, never the engine directly. | Every story involving a rule — shortlist selection, scoring variants, merit bands, allocation eligibility |
| Audit log | Infrastructure. Users never write to it. | "Understand why a candidate received the result they did", and every story requiring a recorded reason |
| Candidate records | A data surface, not a stage. Users reach it through search and through other features. | "Understand why a candidate received the result they did" |

## Deferred to a later release

These are specified in the SRS but are not part of the first release, so no stories are written for them yet:

- Import configuration screens — loading is scripted in the first release
- Candidate self-service — applicants have no access to the platform
- Offer acceptance and decline — requires candidate access
- Exception handling, hold and resume, withdrawal — not yet specified

## Priority summary

| Priority | Count | Share |
|---|---|---|
| P1 | 38 | 44% |
| P2 | 44 | 50% |
| P3 | 5 | 6% |

**87 stories across 19 features.**

The P1 share is higher than the priority guidance would suggest for a single feature. This reflects a first release in which several stages are each individually essential to producing an admission outcome, and in which the design time capabilities block the run time ones. Within each feature the distribution holds to one or two P1 stories.

Worth challenging on review: if the P1 set cannot be built in the available time, the honest response is to reduce scope by removing whole features rather than by demoting stories within them. A feature with its P1 stories cut does not work at all.