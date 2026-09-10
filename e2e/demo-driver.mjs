// Persistent headed demo driver — walks the whole POC end-to-end, one step at a time.
// Stays open across turns; advances when the control file's integer changes.
// Control: write a step index to CTRL (0..N-1) to show that step; 999 = quit.
import { chromium } from '@playwright/test';
import fs from 'fs';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './tests/helpers.js';

const BASE   = process.env.E2E_BASE_URL || 'http://127.0.0.1:3456/';
const SCRATCH = process.env.DEMO_DIR;
const CTRL   = `${SCRATCH}/demo-step.txt`;
const STATUS = `${SCRATCH}/demo-status.txt`;

// The end-to-end admission journey. group '' = top-level link (no accordion group to open).
const STEPS = [
  { t: 'Dashboard',                 g: '',              l: 'Dashboard',                    n: 'Cycle overview & KPIs — the institute admin landing page.' },
  { t: 'Programmes',                g: 'Programmes',    l: 'Programmes',                   n: 'EPIC-004 · Self-referencing programme hierarchy (arbitrary depth).' },
  { t: 'Admission Cycles [NEW]',    g: 'Programmes',    l: 'Admission Cycles',             n: 'STORY-004-01 · Cycles per programme/year with draft/active/closed status.' },
  { t: 'Roles & Permissions [NEW]', g: 'Configuration', l: 'Roles & Permissions',          n: 'STORY-001-01 · Compose roles from a permission catalogue (no fixed role names).' },
  { t: 'User Memberships [NEW]',    g: 'Configuration', l: 'User Memberships',             n: 'STORY-001-02 · Assign roles to users; one account, many memberships.' },
  { t: 'Condition Builder [NEW]',   g: 'Tools',         l: 'Condition Builder',            n: 'EPIC-007 · Visual AND/OR rule builder emitting JsonLogic + live tester.' },
  { t: 'Import Candidates',         g: 'Candidates',    l: 'Import Candidates',            n: 'EPIC-101 · CSV import: infer schema, join, filter, preview, commit.' },
  { t: 'Candidates',                g: 'Candidates',    l: 'Candidates',                   n: 'EPIC-005 · Canonical candidate list; profile shows columns + provenance.' },
  { t: 'Shortlisting',              g: 'Candidates',    l: 'Create Shortlist',             n: 'EPIC-104 · Condition-based grouping, preview before commit.' },
  { t: 'Shortlist Approvals',       g: 'Candidates',    l: 'Shortlist Approval',           n: 'EPIC-105 · Generic ordered approval gate on the shortlist run.' },
  { t: 'Document Collection [NEW]', g: 'Documents',     l: 'Document Collection',          n: 'STORY-201-01/02 · Doc-type config, submission log, per-candidate completeness.' },
  { t: 'Category Verification',     g: 'Verification',  l: 'Category Verification',        n: 'EPIC-202 · Decision gate over collected documents (proceed/reject/reassign).' },
  { t: 'Assessment / PI Config',    g: 'Programmes',    l: 'Assessment / PI Configuration', n: 'EPIC-203 · Assessment records + rubric parameters and scoring authorisation.' },
  { t: 'Sessions',                  g: 'PI Management', l: 'Sessions',                     n: 'EPIC-205 · PI sessions/groups, capacity, provider-agnostic meeting links.' },
  { t: 'Panelists',                 g: 'PI Management', l: 'Panelists',                    n: 'EPIC-204 · Panelists = users-with-membership; onboarding via approval.' },
  { t: 'Candidate Allocation',      g: 'PI Management', l: 'Candidate Allocation',         n: 'EPIC-205 · Allocate eligible candidates into groups (one group per assessment).' },
  { t: 'PI Attendance',             g: 'Interview Day', l: 'PI Attendance',                n: 'EPIC-207 · Attendance state per candidate; exposed as candidate columns.' },
  { t: 'PI Scoring',                g: 'Interview Day', l: 'PI Scoring',                   n: 'EPIC-206 · Raw score capture against the rubric; reads attendance live.' },
  { t: 'Formula Builder [NEW]',     g: 'Merit',         l: 'Formula Builder',              n: 'STORY-209-01 · Weighted score formulas over columns + live preview (FIXED bug).' },
  { t: 'Final Scores',              g: 'Merit',         l: 'Final Scores',                 n: 'EPIC-209 · Computed final score per candidate.' },
  { t: 'Workflow Instances [NEW]',  g: 'Workflow',      l: 'Workflow Instances',           n: 'STORY-102-01 · Per-candidate current node + step timeline.' },
  { t: 'Reopen & Corrections [NEW]',g: 'Corrections',  l: 'Reopen & Corrections',         n: 'STORY-208-01/02 · Reopen a locked step with reason; correction as new revision.' },
  { t: 'Merit Processing',          g: 'Merit',         l: 'Merit Processing',             n: 'EPIC-301 · Rank within partitions; assign selected/waiting/excluded bands.' },
  { t: 'Merit Approval',            g: 'Merit',         l: 'Merit Approval',               n: 'EPIC-301/105 · Merit batch to approval before release.' },
  { t: 'Merit Releases',            g: 'Merit',         l: 'Merit Releases',               n: 'EPIC-301 · Release approved batch as a whole; release-stamped fields.' },
  { t: 'Seat Allocation [NEW]',     g: 'Merit',         l: 'Seat Allocation',              n: 'STORY-302-01/02 · Sanctioned seat matrix + audited conversion + vacancy report.' },
  { t: 'Offer Management [NEW]',    g: 'Merit',         l: 'Offer Management',             n: 'STORY-303-01 · Offer templates, generation, generated/released/revoked lifecycle.' },
  { t: 'Waiting List',              g: 'Merit',         l: 'Waiting List',                 n: 'EPIC-301 · Waiting-band promotion in strict sequence after release.' },
  { t: 'Email Templates [NEW]',     g: 'Communications',l: 'Email Templates',              n: 'STORY-304-01/02 · Merge-field templates, recipient groups, send history.' },
  { t: 'Print Templates [NEW]',     g: 'Print',         l: 'Print Templates',              n: 'STORY-305-01/02 · Admit cards/offer letters/score sheets + bulk generation (FIXED bug).' },
  { t: 'Node Sample Tester [NEW]',  g: 'Workflow',      l: 'Node Sample Tester',           n: 'STORY-103-01 · Test a node against pasted sample rows; see per-row outcome.' },
  { t: 'Workflow Builder',          g: 'Workflow',      l: 'Workflow Builder',             n: 'EPIC-102/103 · Visual DAG canvas; the feature this whole effort started from.' },
  { t: 'Reports — Candidate Reports',g: 'Reports',      l: 'Candidate Reports',            n: 'EPIC-401 · Read layer over component output columns; CSV/printable export.' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (f, s) => { try { fs.writeFileSync(f, s); } catch {} };

async function banner(page, step) {
  const s = STEPS[step];
  await page.evaluate(({ t, n, idx, total }) => {
    let b = document.getElementById('__demoBanner');
    if (!b) { b = document.createElement('div'); b.id = '__demoBanner'; document.body.appendChild(b); }
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(90deg,#4338ca,#7c3aed);color:#fff;padding:9px 18px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35)';
    b.innerHTML = '<div style="font-size:15px;font-weight:700">STEP ' + idx + ' / ' + total + '  —  ' + t + '</div>' +
                  '<div style="font-size:12px;opacity:.92;margin-top:2px">' + n + '</div>';
  }, { t: s.t, n: s.n, idx: step + 1, total: STEPS.length }).catch(() => {});
}

(async () => {
  write(STATUS, 'booting');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 350,
    args: ['--window-position=0,0', '--window-size=1500,950', '--start-maximized'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  const page = await ctx.newPage();

  await mockFilePicker(page);
  await page.goto(BASE);
  await sleep(500);
  try { await openSampleFile(page); } catch { /* maybe no file gate */ }
  await loginInstitute(page);
  // Confirm we reached the admin portal
  try { await page.locator('.apsSideLink').first().waitFor({ state: 'visible', timeout: 8000 }); }
  catch { write(STATUS, 'error :: sidebar not visible after login'); }

  await banner(page, 0);
  write(STATUS, 'ready :: step 0 (Dashboard) on screen. Write 1.. to advance, 999 to quit.');

  let last = 0;
  write(CTRL, '0');
  for (;;) {
    let step = last;
    try { step = parseInt(fs.readFileSync(CTRL, 'utf8').trim(), 10); } catch {}
    if (step === 999) { write(STATUS, 'closing'); break; }
    if (Number.isInteger(step) && step !== last && step >= 0 && step < STEPS.length) {
      const s = STEPS[step];
      try {
        await banner(page, step);            // announce
        if (s.l !== 'Dashboard' || s.g !== '') await gotoNav(page, s.g, s.l);
        else await gotoNav(page, '', 'Dashboard');
        await banner(page, step);            // re-assert over freshly rendered page
        write(STATUS, `done ${step} :: ${s.t}`);
      } catch (e) {
        write(STATUS, `error ${step} :: ${s.t} :: ${String(e.message).slice(0, 160)}`);
      }
      last = step;
    }
    await sleep(400);
  }
  await browser.close();
})().catch((e) => { write(STATUS, 'fatal :: ' + String(e && e.message)); process.exit(1); });
