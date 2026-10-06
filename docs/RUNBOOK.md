# Runbook: owning Incident Lens in production

## Architecture

- `server.js` - one Node HTTP handler. Serves `public/` and `data/` as static files and `GET /api/research?domain=` for live lookup. Runs on Vercel; every push to `main` deploys.
- `live-research.js` - the lookup pipeline. No dependencies beyond Node's standard library. Fetches up to nine public routes, extracts evidence, signals and hypotheses, and checks its own output with `assertSourced()`.
- `public/` - the single-page app. Briefs, feedback and the event trail live in the browser's `localStorage`. The server stores nothing.

## Switches

| Variable | Effect |
| --- | --- |
| `LIVE_RESEARCH_ENABLED=0` (or `false`, `off`) | Live lookup returns 422 "switched off" and the UI falls back to preloaded examples. Use this first in any live-lookup incident |
| unset / any other value | Live lookup on (default) |

## Health checks

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://incident-lens-kappa.vercel.app/                       # expect 200
curl -s "https://incident-lens-kappa.vercel.app/api/research?domain=incident.io" | head -c 300         # expect 200, "live":true
curl -s -w " %{http_code}\n" "https://incident-lens-kappa.vercel.app/api/research?domain=127.0.0.1"   # expect 422
```

## Failure modes and how to debug them

| Symptom | Likely cause | How to confirm | Fix |
| --- | --- | --- | --- |
| Every lookup says "website could not be read" | Outbound fetch failing (platform networking, DNS) or a bug in `guardedFetch` | Vercel function logs for the request; run `node -e` with `researchDomain('incident.io')` locally | Roll back the last deploy in Vercel; switch live off while investigating |
| One domain fails, others work | The site blocks automated reading, needs JavaScript, or redirects to a non-default port or a third-party host | `curl -sIL https://domain/` and compare the redirect chain with the guard rules | Expected behaviour; the UI explains it. Add a route fallback if many sellers need that domain |
| Lookup works but cards are thin | Markup changed; prose filter rejects the page | Run `proseBlocks()` on the saved HTML | Adjust extraction; add a regression fixture to `test/` |
| A card shows a wrong or odd quote | Extraction bug | `assertSourced()` should have blocked a non-verbatim quote, so this is a filter gap | Add the page as a test case, fix, redeploy |
| A share link shows different numbers | Encoding regression in `public/share-link.js` | `npm test` (share-link tests) | Fix and add the failing link as a test |
| Lookups slow | A route is timing out | Response time per domain; the per-page timeout is 6.5s | Lower timeouts or drop the slow route |
| Spike in lookups | Abuse or a script | Vercel analytics / logs | `LIVE_RESEARCH_ENABLED=0`, then add rate limiting |

## Deploy and rollback

1. `npm test` must pass locally.
2. Push to `main`; Vercel builds and promotes.
3. Run the three health checks above.
4. Rollback: promote the previous deployment in Vercel, or revert the commit and push.
