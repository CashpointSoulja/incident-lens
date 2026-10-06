# Data dictionary

This lists every field the product produces or carries. **Source** says where the value comes from: *page* (read from a public page during the lookup), *derived* (computed by a rule from other fields), *config* (fixed in code or the knowledge base), *fixture* (curated example data) or *user* (entered in the UI). Types are JSON types. The live API response is `GET /api/research?domain=…` → `{ account, evidences[], signals[], hypotheses[], scenarioSteps[], research }`.

## Account

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | `live_` + 10 hex characters (hash of the domain) for live accounts; fixture ID otherwise |
| `domain` | string | user | Public hostname, lowercase, no scheme, port or path |
| `name` | string | page / fixture | Company name from the site, or the domain |
| `industry` | string \| null | fixture | `null` for live lookups |
| `createdAt` | string | derived | ISO 8601 |
| `alreadyCustomer` | boolean \| null | fixture | Always `null` for live lookups ("not publicly confirmed"); never exported as `false` when unknown |
| `live` | boolean | derived | `true` for live lookups |

## Research metadata (`research`)

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `live` | boolean | derived | `true` |
| `pagesChecked` | integer | derived | Routes attempted, up to 9 |
| `pagesRead` | integer | derived | Routes that returned readable HTML |
| `observedAt` | string | derived | `YYYY-MM-DD` |
| `capturedAt` | string | derived | ISO 8601 timestamp |

## Evidence

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | `ev_` + hash; stable for the same content |
| `accountId` | string | derived | Account `id` |
| `claim` | string | page | Either a sentence quoted word for word in “ ” or "X is mentioned on this public page" |
| `url` | string | page | A URL that was actually read; must match the account domain or a true subdomain |
| `sourceTitle` | string | page | The page's `<title>`; `""` when unknown |
| `sourceType` | string | derived | `status-page` \| `careers` \| `engineering` \| `blog` \| `github` \| `homepage` \| `other` |
| `observedAt` | string | derived | `YYYY-MM-DD` |
| `confidence` | string | derived | `high` \| `medium` \| `low` |
| `kind` | string | derived | `observed` only, enforced by `assertSourced()` (fixtures may also use `inferred`) |

## Signal

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | `sig_` + hash |
| `accountId` | string | derived | Account `id` |
| `label` | string | derived | Normalised term, e.g. `Public status page`, `Kubernetes`, `AWS`, `Datadog`, `SRE / platform team` |
| `evidenceIds` | string[] | derived | At least one existing Evidence `id` |
| `strength` | integer | derived | 1 to 5. Live rules use 5 for a public status page and 3 for a mention |

## Hypothesis

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | `hyp_` + hash, scoped to the account |
| `accountId` | string | derived | Account `id` |
| `statement` | string | derived | Hedged wording ("might", "could"); in share mode shown as a question |
| `evidenceIds` | string[] | derived | At least one, each must exist |
| `signalIds` | string[] | derived | Signals it draws on |
| `confidence` | number | derived | 0 to 1, always below 1 (live rules use 0.5) |
| `status` | string | derived | `hypothesis` only |
| `kind` | string | derived | `inferred` only |

## Scenario step

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `order` | integer | derived | 1 to 6 |
| `phase` | string | config | `alert` \| `routing` \| `investigation` \| `response` \| `customer-update` \| `postmortem` |
| `text` | string | derived | Narrative for the step |
| `actor` | string | config | `prospect` \| `incident.io` \| `system` |
| `system` | string | derived | Tool or service the step acts on today, e.g. `Azure` |
| `capabilityId` | string | config | ProductCapability `id` proposed at this step |
| `origin` | string | derived | `evidence` only when `personalizedFrom` signals are supported by evidence; otherwise `hypothesis` |
| `personalizedFrom` | string[] | derived | Signal `id`s |

## ROI assumption (one per input)

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | Hash of account, key and lever |
| `accountId` | string | derived | Account `id` |
| `key` | string | config | `incidentsPerMonth`, `minutesReducedPerIncident`, `costPerMinuteDowntime`, `hoursReclaimedPerIncident`, `engineerHourlyRate`, `toolsConsolidated`, `costPerTool` |
| `label` | string | config | Display label |
| `value` | number | config / user | Starting value, then whatever the user enters; never below `min` |
| `unit` | string | config | e.g. `incidents`, `minutes`, `$ / minute`, `hours`, `$ / hour`, `tools`, `$ / month` |
| `editable` | boolean | config | `true` |
| `note` | string | config | Where the starting number comes from |
| `min` | number | config | `0` for every input |
| `step` | number | config | Input step |
| `lever` | string | config | `downtime` \| `engineer-time` \| `consolidation` |
| `source` | string | config | `account-size-heuristic` \| `industry-benchmark` \| `illustrative-placeholder` \| `account-evidence` |
| `scenario` | string \| null | config | Scenario `phase` this input affects |

