# Incident Lens - Product Requirements

Status: v1 live in production at https://incident-lens-kappa.vercel.app/ · Owner: Ayo Ahmed · Last updated: 6 October 2026

Independent concept by Ayo Ahmed. Not affiliated with incident.io.

## 1. Problem statement

Before a first call with a technical prospect, an incident.io seller has to answer three questions: how does this company run reliability today, which incident.io products plausibly matter to them, and what is it worth? The answers are scattered across the prospect's website, status page, engineering blog, careers pages and GitHub. Research is repeated by the BDR, then the AE, then CS; it lives in tabs and heads, and claims made on calls are hard to trace back to a source.

The hypothesis this product tests: a revenue team that gets a dated, source-linked reliability brief in seconds - with facts and guesses visibly separated - will prepare faster, run better discovery and make fewer claims it cannot defend.

This is a hypothesis about how revenue work generally goes wrong, not a finding about incident.io's team. No incident.io data or interviews were used.

## 2. Users

The internal users are incident.io's revenue and GTM team:

| User | What they need from Incident Lens |
| --- | --- |
| Account Executive (AE) | A defensible point of view before the call: what is public, what is a guess, which products fit and why, and a business case they can edit live with the prospect |
| Business Development Rep (BDR) | Fast qualification and a non-generic opener, then a hand-off the AE does not have to redo |
| Customer Success (CS) | Context on an existing account's public stack when planning expansion |
| Marketing | Consistent, sourced product language and a prospect-safe page to share |

Secondary user: the prospect who receives the share link. They see evidence, hypotheses phrased as questions, product fit and the editable business case, with internal notes removed.

## 3. Jobs to be done

- When I am preparing for a first call with a technical prospect, I want to see what is publicly known about how they handle incidents, so I can open with something specific instead of "tell me about your stack".
- When I propose an incident.io product, I want the reason and the source next to it, so I never claim something I cannot back up.
- When a prospect asks "what is this worth to us?", I want a business case whose assumptions we can change together, so the number belongs to both of us.
- When I hand an account to a colleague or a prospect, I want one link that reopens exactly what I was looking at.

## 4. Five Whys

Why do first calls with technical prospects underperform?
1. Because the seller opens generically. Why?
2. Because they did not have a clear picture of the prospect's reliability setup. Why?
3. Because that picture is spread across five or more public sources and takes real time to assemble. Why is it not assembled once and reused?
4. Because research notes are personal and unsourced, so the next person cannot trust or reuse them. Why are they unsourced?
5. Because no tool in the workflow forces a claim to carry its source and date, or separates what was read from what was guessed.

Root cause addressed by Incident Lens: research output is not a trustworthy, shareable artefact. The product makes the brief that artefact.

## 5. Solution (v1, shipped)

1. **Domain input.** Enter a company domain. The server reads up to nine public routes: homepage, status page candidates, engineering blog, careers and GitHub.
2. **Evidence ledger.** Each card is a claim, its source URL and title, the date observed, confidence and an "Observed" chip. Quotes are verbatim sentences from the page.
3. **Brief.** Signals (for example "Datadog", "Public status page", "SRE / platform team") become up to three hypotheses, each marked "Inferred", worded as "might" or "could", shown with the evidence it rests on and carrying a confidence value below 1, plus discovery questions and an incident.io product and integration map with a stated reason per recommendation.
4. **Scenario.** A six-step simulated incident (alert, routing, investigation, response, customer update, post-mortem) personalised to observed signals, and marked where it relies on a hypothesis.
5. **ROI.** Three levers (downtime, engineer time, tool consolidation) with seven editable assumptions and visible formulas. Totals are labelled illustrative.
6. **Share mode.** One tap to a prospect-safe view; a stable link carries the ROI assumptions and, for live lookups, the domain.
7. **Integration boundary.** Feedback buttons, a brief version and event trail, and a typed Salesforce-shaped payload preview. No CRM call is made.

Three preloaded examples (Starling Bank, Monzo, Snyk) keep the product usable if live lookup is switched off or a site blocks automated reading.

## 6. Success metrics

No usage data exists yet; this is a concept with no real users. These are the metrics I would instrument from day one, with targets to be set after a two-week baseline.

| Metric | Type | Definition |
| --- | --- | --- |
| Time to first brief | Leading | Median seconds from domain submit to evidence ledger rendered. Current production measurement: about 1-2 seconds for incident.io, stripe.com and monzo.com (see [Test results](TEST-RESULTS.md)) |
| Lookup success rate | Health | Share of lookups returning at least one observed card |
| Weekly active sellers | Adoption | Distinct AEs/BDRs generating a brief per week |
| Briefs shared | Value | Share links opened by a prospect per brief |
| Useful rate | Quality | "Useful" / ("Useful" + "Not useful") on recommendations |
| Unsourced claims shipped | Guardrail | Must stay at zero; enforced in code, see [Honesty model](HONESTY-MODEL.md) |
| Stage conversion | Lagging | First call to qualified opportunity for accounts with a brief vs without. Needs CRM data and a fair comparison before any claim |

## 7. Scope

In scope for v1: live public-page lookup, evidence ledger, brief, product matcher, scenario, ROI, share mode, feedback and event trail, Salesforce-shaped payload preview, three preloaded examples, mobile-first UI.

Non-goals:
- Real Salesforce, HubSpot or Gong read/write. The payload preview marks the boundary.
- Private, paywalled or logged-in data about prospects.
- Sending anything to anyone. There is no outreach, email or sequencing.
- Generated prose. Extraction and matching are rule-based so every output is traceable.
- Multi-user accounts, permissions or server-side storage of briefs.
- A general sales-intelligence crawler.

## 8. Requirements and definition of done

| Area | Done when |
| --- | --- |
| Lookup | Valid public domain returns a bundle in under 10 seconds; localhost, private and reserved IPs, non-default ports and credential URLs are refused; redirects are re-checked on every hop |
| Evidence | Every card links to a page that was actually read and carries a date; every quote appears verbatim on that page |
| Brief | Every hypothesis is labelled, carries confidence below 1 and cites evidence ids; every recommendation states its rule and evidence |
| ROI | Editing one input updates the total immediately; formulas visible; reset available |
| Share | Link reopens the same ROI values; live links carry the domain and offer a fresh re-read in another browser rather than reconstructing data |
| Safety switch | `LIVE_RESEARCH_ENABLED=0` disables live lookup without a code change; preloaded examples keep working |

## 9. Related documents

[Design](DESIGN.md) · [Honesty model](HONESTY-MODEL.md) · [Risks](RISKS.md) · [Roadmap](ROADMAP.md) · [Decision log](DECISIONS.md) · [Test plan](TEST-PLAN.md) · [Test results](TEST-RESULTS.md) · [Runbook](RUNBOOK.md) · [ELI5 and 30-second pitch](ELI5.md) · [First 30 days](FIRST-30-DAYS.md)
