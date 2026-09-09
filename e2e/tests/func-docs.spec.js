import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const GROUP = 'Documents';
const LINK  = 'Document Collection';

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
  await gotoNav(page, GROUP, LINK);
  // Clear doc-specific localStorage keys so every test starts from the seeded defaults.
  await page.evaluate(() => {
    ['geta_doc_active_tab', 'geta_doc_types', 'geta_doc_submissions', 'geta_doc_candidates']
      .forEach(k => localStorage.removeItem(k));
  });
  // Re-navigate to apply the cleared state.
  await gotoNav(page, GROUP, LINK);
});

// ── 1. Document Types tab renders seeded types ──────────────────────────────
test('Document Types tab renders seeded types', async ({ page }) => {
  // Default tab is "types". Seeded names from DEFAULT_TYPES.
  const table = page.locator('table');
  await expect(table).toBeVisible();
  await expect(page.locator('td', { hasText: '10th Certificate' }).first()).toBeVisible();
  await expect(page.locator('td', { hasText: '12th Certificate' }).first()).toBeVisible();
  await expect(page.locator('td', { hasText: 'Government ID Proof' }).first()).toBeVisible();
  await expect(page.locator('td', { hasText: 'Passport Photo' }).first()).toBeVisible();
  await expect(page.locator('td', { hasText: 'Recommendation Letter' }).first()).toBeVisible();
  // Confirm we see at least 5 data rows (one per seeded type).
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(5);
});

// ── 2a. Switch to Submission Log tab ───────────────────────────────────────
test('Submission Log tab shows submissions and hides Document Types content', async ({ page }) => {
  await page.locator('button', { hasText: 'Submission Log' }).click();
  await page.waitForTimeout(400);

  // Submission Log has a timestamp column and candidate names from DEFAULT_SUBS.
  await expect(page.locator('td', { hasText: 'Aarav Mehta' }).first()).toBeVisible();
  // The "Add Document Type" button (Document Types tab) must be gone.
  await expect(page.locator('button', { hasText: 'Add Document Type' })).not.toBeVisible();
  // Filter dropdowns are present on Submission Log only.
  await expect(page.locator('select').first()).toBeVisible();
});

// ── 2b. Switch to Candidate Completeness tab ───────────────────────────────
test('Candidate Completeness tab shows candidates and hides Submission Log content', async ({ page }) => {
  await page.locator('button', { hasText: 'Submission Log' }).click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'Candidate Completeness' }).click();
  await page.waitForTimeout(400);

  // Completeness tab header columns are unique to this tab.
  await expect(page.locator('th', { hasText: '10th Cert' }).first()).toBeVisible();
  await expect(page.locator('th', { hasText: 'Overall' }).first()).toBeVisible();
  // Candidate names from DEFAULT_CANDS.
  await expect(page.locator('td', { hasText: 'Aarav Mehta' }).first()).toBeVisible();
  // The "All Document Types" option text is exclusive to the Submission Log filter select —
  // the Completeness tab has no filter selects at all.
  await expect(page.locator('option', { hasText: 'All Document Types' })).not.toBeVisible();
});

// ── 3. Add Document Type -> new type row appears ───────────────────────────
test('Add Document Type creates a new row in the types table', async ({ page }) => {
  const UNIQUE = `QA-DocType-${Date.now()}`;

  const rowsBefore = await page.locator('tbody tr').count();

  await page.locator('button', { hasText: 'Add Document Type' }).click();
  await page.waitForTimeout(300);

  await page.locator('#doc-type-name').fill(UNIQUE);
  await page.locator('#fmt-pdf').check();
  await page.locator('#doc-type-required').check();
  // Leave max-size and status at defaults.

  await page.locator('button', { hasText: 'Save' }).click();
  await page.waitForTimeout(400);

  // Form should close (Save button gone).
  await expect(page.locator('button', { hasText: 'Save' })).not.toBeVisible();

  // New row must appear with the unique name.
  await expect(page.locator('td', { hasText: UNIQUE }).first()).toBeVisible();

  const rowsAfter = await page.locator('tbody tr').count();
  expect(rowsAfter).toBe(rowsBefore + 1);
});

// ── 4. Accept/Reject a Pending submission changes its status badge ─────────
test('Accept a Pending submission changes its badge to Accepted', async ({ page }) => {
  await page.locator('button', { hasText: 'Submission Log' }).click();
  await page.waitForTimeout(400);

  // Find a row whose status is "Pending" — s04 (Sneha Patel / Passport Photo) is Pending in DEFAULT_SUBS.
  // Use the Accept button within that row (canAct = Pending only).
  const acceptBtnsBefore = await page.locator('button', { hasText: 'Accept' }).count();
  expect(acceptBtnsBefore).toBeGreaterThan(0);

  await page.locator('button', { hasText: 'Accept' }).first().click();
  await page.waitForTimeout(400);

  // After accepting, an Accepted badge must exist in the table.
  await expect(page.locator('.badge.bg-success').first()).toBeVisible();

  // Accept button count must have dropped by exactly 1 (one Pending -> Accepted).
  const acceptBtnsAfter = await page.locator('button', { hasText: 'Accept' }).count();
  expect(acceptBtnsAfter).toBe(acceptBtnsBefore - 1);
});

test('Reject a Pending submission changes its badge to Rejected', async ({ page }) => {
  await page.locator('button', { hasText: 'Submission Log' }).click();
  await page.waitForTimeout(400);

  // Intercept window.prompt to return a reason automatically (avoid blocking).
  await page.evaluate(() => {
    window.prompt = () => 'QA-rejection-reason';
  });

  const rejectBtnsBefore = await page.locator('button', { hasText: 'Reject' }).count();
  expect(rejectBtnsBefore).toBeGreaterThan(0);

  await page.locator('button', { hasText: 'Reject' }).first().click();
  await page.waitForTimeout(400);

  // A Rejected badge (bg-danger) must now be visible.
  await expect(page.locator('.badge.bg-danger').first()).toBeVisible();

  // Reject button count must have dropped by exactly 1.
  const rejectBtnsAfter = await page.locator('button', { hasText: 'Reject' }).count();
  expect(rejectBtnsAfter).toBe(rejectBtnsBefore - 1);
});
