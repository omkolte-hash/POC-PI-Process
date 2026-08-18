// Shared setup/navigation helpers for the Admission Processing e2e suite.
// The app persists to disk only via the File System Access API (showOpenFilePicker /
// showSaveFilePicker), which has no headless/CI equivalent — mockFilePicker() replaces it
// with a fake handle backed by a static fixture, so "Open Existing Data File..." works the
// same way in a real browser and in CI, and every test run starts from the same pristine data.

export const SAMPLE_DATA_URL = 'sample-data/pi-merit-demo-100.json';

// Seeded institute from sample-data/pi-merit-demo-100.json — used only to get a valid,
// already-approved institute login. Its 100 pre-built MBA candidates are never touched by
// the e2e suite; every test creates its own programme so it always starts from a clean slate.
export const INSTITUTE_LOGIN = { email: 'admin@sim.edu.in', password: 'Ed379Ykk' };

// A known-good panelist login from the same fixture (already Director+Registrar approved).
export const PANELIST_LOGIN = { email: 'panelist1@sim.edu.in', password: 'EnUTPMth' };

export const SUPER_ADMIN_LOGIN = { email: 'superadmin@platform.io', password: 'Super@123' };

// Pre-existing, unrelated to app logic: candidate photo placeholders (`{{ pdImageDataUrl }}` /
// `{{ pfImageDataUrl }}`) render as literal <img src> before the templating engine hydrates
// them, 404ing 2-3 times per page load. Confirmed harmless earlier in this project's history.
// The browser's own console message never includes the failing URL (just "...404 (...)"), and
// different servers phrase the parenthesized part differently (Python's dev server says
// "File not found", GitHub Pages' leaves it empty) — so this matches on the resource-load
// 404 shape generically rather than a server-specific string.
const KNOWN_HARMLESS_ERROR_PATTERNS = [/pdImageDataUrl/, /pfImageDataUrl/, /Failed to load resource.*404/];

export function isKnownHarmless(message) {
  return KNOWN_HARMLESS_ERROR_PATTERNS.some((re) => re.test(message));
}

/** Replaces window.showOpenFilePicker with a fake handle reading the given fixture URL. */
export async function mockFilePicker(page, fixtureUrl = SAMPLE_DATA_URL) {
  await page.addInitScript((url) => {
    window.showOpenFilePicker = async () => {
      const res = await fetch(url);
      const text = await res.text();
      const handle = {
        name: url.split('/').pop(),
        kind: 'file',
        getFile: async () => new File([text], handle.name, { type: 'application/json' }),
        requestPermission: async () => 'granted',
        queryPermission: async () => 'granted',
        // No-op writer: the suite never asserts on saved-file content, only on live app state.
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      };
      return [handle];
    };
  }, fixtureUrl);
}

/** Collects console/page errors for the life of the page, filtering out known-harmless noise. */
export function trackConsoleErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isKnownHarmless(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** From the file-gate screen, loads the sample fixture via the mocked picker. */
export async function openSampleFile(page) {
  await page.locator('button:has-text("Open Existing Data File")').click();
  await page.waitForTimeout(600);
}

/** From the file-gate screen, starts a blank in-memory dataset (engine.generateDataset()). */
export async function skipFileGate(page) {
  await page.locator('button:has-text("Continue without saving")').click();
  await page.waitForTimeout(400);
}

async function login(page, roleLabel, email, password) {
  await page.locator('.seg-opt', { hasText: roleLabel }).click();
  await page.locator('.field:has-text("Email") input').fill(email);
  await page.locator('.field:has-text("Password") input').fill(password);
  await page.locator('button:has-text("Log In")').click();
  await page.waitForTimeout(600);
}

export async function loginInstitute(page, creds = INSTITUTE_LOGIN) {
  await login(page, 'Institute', creds.email, creds.password);
}

export async function loginSuperAdmin(page, creds = SUPER_ADMIN_LOGIN) {
  await login(page, 'Super Admin', creds.email, creds.password);
}

export async function loginPanelist(page, creds = PANELIST_LOGIN) {
  await login(page, 'Panelist', creds.email, creds.password);
}

/**
 * Clicks a sidebar link, expanding its group first if needed. Institute/super-admin sidebar
 * only — the Panelist Portal has its own, unrelated UI (no .apsSideLink/.apsSideGroup).
 */
export async function gotoNav(page, groupText, linkText) {
  // Exact match, not substring: several link labels are substrings of others in the same group
  // (e.g. "Candidates" is contained in "Import Candidates"), so a loose match can silently click
  // the wrong item.
  const exact = new RegExp(`^${linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const link = page.locator('.apsSideLink', { hasText: exact });
  if (!(await link.first().isVisible().catch(() => false))) {
    await page.locator('.apsSideGroup', { hasText: groupText }).click();
    await page.waitForTimeout(200);
  }
  await link.first().click();
  await page.waitForTimeout(500);
}

/**
 * Scopes to the .field wrapper whose <label> (not just any descendant text) matches labelText.
 * Plain `.field:has-text(...)` is too loose on pages with help/hint paragraphs that happen to
 * repeat another field's label in their own text (e.g. Sessions' "Reporting Time" hint mentions
 * "Session From"), which makes it match more than one field.
 */
export function fieldByLabel(page, labelText) {
  return page.locator('.field').filter({ has: page.locator('label', { hasText: labelText }) });
}
