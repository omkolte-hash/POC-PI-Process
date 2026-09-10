// Institute Staff Roles & Page-Level Access Control (STORY-001-03/04, BUG-RBAC-01).
// Roles & Permissions / User Memberships used to be decorative localStorage CRUD with zero
// enforcement (auth.role only ever gated on 3 hardcoded values). These tests exercise the real
// thing: ds-backed roles that actually restrict which sidebar pages a logged-in staff member sees.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav, gotoPageDirect, fieldByLabel, createStaffMember, approveTwice } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_CSV = path.join(__dirname, 'fixtures', 'candidates.csv');

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockFilePicker(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  await openSampleFile(page);
});

test('Institute Admin sees all 8 default institute roles', async ({ page }) => {
  await loginInstitute(page);
  await gotoNav(page, 'Settings', 'Roles & Permissions');
  const table = page.locator('table');
  for (const name of ['Director', 'Registrar', 'Admission Officer', 'Coordinator', 'Panelist', 'Observer', 'Document Verification Team', 'SIU']) {
    await expect(table).toContainText(name);
  }
});

test('Staff member only sees their role\'s pages after login; Settings is never visible to them', async ({ page }) => {
  await loginInstitute(page);
  await gotoNav(page, 'Settings', 'User Memberships');

  const uniqueEmail = `qa-staff-${Date.now()}@test.edu`;
  await page.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(300);
  const form = page.locator('.card').filter({ hasText: 'Add User' });
  await form.locator('input[placeholder="Full name"]').fill('QA Doc Verifier');
  await form.locator('input[type="email"]').fill(uniqueEmail);
  await form.locator('select').first().selectOption({ label: 'Document Verification Team' });
  await form.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(500);

  // The toast reveals the real, immediately-usable login credentials just issued.
  const toastText = await page.locator('.toast-pop').innerText();
  const match = toastText.match(/Login:\s*(\S+)\s*\/\s*(\S+)/);
  expect(match, `expected issued-credentials toast, got: "${toastText}"`).not.toBeNull();
  const [, loginId, password] = match;
  expect(loginId.toLowerCase()).toBe(uniqueEmail.toLowerCase());

  await page.locator('button:has-text("Log Out")').click();
  await page.waitForTimeout(400);
  await loginInstitute(page, { email: loginId, password });

  // Document Verification Team's default pages are visible (nav groups collapse by default —
  // expand "Candidates" to see its link, same as gotoNav()).
  await page.locator('.apsSideGroup', { hasText: 'Candidates' }).click();
  await page.waitForTimeout(200);
  await expect(page.locator('.apsSideLink', { hasText: /^Candidates$/ })).toBeVisible();
  await expect(page.locator('.apsSideGroup', { hasText: 'Verification' })).toBeVisible();

  // ...but Settings (Roles & Permissions / User Memberships / Academic Years / etc.) is reserved
  // for the institute admin login and must not appear in the sidebar for any staff role, however
  // it's configured.
  await expect(page.locator('.apsSideGroup', { hasText: 'Settings' })).toHaveCount(0);
  await expect(page.locator('.apsSideLink', { hasText: 'Roles & Permissions' })).toHaveCount(0);
  await expect(page.locator('.apsSideLink', { hasText: 'User Memberships' })).toHaveCount(0);

  // Pages this role wasn't granted (e.g. Formula Builder, from the Merit group) are absent too —
  // proves this is real per-role filtering, not just Settings being special-cased.
  await expect(page.locator('.apsSideLink', { hasText: 'Formula Builder' })).toHaveCount(0);
});

