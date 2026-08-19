// Deep, functional end-to-end journey through the real admission lifecycle, as an institute
// admin: create a fresh Programme (so this test never touches/pollutes the seeded MBA data),
// configure PI scoring, import a fixed candidate roster, shortlist -> approve -> allocate ->
// attend -> score -> APV -> merit-process -> approve -> release -> provisional letters, plus a
// standalone Category Verification check. One continuous test, one step per phase, so a later
// failure still shows exactly how far the journey got.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mockFilePicker, trackConsoleErrors, openSampleFile, loginInstitute, loginPanelist, gotoNav, fieldByLabel,
} from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_CSV = path.join(__dirname, 'fixtures', 'candidates.csv');

const PROGRAMME = { name: 'E2E Test Programme', code: 'E2ETEST', description: 'Automated end-to-end test programme.' };

/** A fresh login resets the active programme to the institute's default — re-select ours. */
async function selectProgramme(page) {
  await page.locator('header select').nth(1).selectOption({ label: PROGRAMME.name });
  await page.waitForTimeout(300);
  await expect(page.locator('header')).toContainText(PROGRAMME.name);
}
const OPEN_IDS = ['E2E-OPEN-01', 'E2E-OPEN-02', 'E2E-OPEN-03', 'E2E-OPEN-04', 'E2E-OPEN-05', 'E2E-OPEN-06'];
const SC_IDS = ['E2E-SC-01', 'E2E-SC-02'];
const APV_SCORE = 8; // out of 10, same for every candidate — PI alone already separates them.

// A single per-field rubric score (out of 10, all 4 fields get the same value) per candidate,
// strictly decreasing so PI totals — and therefore Final = PI + APV — never tie. That makes the
// Merit Processing band (Merit/Waiting/Rejected) for each candidate a known, assertable fact
// rather than an artifact of stable-sort tie-breaking on identical scores.
const RUBRIC_SCORE_BY_ID = {
  'E2E-OPEN-01': 10, // PI 40, Final 48
  'E2E-OPEN-02': 9,  // PI 36, Final 44
  'E2E-OPEN-03': 8,  // PI 32, Final 40
  'E2E-OPEN-04': 7,  // PI 28, Final 36
  'E2E-OPEN-05': 6,  // PI 24, Final 32
  'E2E-OPEN-06': 5,  // PI 20, Final 28
};
const PI_TOTAL_BY_ID = Object.fromEntries(Object.entries(RUBRIC_SCORE_BY_ID).map(([id, s]) => [id, s * 4]));
// Merit Headcount 4 / Waiting 1 against the strictly-decreasing finals above: top 4 -> Merit,
// next 1 -> Waiting, the rest -> Rejected.
const EXPECTED_OUTCOME_BY_ID = {
  'E2E-OPEN-01': 'Merit', 'E2E-OPEN-02': 'Merit', 'E2E-OPEN-03': 'Merit', 'E2E-OPEN-04': 'Merit',
  'E2E-OPEN-05': 'Waiting',
  'E2E-OPEN-06': 'Rejected',
};

test.describe.configure({ mode: 'serial' });

