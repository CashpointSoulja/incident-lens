# Risks and mitigations

| Risk | Impact | Likelihood | Mitigation in v1 | Next step |
| --- | --- | --- | --- | --- |
| Server-side request forgery: a domain or redirect points the server at an internal address | High | Medium | Domain validation; DNS checked before fetch and again at socket connect (rebinding defence); private, loopback, link-local, CGNAT, multicast and reserved IPv4/IPv6 ranges refused; redirects followed manually and re-validated on every hop, max 5; default ports only; credential URLs refused; 6.5s timeout and 700 KB cap per page | Outbound egress allow-list at the platform level; alerting on blocked-request spikes |
| A quote or claim that the page does not say | High | Low | Prose-only extraction, verbatim quote check and `assertSourced()` fail-closed invariant | Sample review of 20 live briefs a week |
| Wrong company attribution (e.g. a GitHub org with the same name) | Medium | Medium | Off-domain pages (e.g. a guessed GitHub org) used only if they name the domain | Same check for status pages hosted on third-party domains |
| Sites block automated reading or change markup | Medium | High | Lookup fails with a clear message; preloaded examples remain; partial results show "read N of 9 routes" | Track failure rate per route; add fallbacks per route |
| Seller over-trusts an inference | Medium | Medium | Hypothesis labels, confidence, share mode phrases inferences as questions | Measure "Not useful" feedback per hypothesis rule |
| ROI number quoted as a promise | Medium | Medium | "Illustrative" and "not a guarantee" next to every total; all assumptions editable; formula shown | Let finance own the default benchmarks |
| Abuse or cost: someone scripts thousands of lookups | Medium | Low | Each lookup is bounded (9 routes, size and time caps); `LIVE_RESEARCH_ENABLED=0` kill switch | Per-IP rate limit and auth behind company SSO |
| Brand or affiliation confusion | Medium | Low | Persistent "Independent concept by Ayo Ahmed. Not affiliated with incident.io." ribbon and footer | - |
| Prospect data stored where it should not be | Low | Low | Briefs are held in the seller's browser only; server keeps nothing | Decide retention policy before adding server storage |
