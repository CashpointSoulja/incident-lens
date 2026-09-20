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
/* Any address that is not a public unicast destination, across both families.
 * IPv6 matters as much as IPv4 here: a redirect that resolves to ::1, to a
 * link-local fe80:: address, or to an IPv4-mapped form such as ::ffff:127.0.0.1
 * reaches exactly the same internal services as 127.0.0.1 does, so mapped and
 * compatible forms are decoded and re-checked as IPv4. */
function isPrivateIpv4(ip) {
  return /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(ip)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(ip)
    || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
}
export function isPrivateIp(address) {
  const ip = String(address).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!ip) return true;
  if (!ip.includes(':')) return isPrivateIpv4(ip);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms.
  const embedded = ip.match(/^(?:::ffff:0*:?|::)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) return isPrivateIpv4(embedded[1]);
  // The same mapped addresses written as hex (::ffff:7f00:1).
  const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const n = (parseInt(hexMapped[1], 16) * 65536) + parseInt(hexMapped[2], 16);
    return isPrivateIpv4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  if (/^(?:0:){7}0$/.test(ip) || ip === '::' || ip === '::1' || /^(?:0:){7}1$/.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7 unique-local
  return false;
}
/* Host/domain matching is exact or on a real subdomain boundary - never a
 * substring. "notacme.com" is a different company from "acme.com"; only
 * "acme.com" itself and hosts ending in ".acme.com" belong to it. Every place
 * that ties a page to the target domain routes through these two helpers. */
function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}
function hostMatchesDomain(host, domain) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}
function hostOf(url) {
  try { return normalizeHost(new URL(url).hostname); } catch { return ''; }
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
// `lookupImpl` is injectable so the public-host guard can be exercised without
// depending on live DNS; production always uses node's resolver.
async function assertPublicHost(host, lookupImpl = lookup) {
  const rows = await lookupImpl(host, { all: true, verbatim: true });
  if (!rows.length || rows.some((row) => isPrivateIp(row.address))) throw new Error('That domain does not resolve to a public website.');
}
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// A public-host check on the first URL proves nothing about where a redirect
// lands, so every hop is re-checked with the same guard: the protocol must stay
// http(s) and the new host must still resolve to a public address. A hop that
// fails is not followed at all, so a redirect can never smuggle a loopback or
// private-network destination into the evidence.
async function assertFetchableUrl(url, lookupImpl) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported URL protocol.');
  await assertPublicHost(parsed.hostname, lookupImpl);
  return parsed;
}

// Read at most MAX_BYTES *off the wire* and then stop pulling, so an endless or
// hostile response is never buffered in full before being truncated. The budget
// is spent in bytes received, never in decoded characters: multibyte text (CJK,
// emoji) costs 3-4 bytes per character, so a character-based cap would have let
// a 700kB budget accept megabytes. Raw chunks are accumulated and measured
// before decoding, the response is cancelled the moment the byte total reaches
// the cap, and only the accepted bytes are decoded. Falls back to text() only
// when the response exposes no readable stream (test doubles).
// `stream: true` without a final flush drops a trailing partial sequence left by
// cutting at an exact byte boundary, so the decoded text never grows past the
// cap with a replacement character.
function decodeCapped(bytes) {
  return new TextDecoder('utf-8').decode(bytes.subarray(0, MAX_BYTES), { stream: true });
}
async function readCapped(res) {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') return decodeCapped(Buffer.from(String(await res.text()), 'utf-8'));
  const reader = body.getReader();
  const chunks = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : Buffer.from(String(value), 'utf-8');
      const remaining = MAX_BYTES - received;
      if (chunk.length >= remaining) { chunks.push(chunk.subarray(0, remaining)); received = MAX_BYTES; break; }
      chunks.push(chunk);
      received += chunk.length;
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return decodeCapped(Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.length)), received));
}

