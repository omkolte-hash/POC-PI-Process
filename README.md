# POC-PI-Process

## End-to-end tests

Self-contained Playwright project in `e2e/` — everything test-related (config, fixtures,
specs, `node_modules`) lives there, separate from the app's own files at the repo root. A
broad smoke test (every sidebar page, all 3 roles) and a deep functional test that drives a
full admission cycle — programme creation through provisional letters — against a freshly
created programme each run, so it never touches the seeded demo data.

```
cd e2e
npm install
npx playwright install chromium   # first run only
npm run test:e2e
```

Requires Node 20+. Runs against the deployed site
(`https://omkolte-hash.github.io/POC-PI-Process/`, set as `baseURL` in
`e2e/playwright.config.js`) — no local server involved, so make sure GitHub Pages is serving
whatever commit you actually want to test before running the suite.
