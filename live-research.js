import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';

const UA = 'IncidentLens/1.0 (+https://github.com/CashpointSoulja/incident-lens)';
const TIMEOUT_MS = 6500;
const MAX_BYTES = 700_000;

function compact(value = '') { return String(value).replace(/\s+/g, ' ').trim(); }
function stripHtml(html = '') {
  return compact(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' '));
}
function titleFromHtml(html = '') {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 180) : '';
}
function metaDescription(html = '') {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) { const m = String(html).match(re); if (m) return compact(m[1]).slice(0, 320); }
  return '';
}
function stableId(prefix, value) { return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 10)}`; }
function isPrivateIp(ip) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|::1$|fc|fd)/i.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}
export function normalizeDomain(input) {
  const raw = compact(input).toLowerCase();
  if (!raw || raw.length > 253) throw new Error('Enter a company domain, such as acme.com.');
  let parsed;
  try { parsed = new URL(raw.includes('://') ? raw : `https://${raw}`); } catch { throw new Error('That does not look like a valid domain.'); }
  const host = parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) throw new Error('Enter a public company domain, such as acme.com.');
  return host;
}
async function assertPublicHost(host) {
  const rows = await lookup(host, { all: true, verbatim: true });
  if (!rows.length || rows.some((row) => isPrivateIp(row.address))) throw new Error('That domain does not resolve to a public website.');
}
async function fetchPage(url, fetchImpl = fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported URL protocol.');
  try { await assertPublicHost(parsed.hostname); } catch { return null; } // unresolvable or non-public host: treat as an absent page, never abort the whole lookup
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.8' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || (!type.includes('text/html') && !type.includes('application/json'))) return null;
    const body = (await res.text()).slice(0, MAX_BYTES);
    return { url: res.url || url, status: res.status, type, body, title: titleFromHtml(body), description: metaDescription(body), text: stripHtml(body).slice(0, 40_000) };
  } catch { return null; } finally { clearTimeout(timer); }
}
function companyName(domain, home) {
  const domainLabel = domain.split('.')[0];
  const parts = (home?.title || '').split(/\s[|—–-]\s/).map((part) => part.trim()).filter(Boolean);
  const branded = parts.find((part) => part.toLowerCase().includes(domainLabel) && part.length <= 60);
  if (branded) return branded;
  const short = parts.find((part) => part.length >= 2 && part.length <= 40 && !/^(home|welcome)$/i.test(part));
  if (short && parts.length === 1) return short;
  return domainLabel.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
// Evidence carries the kind of public page it came from, so downstream copy can
// say what was actually read instead of treating every URL the same.
export function sourceTypeForUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return 'other'; }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (host === 'github.com' || host.endsWith('.github.com') || host.endsWith('github.io')) return 'github';
  if (host.startsWith('status.') || host.includes('statuspage.io') || host.includes('statusgator') || /(^|\/)status(\/|$)/.test(path)) return 'status-page';
  if (/career|jobs?(\/|$)|vacanc/.test(path) || host.includes('jobs')) return 'careers';
  if (/engineering|infrastructure|platform/.test(path)) return 'engineering';
  if (/blog|post|article|news/.test(path)) return 'blog';
  if (path === '' || path === '/') return 'homepage';
  return 'other';
}
function pageEvidence(accountId, page, claim, observedAt, confidence = 'high') {
  return {
    id: stableId('ev', `${page.url}|${claim}`),
    accountId,
    claim,
    url: page.url,
    sourceTitle: page.title || '',
    sourceType: sourceTypeForUrl(page.url),
    observedAt,
    confidence,
    kind: 'observed',
  };
}
function findTechSignals(pages, accountId, observedAt) {
  const patterns = [
    ['Kubernetes', /\bkubernetes\b|\bk8s\b/i], ['AWS', /\baws\b|amazon web services/i], ['Google Cloud', /\bgcp\b|google cloud/i],
    ['Azure', /\bazure\b/i], ['Terraform', /\bterraform\b/i], ['Datadog', /\bdatadog\b/i], ['PagerDuty', /\bpagerduty\b/i],
    ['Grafana', /\bgrafana\b/i], ['Prometheus', /\bprometheus\b/i], ['PostgreSQL', /\bpostgres(?:ql)?\b/i], ['Redis', /\bredis\b/i],
    ['SRE / platform team', /site reliability|\bsre\b|platform engineer/i], ['On-call practice', /on[- ]call/i], ['Incident response', /incident (?:management|response)/i],
  ];
  const evidence = [], signals = [];
  for (const [label, re] of patterns) {
    const page = pages.find((p) => re.test(p.text));
    if (!page) continue;
    const sentences = page.text.split(/(?<=[.!?])\s+/);
    const sentence = sentences.find((s) => re.test(s) && s.length >= 25 && s.length <= 300);
    const claim = sentence ? `${label} is mentioned publicly: “${sentence.slice(0, 220)}${sentence.length > 220 ? '…' : ''}”` : `${label} is mentioned on this public page.`;
    const ev = pageEvidence(accountId, page, claim, observedAt, 'medium');
    evidence.push(ev);
    signals.push({ id: stableId('sig', `${accountId}|${label}`), accountId, label, evidenceIds: [ev.id], strength: 3 });
    if (signals.length >= 6) break;
  }
  return { evidence, signals };
}
function makeHypotheses(accountId, signals) {
  const out = [];
  const add = (statement, signal) => out.push({ id: stableId('hyp', statement), accountId, statement, evidenceIds: signal.evidenceIds, signalIds: [signal.id], status: 'hypothesis', confidence: 0.5, kind: 'inferred' });
  const find = (...words) => signals.find((s) => words.some((w) => s.label.toLowerCase().includes(w)));
  const oncall = find('on-call', 'incident response', 'sre');
  const infra = find('kubernetes', 'aws', 'google cloud', 'azure', 'terraform');
  const observ = find('datadog', 'grafana', 'prometheus');
  if (oncall) add(`Because ${oncall.label} appears in public material, the team might have a repeatable incident-response workflow worth mapping before proposing changes.`, oncall);
  if (infra) add(`A stack that mentions ${infra.label} could make ownership and blast-radius context important during an incident.`, infra);
  if (observ) add(`The public mention of ${observ.label} suggests an observability workflow that could connect to incident investigation, but the current process is unknown.`, observ);
  while (out.length < 3 && signals[out.length]) add(`The ${signals[out.length].label} signal may be relevant to reliability work, but a discovery call should confirm how it is used.`, signals[out.length]);
  return out.slice(0, 3);
}
function makeScenario(signals) {
  const label = (terms, fallback) => signals.find((s) => terms.some((t) => s.label.toLowerCase().includes(t)))?.label || fallback;
  const sig = (terms) => signals.find((s) => terms.some((t) => s.label.toLowerCase().includes(t)));
  // A live signal only proves a term was mentioned publicly, so a personalized
  // step names the system and says where that name came from; it never asserts
  // that the company runs it.
  const named = (terms, fallback) => {
    const found = sig(terms);
    return found ? `${found.label}, which their public pages mention` : fallback;
  };
  const infra = sig(['kubernetes', 'aws', 'google cloud', 'azure', 'terraform']);
  const obs = sig(['datadog', 'grafana', 'prometheus']);
  const db = sig(['postgres', 'redis']);
  const from = (s) => s ? [s.id] : [];
  // A step's origin is `evidence` only when it is personalized from a signal
  // that public evidence actually supports; everything else is a hypothesis.
  const step = (spec) => ({ ...spec, origin: spec.personalizedFrom.length ? 'evidence' : 'hypothesis' });
  return [
    step({ order: 1, phase: 'alert', text: `A production service starts returning elevated errors in ${named(['kubernetes', 'aws', 'google cloud', 'azure'], 'whatever runs their production services')}.`, personalizedFrom: from(infra), actor: 'system', system: label(['kubernetes', 'aws', 'google cloud', 'azure'], 'unknown - not established publicly') }),
    step({ order: 2, phase: 'routing', text: 'The alert is routed to the responsible on-call owner.', personalizedFrom: [], actor: 'incident.io', system: 'incident.io On-call' }),
    step({ order: 3, phase: 'investigation', text: `The responder checks ${named(['datadog', 'grafana', 'prometheus'], 'whatever telemetry they have')}, narrowing the blast radius.`, personalizedFrom: from(obs), actor: 'prospect', system: label(['datadog', 'grafana', 'prometheus'], 'unknown - not established publicly') }),
    step({ order: 4, phase: 'response', text: `The team mitigates the affected service${db ? ` and checks ${db.label}, also mentioned on their public pages` : ''}.`, personalizedFrom: from(db), actor: 'prospect', system: db ? db.label : 'the affected service' }),
    step({ order: 5, phase: 'customer-update', text: 'A customer update is drafted from the confirmed incident timeline.', personalizedFrom: [], actor: 'prospect', system: 'incident.io Status Pages' }),
    step({ order: 6, phase: 'postmortem', text: 'The team reviews the timeline and records follow-up actions.', personalizedFrom: [], actor: 'prospect', system: 'incident.io Response' }),
  ];
}
/* Capture / transform boundary ---------------------------------------------
 * capturePages() is the only impure step: it is the single place that touches
 * the network. It returns the raw captured pages plus the capture timestamp
 * that was handed to it.
 * buildBundle() is pure: (captured pages + capturedAt) -> bundle. It never
 * reads the clock and never fetches, so replaying a stored capture with its
 * original capturedAt always reproduces byte-identical output. Every internal
 * step (findTechSignals, makeHypotheses, makeScenario) already takes its pages
 * and its timestamp as arguments for the same reason.
 * researchDomain() just wires the two together, so external behaviour is
 * unchanged.
 * ------------------------------------------------------------------------- */
