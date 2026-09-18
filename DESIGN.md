# Incident Lens design system (from incident.io brand guideline PDF, 18 Sep 2026)

IDENTITY: calm under pressure, evidence before theatre. Keep "an audition build for
incident.io" visible everywhere. Never imply affiliation.

COLOUR: warm neutrals carry the room, Alarmalade carries the action.
- #F25533 orange = action / live state ONLY. If everything is orange, nothing is urgent.
- #161618 charcoal = text / dark panels. #5A0A17 burgundy = deep sections (deliberate pauses, not the whole UI).
- #FFFFFF cards/data. #F8F5F0 canvas. #F1EBE2 quiet surfaces. #E4D9C8 rails/borders.
- Never colour alone for status: pair with labels/icons.

TYPE: bold serif display (page title, section openers, prospect-facing conclusions) +
clean sans everywhere the user works. Sentence case. One expressive headline, quiet
functional type underneath.

LAYOUT: build rhythm with surfaces, not decoration. Rounded cards, signal chips (short
labels for severity, confidence, integrations, observed vs inferred). Separate with space
first, sand borders second, shadows last. One clear column, one clear primary action.
MOBILE RULE: no zooming. Evidence sits beside the claim it supports.

VOICE: sharp teammate, no disaster theatre. "We found three signals worth checking." not
"Our advanced AI uncovered critical insights." "Likely PagerDuty setup - inferred from a
public careers page." not "They use PagerDuty." Humour in headings/empty states only,
never in customer harm.

PRODUCT UI: status first (state, owner, next action before detail); evidence as fields
(source, time, system, confidence in structure, not prose); summary -> detail; action in
context; show what AI used, inferred, and what the person can correct; calm motion
(animate state changes/flows only, never decorative motion during work); same state names
everywhere.

SCREEN MAP (= the demo flow):
1. Account picker - warm canvas + polished fixtures
2. Evidence ledger - source/date/confidence metadata
3. Reliability story - conclusion + reasons
4. Scenario player - vertical incident rail
5. ROI panel - editable assumptions
6. Share mode - prospect-safe, sources retained

ACCEPTANCE CHECKLIST (every screen must pass):
[ ] Calm before clever
[ ] One primary action
[ ] Observed / inferred / unknown visibly separated
[ ] Source beside claim
[ ] Orange carries meaning
[ ] Phone flow needs no zoom
[ ] Direct human copy
[ ] Audition disclaimer visible
[ ] No live dependency in core demo
[ ] Unsupported claims blocked
