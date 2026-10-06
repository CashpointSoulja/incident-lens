# Service blueprint

This shows one brief end to end, from the seller's first action to the prospect opening the share link. The **line of visibility** separates what the user sees (front stage) from what runs behind it (back stage and systems).

| Stage | User action | Front stage (seen) | Back stage (not seen) | Systems | Failure points and mitigation |
| --- | --- | --- | --- | --- | --- |
| 1. Enter | Types a domain or picks a preloaded example | Domain field, "Research live", 3 example cards | Input normalised to a bare hostname; IP literals, ports and `localhost` refused before any network call | Browser SPA (`public/app.js`) | Bad input → 422 with a clear message. Live lookup switched off (`LIVE_RESEARCH_ENABLED=0`) → message and the examples still work |
| 2. Lookup | Waits about 1 to 2 s | Loading state that names what is being read | `GET /api/research`: up to 9 routes (root, status, blog, careers, GitHub); DNS checked at validation and again at connect; every redirect hop re-validated; byte cap and timeouts | Vercel Node function (`server.js`, `live-research.js`), public DNS, prospect's public sites | Site blocks or times out → fewer cards, the page is skipped and not guessed. Every page fails → 422 "could not be read". Private address at any hop → refused |
| 3. Evidence | Reads cards, opens sources | Observed cards with source, page title, date and confidence | Prose-only sentence extraction; entity decoding; `assertSourced()` checks every card, quote and hypothesis | `live-research.js` | Extraction regression → `assertSourced()` fails closed and the lookup errors instead of shipping an unsourced claim. Wrong company → exact domain or subdomain match required |
| 4. Brief | Taps "Build the reliability story" | Signals, up to 3 Inferred hypotheses, discovery questions, product map with reasons | Rule-based matcher (`matcher-v1.0`) against the product knowledge base; brief version saved | Browser, `data/product-kb.json`, localStorage | Knowledge base out of date → every item links to its incident.io source page for review. Storage unavailable → works in memory |
| 5. Scenario | Steps through 6 phases | Incident walkthrough with "Live now" and illustrative labels | Steps personalised from signals; `origin` is `evidence` only when signals support it | Browser | Too few signals → generic steps, clearly labelled illustrative |
| 6. ROI | Edits assumptions with the prospect | 3 levers, 7 inputs, formulas, illustrative total | Pure `calculate()`; values clamped at their minimums; `roi-v1.0` | Browser | Overclaiming → never called a guarantee; payload has `Estimate_Is_Guaranteed__c: false` |
| 7. Share | Switches to share mode, copies the link | Prospect-safe page: internal notes removed, hypotheses as questions, sources kept | Link hash carries `roi=` values and, for live accounts, `d=` domain | Browser URL | Link opened elsewhere with no stored bundle → recovery form re-reads the live domain and applies the same ROI values, rather than inventing data |
| 8. Prospect opens | Reads, edits ROI | Same numbers the AE saw | Share-mode ROI edits recompute locally | Prospect's browser | Prospect's pages changed since the brief → fresh read shows today's evidence, dated |
| 9. Feedback / CRM | Marks recommendations "Good match" or "Off the mark", copies the payload | Feedback buttons, CRM-shaped payload preview | Feedback and event trail stored locally against the brief version | localStorage (no CRM call in v1) | No server-side analytics yet → see [Roadmap](ROADMAP.md) for observability and CRM write-back |

## Support processes

- **Monitoring and debugging:** [Runbook](RUNBOOK.md) health checks and failure modes.
- **Kill switch:** set `LIVE_RESEARCH_ENABLED=0` in Vercel and redeploy. The examples keep working.
- **Rollback:** promote the previous Vercel deployment, or run `git revert` and push.
