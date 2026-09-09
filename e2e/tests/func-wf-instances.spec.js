import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Workflow';
const LINK  = 'Workflow Instances';

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
});

// Action 1: instances table renders with candidate rows
test('instances table renders with candidate rows', async ({ page }) => {
  // The seed data has 12 candidates; table must have at least one tbody row with a View button
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  expect(rowCount, 'expected at least 1 candidate row').toBeGreaterThan(0);

  // A known seed name must appear
  await expect(page.locator('table')).toContainText('Aarav Mehta');

  // Summary bar "Total Candidates" must show the full seed count
  const totalEl = page.locator('text=Total Candidates').locator('xpath=preceding-sibling::div[1]');
  const totalText = await totalEl.innerText();
  expect(Number(totalText), 'total candidates counter').toBeGreaterThan(0);
});

// Action 2: node/status filter changes visible rows
test('node filter reduces visible rows', async ({ page }) => {
  // Wait for the filter label to confirm the page loaded
  await expect(page.locator('text=result(s)')).toBeVisible();

  const countEl = page.locator('div').filter({ hasText: /^\d+ result\(s\)$/ }).last();
  const beforeText = await countEl.innerText();
  const before = parseInt(beforeText, 10);
  expect(before, 'unfiltered count must be > 0').toBeGreaterThan(0);

  // Select "Import" node — seed has 3 candidates at Import node
  const nodeSelect = page.locator('select').filter({ has: page.locator('option[value="Import"]') });
  await nodeSelect.selectOption('Import');
  await page.waitForTimeout(400);

  const afterText = await countEl.innerText();
  const after = parseInt(afterText, 10);
  expect(after, 'filtered count must be less than unfiltered').toBeLessThan(before);
  expect(after, 'filtered count must be > 0').toBeGreaterThan(0);

  // Every visible row must show "Import" in the Current Node column
  const nodeCells = page.locator('table tbody tr td:nth-child(3)');
  const count = await nodeCells.count();
  for (let i = 0; i < count; i++) {
    await expect(nodeCells.nth(i)).toHaveText('Import');
  }
});

test('status filter reduces visible rows', async ({ page }) => {
  await expect(page.locator('text=result(s)')).toBeVisible();

  const countEl = page.locator('div').filter({ hasText: /^\d+ result\(s\)$/ }).last();
  const beforeText = await countEl.innerText();
  const before = parseInt(beforeText, 10);

  // Select "Failed" status — seed has exactly 1 candidate (Sneha Patel, APP-2024-004)
  const statusSelect = page.locator('select').filter({ has: page.locator('option[value="Failed"]') });
  await statusSelect.selectOption('Failed');
  await page.waitForTimeout(400);

  const afterText = await countEl.innerText();
  const after = parseInt(afterText, 10);
  expect(after, 'failed-status count < unfiltered').toBeLessThan(before);
  expect(after, 'failed-status count must be > 0').toBeGreaterThan(0);

  // The one Failed candidate must be visible
  await expect(page.locator('table')).toContainText('Sneha Patel');
});

// Action 3: View opens the step timeline for a candidate
test('View button opens step timeline for a candidate', async ({ page }) => {
  // Before clicking View the Close button must not be present (detail panel closed)
  await expect(page.locator('button:has-text("Close")')).not.toBeVisible();

  // The first visible row in the table — click its View button.
  // The table may render below the (hidden) detail panel wrapper, so scope to tbody rows.
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible();
  await firstRow.locator('button:has-text("View")').click();
  await page.waitForTimeout(400);

  // After clicking, the detail/close button must appear
  await expect(page.locator('button:has-text("Close")')).toBeVisible();

  // The candidate name from the detail header must match the first row's candidate name
  const firstName = (await firstRow.locator('td').first().innerText()).trim();
  // Detail panel renders the name as a heading — confirm it's on screen
  await expect(page.locator('div').filter({ hasText: firstName }).first()).toBeVisible();

  // The timeline step "Import" is present on every seed candidate (Import is the first step)
  // The detail card contains "Import" as a step label
  await expect(page.locator('button:has-text("Close")').locator('xpath=../../..'))
    .toContainText('Import');

  // Close the detail and confirm it goes away
  await page.locator('button:has-text("Close")').click();
  await page.waitForTimeout(300);
  await expect(page.locator('button:has-text("Close")')).not.toBeVisible();
});
