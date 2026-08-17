# Business Requirements Document (BRD)
## Post-Entrance-Test Personal Interview & Merit-List Admission Processing System
**Subject system audited:** ISH Info Solutions "Admission Processing" platform, tenant `SET2025PERINT` (Symbiosis Artificial Intelligence Institute, Pune — SAII)
**Prepared from:** live, read-only functional audit of the production/beta system (37 screens, single admin-role account `PISAII`)
**Purpose of this document:** capture the *business* requirements a from-scratch rebuild of an equivalent product must satisfy — the "why," the actors, the rules, and the process — as reverse-engineered from an operating system. Its companion document, the **PRD**, captures the exhaustive screen-by-screen "what" and "how."

---

## 1. Executive Summary

Symbiosis International (Deemed University) runs one shared, university-wide entrance examination — **SET (Symbiosis Entrance Test)** — that feeds candidates into roughly twenty distinct undergraduate programmes across multiple constituent institutes and cities (Pune, Noida, and others). A candidate applies once to the central exam but can pay for and be considered by several programmes simultaneously.

The system audited here is the **downstream, post-written-exam admission engine**: it takes candidates who cleared the SET cutoff for one specific programme and institute, and runs them through the remainder of the funnel — **shortlisting → scheduling into Personal-Interview (PI) sessions → attendance and panel scoring → merit ranking → offer and fee confirmation** — ending in a published, category-wise merit list and formal offer letters. Each constituent institute (here, the Symbiosis Artificial Intelligence Institute, "SAII") appears to run its own tenant/instance of the same underlying application, scoped to its own programmes, staff, and candidates, while some reporting screens read from a shared, university-wide candidate/payment ledger.

The system is heavily shaped by two business realities: (1) **India's statutory reservation-category framework** (OPEN, Scheduled Caste, Scheduled Tribe, Differently Abled, and a specific Jammu & Kashmir migrant/Kashmiri-Pandit category), which is a first-class dimension on nearly every screen and report; and (2) a **multi-level governance/approval culture** — nearly every consequential action (rubric configuration, panelist onboarding, candidate shortlisting, merit-list publication) is gated behind a named sign-off chain (Admission Officer → Institute Director → Registrar and/or the university body, SIU), not left to a single operator's discretion.

## 2. Business Goals

A rebuild of this system should satisfy the following business objectives, all evidenced by the existing product's feature set:

1. **Run a compliant, auditable, multi-round selection process** that starts from a large written-exam candidate pool and narrows it to a published merit list, with every promotion/rejection decision attributable to a named approver and timestamp.
2. **Respect statutory reservation-category quotas** throughout — every funnel stage (shortlist, waitlist, reject, merit, admit) must be reportable per category, not just in aggregate.
3. **Support one shared applicant pool feeding many independently-run programmes**, including tooling to understand cross-programme overlap ("if I set my cutoff here, how many of my likely admits already have offers elsewhere?").
4. **Physically operate an interview day at scale**: create dated/timed sessions at named centres, split candidates into groups, assign external/internal panelists to those groups (with their own eligibility and approval requirements), track room logistics, and record attendance both at check-in and per-activity.
5. **Score candidates through a configurable, weighted rubric** (multiple graded parameters per assessment, multiple panelists per panel, with a defined reconciliation rule for multi-panelist disagreement), and combine that with the written-exam score and any other verification-derived score into one final, ranked total.
6. **Publish a merit list in dated, versioned releases** (not a single one-shot list) — an initial release followed by supplementary releases that draw specifically from a waiting list as seats free up, each release carrying its own fee-payment deadline and next-release date.
7. **Verify category-claim eligibility** (caste/tribe/disability certificates) through an independent two-tier check (a university-level "Eligibility Team" plus the institute itself) before a category-quota candidate can be finalized on the merit list.
8. **Communicate with candidates at scale** (templated, mail-merge-personalized email and SMS, targeted by pipeline stage) and keep an auditable delivery log.
9. **Produce the full slate of physical/printable collateral an admission cycle needs**: attendance sheets, mark sheets, ID/eligibility-verification sheets, barcode ID badges, the original application form, and formal offer letters — each generable per-candidate, per-range, per-session/group, or via bulk ID-list upload.
10. **Give every level of staff (Admission Officer, Director, Registrar, ops/analytics consumers) the reporting view suited to them** — real-time dashboards, drill-through detail, and both "raw data" (CSV) and "formatted" (PDF/print) exports, without needing developer involvement.

## 3. Business Context & Domain Glossary

