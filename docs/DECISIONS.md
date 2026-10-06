# Decision log

| Date | Decision | Why | Alternatives considered |
| --- | --- | --- | --- |
| Sep 2026 | Mobile-first, one primary action per screen | Sellers check accounts between meetings on a phone | Desktop dashboard |
| Sep 2026 | Rule-based extraction and matching, no generated text | Every output must be traceable to a source and a rule; nothing to hallucinate | Generated summaries with citations |
| Sep 2026 | Three preloaded examples always available | The product must still demo and teach if live lookup is off or a site blocks reading | Live-only |
| Sep 2026 | Salesforce-shaped payload preview, no real CRM call | Shows the integration boundary without needing credentials or touching real data | Mock API; real sandbox |
| Sep 2026 | Briefs stored in the browser only | No server-side prospect data to secure or retain in v1 | Database |
| Sep 2026 | Live lookup gated behind `LIVE_RESEARCH_ENABLED=1` after review | Review found a redirect guard gap, an attribution bug and wrong share values | Ship and patch |
| 6 Oct 2026 | Re-check DNS at socket connect, not only before fetch | Closes DNS rebinding between validation and connection | Trust the pre-fetch lookup |
| 6 Oct 2026 | Default ports only; refuse credential URLs | A public host on :22 or :6379 is still a request this tool should never make | Port allow-list |
| 6 Oct 2026 | Quote only prose sentences from body text | Earlier extraction could stitch menu items into a "quote" | Keep whole-page text |
| 6 Oct 2026 | Fail closed via `assertSourced()` | A missing brief is cheaper than a fabricated one | Log and continue |
| 6 Oct 2026 | Live lookup on by default; `LIVE_RESEARCH_ENABLED=0` is the kill switch | Audit passed; the product is the live lookup. The switch still allows instant disable via an environment variable | Keep opt-in |
| 6 Oct 2026 | Share links carry ROI values and, for live briefs, the domain; another browser re-reads the pages instead of reconstructing | Values must match what the AE saw; data must never be invented from a URL | Encode the full bundle in the URL |
| 6 Oct 2026 | Official incident.io wordmark from the brand centre, open-licence fonts (Newsreader, Inter) | Look native without redistributing proprietary fonts | Recreated logo; system fonts |
| 6 Oct 2026 | Product knowledge base quotes incident.io's own public product copy, including its descriptions of its agent features | Those are incident.io's product facts; rewording them would misrepresent the product | Paraphrase |