// "Coordinator will mark student present, not the panelist" — the main-shell PI Attendance page
// used to be pure read-only for everyone. Coordinator (and Institute Admin) now get real
// Present/Absent buttons there; every other role that can see the page (Director, Registrar,
// Admission Officer, the staff-role Panelist) still sees it read-only.
// Candidates/Sessions are now scoped to Programme+Year+Admission Cycle, and old seeded MBA
// Programme data predates cycles (no cycleId), so it no longer shows up once a cycle is
// selected. Build a fresh programme with its own cycle, PI assessment, an imported candidate
// and a session/group with that candidate allocated — the minimum a Coordinator needs to see
// a Session/Group to join and a roster row to mark.
async function setupProgrammeWithAllocatedCandidate(page, programmeName) {
  await gotoNav(page, 'Programmes', 'Programmes');
  await page.locator('button:has-text("Create Programme")').click();
  await fieldByLabel(page, 'Programme Name').locator('textarea').fill(programmeName);
  await fieldByLabel(page, 'Description').locator('textarea').fill('QA RBAC test programme.');
  await page.locator('.dialog button:has-text("Save")').click();
  await expect(page.locator('table')).toContainText(programmeName);
  await page.locator('header select').nth(1).selectOption({ label: programmeName });
  await page.waitForTimeout(300);

  await gotoNav(page, 'Settings', 'Admission Cycles');
  await page.locator('button:has-text("Create Cycle")').click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="e.g. Round 1"]').fill('Round 1');
  await page.locator('button:has-text("Save")').click();
  await expect(page.locator('table')).toContainText('Round 1');

  await gotoNav(page, 'Settings', 'Assessment / PI Configuration');
  await fieldByLabel(page, 'Assessment Name').locator('input').fill('PI Round');
  await fieldByLabel(page, 'Assessment Short Name').locator('select').selectOption('PI');
  await fieldByLabel(page, 'Sequence No').locator('input').fill('1');
  await fieldByLabel(page, 'panelist(s) per panel').locator('select').selectOption('2');
  await fieldByLabel(page, 'Total Marks').locator('input').fill('40');
  await fieldByLabel(page, 'Score Entry Model')
    .locator('select')
    .selectOption({ label: 'Student wise display with Student wise score entry' });
  await fieldByLabel(page, 'Scaling').locator('label.radio:has-text("No")').click();
  await page.locator('button:has-text("Add")').click();
  await expect(page.locator('table')).toContainText('PI Round');

  // Import Candidates has no sidebar link (hidden from the mockup nav) but the page/engine are
  // still intact — reach it directly instead of clicking a nav item that no longer exists.
  await gotoPageDirect(page, 'import-candidates');
  await page.locator('button:has-text("New Import")').click();
  await page.waitForTimeout(400);
  await fieldByLabel(page, 'Dataset Name').locator('input').fill('Roster');
  await page.setInputFiles('input[type="file"]', CANDIDATES_CSV);
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Next: Inspect Schema")').click();
  await page.locator('button:has-text("Next: Field Mapping")').click();
  await page.locator('button:has-text("Auto-map from columns")').click();
  await fieldByLabel(page, 'Candidate ID Field').locator('select').selectOption('applicantId');
  await fieldByLabel(page, 'Category Field').locator('select').selectOption('category');
  await page.locator('button:has-text("Next: Filters")').click();
  await page.locator('button:has-text("Next: Preview")').click();
  await page.locator('button:has-text("Confirm & Commit")').click();
  await expect(page.locator('.toast-pop')).toContainText('new candidate');

  const director = await createStaffMember(page, 'QA RBAC Director ' + Date.now(), 'Director');
  const siu = await createStaffMember(page, 'QA RBAC SIU ' + Date.now(), 'SIU');

  // Candidate Allocation only lists candidates whose shortlist cleared both approval levels.
  await gotoNav(page, 'Candidates', 'Create Shortlist');
  await page.locator('label.radio:has-text("All Matching")').click();
  await page.locator('button:has-text("Preview Shortlist")').click();
  await page.locator('button:has-text("Confirm Shortlist")').click();
  await expect(page.locator('.toast-pop')).toBeVisible();
  await approveTwice(page, {
    returnToOrigin: async () => { await gotoNav(page, 'Candidates', 'Shortlist Approval'); },
    directorCreds: director, siuCreds: siu,
    reselectProgramme: async () => {
      await page.locator('header select').nth(1).selectOption({ label: programmeName });
      await page.waitForTimeout(300);
    },
  });

  await gotoNav(page, 'PI Management', 'Sessions');
  await fieldByLabel(page, 'Assessment').locator('select').selectOption({ index: 1 });
  await fieldByLabel(page, 'Session From').locator('input').click();
  const fromPopover = fieldByLabel(page, 'Session From').locator('.card.elev-lg');
  await expect(fromPopover).toBeVisible();
  await fromPopover.locator('button', { hasText: /^\d{1,2}$/ }).last().click();
  await fromPopover.locator('button', { hasText: '10:00' }).click();
  await fieldByLabel(page, 'Session To').locator('input').click();
  const toPopover = fieldByLabel(page, 'Session To').locator('.card.elev-lg');
  await expect(toPopover).toBeVisible();
  await toPopover.locator('button', { hasText: /^\d{1,2}$/ }).last().click();
  await toPopover.locator('button', { hasText: '13:00' }).click();
  await fieldByLabel(page, 'Reporting Time in Minutes').locator('input').fill('30');
  await fieldByLabel(page, 'No. of Groups').locator('input').fill('1');
  await fieldByLabel(page, 'Total Session Capacity').locator('input').fill('8');
  await page.locator('button:has-text("Submit")').click();
  await expect(page.locator('text=Name the Groups')).toBeVisible();
  await page.locator('label:has-text("Auto-generate group names") input[type="checkbox"]').check();
  await page.locator('table tbody tr').first().locator('input[type="number"]').fill('8');
  await page.locator('button:has-text("Save")').click();
  await expect(page.locator('text=Name the Groups')).toBeHidden();

  await gotoNav(page, 'PI Management', 'Candidate Allocation');
  await page.locator('tr', { hasText: 'E2E-OPEN-01' }).locator('input[type="checkbox"]').check();
  await fieldByLabel(page, 'Session').locator('select').selectOption({ index: 1 });
  await fieldByLabel(page, 'Group').locator('select').selectOption({ index: 1 });
  await page.locator('button', { hasText: /^Allocate Selected/ }).click();
  await expect(page.locator('.toast-pop')).toContainText('allocated');
}

