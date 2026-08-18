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

Requires Node 20+. `webServer` in `e2e/playwright.config.js` serves the *repo root* (where
`index.html` lives) with `python3 -m http.server` automatically — no separate server to start.