export async function fetchPage(url, fetchImpl = fetch, lookupImpl = lookup) {
  try { await assertFetchableUrl(url, lookupImpl); } catch { return null; } // unresolvable, non-public or unsupported: treat as an absent page, never abort the whole lookup
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // 'manual' so this loop - not undici - decides whether a hop is allowed.
      const res = await fetchImpl(current, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.8' } });
      const location = res.headers.get('location');
      if (REDIRECT_STATUSES.has(res.status) && location) {
        if (hop === MAX_REDIRECTS) return null; // redirect chain too long: give up rather than keep following
        const next = new URL(location, current).toString();
        try { await assertFetchableUrl(next, lookupImpl); } catch { return null; } // redirect destination fails the public-host guard
        current = next;
        continue;
      }
      const type = res.headers.get('content-type') || '';
      if (!res.ok || (!type.includes('text/html') && !type.includes('application/json'))) return null;
      const body = await readCapped(res);
      return { url: res.url || current, status: res.status, type, body, title: titleFromHtml(body), description: metaDescription(body), text: stripHtml(body).slice(0, 40_000) };
    }
    return null;
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
/* A status page is recognized by an exact pattern, never by the word "status"
 * appearing somewhere in a URL. Qualifying shapes:
 *   - the `status` subdomain of the company (status.acme.com), or of any host
 *     when no domain is supplied;
 *   - a known hosted status-page vendor (statuspage.io, statusgator.com);
 *   - a `/status` path at the root of the company's own site.
 * A design studio called "Status Quo" at statusquo.example, or a marketing page
 * at /about/status-of-the-industry, is not a status page. */
export function isStatusPageUrl(url, domain) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const host = normalizeHost(parsed.hostname);
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  const base = domain ? normalizeHost(domain) : '';
  if (hostMatchesDomain(host, 'statuspage.io') || hostMatchesDomain(host, 'statusgator.com')) return true;
  if (base ? host === `status.${base}` : /^status\./.test(host)) return true;
  if (path === '/status' && (base ? host === base : true)) return true;
  return false;
}

// Evidence carries the kind of public page it came from, so downstream copy can
// say what was actually read instead of treating every URL the same.
export function sourceTypeForUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return 'other'; }
  const host = normalizeHost(parsed.hostname);
  const path = parsed.pathname.toLowerCase();
  if (hostMatchesDomain(host, 'github.com') || hostMatchesDomain(host, 'github.io')) return 'github';
  if (isStatusPageUrl(url)) return 'status-page';
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
/* A page is attributable to this prospect when it is on their own domain (or a
 * subdomain of it). Off-domain candidates are guesses - `github.com/<label>` is
 * assembled from the domain label, so it may well belong to a different project
 * entirely - and are only attributable when the page itself names the domain.
 * A guess that fails this check is excluded from every extraction, not just from
 * the presence card: an unrelated GitHub profile must never supply "observed"
 * technology evidence for this account. */
