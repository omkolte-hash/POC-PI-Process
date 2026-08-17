# Product Requirements Document (PRD)
## Post-Entrance-Test Personal Interview & Merit-List Admission Processing System
**Subject system audited:** ISH Info Solutions "Admission Processing" platform, tenant `SET2025PERINT` (base URL `https://beta.ishinfo.com/SET2025PERINT/`)
**Method:** live, read-only functional walkthrough of all 37 reachable screens under one Admission-Officer-level account (`PISAII`, scoped to Symbiosis Artificial Intelligence Institute — SAII), plus DevTools network/console instrumentation for the full session. No data was created, modified, deleted, or sent (no "Save," "Submit," "Shortlist," "Send," or similar write action was ever confirmed/executed); every field, dropdown, conditional rule, and report was mapped by populating filters and observing server responses to *read* requests only.
**Companion document:** see the BRD for business goals, stakeholders, process narrative, and open business questions. This PRD is the exhaustive functional/technical specification — every screen, every field, every dropdown's full option set, every conditional-reveal rule, every export format, and a full defect list with reproduction evidence.
**Privacy note:** real candidates' full names observed during the audit are not reproduced in this document; candidates are referenced by their system-generated Applicant ID only. Real panelists' names, emails, and phone numbers observed are likewise omitted — only field structure and status patterns are documented.

---

## 1. How to Read This Document

Each of the 37 screens is documented under its module using a consistent template:

- **Purpose** — the business reason this screen exists (cross-referenced to the BRD process narrative).
- **Access path** — sidebar menu location and `.aspx` filename.
- **Fields & cascades** — every input, in order, with its exact dropdown option set where applicable, and every conditional show/hide/populate rule observed.
- **Grid / report columns** — for list and report screens, the full column set and representative sample data.
- **Exports** — exact button labels/format(s) offered.
- **Business rules & edge cases** — rules and boundary behaviors confirmed by direct (read-only or deliberately-safe) testing.
- **⚠ Defects** — any confirmed bug, tagged with a severity and cross-referenced to Appendix A.

A running **§** section number (e.g. §2.9) is used for cross-referencing between screens and into the Appendices.

---

## 2. System Architecture — Read This Before Building Anything

This section is placed first because it materially changes how a rebuild should be scoped, and was not something a screen-by-screen walkthrough alone would surface — it came from instrumenting the browser's network and console layers across the full session (~4,000 requests, 61 distinct JS exceptions logged).

### 2.1 There is no API layer to port

Across the entire session, filtering out static assets (CSS/JS/images/fonts) and `data:` URIs, **the only dynamic URLs ever hit were the `.aspx` pages themselves.** Zero `.ashx`, `.asmx`, `/api/`, `.json`, or other REST/RPC-style endpoints exist anywhere in this application. Of ~1,000 requests sampled at one checkpoint, 987 were GET and only 13 were POST — and every POST target was one of those same `.aspx` pages posting back to itself.

**This is classic ASP.NET Web Forms**, using full-page `__doPostBack` server round-trips (ViewState-driven) for every cascading dropdown, every "Go"/"Submit" click, and every grid refresh — not a lightweight AJAX/fetch call to a reusable service. **There is nothing to reverse-engineer as a wire contract.** A rebuild on the user's target stack (React/Next.js frontend, NestJS or Go backend, PostgreSQL) must design an actual API from first principles; the only reusable artifact from this legacy system is the *page-level* business logic this document catalogs — field lists, dropdown option sets, conditional rules, and validation/approval behavior.

### 2.2 Confirmed, reproducible dead static assets (not a flake)

The following URLs returned **HTTP 503 on every single request, 100% of the time**, across the whole session (116 of the last 1,000 requests sampled — 11.6%):

```
/SET2025PERINT/JS/jquery.js
/SET2025PERINT/JS/jquery.min.js
/SET2025PERINT/JS/jquery.cookie.js
/SET2025PERINT/JS/toastr.js
/SET2025PERINT/JS1/jquery-3.2.1.js
/SET2025PERINT/JS1/bootstrap.min.js
/SET2025PERINT/JS1/bootstrap.css
/SET2025PERINT/CSS/toastr.css
/SET2025PERINT/css/bucket-ico-fonts.css
/SET2025PERINT/css/datepicker.css
/SET2025PERINT/css/morris.css
```

A working copy of jQuery exists at a different path (`/SET2025PERINT/js/lib/jquery.js`, HTTP 200), but several pages' inline scripts reference the broken `/JS/jquery.js` path instead. This is the root cause of **Defect D-01** below (see Appendix A) and is not case-sensitivity alone — three of the dead paths are already lowercase (`css/bucket-ico-fonts.css`, `css/datepicker.css`, `css/morris.css`), so some assets are simply missing/decommissioned on the server, not merely mis-cased. **A rebuild's cutover checklist must include a full static-asset audit** (every `<script src>`/`<link href>` cross-checked against what actually exists) — "it loads somewhere" is not evidence "it loads everywhere" in this codebase.

### 2.3 Two confirmed, severe, reproducible defects

**D-01 — Sitewide dead-jQuery race (High).** Any Web-Forms page whose inline script calls `$(...)` before the (broken) `/JS/jquery.js` reference would have loaded throws `ReferenceError: $ is not defined` and aborts that script block. Confirmed on `DashBoard.aspx` (kills the entire sidebar menu and the username badge — reproduced 10+ times), `RecordAttendance.aspx`, and `ManageAttendance.aspx` (6+ reproductions). The failure is intermittent-*looking* only because a stale cached 200 response from earlier in a browser session can mask it; it is not actually intermittent server-side. **Recovery in this audit was always a page reload** — real end users would perceive this as "the menu randomly disappears."

