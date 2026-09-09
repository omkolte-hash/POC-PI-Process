import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Tools';
const LINK  = 'Condition Builder';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
});

// ── Action 1: 3-panel layout renders ─────────────────────────────────────────
test('1 — 3-panel layout renders', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  // The CB root is a flex row with three children: left (fields+saved), centre (builder), right (preview+test).
  // Left panel contains "Available Fields" heading.
  await expect(page.getByText('Available Fields')).toBeVisible();
  // Centre panel has "Build Condition" heading.
  await expect(page.getByText('Build Condition')).toBeVisible();
  // Right panel has "JsonLogic Preview" heading.
  await expect(page.getByText('JsonLogic Preview')).toBeVisible();
  // Right panel also has "Test Against Sample".
  await expect(page.getByText('Test Against Sample')).toBeVisible();
});

// ── Action 2: click a field button → condition row appears ───────────────────
test('2 — click field button adds a condition row', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  // Count rows before clicking.  Each root cond row has a Remove (×) button.
  const removeButtons = page.locator('button[title="Remove"]');
  const before = await removeButtons.count();

  // Click the "Name" field chip in the left panel.
  await page.getByText('Name', { exact: true }).first().click();
  await page.waitForTimeout(400);

  const after = await removeButtons.count();
  expect(after, 'row count should grow by 1 after clicking a field chip').toBe(before + 1);
});

// ── Action 2b: "Add Condition" button also adds a row ────────────────────────
test('2b — Add Condition button adds a row', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  const removeButtons = page.locator('button[title="Remove"]');
  const before = await removeButtons.count();

  await page.getByRole('button', { name: /Add Condition/i }).first().click();
  await page.waitForTimeout(400);

  const after = await removeButtons.count();
  expect(after, '"Add Condition" should add one row').toBe(before + 1);
});

// ── Action 3: JsonLogic preview updates as you edit ──────────────────────────
test('3 — JsonLogic preview updates on edit', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  // Grab initial preview text — there is already a default Score >= 70 row.
  const pre = page.locator('pre');
  const initial = await pre.textContent();

  // Change the value field of the first condition row to a sentinel value.
  const valueInput = page.locator('input[placeholder="Value"]').first();
  await valueInput.triple_click?.() || await valueInput.click({ clickCount: 3 });
  await valueInput.fill('99');
  await page.waitForTimeout(400);

  const updated = await pre.textContent();
  expect(updated, 'JsonLogic preview should change after editing a value').not.toBe(initial);
  expect(updated, 'preview should contain the typed value 99').toContain('99');
});

// ── Action 4: Save Condition → appears in saved list ─────────────────────────
test('4 — Save Condition persists to saved list', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  const uniqueName = `QA-${Date.now()}`;

  // Saved list panel - check "None saved yet." is shown or count of saved items before.
  const savedSection = page.locator('div').filter({ hasText: 'Saved Conditions' }).first();

  // Type a unique name into the "Condition name…" input and save.
  const nameInput = page.locator('input[placeholder="Condition name…"]');
  await nameInput.fill(uniqueName);
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: /Save Condition/i }).click();
  await page.waitForTimeout(500);

  // The saved list should now show a button labelled with our unique name.
  await expect(page.getByRole('button', { name: uniqueName })).toBeVisible();
});

// ── Action 5: Run Test shows PASS or FAIL badge ───────────────────────────────
test('5a — Run Test shows PASS for matching JSON', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  // Default condition is Score >= 70.  Supply a JSON that matches.
  const testArea = page.locator('textarea[placeholder*="Score"]');
  await testArea.fill('{"Score": 85}');
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: /Run Test/i }).click();
  await page.waitForTimeout(500);

  // PASS badge should appear; FAIL should not.
  await expect(page.locator('.badge.bg-success')).toBeVisible();
  await expect(page.locator('.badge.bg-danger')).toHaveCount(0);
});

test('5b — Run Test shows FAIL for non-matching JSON', async ({ page }) => {
  page.setDefaultTimeout(12_000);

  // Default condition is Score >= 70.  Supply a JSON that does NOT match.
  const testArea = page.locator('textarea[placeholder*="Score"]');
  await testArea.fill('{"Score": 30}');
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: /Run Test/i }).click();
  await page.waitForTimeout(500);

  await expect(page.locator('.badge.bg-danger')).toBeVisible();
  await expect(page.locator('.badge.bg-success')).toHaveCount(0);
});
