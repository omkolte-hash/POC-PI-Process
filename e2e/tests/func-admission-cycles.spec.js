// Functional interaction test for the Admission Cycles page — now a real, ds-backed collection
// (see engine's createAdmissionCycle/cyclesForScope), not decorative localStorage. Cycles are
// scoped to whichever programme + academic year is selected in the header, exactly like every
// other page, and start empty — creating one is a hard prerequisite for candidate-facing pages
// (see CYCLE_GATED_PAGES in index.html).
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav, fieldByLabel } from './helpers.js';

const GROUP = 'Settings';
const LINK  = 'Admission Cycles';

test.describe.configure({ mode: 'serial' });

// The shared demo fixture (MBA Programme, 2026-27) is also used interactively outside these
// automated tests, so it can't be assumed cycle-free — each test creates its own fresh programme
// first (same isolation pattern as admission-workflow.spec.js) rather than relying on the default
// active programme+year having no cycles yet.
test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);

  await gotoNav(page, 'Programmes', 'Programmes');
  const progName = 'QA-CyclesTest-' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Create Programme")').click();
  await fieldByLabel(page, 'Programme Name').locator('textarea').fill(progName);
  await fieldByLabel(page, 'Description').locator('textarea').fill('QA fixture programme for cycle tests.');
  await page.locator('.dialog button:has-text("Save")').click();
  await page.waitForTimeout(300);
  await page.locator('header select').nth(1).selectOption({ label: progName });
  await page.waitForTimeout(300);

  await gotoNav(page, GROUP, LINK);
});

// ── Action 1: starts empty for a fresh programme+year ─────────────────────────
test('action 1: no cycles yet for a fresh programme+year, empty-state message shown', async ({ page }) => {
  await expect(page.locator('text=No admission cycles yet')).toBeVisible();
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBe(0);
});

// ── Action 2: Create Cycle form only asks for a name ──────────────────────────
test('action 2: create-form only has a name field (programme/year come from the header)', async ({ page }) => {
  await page.locator('button:has-text("Create Cycle")').click();
  await page.waitForTimeout(300);
  const card = page.locator('.card:has-text("New Admission Cycle")');
  await expect(card.locator('input[placeholder="e.g. Round 1"]')).toBeVisible();
  await expect(card.locator('select')).toHaveCount(0);
});

// ── Action 3: fill + Save → new row appears, becomes the selected cycle ───────
test('action 3: fill and save a cycle — new row appears and is auto-selected', async ({ page }) => {
  const unique = 'QA-Cycle-' + Date.now().toString().slice(-6);

  await page.locator('button:has-text("Create Cycle")').click();
  await page.waitForTimeout(300);
  const card = page.locator('.card:has-text("New Admission Cycle")');
  await card.locator('input[placeholder="e.g. Round 1"]').fill(unique);
  await card.locator('button:has-text("Save")').click();
  await page.waitForTimeout(500);

  const row = page.locator('tr', { hasText: unique });
  await expect(row).toBeVisible();
  await expect(row.locator('.badge.bg-secondary')).toContainText('Draft');
  // First cycle created for this programme+year becomes the active one automatically — no
  // "switch to this cycle" control on a row that's already selected.
  await expect(row.locator('button[title="Switch to this cycle"]')).toHaveCount(0);
  // The header's Cycle selector must also reflect it.
  await expect(page.locator('header select').nth(2)).toContainText(unique);
});

// ── Action 4a/4b: Activate / Close toggle the status badge ────────────────────
test('action 4: Activate then Close toggles the status badge', async ({ page }) => {
  const unique = 'QA-Cycle-' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Create Cycle")').click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="e.g. Round 1"]').fill(unique);
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(500);

  const row = page.locator('tr', { hasText: unique });
  await expect(row.locator('.badge.bg-secondary')).toContainText('Draft');

  await row.locator('button:has-text("Activate")').click();
  await page.waitForTimeout(400);
  await expect(row.locator('.badge.bg-success')).toContainText('Active');

  await row.locator('button:has-text("Close")').click();
  await page.waitForTimeout(400);
  await expect(row.locator('.badge.bg-danger')).toContainText('Closed');
});

// ── Action 5: a second cycle can be created and switched to ───────────────────
test('action 5: a second cycle can be created and selected as the active one', async ({ page }) => {
  const first = 'QA-Round1-' + Date.now().toString().slice(-6);
  const second = 'QA-Round2-' + Date.now().toString().slice(-6);

  for (const name of [first, second]) {
    await page.locator('button:has-text("Create Cycle")').click();
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="e.g. Round 1"]').fill(name);
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(500);
  }

  // First cycle stays auto-selected; second must show a switch (select) control instead.
  const firstRow = page.locator('tr', { hasText: first });
  const secondRow = page.locator('tr', { hasText: second });
  await expect(firstRow.locator('button[title="Switch to this cycle"]')).toHaveCount(0);
  await expect(secondRow.locator('button[title="Switch to this cycle"]')).toBeVisible();

  await secondRow.locator('button[title="Switch to this cycle"]').click();
  await page.waitForTimeout(400);

  // Switching flips which row has the control — the newly-selected one loses it, the other gains it.
  await expect(secondRow.locator('button[title="Switch to this cycle"]')).toHaveCount(0);
  await expect(firstRow.locator('button[title="Switch to this cycle"]')).toBeVisible();
  await expect(page.locator('header select').nth(2)).toContainText(second);
});

// ── Action 6: Delete removes the row ───────────────────────────────────────────
test('action 6: Delete removes an unused cycle from the table', async ({ page }) => {
  const unique = 'QA-Delete-' + Date.now().toString().slice(-6);
  await page.locator('button:has-text("Create Cycle")').click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="e.g. Round 1"]').fill(unique);
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(500);

  const targetRow = page.locator('tr', { hasText: unique });
  await expect(targetRow).toBeVisible();
  const before = await page.locator('table tbody tr').count();

  await targetRow.locator('.btn-outline-secondary').click();
  await page.waitForTimeout(500);

  await expect(targetRow).toHaveCount(0);
  const after = await page.locator('table tbody tr').count();
  expect(after).toBe(before - 1);
});
