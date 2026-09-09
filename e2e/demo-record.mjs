// Headless walkthrough RECORDER — renders the whole POC end-to-end to a video file
// (+ one screenshot per step). No visible display needed. Output goes to DEMO_OUT.
import { chromium } from '@playwright/test';
import fs from 'fs';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './tests/helpers.js';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3456/';
const OUT  = process.env.DEMO_OUT;
const SHOTS = `${OUT}/shots`;
const STATUS = `${OUT}/record-status.txt`;
fs.mkdirSync(SHOTS, { recursive: true });
const write = (s) => { try { fs.writeFileSync(STATUS, s); } catch {} };

const STEPS = [
  { t: 'Dashboard',                 g: '',              l: 'Dashboard',                     n: 'Cycle overview & KPIs — institute admin landing page.' },
  { t: 'Programmes',                g: 'Programmes',    l: 'Programmes',                    n: 'EPIC-004 · Self-referencing programme hierarchy.' },
  { t: 'Admission Cycles [NEW]',    g: 'Programmes',    l: 'Admission Cycles',              n: 'STORY-004-01 · Cycles per programme/year, draft/active/closed.' },
  { t: 'Roles & Permissions [NEW]', g: 'Configuration', l: 'Roles & Permissions',           n: 'STORY-001-01 · Roles from a permission catalogue.' },
  { t: 'User Memberships [NEW]',    g: 'Configuration', l: 'User Memberships',              n: 'STORY-001-02 · Assign roles to users.' },
  { t: 'Condition Builder [NEW]',   g: 'Tools',         l: 'Condition Builder',             n: 'EPIC-007 · Visual AND/OR rules → JsonLogic + tester.' },
  { t: 'Import Candidates',         g: 'Candidates',    l: 'Import Candidates',             n: 'EPIC-101 · CSV import: schema, join, filter, preview, commit.' },
  { t: 'Candidates',                g: 'Candidates',    l: 'Candidates',                    n: 'EPIC-005 · Canonical candidate list + profiles.' },
  { t: 'Shortlisting',              g: 'Candidates',    l: 'Shortlisting',                  n: 'EPIC-104 · Condition-based grouping, preview before commit.' },
  { t: 'Shortlist Approvals',       g: 'Candidates',    l: 'Approvals',                     n: 'EPIC-105 · Generic ordered approval gate.' },
  { t: 'Document Collection [NEW]', g: 'Documents',     l: 'Document Collection',           n: 'STORY-201 · Doc types, submission log, completeness.' },
  { t: 'Category Verification',     g: 'Verification',  l: 'Category Verification',         n: 'EPIC-202 · Decision gate over documents.' },
  { t: 'Assessment / PI Config',    g: 'Programmes',    l: 'Assessment / PI Configuration', n: 'EPIC-203 · Assessment records + rubric parameters.' },
  { t: 'Sessions',                  g: 'PI Management', l: 'Sessions',                      n: 'EPIC-205 · PI sessions/groups, capacity, meeting links.' },
  { t: 'Panelists',                 g: 'PI Management', l: 'Panelists',                     n: 'EPIC-204 · Panelists = users-with-membership.' },
  { t: 'Candidate Allocation',      g: 'PI Management', l: 'Candidate Allocation',          n: 'EPIC-205 · Allocate candidates into groups.' },
  { t: 'PI Attendance',             g: 'Interview Day', l: 'PI Attendance',                 n: 'EPIC-207 · Attendance state per candidate.' },
  { t: 'PI Scoring',                g: 'Interview Day', l: 'PI Scoring',                    n: 'EPIC-206 · Raw score capture against the rubric.' },
  { t: 'Formula Builder [NEW]',     g: 'Merit',         l: 'Formula Builder',               n: 'STORY-209-01 · Weighted formulas + live preview (bug fixed).' },
  { t: 'Final Scores',              g: 'Merit',         l: 'Final Scores',                  n: 'EPIC-209 · Computed final score per candidate.' },
  { t: 'Workflow Instances [NEW]',  g: 'Workflow',      l: 'Workflow Instances',            n: 'STORY-102-01 · Per-candidate current node + timeline.' },
  { t: 'Reopen & Corrections [NEW]',g: 'Corrections',  l: 'Reopen & Corrections',          n: 'STORY-208 · Reopen locked step; correction as new revision.' },
  { t: 'Merit Processing',          g: 'Merit',         l: 'Merit Processing',              n: 'EPIC-301 · Rank within partitions; assign bands.' },
  { t: 'Merit Approval',            g: 'Merit',         l: 'Merit Approval',                n: 'EPIC-301/105 · Merit batch to approval.' },
  { t: 'Merit Releases',            g: 'Merit',         l: 'Merit Releases',                n: 'EPIC-301 · Release approved batch as a whole.' },
  { t: 'Seat Allocation [NEW]',     g: 'Merit',         l: 'Seat Allocation',               n: 'STORY-302 · Seat matrix + audited conversion + vacancy.' },
  { t: 'Offer Management [NEW]',    g: 'Merit',         l: 'Offer Management',              n: 'STORY-303-01 · Offer templates, generation, lifecycle.' },
  { t: 'Waiting List',              g: 'Merit',         l: 'Waiting List',                  n: 'EPIC-301 · Waiting-band promotion in sequence.' },
  { t: 'Email Templates [NEW]',     g: 'Communications',l: 'Email Templates',               n: 'STORY-304 · Merge templates, recipient groups, history.' },
  { t: 'Print Templates [NEW]',     g: 'Print',         l: 'Print Templates',               n: 'STORY-305 · Admit cards/letters + bulk gen (bug fixed).' },
  { t: 'Node Sample Tester [NEW]',  g: 'Workflow',      l: 'Node Sample Tester',            n: 'STORY-103-01 · Test a node on pasted sample rows.' },
  { t: 'Workflow Builder',          g: 'Workflow',      l: 'Workflow Builder',              n: 'EPIC-102/103 · Visual DAG canvas.' },
  { t: 'Reports — Candidate Reports',g: 'Reports',      l: 'Candidate Reports',             n: 'EPIC-401 · Read layer over output columns; CSV export.' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  write('booting');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 820 },
    recordVideo: { dir: OUT, size: { width: 1366, height: 820 } },
  });
  const page = await ctx.newPage();

  await mockFilePicker(page);
  await page.goto(BASE);
  await sleep(500);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  try { await page.locator('.apsSideLink').first().waitFor({ state: 'visible', timeout: 8000 }); } catch {}

  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    try {
      await banner(page, i);
      await gotoNav(page, s.g, s.l);
      await banner(page, i);
      await sleep(2600);                       // dwell so the page is readable in the video
      await page.screenshot({ path: `${SHOTS}/${String(i + 1).padStart(2, '0')}-${s.l.replace(/[^a-z0-9]+/gi, '-')}.png` }).catch(() => {});
      write(`recorded ${i + 1}/${STEPS.length} :: ${s.t}`);
    } catch (e) {
      write(`error ${i + 1} :: ${s.t} :: ${String(e.message).slice(0, 140)}`);
    }
  }

  const vid = page.video();
  await ctx.close();               // finalizes the video file
  let finalPath = '';
  try {
    const p = await vid.path();
    finalPath = `${OUT}/geta-poc-walkthrough.webm`;
    fs.renameSync(p, finalPath);
  } catch (e) { finalPath = 'video-error: ' + String(e && e.message); }
  await browser.close();
  write('DONE :: ' + finalPath);
  console.log('VIDEO=' + finalPath);
})().catch((e) => { write('fatal :: ' + String(e && e.message)); process.exit(1); });
