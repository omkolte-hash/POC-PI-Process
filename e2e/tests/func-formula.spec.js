// BUG-FORMULA-01 fix: Formula Builder used to operate on 5 hardcoded fake candidates via
// localStorage, and "Commit Formula" had no effect on the real merit score (recomputeOutcome's
// hardcoded pi+apv in admission-engine.js). It now runs against the active programme's real,
// currently-scored candidates, and committing actually changes recomputeOutcome's finalScore.final.
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Merit';
const LINK  = 'Formula Builder';

// The seeded fixture's 100 pre-built, already-scored candidates all live under MBA Programme, but
// a fresh login lands on the fixture's default active programme (BBA, no candidates) — switch to
// MBA first so Preview has real rows to show. See admission-workflow.spec.js's selectProgramme.
async function selectMbaProgramme(page) {
  await page.locator('header select').nth(1).selectOption({ label: 'MBA Programme' });
  await page.waitForTimeout(300);
}

// Final Scores / Merit are now scoped by Programme+Year+Admission Cycle, and the seeded fixture's
// 100 MBA candidates predate that (no cycleId) — by design they don't show up under any cycle
// until re-set-up fresh. Rather than replaying the whole import->allocate->score->APV pipeline
// just to get one cycle-scoped scored candidate, reach into the live app instance (same fiber-walk
// escape hatch wf-explore.spec.js uses) and stamp a cycle onto the fixture's own "OPEN Candidate 1"
// directly — this only touches in-memory state for this test run (writeFile is the mocked no-op).
async function ensureMbaCycleAndStampCandidate(page) {
  await page.evaluate(() => {
    const hostEl = document.getElementById('dc-root');
    const containerKey = Object.keys(hostEl).find((k) => k.startsWith('__reactContainer'));
    const containerFiber = hostEl[containerKey];
    const rootFiber = containerFiber.current || containerFiber;
    let logic = null;
    const seen = new Set();
    (function walk(fiber, depth) {
      if (!fiber || depth > 40 || logic || seen.has(fiber)) return;
      seen.add(fiber);
      if (fiber.stateNode && typeof fiber.stateNode === 'object' && !(fiber.stateNode instanceof Node) && fiber.stateNode.logic && typeof fiber.stateNode.logic.mutate === 'function') {
        logic = fiber.stateNode.logic;
        return;
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    })(rootFiber, 0);
    if (!logic) throw new Error('could not reach app logic via fiber walk');
    const CID = 'CYC-QA-FORMULA-TEST';
    logic.mutate((ds) => {
      if (!ds.admissionCycles.some((c) => c.id === CID)) {
        ds.admissionCycles.push({ id: CID, programmeId: 'MBA', academicYearId: 'AY2026-MBA', name: 'QA Formula Test Cycle', status: 'Active', createdOn: '2026-01-01' });
      }
      ds.activeCycleByProgYear['MBA::AY2026-MBA'] = CID;
      const c = ds.candidates.find((x) => x.name === 'OPEN Candidate 1' && x.programmeId === 'MBA');
      if (c) c.cycleId = CID;
    });
  });
  await page.waitForTimeout(200);
}

// Serial so each test starts with a fresh page via beforeEach
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await selectMbaProgramme(page);
  await gotoNav(page, GROUP, LINK);
});

// Helper: reset formula config in-page (no reload needed) and trigger re-render
async function resetFormula(page) {
  await page.evaluate(() => {
    localStorage.removeItem('geta_formula_config');
  });
  // Navigate away and back to force the engine to re-read localStorage
  await gotoNav(page, 'Merit', 'Final Scores');
  await page.waitForTimeout(300);
  await gotoNav(page, GROUP, LINK);
  await page.waitForTimeout(400);
}

// ── 1. Score Inputs chips render ────────────────────────────────────────────
test('1 - Score Inputs chips render', async ({ page }) => {
  const chipsCard = page.locator('.card', { hasText: 'Score Inputs' }).first();
  await expect(chipsCard).toBeVisible();

  const chips = chipsCard.locator('.badge');
  const count = await chips.count();
  expect(count, 'expected at least one chip').toBeGreaterThan(0);

  // The three real score fields every ready-for-merit candidate carries.
  await expect(chipsCard).toContainText('PI Score');
  await expect(chipsCard).toContainText('APV Score');
  await expect(chipsCard).toContainText('SLAT Score');
});

// ── 2. Add Formula Step adds a step card ─────────────────────────────────────
test('2 - Add Formula Step adds a step card', async ({ page }) => {
  await resetFormula(page);

  const stepsCard = page.locator('.card', { hasText: 'Formula Steps' }).first();
  // Default config has 1 step; count existing bordered step divs
  const stepsBefore = await stepsCard.locator('.border.rounded').count();

  await stepsCard.locator('button', { hasText: 'Add Formula Step' }).click();
  await page.waitForTimeout(400);

  const stepsAfter = await stepsCard.locator('.border.rounded').count();
  expect(stepsAfter, 'step count should have grown by 1').toBe(stepsBefore + 1);
});