**D-02 — Unescaped server data breaks inline `<script>` blocks (High / security-adjacent).** Confirmed on three separate pages:
- `GEPIShortListReport.aspx` — `SyntaxError: Unexpected end of input`, reproduced 6+ times at shifting line numbers (the inline script's length changes with the result set), consistent with a candidate-data string (e.g. a name containing an apostrophe) breaking out of an unescaped JS string literal.
- `PiwatFinalDashbord.aspx` — root-caused precisely: `SyntaxError: Unexpected identifier 'Male'` at line 219, reproduced 7 times. The literal label "Male" (from the Gender chart) is concatenated directly into an inline script's array/object literal **without quotes or JSON-encoding**, producing invalid JS (`[Male, Female, ...]` instead of `["Male","Female",...]`) and aborting the whole script block — which in turn is why that page's Morris.js bar chart also fails (`Error: Graph container element not found`, since the container-creating code never ran).
- `TestWiseGroupAllocation.aspx` — `SyntaxError: Unexpected token ';'` at line 350, same defect family.

**This is a real security-hygiene finding, not just a cosmetic one:** server-side data of any kind (not just known-safe literals like "Male") is being string-concatenated into inline `<script>` blocks. Any rebuild must **never** do this — always serialize server data to the client via `JSON.stringify()`/proper encoding, whether over an API or via a server-rendered `<script type="application/json">` payload.

**D-03 — Tab-freezing crash on a required-but-unpopulated dropdown (Critical).** On `PanelistAllocation.aspx` (§6.4), the required "Score Type" dropdown never populates (confirmed empty via DOM inspection under every input combination tried). Clicking **Submit** with it empty did not show an inline validation message like every other screen in the app — **it froze the entire browser tab.** All subsequent actions (screenshot, JS execution, keyboard input) timed out for 45+ seconds, consistent with a blocking native `alert()`/`confirm()` dialog halting the page's JS event loop; recovery required a browser-level forced navigation, a recovery path an ordinary end user does not have. **This screen, and three siblings that share the identical broken dropdown (see D-04), should be treated as functionally unusable in the current build** and are a top rebuild priority.

**D-04 — Shared broken "Test Type" cascade control, 4 of 11 PI Process screens (Critical, architecture-level).** The exact same broken dropdown (`ddlTestType`, permanently empty regardless of valid upstream selections) was independently confirmed on:
- `PanelistAllocation.aspx` (§6.4)
- `ManageAttendance.aspx` (§6.7)
- `PanelistAllocationReport.aspx` (§6.10)
- `TestwiseAllocationReport.aspx` (§6.11)

Meanwhile, differently-implemented score/test-type dropdowns on `ScoreTypeparameters.aspx` (§2.3), `TestWiseGroupAllocation.aspx` (§6.5, id `ddlTestType` — same *name*, different working implementation), and `PIWATScorePrint.aspx` (§6.8, id `ScoreType`) all populate correctly. **This strongly indicates at least two parallel, inconsistent code implementations of "look up assessment/activity types for this session," and only one of them (used by exactly these 4 screens) is broken.** This is the single highest-value technical finding of the audit: it precisely scopes which 4 of 37 screens need remediation and points to one shared root cause rather than four independent bugs.

### 2.4 Navigation-layer findings

- **A "forceful browsing" guard exists.** Direct top-level navigation (typing a URL, or any navigation without an in-app `document.referrer`) to several inner pages is blocked by a custom `ForcefulBrowsing.html` interstitial ("Unauthorized access - forceful browsing detected"). Only navigating via an in-app link (or a same-document `window.location.href` script navigation, which still sets a referrer) succeeds. **A rebuild's router should use real, referrer-independent authorization (session/role checks), not a referrer-sniffing heuristic**, which is both bypassable and a source of the false-positive lockouts observed in this audit.
- **The sidebar never preserves or auto-expands state.** Every navigation collapses the menu back to its 6 top-level module names; combined with no breadcrumb or active-page indicator anywhere in the chrome, there is no persistent visual confirmation of "where am I" beyond the browser tab title — which itself is frequently wrong (see §2.5).
- **No confirmed 4xx/5xx errors besides the D-01 503s were observed anywhere in the session** — no broken auth, no server 500s during any read-only navigation performed.

### 2.5 Sitewide UX/quality patterns (not single-screen bugs)

- **Browser tab titles are frequently copy-pasted leftovers from a different screen** and do not reflect the page actually loaded. Confirmed on at least 6 screens (e.g. `ImportData.aspx` titled "Candidates Meritlist Screen"; `GEPIShortListReport.aspx` and `GEPIShortlistCountByMark.aspx` both titled generically "PI ShortList Screen"/"Candidate ShortList Report"; `RecordAttendance.aspx` and `ManageAttendance.aspx` both titled generically "Attendance Marking"). A rebuild should treat `<title>` as a first-class, per-route, tested value.
- **Export/print capability is inconsistent across otherwise-similar report screens** with no discernible rule: some offer CSV+Print+PDF, some Print+PDF only, some CSV only, some no export at all, and two screens offer a distinctive "raw CSV" + "formatted report" pair not seen elsewhere. A rebuild should standardize a small number of export "profiles" (e.g. every list report gets CSV+PDF) rather than deciding per-screen.
- **The 5-level cascading filter chain — Programme → Test Group → City → Centre → Session — recurs verbatim on at least 8 screens**, sometimes extended with Group, Score Type, Panelist Number, or Records-per-page. This is the single most reusable UI pattern in the product and should be built once as a shared component in a rebuild, not re-implemented per screen (which is very likely *why* D-04's inconsistency exists in the legacy system).
- **A recurring "N-level approval stepper/status pattern"** (see §6.3 governance table below) appears with different specific approvers on different screens (AO→Director→SIU for rubric config; Director→Registrar for panelists; Director-then-Registrar named+timestamped on individual shortlist records). A rebuild should model this as one generic, configurable approval-workflow engine, not three bespoke implementations.
- **Data-quality/naming inconsistencies recur across near-duplicate strings that should be one foreign-keyed master value** — e.g. the Kashmiri-migrant reservation category is spelled "…LIVING IN KASHMIR VALLEY" on one screen and "…LIVING IN KASHMIRI VALLEY" on another; a print-report name is "Attendance and ID Verification" in one master list and "IDENTITY VERIFICATION and ATTENDANCE" in a saved mapping row. **Every such master value (categories, report names, statuses) should be a single referenced row, never a duplicated string literal**, in a rebuild's data model.

---

## 3. Module 1 — Manage PI

### §1.1 Create Session — `CreateSession.aspx`
**Purpose:** define a Programme × Centre × date/time block ("Session") that candidates will later be allocated into — the foundational scheduling object for everything downstream.

**Fields, in order, all mandatory:**

| # | Field | Type | Notes / cascade |
|---|---|---|---|
| 1 | Programme | select | Institute-scoped list (2 programmes in this tenant). Triggers postback cascade. |
| 2 | Test Group | select | Empty until Programme chosen; populates 1:1 with the Programme name in this tenant. |
| 3 | City | select | Empty until Programme chosen; populates from Programme (here: "Pune" only). |
| 4 | Centre | select | Empty until City chosen; populates from City. Full chain: **Programme → {Test Group, City} → Centre.** |
| 5 | Session From | custom date/time widget | Month-grid calendar → hour-only picker (0:00–23:00, **no minutes selectable**). Adjacent "×" clear button. |
| 6 | Session To | custom date/time widget | Same widget as Session From. |
| 7 | Reporting Time in Minutes | text, max 3 digits | Candidate reporting time = Session-From minus this many minutes. Helper text example: "Session start time is 9.00 AM then Report time will be 8.30 AM." |
| 8 | No. of Groups | text | Splits the session's capacity into that many sub-Groups. |
| 9 | Session Capacity | text | Max candidates allocable to this session. |

**Submit** (write action, not exercised).

**⚠ Defect / inconsistency:** existing seeded sessions carry minute-precision start times (e.g. 9:45, 10:30, 6:05), but this Create form's picker only allows whole hours — meaning minute-precision data in the system did **not** originate from this current form (likely a data import or an older UI version). See also the identical minute-capable text format on the Edit screen (§1.2), which confirms the underlying storage supports minutes; only *this* create form's picker is hour-limited.

**Open business questions:** no client-side check observed for Session-To < Session-From, for overlapping sessions at the same Centre, for Session Capacity vs. a Centre's real physical capacity, or for how capacity divides across "No. of Groups" (evenly, with remainder to earlier groups, per the observed 3/3/2/2 split summing to 10).

### §1.2 View Session Details — `ViewSessionDetails.aspx`
**Purpose:** list, edit, and delete previously-created sessions; manage each session's Group sub-structure.

**Filter:** Programme (mandatory; grid only loads once chosen — no unfiltered "show all" view).

**Grid columns:** S.No., City Name, Centre Name, Session From Date, Session To Date, Session Capacity, Edit, Delete.

**Sample data (BSc-AI, Pune):**

| # | Centre | From | To | Capacity |
|---|---|---|---|---|
| 1 | SAII Pune | May 7 2025 9:00AM | May 7 2025 1:00PM | 10 |
| 2 | SAII Pune | May 15 2025 10:30AM | May 21 2025 10:30AM | 12 |
| 3 | SAII Pune | May 16 2025 9:45AM | May 16 2025 7:00PM | 10 |
| 4 | SAII Pune | Jun 9 2025 6:05AM | Jun 11 2025 6:05AM | 2 |

Row 2 spans **6 calendar days** while the others are same-day windows — either dirty seed data, or "Session" is legitimately allowed to be a multi-day window with real candidate slots nested inside via Groups elsewhere; needs business confirmation for a rebuild's data model.

**Edit (inline expansion):**
- Session From / Session To — editable text, format `DD-MM-YYYY HH:MM` (24h) — confirms minute-level storage.
- City Name — **read-only** once created (Centre/City cannot be changed post-creation; sensible, since reallocating city after candidates/panelists are tied to it would be destructive).
- Reporting Time, Session Capacity — editable numeric text.
- **Group sub-table:** S.No., Group Name (editable, system-generated code e.g. `S07MG01`), Group Capacity (editable), Remove. **Add** button appends a blank row. Group codes observed follow `S<SessionSeq 2-digit>MG<GroupIndex 2-digit>` in this screen — compare to the differently-formatted `<SessionSeq>MG<GroupIndex>` (no leading "S") seen on §2.12/§2.14, a confirmed naming inconsistency between where the code is generated and where it's later displayed.
- **Update / Cancel** buttons (not exercised).

**Delete (per session row):** not exercised. Open question — does it cascade-block if candidates/panelists/attendance already reference the session, or hard-delete and orphan child records? Should almost certainly be soft-delete/blocked-if-in-use in a rebuild.

**No export/print option** on this screen — an inconsistency versus most other list screens.

---

## 4. Module 2 — PI Shortlist Processing (17 menu items, 16 documented, 1 confirmed broken)

### §2.1 Add Academic Year — `AcademicMaster.aspx` — ⚠ CONFIRMED BROKEN, D-05
Both direct navigation and clicking the real sidebar link land on a generic `Error.aspx` ("OOOPS!!! SOMETHING WENT WRONG") every time. This is the *first* item in the module and appears to be entirely non-functional in the current build. Corroborating evidence: `ScoreTypeparameters.aspx` (§2.3) already shows a working "Academic Year = 2025-26" dropdown with no way to have created that value through this broken screen — meaning academic years are seeded through some other mechanism entirely (a back-office/DB process, or a different, unfound screen). **A rebuild needs a real, working Academic Year admin screen**, whatever its actual scope turns out to be once confirmed with the business.

### §2.2 Add Assessment — `AddScoreType.aspx`
**Purpose:** define the scored activities ("Assessments") for a programme — this tenant configures only Personal Interview, but the platform is built for GE/WAT/WE too.

**Filter:** Programme (nothing renders until chosen).

**Add form fields:**

| # | Field | Type | Options / notes |
|---|---|---|---|
| 1 | Academic Year | select | `2025-26` (only value in this tenant). |
| 2 | Assessment Name | text | Free text, e.g. "Personal Interaction". |
| 3 | Assessment Short Name | select | **GE, PI, WAT, WE** (fixed master list; only PI configured in this tenant). |
| 4 | Sequence No | text | Ordering among assessments (PI = 1). |
| 5 | No of panelist(s) per panel | select | **1, 2, 3, 4**. **Conditional:** ≥2 reveals field 6. |
| 6 | Panelist Score Entry | select — *conditional, only when field 5 ≥ 2* | "Panel members will discuss and give common marks for a candidate" / "Panel members will give different marks for a candidate." |
| 7 | Total Marks | text | Max marks for the assessment (PI = 40). |
| 8 | Score Type | radio | "Online" (observed default) vs. an unlabeled second option (structurally "Offline"). |
| 9 | Score Entry Model | select | **"Group wise display with group wise score entry"** / **"Student wise display with Student wise score entry"** / **"Group wise display with Student wise score entry (award score)"** (this one used by the existing PI row). |
| 10 | Allocation Type | radio — **only visible on Edit, never on Add** | Group Wise / Room Wise. **⚠ Defect D-06:** no way to set this at creation time under any Score-Entry-Model combination tried; it only becomes visible/editable after the row already exists, meaning it silently defaults on creation with no operator control. |
| 11 | Scaling | radio | Yes / No (default No). |

**ADD / Clear** buttons.

**Results grid columns:** S.No., Assessment Name, Assessment Short Name, Sequence No, No of panelist(s) per panel, Panelist Score Entry, Total Marks, Score Type, Score Entry Model, Allocation Type, Scaling, Edit, Delete.

**Sample row (BSc-AI):** Personal Interaction / PI / seq 1 / 2 panelists / "discuss and give common marks" / 40 marks / Online / "Group wise display with Student wise score entry(award score)" / Group Wise / Scaling No.

**Open questions:** exact operational difference between the three Score Entry Model options; whether Scaling=Yes reveals a scale-to value; whether Sequence No uniqueness is enforced server-side; whether Delete checks for existing scores against the assessment.

### §2.3 Add Assessment Parameters — `ScoreTypeparameters.aspx`
**Purpose:** break each Assessment into its scoring rubric line-items.

**Layout:** Programme selector → a tab strip, one tab per configured Assessment Short Name (only "PI" exists in this tenant).

**Info banner:** echoes the parent assessment's config for context, e.g. *"Score Entry : Online, Panelist Score Entry : Panel members will discuss and give common marks for a candidate, PI Total Marks : 40."*

**Add form fields:**

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | Academic Year | select | "2025-26" only. |
| 2 | Parameter Name | text (max 128) | e.g. "Technical Aptitude/Management Aptitude". |
| 3 | Sequence No | text (max 3) | |
| 4 | Max Weightage | text (max 3) | Points this parameter contributes. |
| 5 | Allow zero mark | radio Yes/No (default No) | Can a panelist score literally 0? |
| 6 | Allow Decimal | radio Yes/No (default No) | **Conditional:** Yes reveals "No of decimals" (text, max 2). |

Two more DOM inputs (`txtMinWeightage` / "Min Weightage", and a "Copy" button) exist but were **never observed to become visible** under any tested combination — flagged as unconfirmed, possibly dead code or requiring a multi-assessment tenant to trigger.

**Existing PI rubric (sums exactly to the 40-mark PI total):**

| Parameter | Seq | Max Weightage |
|---|---|---|
| Technical Aptitude/Management Aptitude | 1 | 10.0 |
| Domain Knowledge | 2 | 10.0 |
| General Knowledge | 3 | 10.0 |
| Communication Skills | 4 | 10.0 |

**Governance finding — a 3-stage approval stepper is shown on every state of this screen:** **AO Submission → Director Approval → SIU Approval**, all green/checked in this sample. Rubric configuration is not free-editing — it is a governed, sign-off'd change. Open questions: exact mid-workflow UI (partial approval states), whether editing an already-approved rubric resets the stepper, and who the Director/SIU approver accounts actually are (not observed — outside the AO role's login).

### §2.4 Candidates Data Import — `ImportData.aspx`
**Purpose:** pull SET-cleared candidates for a programme into this system's local candidate table.

**Fields:** Programme (select) → **Import** button. **No file-upload control exists anywhere in the DOM** — despite the menu label, this is a **one-click server-side pull** from the central university system, not a manual spreadsheet upload. Not exercised (would import live data). Open questions: exact server-side eligibility filter, and whether re-running is idempotent or duplicates/resets candidates.

### §2.5 Map Print Reports — `AssignPrintReport.aspx`
**Purpose:** curate which print-report templates apply to a programme and their print/display sequence (metadata only — see §2.13 for actual report generation).

**Fields:** Program (select) → **Print Report Types** (multi-select, cascades from Program) → **Submit**.

**Master option list (this tenant):** Mark Sheet(PI), Attendance and ID Verification, Eligibility Verification, Attendance Sheet(PI).

**Existing mappings grid:**

| Print Report Name | Sequence No |
|---|---|
| Attendance Sheet(PI) | 8 |
| Mark Sheet(PI) | 9 |
| IDENTITY VERIFICATION and ATTENDANCE | 12 |
| Eligibility Verification | 13 |

**⚠ Data-quality defect D-07:** the saved row "IDENTITY VERIFICATION and ATTENDANCE" (all caps, reordered words) does not exactly match its master-list counterpart "Attendance and ID Verification" — these should be one foreign-keyed value, not two independent strings. Non-contiguous sequence numbers (8, 9, 12, 13) confirm a single, larger, cross-module print-report master table shared platform-wide.

**Edit:** Print Report Name (appears editable, though it likely shouldn't be — editing here risks desyncing from the master catalog) + Sequence No, Update/Clear.

### §2.6 Shortlist Dashboard — `PiwatDashbord.aspx`
**Purpose:** the primary daily analytics screen for the SET→PI funnel, category-broken-down.

**Filter:** Programme Name.

**Top KPI strip (4 donuts):** Total Candidates Paid for SET (**university-wide**, 34,654), Total Appeared for SET Exam (university-wide, 16,322), Total Paid for **[this programme]** (4,999), Total **[this programme]** Appeared (3,626 — a ~72.5% show rate).

**"Break-Even Admissions" table, one row per reservation category + Total:**
Columns — S.No., Category, Sanctioned Intake, Last Year Admitted Count, Applied, Paid, Appeared for the exam, SET Cut off percentile, Yet to be Shortlisted, Short Listed, First Level Approved, Second Level Approved, Rejected List, Rejected List Maximum Score, Rejected List Minimum Score.

**Categories:** OPEN, SCHEDULED CASTE (SC), SCHEDULED TRIBE (ST), DIFFERENTLY ABLED (DA), KASHMIRI MIGRANTS AND KASHMIRI PANDITS/KASHMIRI HINDU FAMILIES (NON-MIGRANTS) LIVING IN KASHMIR VALLEY.

**⚠ Defect D-08 (structural gap):** "Sanctioned Intake" and "Last Year Admitted Count" are 0 for every category — no screen anywhere in the 37-page menu was found that sets these values (see also §3.1, §3.2). This may be a genuinely missing admin screen or reside in a separate university-level system.

**Open question:** exact definition/unit of "SET Cut off percentile" (observed values, e.g. OPEN 0.0735, don't read as an intuitive percentile).

**Charts (toggle "Click here to view chart"):** GENDER donut (Female 1,548 / Male 2,069 / **Transgender 6** / Total 3,623) and EDUCATION BACKGROUND donut (Arts 234 / Commerce 3,006 / Others 18 / Science 365 / Total 3,623). Note: chart total (3,623) vs. KPI "Appeared" (3,626) — a 3-record discrepancy, likely a minor data-consistency issue between the two underlying queries.

**Exports:** Save As CSV, Print, Save As PDF.

### §2.7 View Candidate Scores — `GEPIShortListReport.aspx`
**Purpose:** the master candidate shortlist/score report.

**Filters:** Programme → **Category** (conditional, ALL + 5 categories) → **Status** (conditional, defaults to first option rather than "ALL") → City → Go/Clear.

**Status options (5-state shortlist pipeline):** **Yet to be Shortlisted → Shortlisted → First level approved → Second level approved**, plus **Rejected List** as an alternate terminal state. This exact vocabulary recurs as the Dashboard's own column headers (§2.6).

**Grid columns (14):** S.No., Applicant ID, Name, Gender, Category, Education Background, Twelfth Percentage, Tenth Percentage, **Score (Out of 60)**, **Percentile**, **Level 1 Approved By**, Level 1 Approved Date, **Level 2 Approved By**, Level 2 Approved Date.

"Score (Out of 60)"/Percentile are the **SET written-exam** figures — a track distinct from the PI panel score (out of 40). **Named approver roles first surface here:** Level 1 Approved By = **"DIRECTORSAII"**, Level 2 Approved By = **"Registrar"**; every sampled row carries the identical timestamp for both levels, strongly suggesting a bulk "approve all" action exists elsewhere (likely at §2.9).

**Export:** Print, Save As PDF (no CSV on this screen).

**⚠ See D-02** — this is one of the three pages that throws the unescaped-inline-script JS error.

### §2.8 Cut off mark comparison — `GEPIShortlistCountByMark.aspx`
**Purpose:** a cross-programme overlap / cutoff what-if simulator — since one shared candidate pool feeds ~20 Symbiosis programmes, this answers "of my likely shortlist, how many also have offers elsewhere?"

**Fields:** Programme → Category → **Status** (radio: Paid/Shortlisted, for the target programme) → **Other Programme(s) Status** (radio: Paid/Shortlisted, for the comparison set) → **Specify Cut-off Mark to Compare** (optional text) → Submit/Clear.

**Result (BSc-AI, Paid/Paid, no cutoff):** *"Out of 3626 candidates, 3626 are falling under greater than or equal to [blank]"* and *"Exclusive candidates for [BSc-AI] : 0"* — a striking real finding: **zero** BSc-AI-paid candidates applied to BSc-AI exclusively; all 3,626 also applied elsewhere in the university.

**Grid (19 rows):** Programme Name, Count, Payment status. Confirms the platform's tenancy model precisely: one shared SET pool feeding ~19+ programmes across multiple institutes/cities (Pune, Noida, ...).

No export controls on this screen.

### §2.9 Shortlist Candidates — `GEPIShortListScreen.aspx`
**Purpose:** the actual shortlisting execution engine — the write-action counterpart to §2.7/§2.8. **Not exercised** (bulk write, out of scope).

**Fields:** Programme → **Category** (no "ALL" — must run one category at a time) → **Selection Criteria** (radio, conditional/mutually-exclusive: "No.of Candidates" reveals a headcount field; "Cut Off Marks" reveals a mark-threshold field) → **Shortlist / Reset / Reset All**.

3 additional DOM-present-but-hidden selects (`ddlpreference`, `ddlSortOn` fixed to "Total", `ddlSortBy` fixed to "Descending") suggest a planned tie-break/explicit-sort control not wired into the visible UI — flagged as an open item (dead code, mid-rollout feature, or unmet precondition).

### §2.10 View Slot Book Count — `sessionslotcount.aspx`
**Purpose:** operational per-session capacity monitor.

**Filter:** Program Name (grid loads immediately).

**Grid columns:** S.No., City Name, Session Date, Capacity, Slotbook Count, Forceful Allocated Count, Available Capacity.

**Sample data (BSc-AI):**

| Session | Capacity | Slotbook | Forceful | Available |
|---|---|---|---|---|
| May 7 2025 9:00AM | 10 | 0 | 10 | 0 |
| **May 15 2025 10:30AM** | **12** | 1 | 12 | **-1** |
| May 16 2025 9:45AM | 10 | 0 | 10 | 0 |
| Jun 9 2025 6:05AM | 2 | 0 | 2 | 0 |

**⚠ Defect D-09 (Critical, data-integrity) — negative available capacity / confirmed session overbooking.** The 15-May session was allowed to accumulate 13 candidates against a 12-seat capacity, with the overflow simply rendered as `-1` rather than blocked or flagged. **Independently corroborated on four separate screens across the audit** (this one, §2.14, §6.9, and implicitly §4.1) — a genuine, systemic defect, not a display artifact. "Forceful Allocated Count" being ≥ Capacity on 3 of 4 rows also suggests Forceful Allocation (§2.16) is the *dominant* real-world path candidates take into a session, not self-service slot-booking.

**Controls:** "View Category wise slot booked count" (modal breakdown by the 5 categories), "Slot Booked"/"Slot Not Booked" toggle filters (effect inconclusive in this low-volume sample), "Download Report" (not exercised).

### §2.11 Candidate Reallocation — `GEPIReAllocation.aspx`
**Purpose:** move a candidate between sessions/groups — **explicitly scoped**, per the on-screen banner, to "Attendance not marked for any Activity Test & absent candidate(s)" — a remediation tool for no-shows/unmarked attendance, not general rescheduling.

**Fields:** Program → **From Group** (select + "…" picker) → **To Group** (select + "…" picker) → **Comments** (required textarea — mandates a written justification for every reallocation) → **ReAllocate** (not exercised).

The "…" pickers produced no visible modal in this session (likely because zero candidates currently qualify under the eligibility rule above) — their exact browsing UI is unconfirmed.

### §2.12 Reallocation Report — `GEPIReAllocationReport.aspx`
**Purpose:** audit log of reallocations actually performed via §2.11.

**Filters:** Programme → **Test Group** (cascades, mirrors Programme 1:1) → Search by (Applicant Id / Applicant Name) + value → Submit.

**Grid columns:** S.No., ApplicantId, Applicant Name, Old Group Name, Old PI ID, New Group Name, New PI ID, New Session.

**Sample record:** Old Group "15MG02" / Old PI ID "15MG0206" → New Group "15MG01" / New PI ID "15MG0107". Confirms the group-code composition pattern: `<SessionSeq><"MG"><GroupIndex>`, extended with a 2-digit seat number for the per-candidate "PI ID" (e.g. "15MG02" + "06"). **Note the missing leading "S"** here versus §1.2's "S07MG01" format — an unresolved naming inconsistency, see §2.5's data-model note.

**Export:** Save As CSV only.

### §2.13 Print Reports — `gepireport.aspx`
**Purpose:** the generic print-output generator for the four templates curated in §2.5.

**Fields (the deepest cascade in the app, 5 levels):** Programme → Test Group → City → Centre → **Session** (real created sessions) → **PI Group** (cascades from Session; "All" + individual group codes) → **Report Type** (independent of the cascade — the same 4-item catalog from §2.5) → **Records per page** (1–12) → **Generate Report**.

Clicking Generate Report produced no inline preview or new tab — consistent with a direct file-download (PDF) server response; output bytes not captured (out of scope).

### §2.14 Approval Count — `GEPIApprovalCount.aspx`
**Purpose:** per-session operational funnel: allocated → present/absent/unmarked → Director-approved.

**Filter:** Programme (grid loads immediately).

**Grid columns:** Session Date, Session Time, City Name, Allocated Count, Present Count (drill-through), Absent Count (drill-through), Attendance/Present Not Marked Count (drill-through), Director Approved Count (drill-through) + Total row.

**Sample data (BSc-AI):**

| Session | Allocated | Present | Absent | Not Marked | Director Approved |
|---|---|---|---|---|---|
| 07 May | 10 | 0 | 0 | 10 | 0 |
| 09 Jun | 2 | 0 | 0 | 2 | 0 |
| **15 May** | **13** | 11 | 0 | 2 | 11 |
| 16 May | 10 | 1 | 0 | 9 | 0 |
| **Total** | **35** | 12 | 0 | 23 | 11 |

Second independent confirmation of D-09 (15-May Allocated=13 vs. 12-seat capacity).

**Details modal (drill-through):** S.No., Applicant ID, Name, Group Name, Group ID (e.g. "15MG0101" — confirms `<GroupName><2-digit seat>`), Session Date, Session Time — paginated 10/page, with its own Download button.

### §2.15 Print Application Form — `Printapplicants.aspx`
**Purpose:** print the original SET application form for physical check-in verification.

**Fields:** Programme → **Select Print Type** (radio, conditional, 4 modes):

| Mode | Fields revealed |
|---|---|
| Single Form | Student ID (text) |
| Range Print | From / To (text) |
| Group Wise | Test Group → City → Centre → Session → Group (default "All") |
| Upload File | Select File (bulk print by uploaded Applicant-ID list) |

A "(Download Sample Upload File)" link is always present alongside the radios, confirming the upload format is a fixed template. **Print** button (not exercised).

### §2.16 Forceful Allocation — `CandidateAllocation.aspx`
**Purpose:** manually push one candidate into a session, bypassing normal shortlist/slot-booking — per §2.10/§2.14, the dominant real-world allocation path in this tenant.

**Flow:** Programme Name + **Enter Student ID** → **Submit** (2-step lookup-then-act; the second, session/group-assignment form was not reached in this pass since every tested ID was already allocated).

**Confirmed edge cases:**
- **Already-allocated candidate:** clean error — *"Candidate already allocated for Session : May 15, 2025 - 10:30AM."* Confirms the system **does** enforce one-candidate-one-session, but (per D-09) does **not** enforce session capacity — an asymmetric safeguard.
- **Non-existent Student ID:** clean, generic *"No Record(s) Found."*

### §2.17 Print Barcode ID Card — `BarcodeLabels.aspx`
**Purpose:** print physical barcode ID badges for interview-day scanning.

**Fields:** Programme → Test Group → City → Centre → **Session** (a real "ALL" option exists here, unlike §2.13) → Group → **Submit** (not exercised).

---

## 5. Module 3 — Merit List Processing

### §3.1 Conversion of Vacant Seats — `VacantSeats.aspx`
**Purpose:** category-wise seat-utilization summary, to decide whether to convert unfilled quota seats to another category.

**Filter:** Programme Name (grid loads on selection).

**Grid columns:** S.No., Category (+Total), Sanctioned Intake, Merit listed, Admit Count, Vacant Seat, Waitlisted, Rejected List.

**Sample (BSc-AI):** OPEN: Sanctioned Intake 0, Merit listed 2, Admit 0, Vacant 0, Waitlisted 6, Rejected 2; all other categories 0.

**Reinforces D-08:** Sanctioned Intake is 0 everywhere — no discoverable screen anywhere sets it — so "Vacant Seat" cannot produce a meaningful answer in this tenant. **This screen's stated purpose (deciding seat conversion) is currently non-functional** for that reason. **Read-only display**: despite the menu label implying an action, no "convert" control was found here.

**Export:** Save As CSV, Print.

### §3.2 Merit List Dashboard — `PiwatFinalDashbord.aspx`
**Purpose:** the post-PI equivalent of §2.6 — merit ranking, waitlist, and rejection outcomes, versioned by Merit List release.

**Filter:** Programme Name → 2 KPI donuts (Total Shortlisted: 3,623; Total Appeared **for PI**: 11) → **Last Payment Date** (a mislabeled control — actually the **Merit List version selector**, e.g. "MeritList 1 - 16-June-2025") → Date of commencement.

**"Break-Even Admissions" table — 24 columns, the widest grid in the product:**
SNo, Category, Sanctioned Intake, Last Year Admitted Count, Admit Count, Vacant Seat, Previous MeritList Count, Admitted Male/Female/Transgender Count, Number of Candidates Shortlisted for PI, Number of Candidates Appeared for PI, Yet to be processed, Meritlisted, First level approved, Second level approved, **Meritlist CutOff Mark**, Waitlisted, **WaitList CutOff Mark Minimum/Maximum**, Rejected List, Rejected List Minimum/Maximum Score, **Ineligible**.

**Sample (BSc-AI, OPEN):** Shortlisted for PI 3,556 · Appeared for PI 11 · Meritlist CutOff 43.0000 · Waitlisted 6 (range 31.40–41.60) · Rejected 2 (range 23.00–29.60) · Ineligible 1.

**Merit-band model confirmed:** the three cutoff bands (Rejected < WaitList < Meritlist cutoff) are contiguous and non-overlapping per category — candidates are ranked and sliced by two cutoff marks. **This is the core merit-ranking algorithm** for a rebuild's scoring engine.

**New 6th outcome state: "Ineligible"** — beyond the 5-state shortlist pipeline, ties to §6.1's category-document verification. Open question: exactly how "Ineligible" differs from "Rejected" (document/eligibility failure vs. merit-based).

**⚠ Defects on this specific screen:** the Morris.js bar chart throws `Error: Graph container element not found` (chart section fully non-functional — see D-02/§2.5's technical chapter), and easyPieChart donuts fail similarly.

### §3.3 View Candidate Final Score — `PiwatFinalReport.aspx`
**Purpose:** the definitive per-candidate final-score report — where the actual merit formula is exposed.

**Filters:** Programme → Category → **Status** (conditional, reveals a **Date**/Merit-List-version field on selection) → Student Id / Name → Search.

**Status options — the fullest state enum in the app (7 states):** Shortlist - Yet to be Meritlisted, Merit List - Yet to be Approved, Merit List - First Level Approved, Merit List - Second Level Approved, Waiting List, Ineligible, Rejected List.

**Grid columns — the merit formula, fully exposed:** S.No., Applicant ID, Category, Gender, **Total PI Panelist 1 (40 Marks)**, **Total PI (40 Marks)**, **APV Score (Out of 10)**, **PI+APV score (50 Marks)**, **SET Score**, **Total Score**.

**Formula confirmed:** `Total PI (40) + APV Score (10) = PI+APV score (50)`, and observed `Total Score` = `PI+APV score` exactly — i.e. **`SET Score` reads `0.0000` and appears not to be added into the final Total Score**, despite these candidates having a real, non-zero SET exam score elsewhere in the system.

**⚠ Defect D-10 (High, confirmed on 3 independent screens — §3.3, §4.1, and consistent with §2.7's data):** the SET score fails to populate/flow into the final merit total. This is confirmed, not hypothetical, and directly affects whether the published merit list is computed correctly — **the single highest-priority scoring-logic defect in this audit.**

**"APV" (unresolved acronym)** — see BRD Glossary and §3.4; a rebuild must get this defined by the business before finalizing the scoring algorithm.

**Export:** Print, Save As PDF.

### §3.4 Merit list / Wait list Candidates — `PiwatFinalSelection.aspx`
**Purpose:** the write-action counterpart to §3.3 — actually promotes candidates onto the published merit list. The highest-stakes screen in the audit. **Not exercised.**

**Fields:** Programme → Category → **Status** (single fixed option in this tenant: "Merit List") → **Selection Criteria** (radio, **dynamically constrained by business state**, see below).

**Pre-flight status panel:** "PI Present Count : 12" / "Overall Present Count : 12" (cross-validates against §2.14's Total Present=12) and a **4-item readiness checklist**: Attendance Verification → **APV** → Category Document Verification → Clearance to Generate Merit List, all "Approved" in this sample. **This confirms APV is a formal checklist/approval gate**, in addition to being a scored component (§3.3) — most consistent reading: a distinct verification/scoring step that both gates progression and contributes up to 10 points.

**Business-state-driven UI:** banner reads *"First Merit list is over. Hereafter only Wait listed candidates are allowed to move to Merit list status."* — and correspondingly, once Status="Merit List" is chosen, **the "Cut Off Marks" radio option disappears entirely**, leaving only "No.of Candidates." **This is core business logic:** a category's first merit-list run may use either method; every subsequent run is headcount-only, against the Waiting List.

**Fields revealed for a run:** No. of Candidates (headcount) + **"Last date to pay the fees"** (required date) + **"Next Merit list release date"** (required date) — both tied to the versioned release cycle. **Submit / Reset / Reset All.**

### §3.5 Print Offer Letter — `BulkOfferLetterPrint.aspx`
**Purpose:** bulk-generate offer letters for a Merit List release, or a single candidate.

**Fields:** Programme → **Merit List Last Payment Date** (cascades, same versioned release list) → optional Student ID → **Submit** (not exercised).

---

## 6. Module 4 — View Student Profile

### §4.1 Search Student Profile — `StudentProfile.aspx`
**Purpose:** the single-candidate 360° view, for support/query resolution.

**Fields:** Programme Name → **Search Student** (radio: Student ID / Student Name, conditional field reveal) → Submit.

**Full "CANDIDATE PROFILE" card (tested with a real candidate — real name withheld, referenced here by Applicant ID only):**
- Photo (or "No photo available" placeholder) + **"View Application"** button (links to the raw original application record).
- Applicant ID, **PI ID** (e.g. "15MG0204" — confirms the group/seat composition pattern again), Programme Name, Session Date, Reporting Time, Score Approval Status.
- **SET Percentile** and **"SET Score (Scaled Up Mark)" = 0.0000** — a third, independently-observed confirmation of D-10; the explicit "Scaled Up Mark" label is the strongest evidence that a scaling/normalization step exists but is not executing or persisting its result.
- **Admission Status** and **Waiting List Number** (populates only when the candidate is actually on the Waiting List — a conditional/nullable field tied to Admission Status).
- Right rail: Category, Educational Background, Twelfth/Tenth Percentage, Gender (Twelfth Percentage was blank for the tested candidate — a source-application data-completeness gap, not a bug in this screen).
- Score table: identical structure to §3.3 (Total PI Panelist 1, Total PI, APV Score, PI+APV score, Percentile, Total Score).

---

## 7. Module 5 — SMS and Email

*All exploration in this module was strictly limited to observing form structure; the Send action was never exercised (an actual send is an irreversible, outward-facing action with real-world consequences on real candidates).*

### §5.1 Send Email — `SendMail.aspx`
**Fields:** Programme Name → **Status** (actually an audience/template selector, conditional — changes the rest of the form):

| Value | Behavior |
|---|---|
| Sample Mail | Reveals **From Mail** (read-only, `admissions@saii.siu.edu.in`) + a manual **"To Mail"** text field (comma-separated) — a one-off test-send. |
| Shortlisted Candidates / MeritList Candidates / WaitList Candidates / Allocated Candidates | "To Mail" disappears; replaced by a **"Slot Book Status"** radio filter (All/Booked/Not Booked/Allocated Candidates) to narrow the bulk-send audience, which is derived server-side. |

Common to both modes: Subject (text) + a rich-text **Body** editor (TinyMCE-class toolbar) with documented mail-merge placeholders **`%StudentID%`** and **`%StudentName%`**. **Send** button (not exercised).

**⚠ Defect D-11 (Medium, usability/safety):** the bulk-audience mode shows **no recipient-count preview** before Send — no "this will email N candidates" confirmation anywhere in the flow. A rebuild should add this as a hard requirement before any bulk-communication send.

### §5.2 Emailer and SMS Report — `EmailerAndSMSReport.aspx`
**Purpose:** delivery/audit log for communications sent via §5.1 (and its SMS counterpart, which was not located as a separate compose screen anywhere in the menu — open question, see BRD §8.6).

**Fields:** Programme Name → **Report Type** (Emailer / SMS) → Search.

Zero rows returned for the tested combination (no historical send activity in this tenant) — grid column structure therefore unconfirmed; expected at minimum to include recipient, content/subject, timestamp, and delivery status by pattern-matching every other report in the product.

---

## 8. Module 6 — PI Process (11 screens; 4 blocked by D-04)

### §6.1 Category Document Verification — `StudentCategoryDocumentStatus.aspx`
**Purpose:** verify category-claim proof documents (caste/tribe certificates, disability medical certificates) — feeds the "Ineligible" status (§3.2/§3.3/§3.4).

**Notable UX exception:** the grid **loads immediately with no filters required** — the only screen in the product where this is true — showing all category-claiming (non-OPEN) candidates across both tenant programmes by default.

**Filters (all optional):** Student Id, Programme, Category (cascades), Institute Document Status (All/Valid/InValid), plus a second not-yet-triggered Document Status select (likely the Eligibility Team's own filter).

**Grid columns:** S.No., Student Id, Name, Category, Programme, **Eligibility Team Document Status**, **Institute Document Status**, **Final Attendance status**, View, **DA Eligible Upload/View**.

**Two-tier verification confirmed:** documents are checked independently by a university-level **Eligibility Team** and by the **Institute**, with a separate upload/review flow specifically for DA (Differently Abled) candidates.

**"View" → "View Document" modal:** Document Type (e.g. "Category / Medical Certificate*"), View Document (link to the uploaded file — not opened, to respect candidate privacy), Document Name, Document Status.

### §6.2 Panelist Creation — `PanelistCreation.aspx`
**Purpose:** register the pool of internal/external interview panelists, with a built-in eligibility compliance check.

**Add form fields:**

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | Salutation | select | Mr, Ms, Prof, Dr |
| 2 | Name | text | |
| 3 | Email ID | text | |
| 4 | Panelist Type | radio | Internal / External |
| 5 | Mobile Number | text | |
| 6 | LinkedIn | text, required | Mandatory profile URL, presumably for credential verification. |
| 7 | Panelist | radio | New / Existing |
| 8 | Qualifications | text | |
| 9 | Organization (Present) | text | |
| 10 | Designation (Present) | text | |
| 11 | Industry (Number of Years) / Academic (Numbers of Years) | text/number ×2 | Split experience tracking. |
| 12 | Programme | checkboxes, multi-select | Many-to-many confirmed by real data (panelists tagged to both tenant programmes simultaneously). |
| 13 | Image Upload / Remarks | file / required textarea | |

**Compliance banner (prominent, red):** *"All panelists, both internal and external, for undergraduate programmes must have a minimum of 5 years of experience. If a panelist has less than 5 years of experience, please provide a justification. If the panellist has 5 years or more, indicate 'N/A'."* — explains the mandatory Remarks field. **⚠ Defect D-12 (soft/unenforced business rule):** no client-side validation blocks submission when Industry+Academic years total under 5 — the policy is enforced only by instruction, not by the system.

**Bulk-add tools:** Select File → Upload/Clear with a "(Download Upload File Format)" template link; **"Import Last Year Panelist"** one-click roster carry-forward.

**List/search:** row counter, status filter (**All, Yet To be Approve, DirectorApprove, RegistrarApprove, DisApprove**), Search By (Panelist ID/Name/Mobile Number/Email ID/Panelist Type).

**Governance:** a **Director → Registrar** approval chain, distinct from the AO→Director→SIU chain for rubric config (§2.3), with an explicit **DisApprove** terminal state.

**Grid columns:** S.No, Photo, Panelist ID, Name, Mobile Number, Email ID, Panelist Type, Approved Status, Programme(s), Edit. **Panelist ID format:** `P<number>`, a simple global auto-increment.

### §6.3 Panelist Approval — `FIRSTLVLAPPPANELIST.aspx`
**Purpose:** the Director-level (first-level) approval action for panelists from §6.2.

**Fields:** Institute (select, locked to "SAII" for this account) → Approval Status (**"Yet To be Approved" / "Approved"**) → Go/Clear.

**Tested:** "Yet To be Approved" → *"No record(s) found"* — consistent with every known panelist already being fully Director+Registrar approved. **No Registrar-level (second-level) approval screen exists in this account's menu at all** — that step is performed via a separate role/portal not available to the AO login.

### §6.4 Panelist Allocation — `PanelistAllocation.aspx` — ⚠ D-03 / D-04, effectively unusable
**Purpose:** assign approved panelists to sessions/groups.

**Fields:** the standard 5-level cascade → **Score Type** (select). **Confirmed permanently empty** (`ddlTestType`), and Submitting with it empty **froze the entire browser tab** (see §2.3 D-03). The post-submit allocation UI was never observed as a result.

### §6.5 Activity wise Allocation (Group wise) — `TestWiseGroupAllocation.aspx`
**Purpose:** room-logistics allocation — assign a session's groups to a given number of physical rooms for an activity.

**Fields:** standard cascade (Session defaults to "ALL") → **Score Type** (select — **populates correctly here**, "Personal Interaction"; the working counterpart to §6.4's broken instance) → **No. of Rooms** (text) → Submit (not exercised — the actual room-distribution algorithm/output was not observed).

**⚠ Also affected by D-02** (`SyntaxError: Unexpected token ';'` at line 350).

### §6.6 Registration Attendance — `RecordAttendance.aspx`
**Purpose:** front-desk session check-in — the data source behind session-level "Present"/"Absent" counts seen in §2.14/§3.2.

**Fields:** standard cascade → Group → **Attendance status** (select filter: Yet to be Marked / Present marked candidates / Absent marked candidates) → Submit.

Tested (Group=15MG01, "Present marked candidates") returned no visible result grid — inconclusive (possibly zero present in that specific group, since 11 present candidates split across 2 groups for that session). **The actual per-candidate mark-present/absent action UI was not reached** (further screen behind this filter step, out of scope as a write action). **⚠ Also affected by D-01** (jQuery race, confirmed 3+ times on this exact screen).

### §6.7 Candidate Testwise Attendance — `ManageAttendance.aspx` — ⚠ D-04
**Purpose:** attendance scoped to a specific activity within a session (as opposed to §6.6's general check-in).

**Fields:** standard cascade → Group → **Test Type** (select) → Attendance status → Submit. **Test Type confirmed permanently empty** — Submit deliberately not tested (avoiding a repeat of D-03's tab freeze). **⚠ Also affected by D-01.**

### §6.8 Score Print — `PIWATScorePrint.aspx`
**Purpose:** generate a printable per-panelist mark-sheet.

**Fields:** standard cascade → **Score Type** (select, id `ScoreType` — **populates correctly**, "Personal Interaction") → Group → **Panelist Number** (select: **Panelist 1 / Panelist 2**, matching the 2-panelist config from §2.2 — confirms one printable sheet per panelist) → **Records per page** (1–18+) → **Print Score** (not exercised).

### §6.9 Activity wise Attendance Count — `TestWiseAttendanceCount.aspx`
**Purpose:** compares session-level check-in against activity-specific completion — a distinction not visible on any other attendance screen.

**Filter:** Program (grid loads immediately).

**Grid columns:** Session Date & Time, Allocated Count, **Present Count** (drill-through, activity-specific), **Overall Present Count** (drill-through, session-level), **Partially Attended Count**.

**Sample (BSc-AI):**

| Session | Allocated | Present (activity) | Overall Present (venue) | Partially Attended |
|---|---|---|---|---|
| May 7 | 10 | 3 | 10 | 0 |
| **May 15** | **13** | 12 | 13 | 0 |
| May 16 | 10 | 2 | 10 | 0 |
| Jun 9 | 2 | 2 | 2 | 0 |

**Key business insight:** "Overall Present Count" equals "Allocated Count" on every row (everyone allocated is treated as present at the venue), while activity-specific "Present Count" is markedly lower for 2 of 4 sessions — real, precisely-tracked evidence that candidates can check in without completing the scored activity. Fourth independent confirmation of D-09.

**Export:** two distinct buttons — "Save As CSV" and "Download Attendance Report."

### §6.10 Panelist Allocation Report — `PanelistAllocationReport.aspx` — ⚠ D-04
**Purpose:** read-only report view of §6.4's panelist-to-group assignments.

**Fields:** standard cascade → **Score Type** (id `ddlTestType` — **confirmed permanently empty**, third instance of D-04). Not submitted.

### §6.11 Activity wise Allocation Report — `TestwiseAllocationReport.aspx` — ⚠ D-04
**Purpose:** report counterpart to §6.5's room allocation.

**Fields:** standard cascade → **[Score Type, id `ddlTestType`]** → Submit. **Fourth confirmed instance of D-04.** Not submitted.

---

## Appendix A — Full Defect List (ranked by severity)

| ID | Severity | Screen(s) | Summary |
|---|---|---|---|
| D-03 | **Critical** | §6.4 Panelist Allocation | Submitting a required-but-unpopulated dropdown freezes the entire browser tab; no ordinary recovery path. |
| D-04 | **Critical** | §6.4, §6.7, §6.10, §6.11 | Shared broken `ddlTestType` cascade control across 4 of 11 PI Process screens — architecture-level, single root cause. |
| D-09 | **Critical / data integrity** | §2.10, §2.14, §6.9, (§4.1) | Session over-allocation is possible and unblocked; confirmed on 4 independent screens (15-May session: 13 allocated vs. 12 capacity). |
| D-10 | **High / scoring correctness** | §3.3, §4.1, (§2.7) | SET exam score fails to populate/flow into the final merit Total Score; confirmed on 3 independent screens. |
| D-01 | **High** | Sitewide; confirmed on DashBoard.aspx, RecordAttendance.aspx, ManageAttendance.aspx | Dead `/JS/jquery.js` reference (503) causes sitewide `$ is not defined` failures, killing menu/UI rendering intermittently-looking but 100%-reproducible root cause. |
| D-02 | **High / security-adjacent** | GEPIShortListReport.aspx, PiwatFinalDashbord.aspx, TestWiseGroupAllocation.aspx (§6.5) | Server-side string data concatenated unescaped into inline `<script>` blocks, breaking JS syntax; a real data-handling anti-pattern, not cosmetic. |
| D-05 | High | §2.1 Add Academic Year | Fully broken — every access path (direct URL and real link) errors out. |
| D-06 | Medium | §2.2 Add Assessment | "Allocation Type" field only appears on Edit, never on Add — no operator control at creation time. |
| D-11 | Medium | §5.1 Send Email | No recipient-count preview before a bulk send — safety gap. |
| D-12 | Medium | §6.2 Panelist Creation | 5-year-experience policy is instructional only, not enforced by validation. |
| D-07 | Low | §2.5 Map Print Reports | Duplicated/inconsistent master-value strings (report names, category names) instead of one foreign-keyed source of truth. |
| — | Low (sitewide UX) | Many | Copy-pasted/incorrect browser tab titles on 6+ screens; sidebar never preserves expand state; no breadcrumb; inconsistent export button sets per screen. |

Additional dead static assets (toastr notifications, the "morris" chart library, one datepicker CSS variant) are cataloged in §2.2 and should be included in the same remediation pass as D-01.

## Appendix B — Inferred Domain Objects (for a rebuild's data model)

- **Programme** — belongs to an Institute; scoped per admin account.
- **Academic Year** — currently un-creatable through any working screen (D-05).
- **Assessment** — belongs to Programme + Academic Year; has Short Name (GE/PI/WAT/WE), panelist count, scoring model, total marks; governed by a 3-stage approval (AO→Director→SIU).
- **Assessment Parameter** — belongs to Assessment; weighted rubric line-item.
- **Session** — belongs to Programme + Centre; has a date/time window, capacity, reporting-time offset; contains one or more Groups.
- **Group** — belongs to Session; has a system-generated code (`<SessionSeq>MG<GroupIndex>`) and its own capacity.
- **Candidate/Applicant** — imported from the central SET system; carries SET score/percentile, category, gender, education background, twelfth/tenth percentage; progresses through a multi-stage status (see Appendix C's state diagram).
- **Panelist** — Internal/External; belongs to one or more Programmes; governed by a 2-stage Director→Registrar approval with an explicit Disapprove state.
- **Reservation Category** — a fixed, statutory master list (OPEN/SC/ST/DA/Kashmiri-category) that should be a single referenced table, not a repeated string.
- **Merit List Release** — versioned, dated; carries a fee-payment deadline and a next-release date.
- **Print Report** — a shared, cross-module master catalog (non-contiguous sequence numbers observed) mapped per-programme via §2.5.

## Appendix C — Candidate Lifecycle State Diagram (reconstructed)

```
Imported
   │
   ▼
Yet to be Shortlisted ──(§2.9 Shortlist)──▶ Shortlisted
                                               │
                       (Director approve)      ▼
                                       First level approved
                                               │
                       (Registrar approve)     ▼
                                       Second level approved ──▶ Rejected List (alt. terminal)
                                               │
                              (interview happens; §6.1 doc check)
                                               │
                        ┌──────────────────────┼───────────────────────┐
                        ▼                      ▼                       ▼
              Shortlist - Yet to        (fails category doc      (attends & scores)
              be Meritlisted             verification)
                        │                      ▼
                        ▼                  Ineligible (terminal)
              Merit List - Yet to
                be Approved
                        │
             (Director approve)
                        ▼
              Merit List - First
                Level Approved
                        │
             (Registrar approve)
                        ▼
              Merit List - Second
                Level Approved ──▶ published on a MeritList release
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
         Merit List           Waiting List
      (fee paid by deadline)  (pulled into next
                                release, headcount-only)
```

## Appendix D — Rebuild Recommendations (aligned to a React/Next.js + NestJS-or-Go + PostgreSQL stack)

1. **Design a real API-first architecture.** There is no existing API to preserve — build proper REST/RPC endpoints for every cascading lookup (Programme→TestGroup/City→Centre→Session→Group, the single most-reused pattern in the legacy app) as one shared, well-tested service, not one implementation per screen (the direct cause of D-04).
2. **Model the approval-workflow pattern once, generically**, parameterized by (subject type, list of approver roles, terminal states including Disapprove) — reused for rubric config (AO→Director→SIU), panelists (→Director→Registrar), and shortlist/merit-list candidate approvals, rather than three bespoke implementations.
3. **Make session capacity a real, enforced constraint** (hard block or explicit, logged manager override) — do not repeat D-09.
4. **Design the merit-scoring formula as an explicit, testable calculation step** (PI score + rubric weightings + the still-undefined APV score + a correctly-scaled SET score), with unit tests specifically covering the SET-score-scaling defect (D-10) that plagues the legacy system.
5. **Build the reservation-category framework as a first-class, referenced dimension** on every report and funnel stage from day one, not retrofitted — it recurs on nearly every screen in the legacy product.
6. **Add a recipient-count confirmation step before any bulk communication send** (D-11), and make the 5-year panelist-experience policy a real, blocking validation with a logged exception workflow (D-12).
7. **Never string-concatenate server data into client-rendered script or HTML** — always serialize through a proper JSON boundary (directly addresses D-02, and is good practice regardless of stack).
8. **Get explicit business answers to the BRD's open questions (§8)** — especially the APV acronym/calculation and the missing Sanctioned Intake configuration — before finalizing the scoring and quota-management modules; do not guess these in implementation.
9. **Standardize export capability** (e.g. every list/report screen gets CSV + PDF, consistently) instead of the legacy system's per-screen inconsistency.
10. **Treat versioned, dated Merit List releases as a core domain concept from the start** (not a bolt-on), since it drives fee deadlines, candidate communications, and the different selection-method rules for first vs. subsequent releases.
