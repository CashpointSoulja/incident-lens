# Data model (JSON fixtures + runtime)
Account { id, domain, name, industry?, createdAt }
Evidence { id, accountId, claim, url, sourceTitle (title the page gave itself, "" when unknown), sourceType: status-page|careers|engineering|blog|github|homepage|other (inferred from the url), observedAt, confidence: high|medium|low, kind: observed|inferred }
Signal { id, accountId, label, evidenceIds[], strength: 1-5 }
Hypothesis { id, accountId, statement, evidenceIds[], signalIds[], confidence: 0-1 number, status: hypothesis }  // never presented as fact; signalIds are the signals it draws on, confidence is explicit and always < 1
ProductCapability { id, product: Nexus|On-call|Investigations|Response|Status Pages, name, description, sourceUrl }
Integration { id, name, category, sourceUrl }
Recommendation { id (content hash of accountId+ruleId+target+evidenceIds), accountId, capabilityId|integrationId, ruleId, reasons[], evidenceIds[] }
ScenarioStep { order, phase: alert|routing|investigation|response|customer-update|postmortem, text, actor: prospect|incident.io|system, system (named tool/service the step acts on), origin: evidence|hypothesis, personalizedFrom: signalIds[] }  // origin is `evidence` only when personalizedFrom points at signals public evidence supports
RoiAssumption { id (content hash of accountId+key+lever), accountId, key, label, value, unit, editable: true, note, min, step, lever: downtime|engineer-time|consolidation }
BriefVersion { id, accountId, version, mode: internal|share, matcherVersion, roiVersion, roiAssumptions[] (immutable snapshot of { id, key, label, value, unit, lever } as saved), content (immutable snapshot of the generated brief: { headline, hypotheses[{ id, statement, confidence, evidenceIds }], questions[], recommendations[{ id, ruleId, title, area, reason, evidenceIds }], scenarioSteps[{ order, phase, text, actor, system, origin }] }), createdAt }
FeedbackEvent { id, briefId, recommendationId (set when the feedback targets one recommendation, null when it is about the brief as a whole), useful: bool, comment?, at }