test('full admission lifecycle: programme creation through provisional letters', async ({ page, context }) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000); // fail fast on a bad locator instead of eating the whole test budget
  const errors = trackConsoleErrors(page);

  await test.step('Log in as institute admin', async () => {
    await mockFilePicker(page);
    await page.goto('index.html');
    await openSampleFile(page);
    await loginInstitute(page);
    await expect(page.locator('main')).not.toBeEmpty();
  });

  await test.step('Create a fresh Programme and make it active', async () => {
    await gotoNav(page, 'Programmes', 'Programmes');
    await fieldByLabel(page, 'Programme Name').locator('input').fill(PROGRAMME.name);
    await fieldByLabel(page, 'Programme Code').locator('input').fill(PROGRAMME.code);
    await fieldByLabel(page, 'Description').locator('input').fill(PROGRAMME.description);
    await page.locator('button:has-text("Create Programme")').click();
    await expect(page.locator('table')).toContainText(PROGRAMME.name);

    // A programme only auto-activates if none was active yet; this institute already has MBA
    // active, so switch explicitly via the header's Programme selector.
    await selectProgramme(page);
  });

  await test.step('Configure a PI assessment (required before Sessions can be created)', async () => {
    await gotoNav(page, 'Programmes', 'Assessment / PI Configuration');
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
  });

  await test.step('Import the fixed candidate roster (6 OPEN + 2 SC)', async () => {
    await gotoNav(page, 'Candidates', 'Import Candidates');
    await page.setInputFiles('input[type="file"]', CANDIDATES_CSV);
    await expect(page.locator('button:has-text("Import 8 Candidate")')).toBeVisible();
    await page.locator('button:has-text("Import 8 Candidate")').click();
    await expect(page.locator('.toast-pop')).toContainText('8 new candidate');
  });

  await test.step('Verify SC candidates’ category documents (OPEN needs none)', async () => {
    await gotoNav(page, 'Verification', 'Category Verification');
    for (const id of SC_IDS) {
      const row = page.locator('tr', { hasText: id });
      await expect(row).toBeVisible();
      await row.locator('button:has-text("View")').first().click();
      const modal = page.locator('.dialog', { hasText: 'View Document' });
      await expect(modal).toBeVisible();
      await modal.locator('select').selectOption({ label: 'Valid' });
      await modal.locator('input[type="checkbox"]').check();
      await modal.locator('button:has-text("Submit")').click();
      await expect(modal).toBeHidden();
    }
    await expect(page.locator('tr', { hasText: SC_IDS[0] })).toContainText('Valid');
  });

  await test.step('Shortlist all 6 OPEN candidates', async () => {
    await gotoNav(page, 'Candidates', 'Shortlisting');
    await fieldByLabel(page, 'Reservation Category').locator('select').selectOption({ label: 'OPEN' });
    await page.locator('label.radio:has-text("No. of Candidates")').click();
    await fieldByLabel(page, 'Number of Candidates').locator('input').fill('6');
    await page.locator('button:has-text("Preview Shortlist")').click();
    await expect(page.locator('.card', { hasText: 'Candidates Selected' }).first()).toContainText('6');
    await page.locator('button:has-text("Confirm Shortlist")').click();
    await expect(page.locator('.toast-pop')).toBeVisible();
  });

  await test.step('Approve the shortlist (Director, then SIU)', async () => {
    await approveTwice(page, context, {
      returnToOrigin: () => gotoNav(page, 'Candidates', 'Approvals'),
      mailTo: 'director@e2e.test',
    });
    await gotoNav(page, 'Candidates', 'Approvals');
    await expect(page.locator('table')).toContainText('Approved');
  });

  const panelists = [];
  await test.step('Create two panelists and get them Director + Registrar approved', async () => {
    for (let i = 1; i <= 2; i++) {
      const name = `E2E Panelist ${i}`;
      await gotoNav(page, 'PI Management', 'Panelists');
      await fieldByLabel(page, 'Salutation').locator('select').selectOption('Dr.');
      await fieldByLabel(page, 'Name').locator('input').fill(name);
      await fieldByLabel(page, 'Email ID').locator('input').fill(`e2e.panelist${i}@test.local`);
      await page.locator('label.radio:has-text("Internal")').click();
      await fieldByLabel(page, 'Mobile Number').locator('input').fill(`98000000${10 + i}`);
      await fieldByLabel(page, 'LinkedIn').locator('input').fill(`https://linkedin.com/in/e2e-panelist-${i}`);
      await fieldByLabel(page, 'Qualifications').locator('input').fill('MBA, PhD');
      await fieldByLabel(page, 'Organization').locator('input').fill('Test Org');
      await fieldByLabel(page, 'Designation').locator('input').fill('Professor');
      await fieldByLabel(page, 'Industry').locator('input').fill('3');
      await fieldByLabel(page, 'Academic').locator('input').fill('3');
      await page.locator(`label:has-text("${PROGRAMME.name}") input[type="checkbox"]`).check();
      await page.locator('button:has-text("Add")').click();
      await expect(page.locator('.toast-pop')).toContainText('Panelist registered');

      const row = page.locator('tr', { hasText: name });
      await row.locator('button:has-text("Approve")').first().click();
      await expect(row.locator('button:has-text("Approve")').first()).toBeVisible();
      await row.locator('button:has-text("Approve")').first().click();
      await expect(row).toContainText('Approved');

      await row.locator('a', { hasText: name }).click();
      const credsLine = page.locator('div:has-text("Login ID:")').last();
      const codes = await credsLine.locator('code').allInnerTexts();
      panelists.push({ name, email: `e2e.panelist${i}@test.local`, loginId: codes[0], password: codes[1] });
      await page.locator('button:has-text("Back to Panelists")').click();
    }
    expect(panelists).toHaveLength(2);
    expect(panelists[0].password).toBeTruthy();
    expect(panelists[1].password).toBeTruthy();
  });

  await test.step('Create a PI Session with one group holding all 6 candidates', async () => {
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
    await fieldByLabel(page, 'Session Capacity').locator('input').fill('6');
    await page.locator('button:has-text("Submit")').click();

    await expect(page.locator('text=Name the Groups')).toBeVisible();
    await page.locator('label:has-text("Auto-generate group names") input[type="checkbox"]').check();
    await page.locator('table tbody tr').first().locator('input[type="number"]').fill('6');
    await page.locator('button:has-text("Save")').click();
    await expect(page.locator('text=Name the Groups')).toBeHidden();
  });

  await test.step('Assign both panelists to the group', async () => {
    await gotoNav(page, 'PI Management', 'Panelist Allocation');
    await fieldByLabel(page, 'Session').locator('select').selectOption({ index: 0 });
    for (const p of panelists) {
      const picker = page.locator('select').filter({ has: page.locator(`option:has-text("${p.name}")`) }).first();
      const optionText = (await picker.locator('option', { hasText: p.name }).innerText()).trim();
      await picker.selectOption({ label: optionText });
      await page.locator('button:has-text("Assign")').first().click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('.tag-outline').filter({ hasText: panelists[0].name })).toBeVisible();
    await expect(page.locator('.tag-outline').filter({ hasText: panelists[1].name })).toBeVisible();
  });

  await test.step('Assign a Zoom Room to the group', async () => {
    await gotoNav(page, 'PI Management', 'Zoom Rooms');
    await page.locator('button:has-text("Assign Zoom Room")').first().click();
    await expect(page.locator('body')).toContainText('zoom.us');
  });

  await test.step('Allocate all 6 OPEN candidates to the session/group', async () => {
    await gotoNav(page, 'PI Management', 'Candidate Allocation');
    for (const id of OPEN_IDS) {
      await page.locator('tr', { hasText: id }).locator('input[type="checkbox"]').check();
    }
    await fieldByLabel(page, 'Session').locator('select').selectOption({ index: 1 });
    await fieldByLabel(page, 'Group').locator('select').selectOption({ index: 1 });
    await page.locator('button', { hasText: /^Allocate Selected/ }).click();
    await expect(page.locator('.toast-pop')).toContainText('allocated');
  });

  for (let i = 0; i < 2; i++) {
    await test.step(`Panelist ${i + 1}: mark attendance (first panelist only) and submit PI scores`, async () => {
      await page.locator('button:has-text("Log Out")').click();
      await page.waitForTimeout(400);
      await loginPanelist(page, { email: panelists[i].email, password: panelists[i].password });
      await expect(page.locator('body')).toContainText(panelists[i].name);

      await page.locator('button:has-text("Join")').first().click();
      await page.waitForTimeout(400);

      for (let c = 0; c < OPEN_IDS.length; c++) {
        const isDone = await page.locator('text=All candidates completed').isVisible().catch(() => false);
        if (isDone) break;
        if (i === 0) {
          await page.locator('button:has-text("Present")').click();
        }
        // Read the candidate's own Applicant ID off the page rather than assuming queue order
        // matches OPEN_IDS — the score entered must match the candidate actually on screen.
        const candidateId = (await page.locator('.card strong').first().innerText()).trim();
        const score = RUBRIC_SCORE_BY_ID[candidateId];
        expect(score, `no expected rubric score for candidate "${candidateId}"`).toBeTruthy();
        const fields = page.locator('.field input[type="number"]');
        const count = await fields.count();
        for (let f = 0; f < count; f++) {
          await fields.nth(f).fill(String(score));
        }
        await page.locator('button:has-text("Next Candidate")').click();
        await page.waitForTimeout(250);
      }
      await expect(page.locator('text=All candidates completed')).toBeVisible();
    });
  }

  await test.step('Log back in as institute admin, enter APV scores for all 6 candidates', async () => {
    await page.locator('button:has-text("Log Out")').click();
    await page.waitForTimeout(400);
    await loginInstitute(page);
    await selectProgramme(page);
    for (const id of OPEN_IDS) {
      await gotoNav(page, 'Candidates', 'Candidates');
      await page.locator('input[placeholder*="Applicant"]').first().fill(id);
      await page.waitForTimeout(300);
      const row = page.locator('tr', { hasText: id });
      await row.locator('button:has-text("View")').click();
      await page.waitForTimeout(300);
      await expect(page.locator('body')).toContainText(`${PI_TOTAL_BY_ID[id]} / 40`); // PI score, as entered
      const apvField = fieldByLabel(page, 'APV Score').locator('input');
      if (await apvField.count()) {
        await apvField.fill(String(APV_SCORE));
        await page.locator('button:has-text("Save")').click();
        await page.waitForTimeout(300);
      }
    }
  });

  await test.step('Run Merit Processing for OPEN (4 merit, 1 waiting, 1 rejected)', async () => {
    await gotoNav(page, 'Merit', 'Merit Processing');
    await fieldByLabel(page, 'Reservation Category').locator('select').selectOption({ label: 'OPEN' });
    await page.locator('label.radio:has-text("No. of Candidates")').click();
    await fieldByLabel(page, 'Merit Headcount').locator('input').fill('4');
    await fieldByLabel(page, 'Waiting List Size').locator('input').fill('1');
    await page.locator('button:has-text("Run Merit Processing")').click();
    // Exact split, not just "it ran": 6 strictly-decreasing finals, headcount 4 + waiting 1.
    await expect(page.locator('.toast-pop')).toContainText('4 Merit, 1 Waiting, 1 Rejected');
  });

  await test.step('Approve the merit batch (Director, then SIU)', async () => {
    await approveTwice(page, context, {
      returnToOrigin: () => gotoNav(page, 'Merit', 'Merit Approval'),
      mailTo: 'director@e2e.test',
    });
    await gotoNav(page, 'Merit', 'Merit Approval');
    await expect(page.locator('table')).toContainText('Approved');
  });

  await test.step('Release the approved merit batch', async () => {
    await gotoNav(page, 'Merit', 'Merit Releases');
    const row = page.locator('table').first().locator('tbody tr').first();
    await expect(row).toBeVisible();
    const dateInputs = row.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2026-09-05');
    await dateInputs.nth(1).fill('2026-09-15');
    await row.locator('button:has-text("Release")').click();
    await expect(page.locator('.toast-pop')).toBeVisible();
  });

  await test.step('Set up a Fee Structure (required before provisional letters can print)', async () => {
    await gotoNav(page, 'Merit', 'Provisional Letters');
    const setupButton = page.locator('button:has-text("Set Up Fee Structure")');
    if (await setupButton.count()) {
      await setupButton.click();
      await fieldByLabel(page, 'Batch').locator('input').fill('2026-2030');
      await fieldByLabel(page, 'Programme Commencement Date').locator('input').fill('2026-09-20');
      await fieldByLabel(page, '2nd Installment Due Date').locator('input').fill('2027-01-15');
      await page.locator('button:has-text("Save Fee Structure")').click();
      await expect(page.locator('.toast-pop')).toBeVisible();
    }
  });

  await test.step('Print provisional letters for the released candidates', async () => {
    await gotoNav(page, 'Merit', 'Provisional Letters');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('button:has-text("Print All")').click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup.locator('button#printBtn')).toBeVisible();
    await popup.close();
  });

  await test.step('Reports reflect the actual scores and outcomes entered earlier', async () => {
    await gotoNav(page, 'Reports', 'Candidate Reports');
    for (const id of OPEN_IDS) {
      const row = page.locator('tr', { hasText: id });
      await expect(row, `${id} row`).toContainText(String(PI_TOTAL_BY_ID[id]));
      await expect(row, `${id} outcome`).toContainText(EXPECTED_OUTCOME_BY_ID[id]);
    }

    await gotoNav(page, 'Reports', 'Session Reports');
    const sessionRow = page.locator('table tbody tr').first();
    await expect(sessionRow).toBeVisible();
    const cells = await sessionRow.locator('td').allInnerTexts();
    // Session label, Date, Allocated, Present, Absent, Not Marked — all 6 allocated, all marked present.
    expect(cells[2], 'Allocated').toBe('6');
    expect(cells[3], 'Present').toBe('6');
    expect(cells[4], 'Absent').toBe('0');
    expect(cells[5], 'Not Marked').toBe('0');
  });

  expect(errors, `console/page errors seen during the full journey:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * Drives the universal Director -> SIU approval flow twice (once per level) from whatever page
 * currently shows a "Send for Approval" button. Handles the real popup tab + in-page OTP.
 */
async function approveTwice(page, context, { returnToOrigin, mailTo }) {
  for (let level = 0; level < 2; level++) {
    await returnToOrigin();
    await page.locator('button:has-text("Send for Approval")').first().click();
    await expect(fieldByLabel(page, 'To').locator('input')).toBeVisible();
    await fieldByLabel(page, 'To').locator('input').fill(mailTo);
    await page.locator('button:has-text("Send")').click();
    await expect(page.locator('button:has-text("Open Approval Link")').first()).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('button:has-text("Open Approval Link")').first().click(),
    ]);
    await popup.waitForLoadState();
    await popup.locator('button:has-text("Approve")').click();

    const otpLocator = popup.locator('strong[style*="monospace"]');
    await expect(otpLocator).toBeVisible();
    const otp = (await otpLocator.innerText()).trim();
    await popup.locator('input[placeholder="6-digit code"]').fill(otp);
    await popup.locator('button:has-text("Confirm Approval")').click();
    await expect(popup.locator('text=You can close this tab now.')).toBeVisible();
    await popup.close();
    await page.waitForTimeout(400);
  }
}
