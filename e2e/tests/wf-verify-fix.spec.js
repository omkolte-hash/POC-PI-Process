// Verifies the BFS reachability fix in WorkflowBuilder._validate():
// validator must detect disconnected sub-chains, not just edge membership.
import { test, expect } from '@playwright/test';
import { mockFilePicker, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

// Reaches the WorkflowBuilder instance via React fiber traversal, exposes as window._wfb,
// then injects 3 nodes and edges per the given pairs.
async function setupCanvas(page, edgePairs) {
  return page.evaluate((pairs) => {
    const wfRoot = document.getElementById('wf-builder-root');
    const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
    let fiber = wfRoot[fiberKey];
    let wfb = null;
    for (let i = 0; i < 30 && fiber; i++) {
      if (fiber.stateNode?.logic?._wfBuilder) { wfb = fiber.stateNode.logic._wfBuilder; break; }
      fiber = fiber.return;
    }
    if (!wfb) return { ok: false, error: 'could not reach _wfBuilder via fiber' };
    window._wfb = wfb;

    // Reset to clean slate
    wfb.nodes = []; wfb.edges = []; wfb.nextId = 1; wfb.selected = null;

    wfb._addNode('import',    40,  180); // n1
    wfb._addNode('shortlist', 260, 180); // n2
    wfb._addNode('merit',     480, 180); // n3

    pairs.forEach(([from, to]) => wfb._addEdge(from, to));
    wfb._renderNodes();
    wfb._renderEdges();

    return { ok: true, nodeCount: wfb.nodes.length, edgeCount: wfb.edges.length };
  }, edgePairs);
}

test('BFS validator fix — Case 1: connected chain passes', async ({ page }) => {
  page.setDefaultTimeout(15_000);

  await mockFilePicker(page);
  await page.goto('index.html');
  await openSampleFile(page);
  await loginInstitute(page);
  await gotoNav(page, 'Workflow', 'Workflow Builder');
  await expect(page.locator('#wf-builder-root > div').first()).toBeVisible();

  const setup = await setupCanvas(page, [['n1', 'n2'], ['n2', 'n3']]);
  expect(setup.ok, `Canvas setup failed: ${setup.error}`).toBe(true);
  expect(setup.nodeCount).toBe(3);
  expect(setup.edgeCount).toBe(2);

  await page.locator('#wfb-validate').click();
  await expect(page.locator('#wf-builder-root')).toContainText('Workflow valid');
  await expect(page.locator('#wf-builder-root')).not.toContainText('Issues:');
});

test('BFS validator fix — Case 2: split chain after mid-node deletion fails', async ({ page }) => {
  page.setDefaultTimeout(15_000);

  await mockFilePicker(page);
  await page.goto('index.html');
  await openSampleFile(page);
  await loginInstitute(page);
  await gotoNav(page, 'Workflow', 'Workflow Builder');
  await expect(page.locator('#wf-builder-root > div').first()).toBeVisible();

  const setup = await setupCanvas(page, [['n1', 'n2'], ['n2', 'n3']]);
  expect(setup.ok, `Canvas setup failed: ${setup.error}`).toBe(true);

  // Delete middle node — splits graph into Import-only and Merit-only sub-chains
  await page.evaluate(() => {
    window._wfb._deleteNode('n2');
    window._wfb._renderEdges();
    window._wfb._renderNodes();
  });

  await page.locator('#wfb-validate').click();
  await expect(page.locator('#wf-builder-root')).toContainText('Issues:');
  await expect(page.locator('#wf-builder-root')).not.toContainText('Workflow valid');
});
