# V2 roadmap

Ordered by what I would expect to matter most to sellers, to be re-ordered after talking to them.

1. **Sign-in and team sharing.** Company SSO, briefs stored server-side, share links that open in any browser without a fresh lookup. Enables per-user metrics.
2. **CRM write-back.** Replace the payload preview with a real Salesforce (or HubSpot) write to the Account and Opportunity: brief link, top signals, hypotheses, ROI assumptions. Idempotent on account id.
3. **Gong / call-notes loop.** After a call, mark which hypotheses were confirmed or rejected; feed that back into rule confidence.
4. **More sources.** Engineering blog post bodies, status-page incident history (frequency, components), job-ad stack lists, public post-mortems.
5. **Observability for the tool itself.** Structured logs per route, success-rate and latency dashboards, alert when a source starts failing (see [Runbook](RUNBOOK.md)).
6. **Rate limits and caching.** Per-user limits, 24-hour cache per domain so the same account is not re-read every time.
7. **Benchmarks owned by finance.** Downtime cost and engineer-rate defaults by segment, versioned, with a named owner.
8. **Slack entry point.** `/lens acme.com` posts the brief into the account channel.
9. **Evaluation set.** 50 hand-checked domains with expected signals, run on every deploy to catch regressions in extraction.
