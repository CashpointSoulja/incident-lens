# Viability memo: Incident Lens and the Product Engineer - GTM role

**To:** incident.io GTM leadership (concept memo)  **From:** Ayo Ahmed  **Status:** independent concept, not affiliated with incident.io

## The bet

incident.io sells to engineering organisations. The revenue team wins by showing a technical buyer, specifically, how incidents run in *their* stack. That preparation is real work, and today it lives in personal notes. A small internal tool can turn it into a sourced, shareable artefact. Owning that tool in production is the core of a Product Engineer - GTM role: build the software the revenue team runs on, and keep it trustworthy.

## Why it is viable

- **Desirable:** it serves jobs every seller has before a technical call ([JTBD](JTBD.md)). The open question is how much time it saves; that is measured in the pilot ([Rollout](ROLLOUT.md)), not assumed here.
- **Feasible:** it already runs in production at https://incident-lens-kappa.vercel.app/:
  - it reads public pages in under a second per lookup in tests ([Test results](TEST-RESULTS.md));
  - it needs no dependencies at runtime;
  - 28 automated tests pass.
- **Cheap to run:** no paid APIs, no generated text, no data vendor. Hosting is a single Vercel project, and the cost grows with lookups, which rate limiting and caching bound.
- **Safe to own:**
  - SSRF protection checks redirects and connections;
  - a fail-closed honesty check stops unsourced claims before they ship;
  - a kill switch needs no deploy of new code;
  - a runbook covers failure modes.

## Why build instead of buy

General sales-intelligence tools describe firmographics and intent. They do not know incident.io's product map, its integration list or its incident narrative. The value here is the mapping from public reliability evidence to incident.io capabilities. That mapping changes as the product ships, so it is best owned in-house, next to the team that uses it.

## What it would take

- Phase 0 hardening from the [Rollout](ROLLOUT.md): SSO, rate limiting, logging, CRM field mapping.
- A three-week pilot with a handful of sellers and an honest baseline.
- One owner. This is the work the Product Engineer - GTM role describes, and [First 30 days](FIRST-30-DAYS.md) sets out how it would be run.

## Risks to viability

- Sellers may not change their prep habit. The pilot measures this directly.
- Public pages may be too thin for some prospects. Preloaded examples and clear "not found" states cover this, and the [Roadmap](ROADMAP.md) adds more source types.
- The brand or a claim could be misread externally. Share mode, the non-affiliation notice and the [honesty model](HONESTY-MODEL.md) cover this; see [Risks](RISKS.md).

## What is not claimed

No customers, users, adoption, revenue impact or time saved are claimed. None of these have been measured.