| Term | Meaning (as reverse-engineered) |
|---|---|
| **SET** | Symbiosis Entrance Test — the single, university-wide written entrance exam that gates entry into this whole funnel. |
| **SAII / SIU** | Symbiosis Artificial Intelligence Institute (the tenant audited) / Symbiosis International (Deemed University), the parent body. Institute admin emails follow the pattern `admissions@<institute-code>.siu.edu.in`. |
| **PI** | Personal Interview — the core, and in this tenant the *only*, selection activity of the round this system manages. |
| **GE** | Group Exercise — a supported-but-unused (in this tenant) selection activity type. |
| **WAT** | Written Ability Test — a supported-but-unused activity type. |
| **WE** | Written Exercise — a fourth supported-but-unused activity type (exact scope to be confirmed with the business). |
| **PIWAT / GEPI** | Internal shorthand seen in URLs/screen titles for "PI+WAT combined round" and "Group Exercise + PI" respectively — evidence the platform is built for multi-activity selection rounds generally, even though this tenant only runs PI. |
| **Session** | A scheduled block of time at a named Centre into which candidates are allocated for their PI (and, if configured, other activities). |
| **Group** | A sub-division of a Session's candidates (e.g. for panel-based group interviews); each Group has its own capacity and a system-generated code. |
| **Reservation Category** | The statutory admission-quota category a candidate is claiming: **OPEN, Scheduled Caste (SC), Scheduled Tribe (ST), Differently Abled (DA)**, and a named **Kashmiri Migrants and Kashmiri Pandits/Kashmiri Hindu Families (Non-Migrants) Living in Kashmir Valley** category. |
| **APV** | An unresolved acronym appearing as both a distinct approval/verification checklist gate *and* a 10-point score component of the final merit formula. **Not decoded from any on-screen text during this audit — must be confirmed directly with the business/vendor before a rebuild finalizes its scoring-algorithm spec.** |
| **AO** | Admission Officer — the institute-level operator role (the account used for this audit, `PISAII`, operates at this level). |
| **Director** | The institute's own approving authority — the first-level sign-off on both assessment-rubric configuration and panelist onboarding. |
| **Registrar** | A university-level (not institute-level) approving authority — second-level sign-off on panelists, and one of two named approvers on candidate shortlisting. |
| **SIU (as an approval step)** | The university-level final sign-off on assessment-rubric configuration, distinct from and beyond the Director's institute-level approval. |
| **Eligibility Team** | A distinct, presumably university-level body that independently verifies a candidate's reservation-category proof documents, in parallel with the institute's own document check. |
| **Merit List release** | A dated, versioned publication event (e.g. "MeritList 1 – 16-June-2025"). The system is explicitly built to support multiple sequential releases per admission cycle, each with its own fee-payment deadline and the date the *next* release is expected. |

## 4. Stakeholders & Roles

| Role | What they do in this system (evidenced) |
|---|---|
| **Admission Officer (AO)** | Institute-level day-to-day operator: configures assessments/rubrics, imports candidates, creates sessions, runs shortlisting and merit-list generation, registers panelists, records attendance, sends communications, pulls every report. This audit's account (`PISAII`) operates at this level. |
| **Institute Director** | First-level approver for (a) assessment/rubric parameter changes and (b) newly-registered panelists. Also appears as a named approver on individual shortlisted-candidate records ("Level 1 Approved By: DIRECTORSAII"). |
| **University Registrar** | Second-level (final) approver for panelists; also appears as a named approver on shortlisted-candidate records ("Level 2 Approved By: Registrar"). Operates outside the AO's own login — no Registrar-level approval screen exists in the AO's menu, implying a separate portal/role. |
| **SIU (university body)** | Final sign-off authority on assessment-rubric configuration, above the Institute Director. |
| **Eligibility Team** | Independent, presumably university-level verifier of candidates' reservation-category proof documents, tracked separately from the institute's own document check. |
| **Panelists (Internal / External)** | Subject-matter experts who sit on interview panels and score candidates against the configured rubric. Must be individually registered, must meet (or formally justify an exception to) a minimum-experience policy, and must clear their own Director→Registrar approval chain before being allocated to a session. |
| **Candidate / Applicant** | The person moving through the funnel: pays for and appears at SET → gets imported into this system if eligible → gets shortlisted, scheduled, interviewed, scored, merit-ranked or waitlisted → receives an offer and confirms with a fee payment by a published deadline. |
| **(Implied) Registrar's/Director's back-office and physical front-desk staff** | Not a logged-in role observed directly, but implied by features like barcode ID-card printing and the "Registration Attendance" check-in screen, which exist specifically to support a physical, walk-up interview day. |

