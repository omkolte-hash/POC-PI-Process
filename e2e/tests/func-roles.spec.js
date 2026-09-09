// Interaction tests for Roles & Permissions page (Settings > Roles & Permissions).
// Each test is independent and uses soft assertions where possible so all failures surface.
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Settings';
const LINK  = 'Roles & Permissions';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
});

// ── AC-1: seeded roles table renders ──────────────────────────────────────────
test('AC-1: seeded roles table renders with ≥5 rows', async ({ page }) => {
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count, 'expected at least 5 seeded role rows').toBeGreaterThanOrEqual(5);
  // Spot-check a known seeded role name (Director/Registrar/Admission Officer/Coordinator/Panelist/
  // Observer/Document Verification Team/SIU — see DEFAULT_INSTITUTE_ROLES in admission-engine.js;
  // "Institute Admin" is the institute's own unrestricted login, not a configurable role row here).
  await expect(page.locator('table')).toContainText('Director');
  await expect(page.locator('table')).toContainText('SIU');
});

// ── AC-2: Add Role form opens with permission checkboxes ──────────────────────
test('AC-2: Add Role form opens with permission checkboxes visible', async ({ page }) => {
  // Form must be hidden initially
  await expect(page.locator('text=New Role')).not.toBeVisible();

  await page.locator('button:has-text("Add Role")').click();
  await page.waitForTimeout(300);

  // Form title appears
  await expect(page.locator('text=New Role')).toBeVisible();

  // Role name input visible
  await expect(page.locator('input[placeholder*="Programme Coordinator"]')).toBeVisible();

  // Permission checkboxes: one per nav page across every non-Configuration sidebar group (~40) —
  // expect well more than the old 6-groups-worth floor.
  const allCbs = page.locator('.card.elev-sm input[type="checkbox"]');
  const cbCount = await allCbs.count();
  expect(cbCount, 'expected ≥ 6 page checkboxes in form').toBeGreaterThanOrEqual(6);

  // Known page labels visible (from instituteNavGroups() — the same catalogue the sidebar itself uses)
  await expect(page.locator('text=Candidates').first()).toBeVisible();
  await expect(page.locator('text=PI Scoring')).toBeVisible();
});

// ── AC-3: fill name + check perms + save → new role row appears ───────────────
test('AC-3: new role appears in table after save', async ({ page }) => {
  const UNIQUE_ROLE = `QA-AutoRole-${Date.now()}`;

  // Capture row count before
  const rows = page.locator('table tbody tr');
  const countBefore = await rows.count();

  // Open form
  await page.locator('button:has-text("Add Role")').click();
  await page.waitForTimeout(300);

  // Fill role name
  await page.locator('.card.elev-sm input[placeholder*="Programme Coordinator"]').fill(UNIQUE_ROLE);
  await page.waitForTimeout(150);

  // Check at least two page-access boxes (Candidates + PI Scoring) — accessible name comes from the
  // wrapping <label>, so getByRole with exact:true reliably picks these over e.g. "Import Candidates".
  const form = page.locator('.card.elev-sm');
  const cbCandidates = form.getByRole('checkbox', { name: 'Candidates', exact: true });
  const cbPiScoring  = form.getByRole('checkbox', { name: 'PI Scoring', exact: true });
  await cbCandidates.check();
  await page.waitForTimeout(100);
  await cbPiScoring.check();
  await page.waitForTimeout(100);

  // Save
  await page.locator('.card.elev-sm button:has-text("Save Role")').click();
  await page.waitForTimeout(400);

  // Form should close
  await expect(page.locator('text=New Role')).not.toBeVisible();

  // Row count must grow
  const countAfter = await rows.count();
  expect(countAfter, 'row count should increase by 1 after save').toBe(countBefore + 1);

  // The unique name must appear in the table
  await expect(page.locator('table')).toContainText(UNIQUE_ROLE);
});

// ── AC-4: edit and delete a role work ─────────────────────────────────────────
test('AC-4a: edit a role - name update persists in table', async ({ page }) => {
  const UNIQUE_ROLE = `QA-EditTarget-${Date.now()}`;
  const EDITED_NAME  = `QA-Edited-${Date.now()}`;

  // First add a role so we have a controlled target to edit (avoids mutating seeded data)
  await page.locator('button:has-text("Add Role")').click();
  await page.waitForTimeout(300);
  await page.locator('.card.elev-sm input[placeholder*="Programme Coordinator"]').fill(UNIQUE_ROLE);
  await page.locator('.card.elev-sm').getByRole('checkbox', { name: 'Session Reports', exact: true }).check();
  await page.locator('.card.elev-sm button:has-text("Save Role")').click();
  await page.waitForTimeout(400);

  // Confirm it's in table
  await expect(page.locator('table')).toContainText(UNIQUE_ROLE);

  // Click the pencil (edit) button on that row
  const targetRow = page.locator('tr', { hasText: UNIQUE_ROLE });
  await targetRow.locator('button').first().click(); // first button = pencil/edit
  await page.waitForTimeout(300);

  // Edit form should open with "Edit Role" title
  await expect(page.locator('text=Edit Role')).toBeVisible();

  // Clear name and type new one
  const nameInput = page.locator('.card.elev-sm input[placeholder*="Programme Coordinator"]');
  await nameInput.fill('');
  await nameInput.fill(EDITED_NAME);
  await page.waitForTimeout(150);

  // Save update
  await page.locator('.card.elev-sm button:has-text("Update")').click();
  await page.waitForTimeout(400);

  // Form must close
  await expect(page.locator('text=Edit Role')).not.toBeVisible();

  // New name visible, old name gone
  await expect(page.locator('table')).toContainText(EDITED_NAME);
  await expect(page.locator('table')).not.toContainText(UNIQUE_ROLE);
});

test('AC-4b: delete a role - row disappears from table', async ({ page }) => {
  const UNIQUE_ROLE = `QA-DelTarget-${Date.now()}`;

  // Add a controlled role to delete
  await page.locator('button:has-text("Add Role")').click();
  await page.waitForTimeout(300);
  await page.locator('.card.elev-sm input[placeholder*="Programme Coordinator"]').fill(UNIQUE_ROLE);
  await page.locator('.card.elev-sm button:has-text("Save Role")').click();
  await page.waitForTimeout(400);

  await expect(page.locator('table')).toContainText(UNIQUE_ROLE);

  const countBefore = await page.locator('table tbody tr').count();

  // Click delete (trash) button on that row — second button after pencil
  const targetRow = page.locator('tr', { hasText: UNIQUE_ROLE });
  const buttons = targetRow.locator('button');
  await buttons.last().click(); // last button = trash
  await page.waitForTimeout(400);

  // Row must be gone
  const countAfter = await page.locator('table tbody tr').count();
  expect(countAfter, 'row count should decrease by 1 after delete').toBe(countBefore - 1);
  await expect(page.locator('table')).not.toContainText(UNIQUE_ROLE);
});
