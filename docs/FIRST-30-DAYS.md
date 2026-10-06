# First 30 days as Product Engineer - GTM

The role, as incident.io describes it, is to build and own the software the revenue team runs on. Incident Lens is a small version of that job: a tool sellers would rely on before a call, running in production, with a clear owner. Here is how I would approach the first month, using this tool as the worked example.

## Days 1-10: learn the work, not just the stack

- Shadow AEs, BDRs, CS and marketing on real prep and real calls. Write down every repeated step, copy-paste, and "where did that number come from?".
- Map the GTM systems: CRM objects and fields, call recording, enrichment, Slack channels, and who owns each.
- Find the top three time sinks and the one place where wrong information reaches a customer. Those are the backlog.
- Ship one small fix in week one so the team sees the loop: ask, build, ship, measure.

## Days 11-20: ship something people use

- Pick the highest-value pain and ship a thin version to a handful of sellers. For a tool like Incident Lens that would be: SSO, the brief written back to the CRM account, and a Slack shortcut.
- Agree the success metric with the users before shipping (for Incident Lens: time to first brief, lookup success rate, useful rate, briefs shared).
- Instrument from day one: request logs, per-source success and latency, feedback events.

## Days 21-30: own it in production

Owning a tool means sellers never have to tell me it is broken. For Incident Lens that looks like:

**Monitoring**
- Synthetic check every 10 minutes: `GET /`, a lookup of a known-good domain, and a known-bad domain that must be refused.
- Dashboards for lookup success rate by route (homepage, status, blog, careers, GitHub), p50/p95 latency, `assertSourced()` blocks and SSRF refusals.
- Alerts: success rate drops below its baseline for 15 minutes; any spike in guard refusals; error rate on the share route.

**Known failure modes** (full table in the [Runbook](RUNBOOK.md))
- Prospect sites blocking automated reading or changing markup - degrade gracefully, never invent.
- Outbound networking or DNS failure on the platform - every lookup fails at once.
- Extraction regressions after a code change - caught by tests and an evaluation set of known domains.
- Share-link encoding regressions - caught by unit tests.
- Abuse - kill switch, then rate limiting.

**How a breakage gets debugged** (example: "lookups for monzo.com return nothing since this morning")
1. Reproduce: `curl` the production endpoint for monzo.com and for incident.io. One failing means a site-specific cause; both failing means the platform or our code.
2. Check what changed: last deploy time vs first failure; roll back if they line up.
3. Narrow down: run `researchDomain('monzo.com')` locally and inspect which of the nine routes failed and why (status code, redirect target refused by the guard, timeout, prose filter).
4. Fix with a regression test that reproduces the failure, ship, and re-run the production checks.
5. Tell the users in their channel what broke, for how long, and what changed. Add the check that would have caught it sooner.

**Then:** a short written review of month one - what shipped, what the numbers say, what I would build next and what I would stop.
