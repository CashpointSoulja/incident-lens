import json
import uuid

def make_id():
    return "id_" + uuid.uuid4().hex[:8]

fixtures = []

# Linear
lin_acc_id = make_id()
lin_evidences = [
    {"id": make_id(), "accountId": lin_acc_id, "claim": "Status page is explicitly powered by incident.io.", "url": "https://linearstatus.com/", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": lin_acc_id, "claim": "Published a detailed incident postmortem regarding a temporary data loss event caused by a database migration.", "url": "https://linear.app/now/linear-incident-on-jan-24th-2024", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": lin_acc_id, "claim": "Shared a public postmortem on a March 2026 security incident involving sync group access control bugs.", "url": "https://linear.app/now/linear-incident-on-mar-24th-2026", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": lin_acc_id, "claim": "Engineering blog discusses their architecture using Google Cloud Platform (GCP) and Cloud SQL for PostgreSQL.", "url": "https://cloud.google.com/blog/products/databases/product-workflow-tool-linear-uses-google-cloud-databases", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": lin_acc_id, "claim": "Engineering roles hire for Fullstack Typescript, Node, and GraphQL experience, indicating a small team of generalist engineers rather than dedicated SREs.", "url": "https://linear.app/careers/cd5ae036-0223-427a-b038-ba16ef9dcb32", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"}
]
lin_ev_ids = [e["id"] for e in lin_evidences]

lin_signals = [
    {"id": make_id(), "accountId": lin_acc_id, "label": "incident.io Status Page", "evidenceIds": [lin_ev_ids[0]], "strength": 5},
    {"id": make_id(), "accountId": lin_acc_id, "label": "GCP & PostgreSQL Stack", "evidenceIds": [lin_ev_ids[3]], "strength": 5},
    {"id": make_id(), "accountId": lin_acc_id, "label": "Generalist Fullstack Engineering", "evidenceIds": [lin_ev_ids[4]], "strength": 4},
    {"id": make_id(), "accountId": lin_acc_id, "label": "Transparent Incident Culture", "evidenceIds": [lin_ev_ids[1], lin_ev_ids[2]], "strength": 5}
]
lin_sig_ids = [s["id"] for s in lin_signals]

lin_hypotheses = [
    {"id": make_id(), "accountId": lin_acc_id, "statement": "Given their generalist fullstack team, they might experience high context-switching costs during on-call escalations.", "evidenceIds": [lin_ev_ids[4]], "status": "hypothesis"},
    {"id": make_id(), "accountId": lin_acc_id, "statement": "Since they actively write public postmortems, they might value automated timeline generation and export tools to save engineering time.", "evidenceIds": [lin_ev_ids[1], lin_ev_ids[2]], "status": "hypothesis"},
    {"id": make_id(), "accountId": lin_acc_id, "statement": "As an existing incident.io Status Page customer, they might be open to consolidating their on-call and response tools into a single platform.", "evidenceIds": [lin_ev_ids[0]], "status": "hypothesis"}
]

lin_steps = [
    {"order": 1, "phase": "alert", "text": "A high-latency alert triggers from Google Cloud SQL for PostgreSQL.", "personalizedFrom": [lin_sig_ids[1]]},
    {"order": 2, "phase": "routing", "text": "The alert is routed to the on-call Fullstack Engineer.", "personalizedFrom": [lin_sig_ids[2]]},
    {"order": 3, "phase": "investigation", "text": "The engineer queries the database cache and investigates the Node.js/GraphQL layer.", "personalizedFrom": [lin_sig_ids[2], lin_sig_ids[1]]},
    {"order": 4, "phase": "response", "text": "The team opens an incident channel and collaborates on a fix.", "personalizedFrom": []},
    {"order": 5, "phase": "customer-update", "text": "An update is posted directly to their incident.io powered status page.", "personalizedFrom": [lin_sig_ids[0]]},
    {"order": 6, "phase": "postmortem", "text": "The team exports the incident timeline to draft a comprehensive public postmortem for their engineering blog.", "personalizedFrom": [lin_sig_ids[3]]}
]

fixtures.append({
    "account": {"id": lin_acc_id, "domain": "linear.app", "name": "Linear", "industry": "Software", "createdAt": "2026-09-18T00:00:00Z", "alreadyCustomer": True},
    "evidences": lin_evidences,
    "signals": lin_signals,
    "hypotheses": lin_hypotheses,
    "scenarioSteps": lin_steps
})

# Monzo
mon_acc_id = make_id()
mon_evidences = [
    {"id": make_id(), "accountId": mon_acc_id, "claim": "Public status page is powered by Atlassian Statuspage.", "url": "https://monzo.statuspage.io/", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": mon_acc_id, "claim": "Engineers built an open-source tool called 'Response' to update status pages from Slack.", "url": "https://monzo.com/blog/2019/07/08/how-we-respond-to-incidents", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": mon_acc_id, "claim": "Platform team runs Kubernetes, Cassandra, Prometheus, Envoy, Kafka on AWS and GCP.", "url": "https://startup.jobs/platform-engineer-monzo-285094", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": mon_acc_id, "claim": "Engineering blog publishes detailed postmortems on incidents, like the July 2019 Cassandra scaling issue.", "url": "https://monzo.com/blog/2019/09/08/why-monzo-wasnt-working-on-july-29th", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": mon_acc_id, "claim": "Actively hiring Site Reliability Engineers / Platform Engineers who participate in on-call and manage cloud infrastructure.", "url": "https://builtin.com/job/senior-platform-engineer/10054050", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"}
]
mon_ev_ids = [e["id"] for e in mon_evidences]

mon_signals = [
    {"id": make_id(), "accountId": mon_acc_id, "label": "Atlassian Statuspage", "evidenceIds": [mon_ev_ids[0]], "strength": 5},
    {"id": make_id(), "accountId": mon_acc_id, "label": "In-House Custom Tooling (Response)", "evidenceIds": [mon_ev_ids[1]], "strength": 4},
    {"id": make_id(), "accountId": mon_acc_id, "label": "Kubernetes / AWS / GCP Stack", "evidenceIds": [mon_ev_ids[2]], "strength": 5},
    {"id": make_id(), "accountId": mon_acc_id, "label": "Dedicated SRE / Platform Team", "evidenceIds": [mon_ev_ids[4]], "strength": 5}
]
mon_sig_ids = [s["id"] for s in mon_signals]

mon_hypotheses = [
    {"id": make_id(), "accountId": mon_acc_id, "statement": "Having built an in-house Slack tool for status updates, they might be experiencing the maintenance burden of custom internal tooling.", "evidenceIds": [mon_ev_ids[1]], "status": "hypothesis"},
    {"id": make_id(), "accountId": mon_acc_id, "statement": "Given their complex multi-cloud and Kubernetes architecture, their SRE team might struggle with integrating disparate alerts into a unified response workflow.", "evidenceIds": [mon_ev_ids[2], mon_ev_ids[4]], "status": "hypothesis"},
    {"id": make_id(), "accountId": mon_acc_id, "statement": "Using Atlassian Statuspage might present limitations in seamless API orchestration compared to a fully integrated incident management platform.", "evidenceIds": [mon_ev_ids[0]], "status": "hypothesis"}
]

mon_steps = [
    {"order": 1, "phase": "alert", "text": "Prometheus detects high latency in the core Cassandra cluster.", "personalizedFrom": [mon_sig_ids[2]]},
    {"order": 2, "phase": "routing", "text": "The alert pages the on-call Platform Engineer.", "personalizedFrom": [mon_sig_ids[3]]},
    {"order": 3, "phase": "investigation", "text": "The engineer checks Kubernetes pod metrics and investigates the AWS instances.", "personalizedFrom": [mon_sig_ids[2]]},
    {"order": 4, "phase": "response", "text": "The team coordinates in Slack to scale the Cassandra cluster and mitigate impact.", "personalizedFrom": []},
    {"order": 5, "phase": "customer-update", "text": "They post an update to their Atlassian Statuspage via their internal 'Response' tool.", "personalizedFrom": [mon_sig_ids[0], mon_sig_ids[1]]},
    {"order": 6, "phase": "postmortem", "text": "A detailed postmortem is written explaining the database scaling issue for their public blog.", "personalizedFrom": []}
]

fixtures.append({
    "account": {"id": mon_acc_id, "domain": "monzo.com", "name": "Monzo", "industry": "Banking", "createdAt": "2026-09-18T00:00:00Z", "alreadyCustomer": False},
    "evidences": mon_evidences,
    "signals": mon_signals,
    "hypotheses": mon_hypotheses,
    "scenarioSteps": mon_steps
})


# Vercel
ver_acc_id = make_id()
ver_evidences = [
    {"id": make_id(), "accountId": ver_acc_id, "claim": "Status page is powered by Atlassian Statuspage, but incident.io's engineering blog confirms Vercel is a customer of incident.io.", "url": "https://incident.io/blog/how-we-built-status-pages", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": ver_acc_id, "claim": "Detailed postmortem published regarding a Next.js middleware bypass and CVE resolution.", "url": "https://vercel.com/blog/postmortem-on-next-js-middleware-bypass", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": ver_acc_id, "claim": "Postmortem describing a service disruption involving their Edge Middleware and global traffic routing.", "url": "https://vercel.com/blog/update-regarding-vercel-service-disruption-on-august-7-2024", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": ver_acc_id, "claim": "Hiring Site Reliability Engineers to manage their Compute infrastructure, focusing on Kubernetes, Linux, and AWS.", "url": "https://builtin.com/job/site-reliability-engineer-compute/3558696", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"},
    {"id": make_id(), "accountId": ver_acc_id, "claim": "Engineering blog detailed migrating the database behind builds to DynamoDB.", "url": "https://vercel.com/blog/how-we-migrated-the-database-behind-every-vercel-build", "observedAt": "2026-09-18", "confidence": "high", "kind": "observed"}
]
ver_ev_ids = [e["id"] for e in ver_evidences]

ver_signals = [
    {"id": make_id(), "accountId": ver_acc_id, "label": "incident.io Customer", "evidenceIds": [ver_ev_ids[0]], "strength": 5},
    {"id": make_id(), "accountId": ver_acc_id, "label": "AWS & DynamoDB Stack", "evidenceIds": [ver_ev_ids[3], ver_ev_ids[4]], "strength": 5},
    {"id": make_id(), "accountId": ver_acc_id, "label": "Edge Infrastructure & Global Routing", "evidenceIds": [ver_ev_ids[2]], "strength": 5},
    {"id": make_id(), "accountId": ver_acc_id, "label": "Mature SRE Practice", "evidenceIds": [ver_ev_ids[3]], "strength": 4}
]
ver_sig_ids = [s["id"] for s in ver_signals]

ver_hypotheses = [
    {"id": make_id(), "accountId": ver_acc_id, "statement": "Because they manage globally distributed edge infrastructure, they might need advanced incident routing to handle cascading failures across regions.", "evidenceIds": [ver_ev_ids[2], ver_ev_ids[3]], "status": "hypothesis"},
    {"id": make_id(), "accountId": ver_acc_id, "statement": "Since they already use incident.io internally, they could be a strong candidate to adopt On-call or other newly released capabilities.", "evidenceIds": [ver_ev_ids[0]], "status": "hypothesis"},
    {"id": make_id(), "accountId": ver_acc_id, "statement": "With highly publicized postmortems, they might value automated public communications to streamline their external incident reporting.", "evidenceIds": [ver_ev_ids[1], ver_ev_ids[2]], "status": "hypothesis"}
]

ver_steps = [
    {"order": 1, "phase": "alert", "text": "An alert triggers indicating high error rates on Edge Middleware invocations.", "personalizedFrom": [ver_sig_ids[2]]},
    {"order": 2, "phase": "routing", "text": "The incident.io platform pages the Compute SRE team on-call.", "personalizedFrom": [ver_sig_ids[3], ver_sig_ids[0]]},
    {"order": 3, "phase": "investigation", "text": "SREs investigate global traffic routing configurations and DynamoDB metrics on AWS.", "personalizedFrom": [ver_sig_ids[1], ver_sig_ids[2]]},
    {"order": 4, "phase": "response", "text": "The team implements a global failover to a secondary compute region.", "personalizedFrom": [ver_sig_ids[2]]},
    {"order": 5, "phase": "customer-update", "text": "A degraded performance notice is posted externally to notify users of Edge Middleware issues.", "personalizedFrom": []},
    {"order": 6, "phase": "postmortem", "text": "A deep-dive postmortem is published detailing the root cause of the edge routing failure.", "personalizedFrom": []}
]

fixtures.append({
    "account": {"id": ver_acc_id, "domain": "vercel.com", "name": "Vercel", "industry": "Cloud Computing", "createdAt": "2026-09-18T00:00:00Z", "alreadyCustomer": True},
    "evidences": ver_evidences,
    "signals": ver_signals,
    "hypotheses": ver_hypotheses,
    "scenarioSteps": ver_steps
})

with open("data/fixtures.json", "w") as f:
    json.dump({"fixtures": fixtures}, f, indent=2)

print("Linear evidences:", len(lin_evidences), "alreadyCustomer:", True)
print("Monzo evidences:", len(mon_evidences), "alreadyCustomer:", False)
print("Vercel evidences:", len(ver_evidences), "alreadyCustomer:", True)