async function addStaff(page, name, email, roleLabel) {
  await gotoNav(page, 'Settings', 'User Memberships');
  await page.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(300);
  const form = page.locator('.card').filter({ hasText: 'Add User' });
  await form.locator('input[placeholder="Full name"]').fill(name);
  await form.locator('input[type="email"]').fill(email);
  await form.locator('select').first().selectOption({ label: roleLabel });
  await form.locator('button:has-text("Add User")').click();
  await page.waitForTimeout(500);
  const toastText = await page.locator('.toast-pop').innerText();
  const match = toastText.match(/Login:\s*(\S+)\s*\/\s*(\S+)/);
  return match[2]; // password
}

test('Coordinator can mark PI attendance; the staff-role Panelist sees the same page read-only', async ({ page }) => {
  test.setTimeout(90_000);
  await loginInstitute(page);
  const programmeName = `QA-RBAC-${Date.now()}`;
  await setupProgrammeWithAllocatedCandidate(page, programmeName);
  const coordEmail = `qa-coord-${Date.now()}@test.edu`;
  const coordPassword = await addStaff(page, 'QA Coordinator', coordEmail, 'Coordinator');
  const panelistEmail = `qa-panelist-${Date.now()}@test.edu`;
  const panelistPassword = await addStaff(page, 'QA Staff Panelist', panelistEmail, 'Panelist');

  // Coordinator: same join-a-meeting flow as the Panelist Portal (pick session/group -> Join
  // Meeting -> split view), with real mark buttons in the roster list once joined.
  await page.locator('button:has-text("Log Out")').click();
  await page.waitForTimeout(400);
  await loginInstitute(page, { email: coordEmail, password: coordPassword });
  await page.locator('header select').nth(1).selectOption({ label: programmeName });
  await page.waitForTimeout(300);
  await gotoNav(page, 'Interview Day', 'PI Attendance');
  await expect(page.locator('text=Mark attendance here')).toBeVisible();
  await fieldByLabel(page, 'Session').locator('select').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await fieldByLabel(page, 'Group').locator('select').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Join Meeting")').click();
  await page.waitForTimeout(300);
  // No in-app video window anymore — top-right is a disabled "Join Meeting" button plus this
  // note when the group has no Zoom link yet (setupProgrammeWithAllocatedCandidate never sets one).
  await expect(page.locator('text=No Zoom link assigned to this group yet.')).toBeVisible();
  await expect(page.locator('table button:has-text("Present")').first()).toBeVisible();

  // Staff-role Panelist: identical Zoom-window layout, but read-only — no mark buttons.
  await page.locator('button:has-text("Log Out")').click();
  await page.waitForTimeout(400);
  await loginInstitute(page, { email: panelistEmail, password: panelistPassword });
  await page.locator('header select').nth(1).selectOption({ label: programmeName });
  await page.waitForTimeout(300);
  await gotoNav(page, 'Interview Day', 'PI Attendance');
  await expect(page.locator('text=Read-only')).toBeVisible();
  await fieldByLabel(page, 'Session').locator('select').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await fieldByLabel(page, 'Group').locator('select').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Join Meeting")').click();
  await page.waitForTimeout(300);
  // No in-app video window anymore — top-right is a disabled "Join Meeting" button plus this
  // note when the group has no Zoom link yet (setupProgrammeWithAllocatedCandidate never sets one).
  await expect(page.locator('text=No Zoom link assigned to this group yet.')).toBeVisible();
  await expect(page.locator('button:has-text("Present")')).toHaveCount(0);
});
