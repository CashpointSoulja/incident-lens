# Data model (JSON fixtures + runtime)
Account { id, domain, name, industry?, createdAt }
Evidence { id, accountId, claim, url, observedAt, confidence: high|medium|low, kind: observed|inferred }
Signal { id, accountId, label, evidenceIds[], strength: 1-5 }
Hypothesis { id, accountId, statement, evidenceIds[], signalIds[], confidence: 0-1 number, status: hypothesis }  // never presented as fact; signalIds are the signals it draws on, confidence is explicit and always < 1
ProductCapability { id, product: Nexus|On-call|Investigations|Response|Status Pages, name, description, sourceUrl }
Integration { id, name, category, sourceUrl }
Recommendation { id (content hash of accountId+ruleId+target+evidenceIds), accountId, capabilityId|integrationId, ruleId, reasons[], evidenceIds[] }
ScenarioStep { order, phase: alert|routing|investigation|response|customer-update|postmortem, text, personalizedFrom: signalIds[] }
RoiAssumption { id (content hash of accountId+key+lever), accountId, key, label, value, unit, editable: true, note, min, step, lever: downtime|engineer-time|consolidation }
BriefVersion { id, accountId, version, mode: internal|share, matcherVersion, roiVersion, roiAssumptions[] (immutable snapshot of { id, key, label, value, unit, lever } as saved), createdAt }
FeedbackEvent { id, briefId, useful: bool, comment?, at }
