import { test, expect } from '@playwright/test';
import { mockFilePicker, trackConsoleErrors, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('workflow builder: navigation, palette, drag-drop, validate, clear', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(12_000);
  const errors = trackConsoleErrors(page);

  await mockFilePicker(page);
  await page.goto('index.html');
  await openSampleFile(page);
  await loginInstitute(page);

  await test.step('1 — navigate to Workflow Builder', async () => {
    await gotoNav(page, 'Workflow', 'Workflow Builder');
    // Title is in <header>, not <main>
    await expect(page.locator('header')).toContainText('Workflow Builder');
    // WorkflowBuilder._build() injects the palette+canvas — wait for the palette div
    await expect(page.locator('#wf-builder-root > div').first()).toBeVisible();
  });

  await test.step('2 — palette content: 3 section headers + spot-check items', async () => {
    const paletteEl = page.locator('#wf-builder-root > div').first();
    await expect(paletteEl).toContainText('Pipeline Nodes');
    await expect(paletteEl).toContainText('Decision Gates');
    await expect(paletteEl).toContainText('Action Nodes');
    await expect(paletteEl).toContainText('Import');
    await expect(paletteEl).toContainText('Approval');
    await expect(paletteEl).toContainText('Communication');
  });

  await test.step('3 — validate empty canvas: status bar shows required message', async () => {
    await page.locator('#wfb-validate').click();
    await expect(page.locator('#wf-builder-root')).toContainText('Add at least one component');
  });

  await test.step('4 — drop Import node onto canvas', async () => {
    const importItem = page.locator('[data-wf-type="import"]');
    const canvas = page.locator('#wf-builder-root > div').nth(1);
    await importItem.dragTo(canvas, { targetPosition: { x: 300, y: 200 } });
    await page.waitForTimeout(400);
    await expect(page.locator('#wf-builder-root .wf-port-out')).toBeVisible();
  });

  await test.step('5 — validate with one node: status bar shows valid', async () => {
    await page.locator('#wfb-validate').click();
    await expect(page.locator('#wf-builder-root')).toContainText('Workflow valid');
  });

  await test.step('6 — clear canvas: confirm dialog, verify no nodes remain', async () => {
    page.on('dialog', d => d.accept());
    await page.locator('#wfb-clear').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#wf-builder-root .wf-port-out')).toHaveCount(0);
  });

  expect(errors, `unexpected console/page errors: ${errors.join('\n')}`).toHaveLength(0);
});
