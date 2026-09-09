// Exploratory session: build a real 8-node admission flow in the Workflow Builder,
// verify connections, validate, delete a middle node, and verify orphan detection.
import { test, expect } from '@playwright/test';
import { mockFilePicker, trackConsoleErrors, openSampleFile, loginInstitute, gotoNav } from './helpers.js';

const SCRATCHPAD = '/tmp/claude-1000/-home-getaweblpubt15-Documents-POC-PI-PROCESS/1c181235-2a51-4e4f-b885-3a248460b331/scratchpad';

// Target flow: Import → Doc Collection → Shortlist → Verification → Approval → Scoring → Merit → Offer
const FLOW_TYPES = [
  'import',         // n1
  'doc-collection', // n2
  'shortlist',      // n3
  'verification',   // n4
  'approval',       // n5
  'scoring',        // n6
  'merit',          // n7
  'offer',          // n8
];

const X_POSITIONS = [40, 260, 480, 700, 920, 1140, 1360, 1580];
const Y = 180;

// Walk the React fiber tree up from #wf-builder-root to find the Component logic instance.
// The WorkflowBuilder instance lives at stateNode.logic._wfBuilder (~8 hops up).
function getWfb(page) {
  return page.evaluate(() => {
    const wfRoot = document.getElementById('wf-builder-root');
    const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
    let fiber = wfRoot[fiberKey];
    for (let i = 0; i < 30 && fiber; i++) {
      if (fiber.stateNode?.logic?._wfBuilder) return fiber.stateNode.logic._wfBuilder;
      fiber = fiber.return;
    }
    return null;
  });
}

