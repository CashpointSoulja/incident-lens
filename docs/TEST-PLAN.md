# Test plan

## Automated (run on every change: `npm test`)

| Area | What is tested | File |
| --- | --- | --- |
| Domain input | Normalisation of URLs, paths, `www.`; rejection of localhost, IPs, single labels, bad characters | `test/live-research.test.js` |
| SSRF guard | Private/reserved IPv4 and IPv6 ranges; redirect to a private host; public redirect chain; redirect loop capped at 5; every hop re-validated; non-default ports; credential URLs; connect-time DNS refusal of loopback | `test/live-research.test.js`, `test/hardening.test.js` |
| Attribution | Status-page matching; unrelated GitHub org dropped | `test/live-research.test.js` |
| Honesty | Prose extraction drops nav/header/footer; only prose sentences quoted; a mention without a quotable sentence is never stitched into a quote; every observed card cites a read page; quotes verbatim; hypotheses labelled and cite evidence; HTML entities decoded | `test/hardening.test.js` |
| Determinism | Same pages in, same bundle out | `test/live-research.test.js` |
| Share link | Exact ROI values round-trip; live link carries domain; missing keys fall back; negatives clamped; malformed links do not crash | `test/share-link.test.js` |
| Kill switch | Default on; `0`/`off` turn it off | `test/hardening.test.js` |

## Production checks (after each deploy)

1. `GET /` returns 200 without a login wall.
2. `GET /api/research` returns 200 with observed evidence for incident.io and two other real domains.
3. `localhost`, `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `192.168.1.1`, `[::1]`, `localhost:8080` return 422.
4. Preloaded example files load and a preloaded example opens.

## Browser end-to-end (Playwright, against production)

Live lookup of incident.io at 390px: evidence, brief, scenario, ROI edit, share mode. Assert the share total equals the ROI total, then open the share link in a fresh browser context, re-run the lookup and assert the same total and edited value.

## Visual

Screenshots at 1366px and 390px of picker, evidence, brief, scenario, ROI and share; header checked at 360px.
