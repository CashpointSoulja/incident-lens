# Observed vs inferred: the honesty model

A seller who repeats a wrong "fact" to a prospect loses the deal's trust. Incident Lens therefore treats the line between what was read and what was guessed as a product requirement enforced in code, not a style guide.

## Three states

| State | Meaning | How it is shown |
| --- | --- | --- |
| Observed | A public page that was fetched today says this. The card links to that page and shows the date | "Observed" chip, source link, date |
| Hypothesis | A reasonable inference from one or more observed cards. Never presented as fact | "Inferred" chip, hedged wording ("might", "could"), the supporting evidence and its source link; a confidence value below 1 travels with it in the data and CRM payload; in share mode phrased as a question |
| Unknown | Not established by public pages | Shown as unknown. For example "Customer status not publicly confirmed" - a live lookup never claims an account is or is not a customer |

## Rules

1. An observed card must cite a page that was actually read in this lookup. Search-result snippets, generated text and memory are never used.
2. A quote must be a verbatim sentence from the page body. Navigation, headers, footers, forms and scripts are stripped first, and only prose-like sentences (6+ words, ends in punctuation, not a run of capitalised menu items) can be quoted. If no such sentence exists the card says only "X is mentioned on this public page."
3. Attribution is strict. An off-domain page such as a guessed GitHub organisation is only used when the page itself names the company's domain; an unrelated org with a similar name is dropped and supplies no evidence.
4. Every signal and hypothesis must cite evidence ids that exist in the same bundle.
5. Hypothesis confidence is always below 1.
6. ROI numbers are illustrative placeholders labelled with their source type (heuristic, placeholder, benchmark) and are always editable.

## Enforcement

`buildBundle()` in `live-research.js` ends with `assertSourced()`, which throws - and so the lookup fails with a clear message instead of rendering - if any of these hold:

- an evidence card is not `observed` or cites a URL that was not read;
- a quoted string does not appear in the text of its source page;
- a signal or hypothesis cites no evidence, or an evidence id that does not exist;
- a hypothesis is not labelled `inferred` / `hypothesis`.

Failing closed is deliberate: a missing brief costs a seller a minute; a fabricated brief costs a customer's trust.

Tests covering these rules: `test/live-research.test.js` and `test/hardening.test.js` (see [Test results](TEST-RESULTS.md)).