## 5. End-to-End Business Process

The following is the complete admission-cycle narrative, reconstructed from the menu structure, screen sequencing, and the state values observed across the system:

1. **Cycle setup.** An Academic Year is established (seen already-populated as "2025-26"; no working UI to create one was found in this audit — see PRD defect list). One or more **Assessments** are defined per programme (this tenant: Personal Interview only, 40 marks, scored by up to 2 panelists), each broken into a **rubric of weighted parameters** (this tenant: Technical/Management Aptitude, Domain Knowledge, General Knowledge, Communication Skills — 10 marks each). Rubric changes require **AO submission → Director approval → SIU approval** before being considered final.
2. **Candidate import.** Candidates who cleared the SET cutoff for the programme are pulled in from the central university system via a one-click, server-side import (not a manual file upload) into this application's local candidate table.
3. **Interview scheduling.** The AO creates dated/timed **Sessions** at a Centre, each with a total capacity and a number of sub-**Groups** (capacity auto-split across groups), plus a "reporting time" offset communicated to candidates ahead of their actual interview slot.
4. **Panelist onboarding.** Internal or external subject-matter experts are registered as **Panelists** (with a hard minimum-5-years-experience policy, justification-or-"N/A" required otherwise), then approved through **Director → Registrar**, before being eligible for allocation to any session.
5. **Shortlisting.** Per programme *and per reservation category* (categories cannot be shortlisted in bulk together), the AO runs a shortlisting pass choosing either a top-N headcount or a cutoff-mark threshold on the SET score. Shortlisted candidates then move through a two-level approval (Director, then Registrar) before being finalized as "Shortlisted."
6. **Allocation to sessions.** Shortlisted candidates are placed into a Session/Group — normally via a self-service slot-booking flow, but in observed practice overwhelmingly via a manual **"Forceful Allocation"** override by staff. The system blocks allocating the same candidate twice, but (per a confirmed defect, see PRD) does **not** block exceeding a session's stated capacity.
7. **Interview day operations.** Panelists are allocated to sessions/groups/rooms; physical **room counts** are configured per activity; candidates check in (**Registration Attendance**) and are separately marked present for the specific scored activity (**Candidate Testwise Attendance**) — the system distinguishes "showed up at the venue" from "actually completed the scored activity." Barcode ID cards and the original application form can be printed per-candidate, per-range, per-session/group, or via a bulk ID-list upload, for on-site verification.
8. **Scoring.** Panelists score each candidate against the rubric; printable per-panelist mark sheets exist for manual capture. A separate, distinctly-named **"APV"** verification/scoring step (unresolved acronym, see glossary) contributes up to 10 additional points and is also a required checklist gate before merit-list generation, alongside Attendance Verification and Category Document Verification.
9. **Category-document verification.** For every category-quota (non-OPEN) candidate, their proof documents are checked independently by the university-level **Eligibility Team** and by the **Institute** itself; a candidate who fails this check can be marked **Ineligible**, a distinct terminal outcome from a normal merit-based rejection.
10. **Final scoring & merit ranking.** The system combines **PI score (out of 40) + APV score (out of 10) = 50-point subtotal**, and per current observation, a separately-tracked **SET score** is meant to be scaled and added into the true final total (a defect currently prevents this — see PRD). Candidates are then sorted per category and sliced by two cutoff marks into three contiguous, non-overlapping bands: **Merit List, Waiting List, and Rejected**.
11. **Merit-list publication (versioned).** The **first** merit-list run for a category may use either a headcount or a cutoff-mark method; **every subsequent run pulls exclusively from that category's Waiting List** by headcount only. Each release fixes a **fee-payment deadline** and announces the **date of the next release**, and is identified by a dated version label (e.g. "MeritList 1 – 16-June-2025").
12. **Offer & confirmation.** Formal offer letters are bulk-printable per merit-list release (or per single candidate). Candidates confirm by paying the seat-confirmation fee before the published deadline; unconfirmed seats presumably feed the next release's Waiting-List pull (mechanism not directly observed but strongly implied by the versioning design).
13. **Ongoing communication and reporting.** At every stage, templated Email (and presumably SMS) can be sent to any pipeline-stage audience with mail-merge personalization, and a rich set of dashboards, drill-through reports, and CSV/PDF/print exports are available to every operational role.

## 6. Key Business Rules

