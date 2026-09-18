# INCIDENT LENS - locked build spec (user-approved 2026-09-18)

AI prospect reliability brief + demo builder. Paste a prospect domain; it turns public
evidence into a structured AE brief: observed stack/status setup, evidence links, likely
workflow gaps clearly marked as hypotheses, relevant incident.io products/integrations,
discovery questions, a personalized incident walkthrough, editable ROI assumptions.
Two output modes: internal AE brief and prospect-share mode.

## 48-72h cut
Three excellent precomputed fixtures + optional live domain analysis; official
product/integration knowledge base; citations on every claim; deterministic product
matcher and ROI calculator; share URL; useful/not-useful feedback; typed Salesforce-ready
payload + event log. NO real CRM integration.

## Build spec
- Account picker / domain intake, mobile first.
- Evidence ledger: claim, URL, observed date, confidence, observed vs inferred.
- Account brief: signals, stack map, pains/hypotheses, discovery questions.
- Product matcher across Nexus, On-call, Investigations, Response, Status Pages +
  integrations, always with reasons.
- Scenario timeline: alert -> routing -> investigation -> response -> customer update -> postmortem.
- ROI panel: downtime, engineer time, consolidation. Every assumption visible + editable.
- Prospect-safe share mode (internal notes removed).
- Feedback / version / event trail + mock CRM payload.
- Data model: Account, Evidence, Signal, Hypothesis, ProductCapability, Integration,
  Recommendation, ScenarioStep, RoiAssumption, BriefVersion, FeedbackEvent.
- Deterministic matching/calculation; model only for evidence extraction, summarizing,
  drafting questions. Unsupported claims blocked.
- Cache + fixtures so the room demo never depends on a live call.

## Design spec (official incident.io system)
- Alarmalade orange #F25533 (actions/live state only), charcoal #161618, white,
  dark burgundy #5A0A17 (deep panels), warm off-white #F8F5F0 canvas,
  cream #F1EBE2 / sand #E4D9C8 borders.
- Large bold serif display type + clean sans-serif UI.
- Rounded cards, small severity/confidence chips, timeline rails, generous space.
- Tone: high stakes without grim, technically precise, plainspoken, lightly cheeky.
- Brand: "Incident Lens, an audition build for incident.io" - NO implied affiliation.

## 90-second phone demo flow
1. Open preloaded prospect (never a blank screen)
2. Five public evidence cards with source+date
3. "Build the reliability story"
4. Three evidence-backed hypotheses + product/integration map
5. Simulated incident flow personalized to that stack
6. Change one ROI input -> case updates
7. Switch AE brief -> share-with-prospect mode
8. Feedback + Salesforce-ready payload

## Hard guardrails
- NEVER invent a prospect's stack, outages, or savings.
- Visibly separate observation from inference everywhere.
- No private scraping. No implied affiliation. No external dependency in the main demo path.
