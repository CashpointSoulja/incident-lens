# Rollout plan

This is a plan, not a record. Nothing below has happened yet. Durations are proposals, and the gates use the metrics defined in the [PRD](PRD.md#6-success-metrics), with targets set only after a baseline is measured.

## Phase 0: owner readiness (week 0)

- SSO in front of the app, plus rate limiting and caching on `/api/research` ([Roadmap](ROADMAP.md) items 1 and 6).
- Server-side logging of lookup outcome, latency and pages read, with no prospect content stored.
- Agree field mapping with RevOps before any CRM write.
- Refresh the product knowledge base against incident.io's current pages with product marketing.
- **Exit gate:** runbook health checks pass; kill switch tested in production.

## Phase 1: pilot (weeks 1 to 3)

- **Who:** 3 to 5 volunteers across AE, BDR and CS, plus one product marketer reviewing the share view.
- **How:** use it on real upcoming calls. A weekly 20-minute review collects "Off the mark" feedback and any wrong or awkward evidence.
- **Measure:** time to first brief, lookup success rate, useful rate, briefs shared. Collect a manual-research baseline in the same weeks.
- **Exit gate:** zero unsourced claims reported; useful rate and lookup success agreed with the pilot group as good enough to expand.

## Phase 2: adoption (weeks 4 to 8)

- Open to the wider AE and BDR team, with a five-minute demo in the team meeting and a short guide in the sales enablement space.
- Add the brief link to the CRM account record (manual paste first, then write-back if RevOps approves).
- Weekly review of weekly active sellers and briefs shared; first look at first call to qualified opportunity, only with a fair comparison.

## Support model

- **Owner:** Product Engineer - GTM, on point for breakage during working hours.
- **Channel:** one Slack channel for questions and "this card is wrong" reports, triaged daily.
- **Severity:**
  - S1: an unsourced or wrong-company claim shown to a prospect. Kill switch, then fix.
  - S2: lookups failing broadly.
  - S3: single-site extraction gaps.
- **Docs:** [Runbook](RUNBOOK.md) for failure modes and debugging.

## Kill switch and rollback

- Set `LIVE_RESEARCH_ENABLED=0` in Vercel and redeploy. Live lookup returns a clear message and the preloaded examples keep working.
- For bad code, promote the previous Vercel deployment or run `git revert` and push.
- Before rollout ends: write down when the switch is used (any S1, abuse, or cost spike), and rehearse it once per phase.

## Communication

- Pilot invite, weekly pilot notes, and a launch note that states plainly what the tool does not do: no customer status, no guarantees, no sending.