function isAttributable(page, domain) {
  const base = normalizeHost(domain);
  if (hostMatchesDomain(hostOf(page.url), base)) return true;
  // A substring search would accept "notacme.com" as a mention of "acme.com",
  // so every host-shaped token in the text is extracted and matched on the same
  // exact/subdomain boundary as a URL host.
  const mentions = String(page.text || '').toLowerCase().match(/(?:[a-z0-9-]+\.)+[a-z]{2,63}/g) || [];
  return mentions.some((candidate) => hostMatchesDomain(normalizeHost(candidate), base));
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
  // The id is scoped to the account: two companies whose captures generate the
  // same sentence are still two distinct hypotheses.
  const add = (statement, signal) => out.push({ id: stableId('hyp', `${accountId}|${statement}`), accountId, statement, evidenceIds: signal.evidenceIds, signalIds: [signal.id], status: 'hypothesis', confidence: 0.5, kind: 'inferred' });
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
  // capabilityId names the incident.io capability proposed for that moment, kept
  // separate from `system` (what they appear to use today) - the same
  // relationship the curated fixtures carry.
  return [
    step({ order: 1, phase: 'alert', text: `A production service starts returning elevated errors in ${named(['kubernetes', 'aws', 'google cloud', 'azure'], 'whatever runs their production services')}.`, personalizedFrom: from(infra), actor: 'system', system: label(['kubernetes', 'aws', 'google cloud', 'azure'], 'unknown - not established publicly'), capabilityId: 'cap-oncall-3' }),
    step({ order: 2, phase: 'routing', text: 'The alert is routed to the responsible on-call owner.', personalizedFrom: [], actor: 'incident.io', system: 'incident.io On-call', capabilityId: 'cap-oncall-1' }),
    step({ order: 3, phase: 'investigation', text: `The responder checks ${named(['datadog', 'grafana', 'prometheus'], 'whatever telemetry they have')}, narrowing the blast radius.`, personalizedFrom: from(obs), actor: 'prospect', system: label(['datadog', 'grafana', 'prometheus'], 'unknown - not established publicly'), capabilityId: 'cap-inv-2' }),
    step({ order: 4, phase: 'response', text: `The team mitigates the affected service${db ? ` and checks ${db.label}, also mentioned on their public pages` : ''}.`, personalizedFrom: from(db), actor: 'prospect', system: db ? db.label : 'the affected service', capabilityId: 'cap-resp-1' }),
    step({ order: 5, phase: 'customer-update', text: 'A customer update is drafted from the confirmed incident timeline.', personalizedFrom: [], actor: 'prospect', system: 'incident.io Status Pages', capabilityId: 'cap-stat-2' }),
    step({ order: 6, phase: 'postmortem', text: 'The team reviews the timeline and records follow-up actions.', personalizedFrom: [], actor: 'prospect', system: 'incident.io Response', capabilityId: 'cap-resp-4' }),
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
async function capturePages(domain, { fetchImpl = fetch, lookupImpl = lookup, capturedAt } = {}) {
  const home = await fetchPage(`https://${domain}/`, fetchImpl, lookupImpl) || await fetchPage(`http://${domain}/`, fetchImpl, lookupImpl);
  if (!home) throw new Error('The company website could not be read. Try its root domain or use a preloaded prospect.');
  const candidates = [
    `https://status.${domain}/`, `https://${domain}/status`, `https://${domain}/engineering`, `https://${domain}/blog`,
    `https://${domain}/careers`, `https://${domain}/jobs`, `https://${domain}/company/careers`, `https://github.com/${domain.split('.')[0]}`,
  ];
  const settled = await Promise.all(candidates.map((url) => fetchPage(url, fetchImpl, lookupImpl)));
  const pages = [home, ...settled.filter(Boolean)].filter((page, i, all) => all.findIndex((x) => x.url === page.url) === i);
  return { domain, pages, pagesChecked: candidates.length + 1, capturedAt };
}

export function buildBundle({ domain, pages, pagesChecked, capturedAt }) {
  const observedAt = String(capturedAt).slice(0, 10);
  const accountId = stableId('live', domain);
  const home = pages[0];
  const name = companyName(domain, home);
  // Nothing a public-page capture reads establishes whether this company is an
  // incident.io customer, so the field stays null (unknown) rather than being
  // exported as a confident "not a customer".
  const account = { id: accountId, domain, name, industry: null, createdAt: `${observedAt}T00:00:00Z`, alreadyCustomer: null, live: true };
  const evidences = [pageEvidence(accountId, home, `${name}'s public website was read successfully${home.description ? `: “${home.description}”` : '.'}`, observedAt)];
  // Only attributable pages may produce evidence of any kind for this account.
  const owned = pages.filter((p) => isAttributable(p, domain));
  const statusPage = owned.find((p) => isStatusPageUrl(p.url, domain) && /status|uptime|incident|operational/i.test(`${p.title} ${p.text.slice(0, 1500)}`));
  if (statusPage) evidences.push(pageEvidence(accountId, statusPage, `A public status page was found${statusPage.title ? `: “${statusPage.title}”` : '.'}`, observedAt));
  const careersPage = owned.find((p) => /career|jobs/i.test(new URL(p.url).pathname) && /career|job|join|role|vacanc/i.test(p.text.slice(0, 5000)));
  if (careersPage) evidences.push(pageEvidence(accountId, careersPage, `A public careers or jobs page was found${careersPage.title ? `: “${careersPage.title}”` : '.'}`, observedAt));
  const engineeringPage = owned.find((p) => /engineering|blog/i.test(new URL(p.url).pathname) && /engineer|technical|developer|infrastructure/i.test(p.text.slice(0, 7000)));
  if (engineeringPage) evidences.push(pageEvidence(accountId, engineeringPage, `A public engineering or technical page was found${engineeringPage.title ? `: “${engineeringPage.title}”` : '.'}`, observedAt));
  // `owned` already required exact-host or true-subdomain association, so a
  // GitHub page only earns the "linked to <domain>" claim when the page itself
  // names this domain (not a lookalike such as notacme.com).
  const githubPage = owned.find((p) => hostMatchesDomain(hostOf(p.url), 'github.com'));
  if (githubPage) evidences.push(pageEvidence(accountId, githubPage, `A public GitHub presence linked to ${domain} was found${githubPage.title ? `: “${githubPage.title}”` : '.'}`, observedAt));
  const discovered = findTechSignals(owned, accountId, observedAt);
  evidences.push(...discovered.evidence);
  const signals = discovered.signals;
  if (statusPage) signals.unshift({ id: stableId('sig', `${accountId}|Public status page`), accountId, label: 'Public status page', evidenceIds: [evidences.find((e) => e.url === statusPage.url).id], strength: 5 });
  const hypotheses = makeHypotheses(accountId, signals);
  return { account, evidences, signals, hypotheses, scenarioSteps: makeScenario(signals), research: { live: true, pagesChecked, pagesRead: pages.length, observedAt, capturedAt } };
}

// `now` is the explicit capture timestamp (Date or ISO string); it is read
// once here and then only ever passed through, never re-read downstream.
export async function researchDomain(input, { fetchImpl = fetch, lookupImpl = lookup, now = new Date() } = {}) {
  const domain = normalizeDomain(input);
  const capturedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return buildBundle(await capturePages(domain, { fetchImpl, lookupImpl, capturedAt }));
}
