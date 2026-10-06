# Design

Incident Lens should feel like a page from incident.io's own product: calm, warm, precise. This document was written before the brand pass and is the reference for every visual decision in `public/`.

## Sources inspected

- incident.io homepage, captured at 1366px desktop and 390px mobile on 6 October 2026.
- incident.io brand centre (`incident.io/brand`) and its downloadable assets: the SVG wordmark and icon pack and the brand guidelines PDF.

## What the real product looks like

| Observed on incident.io | How Incident Lens applies it |
| --- | --- |
| Black wordmark with the orange flame icon, top-left, on a transparent background | The official `wordmark-colour-dark.svg` from the brand pack, unedited, at `public/brand/incidentio-wordmark.svg`, top-left in the header |
| Warm white and cream surfaces, no cold greys | Canvas `#F8F5F0`, quiet surfaces `#F1EBE2`, borders `#E4D9C8`, cards `#FFFFFF` |
| Alarmalade orange on the primary call to action only | `#F25533` is used for primary buttons, the live-state dot and the active step number. Nothing decorative is orange |
| Large serif display headlines, sans-serif navigation and UI | Newsreader 700 for headings (open licence stand-in for incident.io's proprietary display face), Inter for everything functional |
| Charcoal text `#161618`, deep burgundy `#5A0A17` for dense panels | Same values for body text and the "pause" panels that hold totals |
| Rounded cards and pill controls, generous spacing | 18px card radius, pill chips and segmented controls, 44px minimum touch targets |

Fonts are self-hosted from `public/fonts/` so the page renders the same everywhere and makes no third-party font request.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--orange` (Alarmalade) | `#F25533` | Action and live state only |
| `--charcoal` | `#161618` | Text, selected states, the disclaimer ribbon |
| `--burgundy` | `#5A0A17` | Deep panels |
| `--white` | `#FFFFFF` | Cards and data |
| `--canvas` | `#F8F5F0` | Page background |
| `--cream` | `#F1EBE2` | Quiet surfaces, chips |
| `--sand` | `#E4D9C8` | Borders, rails, dividers |

Rule of thumb: if everything is orange, nothing is urgent. Status is never shown by colour alone; every chip also carries a word ("Observed", "Inferred", "High confidence").

## Layout

- Mobile first at 390px; content column capped at 760px on desktop.
- One primary action per screen, pinned in a bottom action bar on phones.
- A step rail (Evidence, Brief, Scenario, ROI) shows where the AE is; share mode is a single screen outside the rail.
- Evidence sits beside the claim it supports. Nobody should have to hunt for a source.

## Voice

Plainspoken and technically precise. Examples:

- Good: "Datadog is mentioned on this public page." / "Likely PagerDuty setup - a hypothesis to confirm on the call."
- Avoid: "Our engine uncovered critical insights." Anything that sounds certain without a source.

## Identity and non-affiliation

- The incident.io name and logo identify the product this concept is built around. They belong to incident.io.
- A persistent ribbon and the footer both read exactly: "Independent concept by Ayo Ahmed. Not affiliated with incident.io."
- Nothing in the UI implies employment, partnership, endorsement or access to incident.io data.

## Accessibility

- Measured contrast: charcoal on canvas 16.6:1, charcoal on cream 15.3:1, muted text `#6B645C` on canvas 5.4:1.
- White on Alarmalade is 3.4:1, the same pairing incident.io uses on its own buttons. That passes WCAG AA for large or bold text only, so orange is never used for body text and button labels stay bold. Logged as a deliberate brand trade-off.
- Visible focus rings, a skip link, `aria-live` status for lookups, reduced-motion respected for number tweens.
