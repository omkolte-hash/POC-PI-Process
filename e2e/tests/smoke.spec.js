// Broad smoke coverage: for every role, log in and visit every reachable page, asserting each
// one renders (non-empty <main>) with no unexpected console/page errors. Doesn't verify that
// actions do the right thing — see admission-workflow.spec.js for a real functional journey.
import { test, expect } from '@playwright/test';
import {
  mockFilePicker, trackConsoleErrors, openSampleFile, skipFileGate,
  loginSuperAdmin, loginInstitute, loginPanelist, gotoNav,
} from './helpers.js';

test.describe('Role sidebar smoke tests', () => {
  test('super-admin: every sidebar page renders with no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockFilePicker(page);
    await page.goto('/index.html');
    await skipFileGate(page);
    await loginSuperAdmin(page);
    await expect(page.locator('main')).not.toBeEmpty();

    const groups = [
      { group: 'Institutes', links: ['All Institutes', 'Create Institute', 'Institute Users'] },
      { group: 'Platform', links: ['System Settings', 'Audit Logs'] },
    ];
    await page.locator('.apsSideLink', { hasText: 'Dashboard' }).click();
    await page.waitForTimeout(300);
    await expect.soft(page.locator('main')).not.toBeEmpty();

    for (const { group, links } of groups) {
      for (const link of links) {
        await gotoNav(page, group, link);
        await expect.soft(page.locator('main'), `${group} > ${link} should render`).not.toBeEmpty();
      }
    }

    expect(errors, `console/page errors seen:\n${errors.join('\n')}`).toEqual([]);
  });

  test('institute admin: every sidebar page renders with no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockFilePicker(page);
    await page.goto('/index.html');
    await openSampleFile(page);
    await loginInstitute(page);
    await expect(page.locator('main')).not.toBeEmpty();

    const groups = [
      { group: 'Programmes', links: ['Programmes', 'Academic Years', 'Assessment / PI Configuration', 'Assessment Parameter'] },
      { group: 'Candidates', links: ['Import Candidates', 'Candidates', 'Shortlisting', 'Approvals'] },
      { group: 'PI Management', links: ['Sessions', 'Groups', 'Candidate Allocation', 'Zoom Rooms', 'Panelists', 'Panelist Allocation', 'Barcode Labels'] },
      { group: 'Interview Day', links: ['PI Attendance', 'PI Scoring'] },
      { group: 'Verification', links: ['Category Verification'] },
      { group: 'Merit', links: ['Final Scores', 'Merit Processing', 'Merit Approval', 'Merit Releases', 'Waiting List', 'Provisional Letters'] },
      { group: 'Reports', links: ['Dashboard', 'Candidate Reports', 'Session Reports'] },
      { group: 'Approvals', links: ['Sent Mail', 'Pending Approvals'] },
    ];
    await page.locator('.apsSideLink', { hasText: 'Dashboard' }).click();
    await page.waitForTimeout(300);
    await expect.soft(page.locator('main')).not.toBeEmpty();

    for (const { group, links } of groups) {
      for (const link of links) {
        await gotoNav(page, group, link);
        await expect.soft(page.locator('main'), `${group} > ${link} should render`).not.toBeEmpty();
      }
    }

    expect(errors, `console/page errors seen:\n${errors.join('\n')}`).toEqual([]);
  });

  test('panelist: portal loads and a session can be joined/left with no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockFilePicker(page);
    await page.goto('/index.html');
    await openSampleFile(page);
    await loginPanelist(page);
    await expect(page.locator('body')).toContainText(/Panelist|Session|Group/i);

    const joinButton = page.locator('button:has-text("Join")').first();
    if (await joinButton.count()) {
      await joinButton.click();
      await page.waitForTimeout(500);
      const leaveButton = page.locator('button:has-text("Leave")').first();
      if (await leaveButton.count()) {
        await leaveButton.click();
        await page.waitForTimeout(300);
      }
    }

    expect(errors, `console/page errors seen:\n${errors.join('\n')}`).toEqual([]);
  });
});
