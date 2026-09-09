import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Settings';
const LINK  = 'Print Templates';

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
});

// Action 1: Templates tab renders seeded print templates
test('Templates tab renders seeded print templates', async ({ page }) => {
  // page lands on Templates tab by default
  await expect(page.locator('button.nav-link', { hasText: 'Templates' })).toBeVisible();
  // seeded row: MBA Admit Card
  await expect(page.locator('td.fw-semibold', { hasText: 'MBA Admit Card' })).toBeVisible();
  // seeded row: CSE Offer Letter
  await expect(page.locator('td.fw-semibold', { hasText: 'CSE Offer Letter' })).toBeVisible();
  // seeded row: Score Summary Sheet
  await expect(page.locator('td.fw-semibold', { hasText: 'Score Summary Sheet' })).toBeVisible();
});

// Action 2: New Template -> appears in list
test('New Template appears in list after save', async ({ page }) => {
  const uniqueName = `QA-Tpl-${Date.now()}`;

  // open form
  await page.locator('button', { hasText: 'New Template' }).click();
  await page.waitForTimeout(300);

  // form should be visible
  await expect(page.locator('.card-header', { hasText: 'New Template' })).toBeVisible();

  // fill name
  await page.locator('input[placeholder="e.g. MBA Admit Card 2026"]').fill(uniqueName);

  // select Document Type (required)
  await page.locator('select').filter({ hasText: 'Select type' }).selectOption('Admit Card');

  // save
  await page.locator('button', { hasText: 'Save Template' }).click();
  await page.waitForTimeout(500);

  // form should be gone
  await expect(page.locator('.card-header', { hasText: 'New Template' })).not.toBeVisible();

  // unique name must appear in the table
  await expect(page.locator('td.fw-semibold', { hasText: uniqueName })).toBeVisible();
});

// Action 3: Generate Documents shows progress then completion
test('Generate Documents shows progress then completion', async ({ page }) => {
  // switch to Generate Documents tab
  await page.locator('button.nav-link', { hasText: 'Generate Documents' }).click();
  await page.waitForTimeout(400);

  // tab content visible
  await expect(page.locator('h6', { hasText: 'Generate Documents' })).toBeVisible();

  // select the first template option (seeded MBA Admit Card, id=1)
  const templateSelect = page.locator('select').filter({ hasText: 'Select a template' });
  await templateSelect.selectOption({ index: 1 });
  await page.waitForTimeout(300);

  // click the Generate Documents submit button (not the nav tab)
  await page.locator('.btn.btn-primary', { hasText: 'Generate Documents' }).click();

  // progress bar should appear
  await expect(page.locator('text=Generating documents')).toBeVisible({ timeout: 2000 });

  // wait for completion (progress runs ~10 steps * 200ms = ~2s)
  await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.alert-success')).toContainText('Generated');
  await expect(page.locator('.alert-success')).toContainText('documents successfully');
});

// BUG-PRINT-01: the Generate button had no in-flight guard — two quick clicks used to start two
// overlapping progress intervals, each writing its own duplicate row into Generation History.
test('Generate Documents ignores a second click while one run is already in flight', async ({ page }) => {
  await page.locator('button.nav-link', { hasText: 'Generate Documents' }).click();
  await page.waitForTimeout(400);

  const templateSelect = page.locator('select').filter({ hasText: 'Select a template' });
  await templateSelect.selectOption({ index: 1 });
  await page.waitForTimeout(300);

  const genBtn = page.locator('.btn.btn-primary', { hasText: 'Generate Documents' });
  await genBtn.click();
  await expect(page.locator('text=Generating documents')).toBeVisible({ timeout: 2000 });
  // The button must now be disabled — clicking it again must be a no-op.
  await expect(genBtn).toBeDisabled();
  await genBtn.click({ force: true });

  await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });

  await page.locator('button.nav-link', { hasText: 'Generation History' }).click();
  await page.waitForTimeout(400);
  const rows = await page.locator('tbody tr').count();
  expect(rows, 'exactly one new row should have been added, not two').toBe(4 + 1); // 4 seeded + 1 new
});

// Action 4: Generation History tab renders
test('Generation History tab renders', async ({ page }) => {
  // switch to Generation History tab
  await page.locator('button.nav-link', { hasText: 'Generation History' }).click();
  await page.waitForTimeout(400);

  // tab heading
  await expect(page.locator('h6', { hasText: 'Generation History' })).toBeVisible();

  // Templates tab content must be gone
  await expect(page.locator('button', { hasText: 'New Template' })).not.toBeVisible();

  // seeded history rows: table header "Generated By" column
  await expect(page.locator('th', { hasText: 'Generated By' })).toBeVisible();

  // at least one seeded history row with known template name
  await expect(page.locator('td', { hasText: 'MBA Admit Card' }).first()).toBeVisible();
});