async function capturePages(domain, { fetchImpl = fetch, capturedAt } = {}) {
  const home = await fetchPage(`https://${domain}/`, fetchImpl) || await fetchPage(`http://${domain}/`, fetchImpl);
  if (!home) throw new Error('The company website could not be read. Try its root domain or use a preloaded prospect.');
  const candidates = [
    `https://status.${domain}/`, `https://${domain}/status`, `https://${domain}/engineering`, `https://${domain}/blog`,
    `https://${domain}/careers`, `https://${domain}/jobs`, `https://${domain}/company/careers`, `https://github.com/${domain.split('.')[0]}`,
  ];
  const settled = await Promise.all(candidates.map((url) => fetchPage(url, fetchImpl)));
  const pages = [home, ...settled.filter(Boolean)].filter((page, i, all) => all.findIndex((x) => x.url === page.url) === i);
  return { domain, pages, pagesChecked: candidates.length + 1, capturedAt };
}

export function buildBundle({ domain, pages, pagesChecked, capturedAt }) {
  const observedAt = String(capturedAt).slice(0, 10);
  const accountId = stableId('live', domain);
  const home = pages[0];
  const name = companyName(domain, home);
  const account = { id: accountId, domain, name, industry: null, createdAt: `${observedAt}T00:00:00Z`, alreadyCustomer: false, live: true };
  const evidences = [pageEvidence(accountId, home, `${name}'s public website was read successfully${home.description ? `: “${home.description}”` : '.'}`, observedAt)];
  const statusPage = pages.find((p) => /status/i.test(new URL(p.url).hostname + new URL(p.url).pathname) && /status|uptime|incident|operational/i.test(`${p.title} ${p.text.slice(0, 1500)}`));
  if (statusPage) evidences.push(pageEvidence(accountId, statusPage, `A public status page was found${statusPage.title ? `: “${statusPage.title}”` : '.'}`, observedAt));
  const careersPage = pages.find((p) => /career|jobs/i.test(new URL(p.url).pathname) && /career|job|join|role|vacanc/i.test(p.text.slice(0, 5000)));
  if (careersPage) evidences.push(pageEvidence(accountId, careersPage, `A public careers or jobs page was found${careersPage.title ? `: “${careersPage.title}”` : '.'}`, observedAt));
  const engineeringPage = pages.find((p) => /engineering|blog/i.test(new URL(p.url).pathname) && /engineer|technical|developer|infrastructure/i.test(p.text.slice(0, 7000)));
  if (engineeringPage) evidences.push(pageEvidence(accountId, engineeringPage, `A public engineering or technical page was found${engineeringPage.title ? `: “${engineeringPage.title}”` : '.'}`, observedAt));
  const githubPage = pages.find((p) => new URL(p.url).hostname === 'github.com' && p.text.toLowerCase().includes(domain.toLowerCase()));
  if (githubPage) evidences.push(pageEvidence(accountId, githubPage, `A public GitHub presence linked to ${domain} was found${githubPage.title ? `: “${githubPage.title}”` : '.'}`, observedAt));
  const discovered = findTechSignals(pages, accountId, observedAt);
  evidences.push(...discovered.evidence);
  const signals = discovered.signals;
  if (statusPage) signals.unshift({ id: stableId('sig', `${accountId}|Public status page`), accountId, label: 'Public status page', evidenceIds: [evidences.find((e) => e.url === statusPage.url).id], strength: 5 });
  const hypotheses = makeHypotheses(accountId, signals);
  return { account, evidences, signals, hypotheses, scenarioSteps: makeScenario(signals), research: { live: true, pagesChecked, pagesRead: pages.length, observedAt, capturedAt } };
}

// `now` is the explicit capture timestamp (Date or ISO string); it is read
// once here and then only ever passed through, never re-read downstream.
export async function researchDomain(input, { fetchImpl = fetch, now = new Date() } = {}) {
  const domain = normalizeDomain(input);
  const capturedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return buildBundle(await capturePages(domain, { fetchImpl, capturedAt }));
}
