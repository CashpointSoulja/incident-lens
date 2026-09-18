Incident Lens - PRD
Audition build for incident.io
Product requirements document · Build target: Sunday night, 20 September 2026 · Demo: Agent Night, Monday 21 September 2026
1. Problem and why this wins the role
Problem
Revenue teams lose time and context when they prepare for technical prospects. BDR research, AE discovery, product mapping, ROI assumptions and handoff notes often live across tabs, documents and individual memory. The result is repetitive work, generic pitches and claims that are hard to defend.
Incident Lens turns public evidence about a prospect into a structured, source-backed reliability brief. It helps an AE move from “tell me about your reliability stack” to a credible conversation: what is observed, what is only a hypothesis, which incident.io capabilities may matter, what to ask next, and how to show the value without inventing certainty.
Why this is the right audition
The Product Engineer - GTM role is to build and run the software and systems incident.io's revenue team relies on. The live job description names BDRs, AEs, Customer Success, Marketing and GTM leadership; asks the builder to find repetitive work and lost context; and expects internal tools, integrations, AI workflows and dependable production systems.
Incident Lens demonstrates that mandate rather than merely describing fit. It begins with a fuzzy revenue problem, models the data, uses AI only where useful, makes claims auditable, and produces an internal workflow that BDRs and AEs could use. The artifact is the application proof.
2. Users and north star
Primary users
Account Executive: needs a fast, defensible account point of view, useful discovery questions, a relevant product story and editable value assumptions.
Business Development Representative: needs to qualify an account, avoid generic outreach and hand useful context to an AE without duplicating research.

Secondary user
Prospect-share recipient: needs a clean summary that keeps sources and assumptions visible while removing internal notes.

North star: the 90-second phone demo
Open a preloaded prospect, not a blank form.
Show five public evidence cards with source and observed date.
Tap Build the reliability story.
Reveal three evidence-backed hypotheses and the incident.io product/integration map.
Open a simulated incident timeline personalized to that stack.
Adjust one ROI input and show the business case update immediately.
Switch from AE brief to Share with prospect.
Show feedback captured and a Salesforce-ready payload, proving this is a GTM system rather than a landing page.

North-star test: a first-time viewer can understand the problem, trust model, workflow and value inside 90 seconds on Ayo's phone.
3. Scope
In scope: the 48-72 hour cut
Three polished, precomputed prospect fixtures.
Mobile-first account picker and optional domain intake.
Official incident.io product and integration knowledge base for matching.
Evidence ledger with source URL, observed date, confidence and observed/inferred state.
Account brief with signals, hypotheses, discovery questions and product/integration recommendations.
Deterministic product matcher with visible reasons.
Personalized simulated incident scenario.
Editable three-lever ROI panel: downtime, engineer time and tool consolidation.
Internal AE view and prospect-safe share mode.
Useful/not-useful feedback, brief version and event trail.
Typed Salesforce-ready payload shown as an integration boundary.
Caching, failure states, fixture fallback, deployment and phone QA.

Explicitly out of scope
Real Salesforce or CRM authentication, read/write or sync.
Live scraping as a dependency in the core demonstration path.
Private, paywalled or authenticated prospect data.
Automated outreach or sending anything to a prospect.
Production-grade multi-tenant auth and permissions.
A broad crawler, exhaustive company dossier or general-purpose sales intelligence platform.
Any use of incident.io identity that implies employment, endorsement, partnership or official affiliation.

4. Screens and definition of done
4.1 Account picker
Shows: three polished fixture accounts with company name, domain, brief freshness and compact signal preview; optional domain input as a secondary route.
Done when: the demo opens on useful content, a fixture can be selected in one tap, loading is immediate, and the primary path works with no external request.
4.2 Evidence ledger
Shows: evidence cards containing claim, source title and URL, observed date, confidence, source type, and a clear “Observed” or “Inferred” chip.
Done when: at least five fixture evidence cards are readable on mobile; every claim links to its source; inference is visually distinct; and unsupported statements cannot enter the brief.
4.3 Account brief
Shows: company signals, likely reliability pains marked as hypotheses, discovery questions, product capability matches, exact integrations and a short reason for each recommendation.
Done when: the user can tap Build the reliability story and receive three useful evidence-backed hypotheses; each recommendation exposes its evidence and reasoning; and the brief separates fact from sales interpretation.
4.4 Scenario player
Shows: a compact incident timeline tailored to the prospect's observed or hypothesized stack: alert → routing → investigation → response → customer update → postmortem.
Done when: the full sequence is understandable without zooming; the active step is clear; product and integration roles appear in context; and the scenario never presents inferred stack data as fact.
4.5 ROI panel
Shows: editable assumptions and outputs for downtime/MTTR, reclaimed engineer time and tool consolidation. Formulas and benchmark provenance remain visible.
Done when: changing one input updates the result immediately; no result is called guaranteed; the assumptions driving the output are visible; and the user can reset to the fixture baseline.
4.6 Share mode
Shows: a prospect-safe summary of evidence, hypotheses, relevant incident.io capabilities, scenario and editable business case, with internal notes removed and sources retained.
Done when: switching from AE view to share mode takes one action; internal notes and sales-only language disappear; source links, uncertainty and audition-build disclaimer remain; and a stable share URL can be copied.
5. Data model
Entity
Purpose / key relationships