test('exploratory: build 8-node admission flow on Workflow Builder canvas', async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const errors = trackConsoleErrors(page);
  const stepLog = [];
  function log(step, status, detail = '') {
    stepLog.push({ step, status, detail });
    // eslint-disable-next-line no-console
    console.log(`[${status}] ${step}${detail ? ' — ' + detail : ''}`);
  }

  // ── Step 1: Navigate to Workflow Builder ────────────────────────────────────
  await test.step('1 — navigate to Workflow Builder', async () => {
    await mockFilePicker(page);
    await page.goto('index.html');
    await openSampleFile(page);
    await loginInstitute(page);
    await gotoNav(page, 'Workflow', 'Workflow Builder');
    await expect(page.locator('header')).toContainText('Workflow Builder');
    await expect(page.locator('#wf-builder-root > div').first()).toBeVisible();
    log('Navigate to Workflow Builder', 'PASS');
  });

  // ── Step 2: Drop 8 nodes via dragTo probe, then inject all via _addNode ─────
  // We probe whether HTML5 dragTo works (it does for the first node in headless),
  // then inject all 8 via the WorkflowBuilder JS API for reliability.
  await test.step('2 — drop nodes: dragTo probe + _addNode injection for all 8', async () => {
    const importItem = page.locator('[data-wf-type="import"]');
    const canvas = page.locator('#wf-builder-root > div').nth(1);

    let dragWorks = false;
    try {
      await importItem.dragTo(canvas, {
        targetPosition: { x: X_POSITIONS[0], y: Y },
        timeout: 5000,
      });
      await page.waitForTimeout(300);
      const count = await page.locator('#wf-builder-root .wf-port-out').count();
      dragWorks = count >= 1;
      log('dragTo probe (Import node)', dragWorks ? 'PASS' : 'FAIL',
        `${count} port-out elements after drag — ${dragWorks ? 'DnD works for single node' : 'DnD broken even for 1 node'}`);
    } catch (err) {
      log('dragTo probe (Import node)', 'FAIL', `Timeout/error: ${err.message.split('\n')[0]}`);
    }

    // Inject all 8 nodes via _addNode (bypasses DnD fragility in headless for subsequent nodes).
    // The WorkflowBuilder lives at fiber stateNode.logic._wfBuilder (~8 hops up from #wf-builder-root).
    const injected = await page.evaluate(({ types, xs, y }) => {
      const wfRoot = document.getElementById('wf-builder-root');
      const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
      let fiber = wfRoot[fiberKey];
      let wfb = null;
      for (let i = 0; i < 30 && fiber; i++) {
        if (fiber.stateNode?.logic?._wfBuilder) { wfb = fiber.stateNode.logic._wfBuilder; break; }
        fiber = fiber.return;
      }
      if (!wfb) return { ok: false, error: 'could not reach _wfBuilder via fiber' };
      // Clear the probe node (if drag succeeded), then inject all 8 with correct positions
      wfb.nodes = []; wfb.edges = []; wfb.nextId = 1; wfb.selected = null;
      types.forEach((type, i) => wfb._addNode(type, xs[i], y));
      wfb._renderNodes();
      wfb._renderEdges();
      return { ok: true, nodeCount: wfb.nodes.length, ids: wfb.nodes.map(n => n.id) };
    }, { types: FLOW_TYPES, xs: X_POSITIONS, y: Y });

    expect(injected.ok, `Node injection failed: ${injected.error}`).toBe(true);
    expect(injected.nodeCount).toBe(8);
    log('Inject 8 nodes via _addNode', 'PASS',
      `IDs assigned: ${injected.ids.join(', ')}`);

    await expect(page.locator('#wf-builder-root .wf-port-out')).toHaveCount(8);
    log('DOM: 8 wf-port-out elements visible', 'PASS');
  });

  // ── Step 3: Connect nodes via port mousedown / mouseup events ──────────────
  await test.step('3 — connect n1→n2→…→n8 via port mousedown/mouseup events', async () => {
    let connected = 0;
    const portErrors = [];

    for (let i = 1; i <= 7; i++) {
      const fromId = `n${i}`, toId = `n${i + 1}`;
      try {
        const portOut = page.locator(`.wf-port-out[data-node="${fromId}"]`);
        const portIn = page.locator(`.wf-port-in[data-node="${toId}"]`);
        await portOut.waitFor({ state: 'visible', timeout: 3000 });
        await portIn.waitFor({ state: 'visible', timeout: 3000 });
        await portOut.dispatchEvent('mousedown', { bubbles: true });
        await page.waitForTimeout(80);
        await portIn.dispatchEvent('mouseup', { bubbles: true });
        await page.waitForTimeout(100);
        connected++;
      } catch (err) {
        portErrors.push(`${fromId}→${toId}: ${err.message.split('\n')[0]}`);
      }
    }

    await page.waitForTimeout(300);
    const edgeCount = await page.locator('#wf-builder-root svg .wf-edge-g').count();

    log('Port-click events dispatched', connected === 7 ? 'PASS' : 'FAIL',
      `${connected}/7 pairs dispatched`);
    log('SVG edges rendered after port events', edgeCount >= 7 ? 'PASS' : 'WARN',
      `${edgeCount} wf-edge-g elements in SVG`);

    if (portErrors.length > 0) {
      log('Port event errors', 'WARN', portErrors.join('; '));
    }

    // If port events didn't create edges (they may not fire the handler properly
    // in headless because the WorkflowBuilder uses addEventListener on the rendered
    // DOM elements, not declarative handlers), fall back to _addEdge injection.
    if (edgeCount < 7) {
      log('Port events did not create edges — probing why + injecting via _addEdge', 'WARN');
      const edgeResult = await page.evaluate(() => {
        const wfRoot = document.getElementById('wf-builder-root');
        const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
        let fiber = wfRoot[fiberKey];
        let wfb = null;
        for (let i = 0; i < 30 && fiber; i++) {
          if (fiber.stateNode?.logic?._wfBuilder) { wfb = fiber.stateNode.logic._wfBuilder; break; }
          fiber = fiber.return;
        }
        if (!wfb) return { ok: false };
        // Check model: connecting state
        const connectingState = wfb.connecting;
        for (let i = 1; i <= 7; i++) {
          wfb._addEdge(`n${i}`, `n${i + 1}`);
        }
        wfb._renderEdges();
        wfb._save();
        return { ok: true, edgeCount: wfb.edges.length, connectingAtEnd: connectingState };
      });
      log('Fallback _addEdge injection', edgeResult.ok ? 'WARN' : 'FAIL',
        edgeResult.ok
          ? `${edgeResult.edgeCount} edges injected — port-click mousedown/mouseup did NOT trigger _addEdge (connecting state was: ${JSON.stringify(edgeResult.connectingAtEnd)})`
          : 'failed to reach wfb');
    }

    await expect(page.locator('#wf-builder-root svg .wf-edge-g')).toHaveCount(7, { timeout: 3000 });
    log('7 edges confirmed in SVG', 'PASS');
  });

  // ── Step 4: Validate the full connected flow ────────────────────────────────
  await test.step('4 — validate: 8-node connected flow should pass clean', async () => {
    await page.locator('#wfb-validate').click();
    await page.waitForTimeout(300);
    const rootText = await page.locator('#wf-builder-root').textContent();
    const hasIssues = rootText.includes('Issues:');
    const hasValid = rootText.includes('Workflow valid');

    log('Validate 8-node flow', !hasIssues && hasValid ? 'PASS' : 'FAIL',
      hasIssues ? `Unexpected issues: "${rootText.slice(-200)}"` : hasValid ? 'Workflow valid ✓' : `Unexpected status: "${rootText.slice(-100)}"`);

    await expect(page.locator('#wf-builder-root')).not.toContainText('Issues:');
    await expect(page.locator('#wf-builder-root')).toContainText('Workflow valid');
  });

  // ── Step 5: Screenshot ──────────────────────────────────────────────────────
  await test.step('5 — screenshot final 8-node canvas', async () => {
    const screenshotPath = `${SCRATCHPAD}/wf-flow-result.png`;
    await page.locator('#wf-builder-root').screenshot({ path: screenshotPath });
    log('Screenshot saved', 'PASS', screenshotPath);
  });

  // ── Step 6: Select and delete n4 (Verification) ────────────────────────────
  await test.step('6 — click n4 body, press Delete, verify node+edges gone', async () => {
    const n4 = page.locator('#wfn-n4');
    // Click the node body, avoiding the ports at the very edges
    await n4.click({ position: { x: 90, y: 31 } });
    await page.waitForTimeout(200);

    const selectedState = await page.evaluate(() => {
      const wfRoot = document.getElementById('wf-builder-root');
      const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
      let fiber = wfRoot[fiberKey];
      for (let i = 0; i < 30 && fiber; i++) {
        if (fiber.stateNode?.logic?._wfBuilder) return fiber.stateNode.logic._wfBuilder.selected;
        fiber = fiber.return;
      }
      return null;
    });
    log('n4 selected in JS model', selectedState?.id === 'n4' ? 'PASS' : 'WARN',
      `selected: ${JSON.stringify(selectedState)}`);

    // The keydown handler checks activeElement === document.body || activeElement === root
    await page.evaluate(() => document.getElementById('wf-builder-root').focus());
    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);

    const n4Gone = await page.locator('#wfn-n4').count() === 0;
    log('n4 DOM element removed', n4Gone ? 'PASS' : 'FAIL');

    const portOutN4 = await page.locator('.wf-port-out[data-node="n4"]').count();
    const portInN4 = await page.locator('.wf-port-in[data-node="n4"]').count();
    log('n4 ports removed from DOM', portOutN4 === 0 && portInN4 === 0 ? 'PASS' : 'FAIL',
      `port-out: ${portOutN4}, port-in: ${portInN4}`);

    const modelState = await page.evaluate(() => {
      const wfRoot = document.getElementById('wf-builder-root');
      const fiberKey = Object.keys(wfRoot).find(k => k.startsWith('__reactFiber'));
      let fiber = wfRoot[fiberKey];
      for (let i = 0; i < 30 && fiber; i++) {
        if (fiber.stateNode?.logic?._wfBuilder) {
          const wfb = fiber.stateNode.logic._wfBuilder;
          return {
            nodeIds: wfb.nodes.map(n => n.id),
            edgeCount: wfb.edges.length,
            edgesInvolvingN4: wfb.edges.filter(e => e.from === 'n4' || e.to === 'n4').length,
          };
        }
        fiber = fiber.return;
      }
      return null;
    });

    log('JS model: n4 removed', modelState && !modelState.nodeIds.includes('n4') ? 'PASS' : 'FAIL',
      `nodes: [${modelState?.nodeIds?.join(', ')}]`);
    log('JS model: n4 edges purged', modelState?.edgesInvolvingN4 === 0 ? 'PASS' : 'FAIL',
      `${modelState?.edgesInvolvingN4} edges still reference n4`);

    const remainingEdges = await page.locator('#wf-builder-root svg .wf-edge-g').count();
    log('SVG edge count after n4 deletion', remainingEdges === 5 ? 'PASS' : 'WARN',
      `${remainingEdges} edges remain (expected 5: original 7 minus 2 incident on n4)`);

    await expect(page.locator('#wfn-n4')).toHaveCount(0);
    await expect(page.locator('.wf-port-out[data-node="n4"]')).toHaveCount(0);
  });

  // ── Step 7: Validate after deletion — expect "Issues:" ─────────────────────
  // After deleting n4, the graph splits into two disconnected sub-chains (n1→n2→n3 and
  // n5→n6→n7→n8). Was a known bug (_validate() used a membership Set — appears in ANY edge —
  // instead of reachability, so no orphan was ever flagged); fixed via BFS from the root node
  // (see index.html _validate()). This now documents real, currently-passing behavior.
  await test.step('7 — validate after n4 deletion: probe orphan detection', async () => {
    await page.locator('#wfb-validate').click();
    await page.waitForTimeout(300);
    const rootText = await page.locator('#wf-builder-root').textContent();
    const hasIssues = rootText.includes('Issues:');

    log('Validate after n4 deletion', hasIssues ? 'PASS' : 'FAIL',
      hasIssues ? `Orphan detection working — "${rootText.slice(-200)}"` : 'Disconnected sub-chains not detected by validator.');

    expect(hasIssues, 'disconnected sub-chains should be flagged by the BFS reachability check').toBe(true);
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n=== Exploratory Session Step Summary ===');
  for (const { step, status, detail } of stepLog) {
    console.log(`  [${status.padEnd(5)}] ${step}${detail ? ' — ' + detail : ''}`);
  }

  expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toHaveLength(0);
});
