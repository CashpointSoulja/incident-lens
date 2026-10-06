# Test results

These are real runs on 6 October 2026. The numbers are copied from command output; none are estimates. Live-lookup counts change as the companies' public pages change.

## Automated tests (`npm test`, Node 22)

```
# tests 28
# pass 28
# fail 0
```

The tests cover redirect revalidation on every hop, non-default ports and credentials in redirects, a connect-time DNS refusal of loopback addresses, prose-only quoting, verbatim quote checks, the observed-card source requirement, hypothesis labelling and evidence links, HTML entity decoding, the default-on kill switch, and share-link round trips (exact ROI values, live domain, missing keys, clamping to minimums, malformed payloads).

## Production: https://incident-lens-kappa.vercel.app/

Checked with curl while logged out. No Vercel login wall.

| Request | HTTP |
| --- | --- |
| `GET /` | 200 (`x-frame-options: DENY`, `x-content-type-options: nosniff`) |
| `GET /data/fixtures.json` | 200 |
| `GET /app.js`, `/share-link.js`, `/brand/incidentio-wordmark.svg` | 200 |

The served `index.html` and `share-link.js` are byte-identical to `main`.

### Live lookups: `GET /api/research?domain=…`

| Domain | HTTP | Time | Routes checked / read | Evidence | Signals | Hypotheses | Scenario steps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| incident.io | 200 | 0.68 s | 9 / 5 | 10 | 7 | 3 | 6 |
| gitlab.com | 200 | 0.55 s | 9 / 6 | 7 | 4 | 3 | 6 |
| monzo.com | 200 | 0.51 s | 9 / 5 | 7 | 3 | 3 | 6 |
| stripe.com | 200 | 0.39 s | 9 / 5 | 5 | 1 | 1 | 6 |

In every response, all evidence has `kind: "observed"` and all hypotheses have `kind: "inferred"` and `status: "hypothesis"`.

Example evidence (incident.io):

```json
{
  "claim": "incident.io's public website was read successfully: “incident.io is a software reliability platform unifying on-call, agentic root cause analysis, incident response, and status pages – helping teams resolve issues faster.”",
  "url": "https://incident.io/",
  "kind": "observed"
}
```

Signals found: incident.io had Public status page, Azure, Datadog, PagerDuty, SRE / platform team, On-call practice and Incident response. gitlab.com had Public status page, Kubernetes, AWS and Google Cloud.

### Rejected inputs

| Input | HTTP | Body |
| --- | --- | --- |
| `localhost`, `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `192.168.1.1`, `[::1]`, `localhost:8080` | 422 | `{"error":"Enter a public company domain, such as acme.com."}` |
| `metadata.google.internal` | 422 | `{"error":"The company website could not be read. Try its root domain or use a preloaded prospect."}` |

## Browser end to end (production, headless Chromium)

These runs used a 390×844 viewport and a 1366×900 viewport.

- Lookup of `incident.io` reached the evidence screen in 1,512 ms (mobile run).
- Evidence → Build the reliability story → Brief → Scenario → ROI with 7 inputs.
- `incidentsPerMonth` was edited to 25, and the total read `$73,565/mo`, `$882,780 a year`.
- In share mode the total matched (`match true`). The share URL carried `roi=incidentsPerMonth:25;…&d=incident.io`.
- A fresh browser opened the share URL with no stored state. It showed the recovery form, then the same total (`match true`) with `incidentsPerMonth` still 25.
- All 4 preloaded example links rendered.
- Console and page errors: none (`errors []`).

## Visual checks

Rendered screenshots were checked at 1366 px desktop, 390 px and 360 px mobile. The header was adjusted so the wordmark, product name and AE/Share switch fit on one line at 390 px. At 360 px and below, the divider and subtitle are hidden. See `docs/media/`.