// ── 3. Toggle input checkbox + set weight ───────────────────────────────────
test('3 - toggle checkbox and set weight', async ({ page }) => {
  await resetFormula(page);
  await page.waitForTimeout(300);

  const stepsCard = page.locator('.card', { hasText: 'Formula Steps' }).first();
  const firstStep = stepsCard.locator('.border.rounded').first();
  await expect(firstStep).toBeVisible();

  // Weight rows: checkbox + label + number input
  const firstRow = firstStep.locator('div.d-flex.align-items-center.gap-1').first();
  const checkbox   = firstRow.locator('input[type="checkbox"]').first();
  const weightInput = firstRow.locator('input[type="number"]').first();

  // Record initial state
  const wasChecked = await checkbox.isChecked();

  // Toggle off
  await checkbox.click();
  await page.waitForTimeout(400);
  const afterToggle = await checkbox.isChecked();
  expect(afterToggle, 'checkbox state changed after click').toBe(!wasChecked);

  // Toggle back on so the weight input is enabled
  if (!afterToggle) {
    await checkbox.click();
    await page.waitForTimeout(400);
  }

  // Set weight to 0.45
  await weightInput.fill('0.45');
  await weightInput.dispatchEvent('input');
  await page.waitForTimeout(400);
  const val = await weightInput.inputValue();
  expect(parseFloat(val), 'weight input reflects 0.45').toBeCloseTo(0.45, 1);
});

// ── 4. Preview -> results table with computed final scores from REAL candidates ─
test('4 - Preview shows results table with final scores from real candidates', async ({ page }) => {
  // Before preview: empty-state prompt visible
  await expect(page.locator('text=Click Preview to run the formula')).toBeVisible();

  const previewBtn = page.locator('button', { hasText: 'Preview' }).first();
  await previewBtn.click();
  await page.waitForTimeout(500);

  // Commit Formula button only appears when formulaPreviewReady is true
  await expect(page.locator('button', { hasText: 'Commit Formula' })).toBeVisible();

  // Table with real candidate rows from the active programme (MBA)
  const tbody = page.locator('table').first().locator('tbody');
  const rowCount = await tbody.locator('tr').count();
  expect(rowCount, 'preview table has candidate rows').toBeGreaterThan(0);

  // A known, already-scored seeded candidate must appear (not a hardcoded fake name).
  await expect(tbody).toContainText('OPEN Candidate 1');

  // Empty-state prompt gone
  await expect(page.locator('text=Click Preview to run the formula')).not.toBeVisible();
});

// ── 5. Save/Commit persists; Commit respects the "don't rewrite decided candidates" rule ───
// The full positive case (a not-yet-merit-processed candidate's Final Score actually changes
// under a newly committed formula) is covered directly against admission-engine.js in
// js/admission-engine.test.mjs — the seeded fixture's 50 scoreable candidates are all already
// merit-processed (see BUG-FORMULA-01's setScoringFormula), so there's no undecided one to drive
// through the UI here. This test instead confirms the complementary rule: a candidate merit
// processing has already banded keeps the score that decision was made on.
test('5 - Commit Formula does not rewrite an already merit-processed candidate\'s score', async ({ page }) => {
  // OPEN Candidate 1 (SIM-OPEN-001): piTotal 34, apvScore 8, slatScore 80, already meritCategory
  // "merit" in the fixture — default final = pi+apv = 42.
  const finalScoresRow = () => page.locator('tr').filter({ has: page.locator('td', { hasText: /^OPEN Candidate 1$/ }) });

  await ensureMbaCycleAndStampCandidate(page);
  await gotoNav(page, 'Merit', 'Final Scores');
  await page.waitForTimeout(300);
  await expect(finalScoresRow().locator('td').last()).toHaveText('42');

  await gotoNav(page, GROUP, LINK);
  await page.waitForTimeout(300);

  // Save (draft only, no effect on real data yet)
  const saveBtn = page.locator('button', { hasText: 'Save Formula' }).first();
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toContainText('Formula saved');

  // Include SLAT at weight 0.1 in the one and only step, so final = pi*1 + apv*1 + slat*0.1.
  const stepsCard = page.locator('.card', { hasText: 'Formula Steps' }).first();
  const slatRow = stepsCard.locator('div.d-flex.align-items-center.gap-1').filter({ hasText: 'SLAT Score' });
  await slatRow.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(200);
  await slatRow.locator('input[type="number"]').fill('0.1');
  await slatRow.locator('input[type="number"]').dispatchEvent('input');
  await page.waitForTimeout(300);

  const previewBtn = page.locator('button', { hasText: 'Preview' }).first();
  await previewBtn.click();
  await page.waitForTimeout(500);

  const commitBtn = page.locator('button', { hasText: 'Commit Formula' }).first();
  await expect(commitBtn).toBeVisible();
  await commitBtn.click();
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toContainText('committed');

  // Already-decided candidate's score must be untouched — still 42, not 34 + 8 + 0.1*80 = 50.
  await gotoNav(page, 'Merit', 'Final Scores');
  await page.waitForTimeout(300);
  await expect(finalScoresRow().locator('td').last()).toHaveText('42');
});