## ROI result (computed by `calculate()`, never stored as fact)

| Field | Type | Source | Formula |
| --- | --- | --- | --- |
| `downtime.monthly` | number (USD) | derived | incidentsPerMonth × minutesReducedPerIncident × costPerMinuteDowntime |
| `engineerTime.monthly` | number (USD) | derived | incidentsPerMonth × hoursReclaimedPerIncident × engineerHourlyRate |
| `consolidation.monthly` | number (USD) | derived | toolsConsolidated × costPerTool |
| `*.annual` | number (USD) | derived | monthly × 12 |
| `*.formula` | string | config | Shown next to the result |
| `total.monthly`, `total.annual` | number (USD) | derived | Sum of the three levers; labelled illustrative |

## Share link payload (URL hash)

Format: `#/a/<accountId>/share?roi=<pairs>[&d=<domain>]`

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `accountId` | string | derived | Account `id` (path segment) |
| `roi` | string | user | URL-encoded `key:value` pairs joined by `;`. Unknown keys are ignored, non-numeric values dropped, values below `min` clamped |
| `d` | string | user | Present only for live accounts; the domain re-read when the link is opened without stored data |

## Brief version

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `id` | string | derived | Unique ID |
| `accountId` | string | derived | Account `id` |
| `version` | integer | derived | Increments per account and mode |
| `mode` | string | user | `internal` \| `share` |
| `matcherVersion` | string | config | e.g. `matcher-v1.0` |
| `roiVersion` | string | config | e.g. `roi-v1.0` |
| `roiAssumptions` | object[] | derived | Frozen `{ id, key, label, value, unit, lever, source, scenario }` |
| `content` | object | derived | Frozen `{ headline, hypotheses[{id, statement, confidence, evidenceIds}], questions[], recommendations[{id, ruleId, title, area, reason, evidenceIds}], scenarioSteps[...] }` |
| `createdAt` | string | derived | ISO 8601 |

## Feedback event and event trail (browser localStorage only)

| Field | Type | Source | Allowed values / notes |
| --- | --- | --- | --- |
| `FeedbackEvent.id` | string | derived | Unique ID |
| `FeedbackEvent.briefId` | string | derived | The brief version on screen; never null |
| `FeedbackEvent.recommendationId` | string \| null | user | Set when feedback targets one recommendation |
| `FeedbackEvent.useful` | boolean | user | "Good match" = `true`, "Off the mark" = `false` |
| `FeedbackEvent.comment` | string | user | Optional |
| `FeedbackEvent.at` | string | derived | ISO 8601 |
| Event `type` | string | derived | `domain-lookup-started`, `domain-lookup-completed`, `domain-lookup-failed`, `brief-built`, `hypothesis-count-warning`, `mode-switch`, `roi-edit`, `roi-reset`, `share-link-copied`, `sf-payload-copied`, `feedback`, `recommendation-feedback` |

## CRM-shaped payload preview (not sent anywhere)

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `Account_Name__c`, `Domain__c` | string | derived | From Account |
| `Industry__c` | string \| null | fixture | |
| `Already_Customer__c` | boolean \| null | fixture | `null` when unknown |
| `Already_Customer_Evidence__c` | string | derived | `unknown - not publicly confirmed` or `from curated fixture data` |
| `Reliability_Hypotheses__c` | string[] | derived | Hypothesis statements |
| `Recommended_Capabilities__c`, `Recommended_Integrations__c` | string[] | derived | Names from the matcher |
| `Estimated_Monthly_Value_Usd__c`, `Estimated_Annual_Value_Usd__c` | integer | derived | Rounded ROI totals |
| `Estimate_Is_Guaranteed__c` | boolean | config | Always `false` |
| `Brief_Version__c`, `Brief_Mode__c` | integer, string \| null | derived | |
| `Matcher_Version__c`, `Roi_Version__c`, `App_Version__c` | string | config | |
| `Generated_At__c` | string | derived | ISO 8601 |
