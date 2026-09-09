// QA Batch B — Documents, Formula, Offer, Email, Print
// Verifies: nav reachability, tabs visible, seeded data rows meet minimum count.
// Login pattern mirrors the main admission-workflow spec (mockFilePicker + openSampleFile + loginInstitute).
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

// Each test is independent (own page + setup) — no shared state, no serial cascade.
test.describe('Batch B — Documents / Formula / Offer / Email / Print', () => {

  /** Shared page setup: mock picker, open sample data, log in as institute admin. */
  async function setup(page) {
    await mockFilePicker(page);
    await page.goto('index.html');
    await openSampleFile(page);
    await loginInstitute(page);
    await expect(page.locator('main')).not.toBeEmpty();
  }

  // ── TC-1 / TC-2: Document Collection ────────────────────────────────────────

  test('TC-1: Documents nav group → Document Collection renders three tabs', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Documents', 'Document Collection');
    // Three tab buttons must be visible
    await expect(page.locator('button.nav-link', { hasText: 'Document Types' })).toBeVisible();
    await expect(page.locator('button.nav-link', { hasText: 'Submission Log' })).toBeVisible();
    await expect(page.locator('button.nav-link', { hasText: 'Candidate Completeness' })).toBeVisible();
  });

  test('TC-2: Document Types tab shows at least 3 seeded rows', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Documents', 'Document Collection');
    // Document Types tab should be active by default; find the table body rows
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count, `Expected >= 3 document type rows, got ${count}`).toBeGreaterThanOrEqual(3);
  });

  // ── TC-3 / TC-4: Formula Builder ────────────────────────────────────────────

  test('TC-3: Merit nav group → Formula Builder renders two-column layout', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Merit', 'Formula Builder');
    // Two-column layout: left card ("Score Inputs") and right card ("Preview & Results")
    await expect(page.locator('.card-header', { hasText: 'Score Inputs' })).toBeVisible();
    await expect(page.locator('.card-header', { hasText: 'Preview' })).toBeVisible();
  });

  test('TC-4: Formula Builder — available score inputs list is populated', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Merit', 'Formula Builder');
    // Score Inputs card body must contain the real score fields (see BUG-FORMULA-01 — these used
    // to be 7 fake fields with no connection to any real candidate data).
    const scoreInputsCard = page.locator('.card', { has: page.locator('.card-header', { hasText: 'Score Inputs' }) });
    await expect(scoreInputsCard.locator('.card-body')).toContainText('PI Score');
    await expect(scoreInputsCard.locator('.card-body')).toContainText('APV Score');
    await expect(scoreInputsCard.locator('.card-body')).toContainText('SLAT Score');
  });

  // ── TC-5 / TC-6: Offer Management ───────────────────────────────────────────

  test('TC-5: Merit nav group → Offer Management renders three tabs', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Merit', 'Offer Management');
    await expect(page.locator('button.nav-link', { hasText: 'Offer Templates' })).toBeVisible();
    await expect(page.locator('button.nav-link', { hasText: 'Generate Offers' })).toBeVisible();
    await expect(page.locator('button.nav-link', { hasText: 'Offer Status' })).toBeVisible();
  });

  test('TC-6: Offer Templates tab shows seeded templates', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Merit', 'Offer Management');
    // Offer Templates is the default tab — wait for table
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count, `Expected >= 1 offer template row, got ${count}`).toBeGreaterThanOrEqual(1);
    // Seed has 3 templates — assert the known MBA one is present
    await expect(page.locator('table tbody')).toContainText('MBA Offer Letter');
  });

  // ── TC-7 / TC-8: Email Templates ────────────────────────────────────────────

  test('TC-7: Settings nav group → Email Templates page loads', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Settings', 'Email Templates');
    // Page heading
    await expect(page.locator('h5', { hasText: 'Email Templates' })).toBeVisible();
  });

  test('TC-8: Email Templates table shows at least 3 seeded templates', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Settings', 'Email Templates');
    // Templates tab is default — table rows
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count, `Expected >= 3 email template rows, got ${count}`).toBeGreaterThanOrEqual(3);
  });

  // ── TC-9 / TC-10: Print Templates ────────────────────────────────────────────

  test('TC-9: Settings nav group → Print Templates page loads', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Settings', 'Print Templates');
    await expect(page.locator('h5', { hasText: 'Print Templates' })).toBeVisible();
  });

  test('TC-10: Print Templates tab shows at least 2 seeded templates', async ({ page }) => {
    await setup(page);
    await gotoNav(page, 'Settings', 'Print Templates');
    // Templates is the default tab; rendered via Mustache {{ #ptTemplates }} so rows are plain <tr>
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count, `Expected >= 2 print template rows, got ${count}`).toBeGreaterThanOrEqual(2);
  });
});
