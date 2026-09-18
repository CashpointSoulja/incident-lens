# Data model (JSON fixtures + runtime)
Account { id, domain, name, industry?, createdAt }
Evidence { id, accountId, claim, url, observedAt, confidence: high|medium|low, kind: observed|inferred }
Signal { id, accountId, label, evidenceIds[], strength: 1-5 }
Hypothesis { id, accountId, statement, evidenceIds[], status: hypothesis }  // never presented as fact
ProductCapability { id, product: Nexus|On-call|Investigations|Response|Status Pages, name, description, sourceUrl }
Integration { id, name, category, sourceUrl }
Recommendation { id, accountId, capabilityId|integrationId, reasons[], evidenceIds[] }
ScenarioStep { order, phase: alert|routing|investigation|response|customer-update|postmortem, text, personalizedFrom: signalIds[] }
RoiAssumption { id, key, label, value, unit, editable: true, note }
BriefVersion { id, accountId, version, mode: internal|share, createdAt }
FeedbackEvent { id, briefId, useful: bool, comment?, at }
