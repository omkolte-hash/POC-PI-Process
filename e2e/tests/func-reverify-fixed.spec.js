// Corrected interaction tests for the 4 pages the stale tests failed on.
// These match the ACTUAL current DOM (no obsolete #ids; use labels/placeholders/text).
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

async function boot(page) {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  try { await openSampleFile(page); } catch {}
  await loginInstitute(page);
}

test('REOPEN: form opens, request submits and appears, approve works', async ({ page }) => {
  await boot(page);
  await gotoNav(page, 'Corrections', 'Reopen & Corrections');

  await page.locator('button:has-text("New Reopen Request")').click();
  await page.waitForTimeout(400);
  const cand = page.locator('input[placeholder*="candidate name"]');
  await expect(cand).toBeVisible(); // form actually opened

  const unique = 'E2E-Reopen-' + Date.now().toString().slice(-6);
  await cand.fill('Aarav Mehta');
  await page.locator('select:has(option[value="Score Capture"])').selectOption('Score Capture');
  await page.locator('textarea[placeholder*="reopened"]').fill(unique);
  await page.locator('button:has-text("Submit Request")').click();
  await page.waitForTimeout(500);
  await expect(page.locator('table', { hasText: unique })).toContainText(unique); // row appeared

  // Approve a pending row: row button (outline) opens the remark panel, then confirm (solid).
  await page.locator('tr:has-text("Pending") .btn-outline-success').first().click();
  await page.waitForTimeout(300);
  await page.locator('button.btn-success:has-text("Approve")').click();
  await page.waitForTimeout(500);
  await expect(page.locator('.badge.bg-success:has-text("Approved")').first()).toBeVisible();
});

test('OFFER: Generate changes status to a real Generated badge', async ({ page }) => {
  await boot(page);
  await gotoNav(page, 'Merit', 'Offer Management');
  await page.locator('button:has-text("Generate Offers")').click();
  await page.waitForTimeout(400);

  const genBefore = await page.locator('.badge:has-text("Generated")').count();
  const genBtn = page.locator('.btn-outline-success:has-text("Generate")').first();
  await expect(genBtn).toBeVisible();
  await genBtn.click();
  await page.waitForTimeout(500);
  // The escaped-HTML badge is fixed, so a NEW real Generated badge must appear.
  const genAfter = await page.locator('.badge:has-text("Generated")').count();
  expect(genAfter).toBe(genBefore + 1);
});

// BUG-OFFER-03: onRelease/onRevoke used to only mutate the offers[] status record, never the
// matching candidates[].offerStatus — so a revoked candidate's Generate-tab badge stayed stuck on
// "Generated" (canGenerate: offerStatus === 'None') forever, with no way to re-offer them.
test('OFFER: Revoke syncs candidate status and allows re-generate', async ({ page }) => {
  await boot(page);
  await gotoNav(page, 'Merit', 'Offer Management');

  await page.locator('button:has-text("Offer Status")').click();
  await page.waitForTimeout(400);
  const statusRow = page.locator('tr', { hasText: 'Aarav Mehta' });
  await expect(statusRow).toContainText('Generated');

  page.once('dialog', (d) => d.accept('Document discrepancy — testing re-offer'));
  await statusRow.locator('button:has-text("Revoke")').click();
  await page.waitForTimeout(400);
  await expect(statusRow).toContainText('Revoked');

  await page.locator('button:has-text("Generate Offers")').click();
  await page.waitForTimeout(400);
  const genRow = page.locator('tr', { hasText: 'Aarav Mehta' });
  await expect(genRow).toContainText('None');
  await expect(genRow.locator('button:has-text("Generate")')).toBeVisible();
});

test('EMAIL: new-template form opens and Save adds a row', async ({ page }) => {
  await boot(page);
  await gotoNav(page, 'Settings', 'Email Templates');

  const before = await page.locator('table tbody tr').count();
  await page.locator('button:has-text("New Template")').click();
  await page.waitForTimeout(400);
  const name = page.locator('input[placeholder*="Shortlist Notification"]');
  await expect(name).toBeVisible(); // form opened

  const unique = 'E2E-Email-' + Date.now().toString().slice(-6);
  await name.fill(unique);
  await page.locator('input[placeholder*="shortlisted for"]').fill('Subject ' + unique);
  await page.locator('button:has-text("Save Template")').click();
  await page.waitForTimeout(500);
  await expect(page.locator('table', { hasText: unique })).toContainText(unique);
  const after = await page.locator('table tbody tr').count();
  expect(after).toBeGreaterThan(before);
});

