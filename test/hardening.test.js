import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, buildBundle, proseBlocks, isProseSentence, guardedLookup, guardedFetch } from '../live-research.js';
import { liveResearchEnabled } from '../server.js';

const publicLookup = async () => [{ address: '93.184.216.34' }];
const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

test('a redirect to a public host on a non-default port is not followed', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return url === 'https://acme.com/' ? new Response(null, { status: 302, headers: { location: 'https://acme.com:6379/' } }) : html('x');
  };
  assert.equal(await fetchPage('https://acme.com/', fetchImpl, publicLookup), null);
  assert.deepEqual(seen, ['https://acme.com/']);
});

test('a redirect to a URL carrying credentials is not followed', async () => {
  const fetchImpl = async (url) => (url === 'https://acme.com/' ? new Response(null, { status: 301, headers: { location: 'https://user:pw@acme.com/' } }) : html('x'));
  assert.equal(await fetchPage('https://acme.com/', fetchImpl, publicLookup), null);
});

test('every hop is re-validated: the third hop of a chain that turns private is refused', async () => {
  const seen = [];
  const lookupImpl = async (host) => [{ address: host === 'evil.example' ? '10.0.0.5' : '93.184.216.34' }];
  const chain = { 'https://acme.com/': 'https://www.acme.com/', 'https://www.acme.com/': 'https://cdn.acme.com/', 'https://cdn.acme.com/': 'https://evil.example/' };
  const fetchImpl = async (url) => { seen.push(url); return chain[url] ? new Response(null, { status: 307, headers: { location: chain[url] } }) : html('secret'); };
  assert.equal(await fetchPage('https://acme.com/', fetchImpl, lookupImpl), null);
  assert.ok(!seen.includes('https://evil.example/'));
});

test('connect-time lookup refuses loopback, so DNS rebinding cannot reach it', async () => {
  const error = await new Promise((resolve) => guardedLookup('localhost', {}, (err) => resolve(err)));
  assert.equal(error?.code, 'EBLOCKED');
  await assert.rejects(guardedFetch('http://localhost:9/'), (err) => err.code === 'EBLOCKED');
});

test('prose blocks drop navigation, headers and footers', () => {
  const blocks = proseBlocks('<header>Products Pricing</header><nav><a>Kubernetes</a></nav><main><p>We run every service on Kubernetes across three regions.</p></main><footer>Kubernetes jobs</footer>');
  assert.deepEqual(blocks, ['We run every service on Kubernetes across three regions.']);
});

test('only real prose sentences can be quoted', () => {
  assert.ok(isProseSentence('We run every service on Kubernetes across three regions.'));
  assert.equal(isProseSentence('Nils Pommerien Director, SRE, Airbnb Slack Scribe Workflows Catalog Status Pages'), false);
  assert.equal(isProseSentence('Kubernetes.'), false);
  assert.equal(isProseSentence('Get A Demo Get Started For Free With Kubernetes Today.'), false);
});

const page = (url, text, blocks) => ({ url, status: 200, type: 'text/html', body: text, title: 'Acme', description: '', text, blocks });

test('a mention without a quotable sentence is a plain mention, never a stitched quote', () => {
  const text = 'Home Pricing Kubernetes Datadog Login Acme builds widgets.';
  const bundle = buildBundle({ domain: 'acme.com', pages: [page('https://acme.com/', text, ['Home', 'Pricing Kubernetes Datadog Login', 'Acme builds widgets.'])], pagesChecked: 1, capturedAt: '2026-01-05T10:00:00.000Z' });
  const k8s = bundle.evidences.find((e) => e.claim.startsWith('Kubernetes'));
  assert.equal(k8s.claim, 'Kubernetes is mentioned on this public page.');
});

test('every observed card cites a page that was read, quotes appear verbatim, every inference cites evidence', () => {
  const text = 'Acme runs on Kubernetes across three regions, with Datadog dashboards for every team. Our SRE team owns on-call for the platform today.';
  const bundle = buildBundle({ domain: 'acme.com', pages: [page('https://acme.com/', text, [text])], pagesChecked: 1, capturedAt: '2026-01-05T10:00:00.000Z' });
  const urls = new Set(['https://acme.com/']);
  for (const e of bundle.evidences) {
    assert.equal(e.kind, 'observed');
    assert.ok(urls.has(e.url));
    const quote = e.claim.match(/“([^”]*?)(?:…)?”/);
    if (quote) assert.ok(text.includes(quote[1]), `quote must be verbatim: ${quote[1]}`);
  }
  const ids = new Set(bundle.evidences.map((e) => e.id));
  for (const h of bundle.hypotheses) {
    assert.equal(h.kind, 'inferred');
    assert.equal(h.status, 'hypothesis');
    assert.ok(h.evidenceIds.length && h.evidenceIds.every((id) => ids.has(id)));
  }
  for (const step of bundle.scenarioSteps) assert.equal(step.origin, step.personalizedFrom.length ? 'evidence' : 'hypothesis');
});

test('HTML entities in quoted text are decoded', () => {
  const blocks = proseBlocks('<p>We&#x27;ve rebuilt our incident response process from scratch.</p>');
  assert.deepEqual(blocks, ["We've rebuilt our incident response process from scratch."]);
});

test('live lookup is on by default and LIVE_RESEARCH_ENABLED=0 switches it off', () => {
  assert.equal(liveResearchEnabled({}), true);
  assert.equal(liveResearchEnabled({ LIVE_RESEARCH_ENABLED: '1' }), true);
  assert.equal(liveResearchEnabled({ LIVE_RESEARCH_ENABLED: '0' }), false);
  assert.equal(liveResearchEnabled({ LIVE_RESEARCH_ENABLED: 'off' }), false);
});
