// QA Batch A — Workflow & Corrections feature verification.
// Tests 8 discrete acceptance criteria independently; each is a separate test so failures are
// pinpointed without dragging down unrelated cases. Serial mode keeps session state (login, nav
// group open/closed) consistent across the run.
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

test.describe.configure({ mode: 'serial' });

// Login once, reuse across all tests in this file via shared page fixture.
test.beforeAll(async ({ browser }) => {
  // Nothing to do at the module level — each test gets the shared page below.
});

let sharedPage;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  sharedPage = await ctx.newPage();
  await mockFilePicker(sharedPage);
  await sharedPage.goto('index.html');
  await openSampleFile(sharedPage);
  await loginInstitute(sharedPage);
  await expect(sharedPage.locator('main')).not.toBeEmpty();
});

test.afterAll(async () => {
  await sharedPage?.close();
});

// ── TC-1: Workflow Instances page loads with a table ──────────────────────────
test('TC-1: Workflow Instances page loads with table', async () => {
  await gotoNav(sharedPage, 'Workflow', 'Workflow Instances');
  // Page title visible
  await expect(sharedPage.locator('h4, h5').filter({ hasText: 'Workflow Instances' })).toBeVisible();
  // Table present
  await expect(sharedPage.locator('table')).toBeVisible();
});

// ── TC-2: Workflow instances table has rows (seeded candidates) ───────────────
test('TC-2: Workflow instances table has at least one row', async () => {
  // Still on the same page from TC-1
  const rows = sharedPage.locator('table tbody tr');
  const count = await rows.count();
  expect(count, 'Expected at least one workflow instance row').toBeGreaterThan(0);
  // Confirm the row isn't the empty-state "No instances match" placeholder
  const firstCell = await rows.first().locator('td').first().innerText();
  expect(firstCell).not.toMatch(/no instances/i);
});

// ── TC-3: Reopen & Corrections page loads ────────────────────────────────────
test('TC-3: Reopen & Corrections page loads', async () => {
  await gotoNav(sharedPage, 'Corrections', 'Reopen & Corrections');
  await expect(sharedPage.locator('h5').filter({ hasText: 'Reopen Requests' })).toBeVisible();
});

// ── TC-4: "New Reopen Request" button reveals form ───────────────────────────
// Was a known bug (raw DOM style.display toggle got overwritten by the templating engine's
// re-render) — fixed by driving the form's visibility off real component state (rrShowForm via
// sc-if) instead. No test.fail() anymore; this is a real, currently-passing assertion.
test('TC-4: New Reopen Request button shows form', async () => {
  await sharedPage.locator('button', { hasText: 'New Reopen Request' }).click();
  await sharedPage.waitForTimeout(500);
  await expect(sharedPage.locator('button', { hasText: 'Submit Request' })).toBeVisible();
  await expect(sharedPage.locator('textarea[placeholder*="reopened"]')).toBeVisible();
});

// ── TC-5: Node Sample Tester page loads ──────────────────────────────────────
test('TC-5: Node Sample Tester page loads', async () => {
  await gotoNav(sharedPage, 'Workflow', 'Node Sample Tester');
  await expect(sharedPage.locator('h4').filter({ hasText: 'Node Sample Tester' })).toBeVisible();
});

// ── TC-6: Node type dropdown is functional ───────────────────────────────────
test('TC-6: Node type dropdown works', async () => {
  // The dropdown uses onChange="{{ onSampleNodeChange }}" — select any non-empty option.
  const dropdown = sharedPage.locator('select', { has: sharedPage.locator('option[value]') })
    .filter({ has: sharedPage.locator('option:has-text("Node Type"), option[value]') })
    .first();

  // Locate the Node Type select specifically (it's inside the left panel)
  const nodeSelect = sharedPage.locator('.form-select').first();
  const options = await nodeSelect.locator('option').allInnerTexts();
  // Must have more than zero options to be useful
  expect(options.length, 'Node type dropdown should have options').toBeGreaterThan(0);

  // Select the second option (first real entry, skip placeholder if any)
  const targetIndex = options.length > 1 ? 1 : 0;
  await nodeSelect.selectOption({ index: targetIndex });
  // Dropdown value should now reflect the selection (no error thrown)
  const selected = await nodeSelect.inputValue();
  expect(selected).toBeTruthy();
});

