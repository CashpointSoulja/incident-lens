# Live mode handoff

Additive v1 on top of fixture HEAD `043d2a9`.

## Changed
- `live-research.js` - dependency-free server-side public-page research pipeline with URL validation, DNS/private-address blocking, timeouts, HTML reduction, evidence/signal/hypothesis/scenario generation.
- `server.js` - adds `GET /api/research?domain=...`; fixture/static paths remain unchanged.
- `public/app.js` - makes live research the picker primary action, loads returned bundle into the existing Evidence -> Brief -> Scenario -> ROI -> Share flow. Preloaded fixtures remain as examples/fallback.
- `public/index.html`, `public/styles.css` - honest live-mode copy and responsive form styling.
- `test/live-research.test.js` - domain normalization and reject-path tests.

No secret or LLM key is needed. The v1 is deterministic and fails closed. It checks the company root, common status, engineering/blog, careers/jobs, and GitHub routes. Sites that block server fetches return a clear error rather than synthetic evidence.

## Verification run
- `node --check live-research.js server.js public/app.js`
- `npm test` (2/2 pass)
- local end-to-end lookup for `incident.io`: 10 dated evidence cards, 7 signals, 3 hypotheses, 6 scenario steps; result opened in the existing flow.
- invalid `localhost` lookup rejected.
- visual checks at 390px and 1280px. Screenshots are provided separately.

## Deploy
Vercel's existing Node handler should expose `/api/research` because the current deployment already uses `server.js`. After merge, redeploy and test one live domain on the production URL. If Vercel routes do not send `/api/research` to the handler, add an explicit rewrite to `vercel.json` rather than changing the app code.