- **One candidate, one active session allocation** — the system enforces this (confirmed by direct test).
- **Session capacity is a *stated* limit, not currently an *enforced* one** — a confirmed defect (see PRD) lets Forceful Allocation exceed a session's capacity with no warning or block. This must be a hard business rule in a rebuild: either block over-allocation outright, or require an explicit, logged manager override.
- **Shortlisting and Merit-List generation must be run one reservation category at a time** — there is no "ALL categories" option on either write-action screen, reflecting that each category has its own independent quota, cutoff, and waitlist.
- **Reallocation between sessions is scoped, not free-form** — it is explicitly restricted to candidates whose attendance was never marked or who were marked absent; it is a remediation tool, not a general reshuffling feature.
- **Merit-list generation has a strict, state-dependent selection method:** cutoff-mark selection is only available for a category's very first merit-list run; every subsequent run for that category is headcount-only, against the Waiting List.
- **Panelist eligibility is a named policy, not just a form field:** minimum 5 years' experience for undergraduate-programme panels, or an explicit written justification. (Currently enforced only as an instructional banner, not a hard validation — a rebuild should make this a real, blocking rule with an audited exception path.)
- **Every reallocation requires a written justification (Comments field)** — this is a deliberate audit-trail design decision, not an incidental UI choice.
- **Category-quota candidates require two independent document sign-offs** (Eligibility Team and Institute) before being eligible to finalize on the merit list.
- **Approval chains are asymmetric by subject:** assessment/rubric config goes AO → Director → SIU (3 steps); panelists go (self-registration) → Director → Registrar (2 steps, with an explicit Disapprove terminal state); shortlisted candidates carry two named approvers (Director, then Registrar) with timestamps.

## 7. Success Metrics Implied by the Product

The dashboards and reports the existing system invests in reveal what the business already considers worth measuring — a rebuild's analytics layer should, at minimum, preserve:

- Funnel conversion at every stage, per programme and per reservation category (paid → appeared → shortlisted → interviewed → merit-listed/waitlisted/rejected/ineligible).
- No-show rates at two distinct levels: exam-day no-shows (paid but didn't appear for SET) and interview-day no-shows (allocated/checked-in but didn't complete the scored activity).
- Cross-programme applicant overlap, to anticipate yield loss from candidates who will accept a competing offer elsewhere in the university.
- Demographic composition of the shortlisted/interviewed pool: gender (including a third-gender option), and prior education stream (Arts/Commerce/Science/Others).
- Category-specific cutoff, waitlist-band, and rejected-band score ranges, for post-hoc fairness/appeals review.
- Session-level operational health: allocated vs. present vs. absent vs. unmarked, and — critically — venue check-in vs. actual activity completion, tracked as two separate numbers.

## 8. Out of Scope / Open Business Questions

The following could not be resolved through read-only exploration and must be answered by the business or the current vendor (ISH Info Solutions) before a rebuild's business logic can be considered complete:

1. **What does "APV" stand for, and exactly how is it computed?** It is both a checklist gate and a 10-point score component; its precise source and calculation are unknown.
2. **Where (if anywhere) is a programme's per-category "Sanctioned Intake" (admission quota) actually set?** No screen in the full 37-page menu edits it; every screen that displays it shows zero, which cascades into "Vacant Seat" and "Admit Count" being meaningless throughout the product. This may be a genuinely missing feature, or configured in a different, university-level system entirely.
3. **What is the precise definition and unit of "SET Cut off percentile"** shown per category on the Shortlist Dashboard? The observed values (e.g. 0.07 for OPEN) don't read as an intuitive top-down percentile and need a source-system definition.
4. **Does a session-level check-in with no corresponding activity attendance count as "Absent" for merit purposes, or does it require manual reconciliation?** The system tracks the two states separately but no observed rule resolves the conflict.
5. **What triggers the "Conversion of Vacant Seats"** implied by that screen's name? The screen itself is read-only in this build; the actual conversion mechanism (if any) was not located.
6. **Is SMS sent from the same compose screen as Email**, or via an undiscovered dedicated screen? Only a combined delivery *report* screen (Emailer **and** SMS) was found; no SMS compose UI was located in this audit.
7. **What exactly differentiates the three "Score Entry Model" options** for an assessment, in terms of the resulting score-entry/print screens? Only one model was observed configured in this tenant.
8. **What happens after a "New" vs. "Existing" panelist selection** on the Panelist Creation form, and what governs the "Import Last Year Panelist" carry-forward logic (does it require re-approval)?

---

*See the companion PRD for the exhaustive, screen-by-screen functional and technical specification, including every dropdown's full option set, every conditional-field rule, every export format, and a full ranked defect list with reproduction evidence.*