Account
Prospect identity, domain, fixture/live mode, brief freshness; parent for evidence and briefs.

Evidence
Claim, source URL/title/type, observed date, extraction state and confidence.

Signal
Normalized observation derived from evidence, such as a public tool or workflow indicator.

Hypothesis
Potential pain or opportunity, linked to supporting signals and carrying explicit confidence/state.

ProductCapability
Official incident.io capability, product area and approved description.

Integration
Official integration and category, linked to relevant signals and capabilities.

Recommendation
Capability/integration match with deterministic reason and supporting evidence.

ScenarioStep
Ordered demo step with state, actor, system, capability and evidence/hypothesis origin.

RoiAssumption
Named input, value, unit, source, editable flag and scenario.

BriefVersion
Immutable generated brief snapshot, mode, rules/model versions and created time.

FeedbackEvent
Useful/not-useful, edits and interaction events attached to a brief and recommendation.

6. Design principles
FIRST PRINCIPLE: Warm neutrals carry the room; Alarmalade orange marks action/live state ONLY.
“If everything is orange, nothing is urgent.”
The accompanying incident.io Brand Guideline - for the Incident Lens build PDF is the design bible. When this PRD and a styling choice conflict, follow that visual reference unless the choice would reduce usability, honesty or accessibility.
Calm before clever: the interface should feel controlled even when the content describes failure.
Evidence beside the claim: do not make the user hunt for provenance.
One clear action: every mobile view has one obvious primary action.
Warm editorial shell, functional core: serif for major headlines; sans-serif for evidence, controls, numbers and system output.
Structure over decoration: paper backgrounds, rounded cards, small chips and timeline rails create hierarchy.
Accessible state: never rely on colour alone; pair status with text or icon.
Audition, not imitation: feel native to incident.io while visibly stating that this is an audition build.

7. Determinism and honesty rules
Every account claim is explicitly Observed, Inferred or Unknown.
Observed claims require a source URL and observed date.
Inferences require supporting evidence, a confidence value and language that keeps them hypothetical.
Unsupported claims are blocked from the generated brief and share view.
Product matching and ROI calculations are deterministic, inspectable and versioned.
Use the model only for evidence extraction, summarization and drafting discovery questions.
The model may not decide financial outputs, silently upgrade an inference to fact, or invent missing data.
Every recommendation answers “why this?” with its rule and supporting evidence.
Cache results and ship three complete fixtures so the 90-second demo never depends on a live call.
If an optional live analysis fails or times out, return to a fixture cleanly and explain the state without exposing technical noise.
Share mode preserves source and uncertainty while removing internal notes.

8. Acceptance criteria and build plan
Acceptance criteria mapped to the 90-second demo
Preloaded account: app opens with three polished fixtures and a chosen fixture loads in under one second on the demo device.
Evidence: selected account displays at least five readable public evidence cards, each with source link and observed date.
Generation: Build the reliability story returns a cached/generated brief without a blank or hanging state.
Hypotheses and map: exactly three primary hypotheses are clearly marked as inferred; recommended products/integrations show reasons and supporting evidence.
Scenario: the six-step incident flow is understandable on a phone without zooming and distinguishes observed stack elements from illustrative ones.
ROI: changing one named assumption visibly updates the business case; formulas and non-guarantee language remain visible.
Share: AE/share mode switch works in one action; internal notes disappear and sources/disclaimer remain.
System proof: useful/not-useful feedback is recorded and the current brief produces a valid typed Salesforce-ready payload without making a real CRM call.

Cross-cutting acceptance
Main path completes inside 90 seconds on Ayo's phone.
No unsupported account claim appears in AE or share mode.
No main-path network dependency after initial app load.
No screen needs pinch-to-zoom.
No identity treatment implies official affiliation.
All core states have loading, empty and failure handling.
Deployment is reachable from a clean browser session.

Build order to Sunday night
Window
Work
Exit condition

Friday, hours 0-4
Design tokens, official product/integration knowledge base, schema, fixture selection and demo script.
Locked visual tokens, typed entities, selected fixtures and one approved scenario outline.

Friday night / Saturday, hours 4-14
Evidence ingestion, structured extraction, source links, state/confidence logic and caching.
Five+ valid evidence cards per fixture; unsupported claims fail closed.

Saturday, hours 14-24
Deterministic product matcher, scenario engine and ROI calculations.
Each fixture generates explainable matches, a six-step scenario and editable ROI.

Saturday night / Sunday, hours 24-36
Account picker, evidence, brief, scenario, ROI and AE/share views.
End-to-end mobile path works locally.

Sunday, hours 36-48
Fixtures, failure states, feedback/event trail, mock CRM payload and deployment.
Deployed main path works without live calls; events and payload validate.

Sunday evening
Phone QA, visual fixes, performance pass and 90-second rehearsal.
Three clean rehearsals under 90 seconds; no clipping, dead ends or uncertain claims.

9. Guardrails
No invented prospect stack, outage history or savings; distinguish observation from inference; never scrape private data; do not imply affiliation; no live external dependency in the core demo path. Show “why this recommendation” and source links everywhere.
Reference set
Design bible: incident.io Brand Guideline - for the Incident Lens build (accompanying visual PDF)
Product Engineer - GTM role
incident.io product site
incident.io Brand Center
