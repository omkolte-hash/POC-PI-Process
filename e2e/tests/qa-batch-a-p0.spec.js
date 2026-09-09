import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

// TC1–TC5: P0 smoke tests for Roles & Permissions, Admission Cycles, Condition Builder.
// Shares the helpers/login already used by the main admission-workflow spec.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('index.html');
  await openSampleFile(page);
  await loginInstitute(page);
  await expect(page.locator('aside').first()).not.toBeEmpty();
});

test('TC1: Roles & Permissions page heading visible', async ({ page }) => {
  // Settings group → Roles & Permissions link
  await gotoNav(page, 'Settings', 'Roles & Permissions');
  await expect(page.locator('h4:has-text("Roles & Permissions"), h4:has-text("Roles &amp; Permissions")')).toBeVisible();
});

test('TC2: Roles table has at least 1 seeded row', async ({ page }) => {
  await gotoNav(page, 'Settings', 'Roles & Permissions');
  // Wait for the table to be populated — seeded data comes from the sample JSON fixture
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count, 'expected at least 1 seeded role row').toBeGreaterThanOrEqual(1);
});

test('TC3: Admission Cycles page loads', async ({ page }) => {
  await gotoNav(page, 'Settings', 'Admission Cycles');
  // The page heading is the canonical signal that we landed on the right view
  await expect(page.locator('h4:has-text("Admission Cycles")')).toBeVisible();
});

test('TC4: Condition Builder 3-panel layout visible', async ({ page }) => {
  await gotoNav(page, 'Tools', 'Condition Builder');

  // Left panel: "Available Fields" header text
  const leftPanel = page.locator('div', { hasText: 'Available Fields' }).first();
  await expect(leftPanel).toBeVisible();

  // Center panel: "Build Condition" heading
  const centerPanel = page.locator('div', { hasText: 'Build Condition' }).first();
  await expect(centerPanel).toBeVisible();

  // Right panel: "JsonLogic Preview" heading
  const rightPanel = page.locator('div', { hasText: 'JsonLogic Preview' }).first();
  await expect(rightPanel).toBeVisible();
});

test('TC5: Adding a condition updates JsonLogic preview', async ({ page }) => {
  await gotoNav(page, 'Tools', 'Condition Builder');

  // Capture the initial preview state (empty builder → "{}")
  const preview = page.locator('pre', { hasText: /^\{/ });
  await expect(preview).toBeVisible();
  const before = await preview.innerText();

  // Add a root condition via the "Add Condition" button in the center panel
  await page.locator('button:has-text("Add Condition")').first().click();
  await page.waitForTimeout(300);

  // The preview <pre> must now differ from the initial empty-object state
  const after = await preview.innerText();
  expect(after, 'JsonLogic preview did not update after adding a condition').not.toBe(before);
  expect(after.trim(), 'JsonLogic preview must not be empty after adding a condition').not.toBe('');
  // Must contain at least one key — a real JsonLogic object, not just "{}"
  expect(after, 'preview still shows empty object').not.toBe('{}');
});
