import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Settings';
const LINK = 'User Memberships';

// Roles are now real, ds-backed, institute-scoped records (see DEFAULT_INSTITUTE_ROLES in
// admission-engine.js) — every institute is seeded with 8 of them (Director/Registrar/Admission
// Officer/Coordinator/Panelist/Observer/Document Verification Team/SIU) the moment it's created, so
// the Role dropdown here always has options with no localStorage seeding needed.
test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
});

// Action 1: page loads with the 8 default roles available, no staff seeded yet (a fresh institute
// starts with an empty staff directory — the admin adds real people, same pattern as candidates).
test('page loads with role options populated and an empty/near-empty staff table', async ({ page }) => {
  await expect(page.locator('h4', { hasText: 'User Memberships' })).toBeVisible();
  await page.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(300);
  const roleOptions = page.locator('.card.elev-sm select').first().locator('option');
  const optionCount = await roleOptions.count();
  expect(optionCount, 'expected the placeholder + 8 default roles').toBeGreaterThanOrEqual(9);
  await expect(page.locator('.card.elev-sm')).toContainText('Director');
});

// Action 2: Add User form opens
test('Add User form opens on button click', async ({ page }) => {
  // Form must not exist before clicking
  await expect(page.locator('.card:has-text("Add User")')).not.toBeVisible();

  await page.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(300);

  const form = page.locator('.card').filter({ hasText: 'Add User' });
  await expect(form).toBeVisible({ timeout: 3000 });
  // Form should contain Name, Email, Role inputs
  await expect(form.locator('input[placeholder="Full name"]')).toBeVisible();
  await expect(form.locator('input[type="email"]')).toBeVisible();
  await expect(form.locator('select').first()).toBeVisible();
});

// Action 3: fill email + pick role + save -> new user row appears, with real login credentials
// issued immediately (see saveStaffMember) — the toast should name a Login ID/password pair.
test('fill name + email + role + save -> new row appears in table with issued credentials', async ({ page }) => {
  const unique = 'QA User ' + Date.now().toString().slice(-6);
  const uniqueEmail = `qa-${Date.now().toString().slice(-6)}@test.edu`;

  const before = await page.locator('table tbody tr').count();

  await page.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(300);

  const form = page.locator('.card').filter({ hasText: 'Add User' });

  // Fill name
  await form.locator('input[placeholder="Full name"]').fill(unique);
  await page.waitForTimeout(100);

  // Fill email
  await form.locator('input[type="email"]').fill(uniqueEmail);
  await page.waitForTimeout(100);

  // Pick first real role (index 1 skips the "-- Select Role --" placeholder)
  const roleSelect = form.locator('select').first();
  await roleSelect.selectOption({ index: 1 });
  await page.waitForTimeout(100);

  // Save
  await form.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(500);

  // Row with the unique name must be visible
  await expect(page.locator('td', { hasText: unique })).toBeVisible({ timeout: 3000 });

  // Row count must have grown
  const after = await page.locator('table tbody tr').count();
  expect(after).toBe(before + 1);

  // The toast confirms real login credentials were issued (not just a decorative record).
  await expect(page.locator('.toast-pop')).toContainText('Login:');
  // The row itself shows the issued login id (== the email) instead of "no login issued".
  const row = page.locator('tr', { hasText: unique });
  await expect(row).toContainText(uniqueEmail);
  await expect(row).not.toContainText('no login issued');
});
