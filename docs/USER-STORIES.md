# User stories and acceptance criteria

Status shows what is in v1 today. "Test" points to automated coverage in `test/` or a documented run in [Test results](TEST-RESULTS.md).

## Lookup and evidence

**US1: Live lookup (AE, BDR).** As a seller, I want to enter a prospect's domain and get public evidence, so I can prepare without manual research.
- Given a valid public domain, when I submit, then I see the evidence screen. Measured at 1.5 s for incident.io in the production browser run.
- Given `localhost`, a private or reserved IP, a non-default port or a credential URL, when I submit, then I get a 422 with a clear message and no network request is made to that address.
- Given live lookup is switched off, when I submit, then I am told so and the preloaded examples remain usable.
- *Status:* shipped. *Test:* `hardening.test.js`, `live-research.test.js`, production curl table.

**US2: Sourced evidence (AE).** As an AE, I want every claim to show where it came from and when, so I can defend it on the call.
- Every card shows source host and path, page title, observed date and an Observed chip.
- Any quoted text appears word for word on the linked page.
- A page that only mentions a term produces "X is mentioned on this public page" and nothing stronger.
- *Status:* shipped. *Test:* `assertSourced()` tests, verbatim-quote test.

**US3: No wrong-company evidence (AE, CSM).** As a seller, I want evidence to come only from the prospect's own domain, so I never quote another company.
- Evidence URLs must match the domain exactly or be a true subdomain (`notacme.com` never counts for `acme.com`).
- A GitHub profile counts only when the company's own page links to it.
- *Status:* shipped. *Test:* attribution tests.

## Brief, scenario, ROI

**US4: Hypotheses, not facts (AE, BDR).** As a seller, I want inferences clearly separated from facts, so I ask instead of assert.
- Each hypothesis is marked Inferred, uses "might" or "could", cites at least one evidence ID, and has a confidence below 1.
- In share mode, hypotheses are rephrased as questions.
- *Status:* shipped. *Test:* hypothesis-labelling test.

**US5: Product map with reasons (AE, CSM).** As a seller, I want each recommended product or integration to state why it fits, so I can explain it.
- Each recommendation has a rule ID, a reason and the evidence it relies on, and links to incident.io's source page.
- *Status:* shipped.

**US6: Scenario walkthrough (AE).** As an AE, I want to step through an incident in the prospect's stack, so I can show the product instead of describing it.
- There are six steps in order: alert, routing, investigation, response, customer update, post-mortem.
- A step tied to observed signals is marked as such; other steps are labelled illustrative.
- *Status:* shipped.

**US7: Editable business case (AE, prospect).** As an AE, I want to change the assumptions with the prospect, so we agree on the number together.
- Seven inputs across three levers, with each formula shown next to its result.
- Editing any input updates every affected subtotal and the total immediately.
- "Reset to baseline" restores the starting values; the total is labelled illustrative.
- *Status:* shipped. *Test:* production browser run (25 incidents/month → $73,565/mo).

## Share and hand-off

**US8: Share link with exact numbers (AE, prospect).** As an AE, I want a link that reopens what I showed, so the prospect sees the same numbers.
- The link carries every ROI value; a live account also carries its domain.
- Opening it in a fresh browser shows the recovery form, then the same total.
- Malformed links fall back to the picker; values below their minimum are clamped.
- *Status:* shipped. *Test:* `share-link.test.js`, fresh-browser run.

**US9: Prospect-safe view (AE, marketing).** As an AE, I want internal notes removed automatically, so I can share without editing.
- Share mode hides internal sections, keeps sources and shows the non-affiliation notice.
- *Status:* shipped.

## Operations

**US10: Kill switch (RevOps owner).** As the tool's owner, I want to switch live lookup off without a code change, so I can respond to abuse or breakage.
- Setting `LIVE_RESEARCH_ENABLED` to `0`, `false` or `off` disables `/api/research`; any other value or unset leaves it on.
- *Status:* shipped. *Test:* `hardening.test.js`.

**US11: Auditable output (RevOps owner).** As RevOps, I want to know which rules produced a brief, so output can be audited and compared.
- Each brief version records the matcher version, ROI rules version and an immutable snapshot of its content and assumptions.
- The CRM-shaped payload includes versions and `Estimate_Is_Guaranteed__c: false`.
- *Status:* shipped (payload preview only; no CRM write).

**US12: CRM write-back (RevOps owner).** As RevOps, I want briefs written to the account record, so the team does not copy and paste.
- *Status:* not built. It is a v2 item in the [Roadmap](ROADMAP.md), behind SSO and field-mapping review.
