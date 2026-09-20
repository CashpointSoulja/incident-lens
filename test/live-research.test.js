import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, isStatusPageUrl, sourceTypeForUrl, fetchPage, buildBundle, researchDomain } from '../live-research.js';

// No test in this file touches the network or DNS: `fetchImpl` and `lookupImpl`
// are both injected, so the guards can be exercised deterministically.
const publicLookup = async (host) => [{ address: /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || host === 'localhost' ? (host === 'localhost' ? '127.0.0.1' : host) : '93.184.216.34' }];

function htmlResponse(body, headers = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });
}
function redirectResponse(location, status = 302) {
  return new Response('', { status, headers: { location } });
}
function page(url, text, title = '') {
  return { url, status: 200, type: 'text/html', body: text, title, description: '', text };
}

test('normalizes a public-looking company URL to its domain', () => {
  assert.equal(normalizeDomain('https://www.Example.com/path'), 'example.com');
  assert.equal(normalizeDomain('incident.io'), 'incident.io');
});

test('rejects hosts that are not public company domains', () => {
  for (const value of ['', 'localhost', '127.0.0.1', 'file:///tmp/x']) {
    assert.throws(() => normalizeDomain(value));
  }
});

test('a redirect to a private host is not followed and yields no page', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url === 'https://acme.com/') return redirectResponse('http://127.0.0.1:8080/admin');
    return htmlResponse('<title>internal</title>should never be read');
  };
  assert.equal(await fetchPage('https://acme.com/', fetchImpl, publicLookup), null);
  assert.deepEqual(seen, ['https://acme.com/'], 'the private destination must never be requested');
});

test('a redirect chain to public hosts is followed, and an endless one gives up', async () => {
  const fetchImpl = async (url) => (url === 'https://acme.com/'
    ? redirectResponse('https://www.acme.com/home')
    : htmlResponse('<title>Acme</title><p>Acme runs on Kubernetes.</p>'));
  const hopped = await fetchPage('https://acme.com/', fetchImpl, publicLookup);
  assert.equal(hopped.url, 'https://www.acme.com/home');
  assert.match(hopped.text, /Kubernetes/);

  let hops = 0;
  const loop = async () => { hops += 1; return redirectResponse(`https://acme.com/hop${hops}`); };
  assert.equal(await fetchPage('https://acme.com/', loop, publicLookup), null);
  assert.ok(hops <= 6, `redirect hops must be capped, saw ${hops}`);
});

test('a status page is an exact pattern, never the word "status" somewhere in a URL', () => {
  assert.ok(isStatusPageUrl('https://status.acme.com/', 'acme.com'));
  assert.ok(isStatusPageUrl('https://acme.com/status', 'acme.com'));
  assert.ok(isStatusPageUrl('https://acme.statuspage.io/'));
  assert.equal(isStatusPageUrl('https://statusquo.design/', 'statusquo.design'), false);
  assert.equal(isStatusPageUrl('https://acme.com/about/status-of-the-industry', 'acme.com'), false);
  assert.equal(isStatusPageUrl('https://status.other.com/', 'acme.com'), false, 'another company\'s status page is not theirs');
  assert.equal(sourceTypeForUrl('https://statusquo.design/'), 'homepage');
  assert.equal(sourceTypeForUrl('https://status.acme.com/'), 'status-page');
});

test('an unrelated GitHub profile supplies no evidence and no technology signal', () => {
  const bundle = buildBundle({
    domain: 'acme.com',
    pages: [
      page('https://acme.com/', 'Acme builds widgets.', 'Acme'),
      page('https://github.com/acme', 'Unrelated project. We run Kubernetes and Datadog at scale.', 'acme'),
    ],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  const urls = bundle.evidences.map((e) => e.url);
  assert.deepEqual(urls, ['https://acme.com/'], 'only the attributable page may produce evidence');
  assert.deepEqual(bundle.signals, [], 'a page that fails domain association contributes no signals');

  const linked = buildBundle({
    domain: 'acme.com',
    pages: [
      page('https://acme.com/', 'Acme builds widgets.', 'Acme'),
      page('https://github.com/acme', 'Open source from the team at acme.com. We run Kubernetes.', 'acme'),
    ],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  assert.ok(linked.signals.some((s) => s.label === 'Kubernetes'), 'a GitHub page that names the domain is attributable');
});

test('a page merely named "status" does not become a status-page claim', () => {
  const bundle = buildBundle({
    domain: 'statusquo.design',
    pages: [page('https://statusquo.design/', 'Status Quo is a design studio. Our status: always shipping, fully operational.', 'Status Quo')],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  assert.equal(bundle.evidences.filter((e) => /status page was found/.test(e.claim)).length, 0);
  assert.equal(bundle.signals.filter((s) => s.label === 'Public status page').length, 0);
});

test('live customer status stays unknown, never false', () => {
  const bundle = buildBundle({
    domain: 'acme.com',
    pages: [page('https://acme.com/', 'Acme builds widgets.', 'Acme')],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  assert.equal(bundle.account.alreadyCustomer, null);
});

test('hypothesis ids are scoped to their account, so two companies never collide', () => {
  const pagesFor = (domain) => [page(`https://${domain}/`, `We are hiring. Our on-call rotation and incident response are core to how ${domain} works.`, domain)];
  const a = buildBundle({ domain: 'acme.com', pages: pagesFor('acme.com'), pagesChecked: 9, capturedAt: '2026-01-05T10:00:00.000Z' });
  const b = buildBundle({ domain: 'beta.com', pages: pagesFor('beta.com'), pagesChecked: 9, capturedAt: '2026-01-05T10:00:00.000Z' });
  assert.ok(a.hypotheses.length && b.hypotheses.length);
  const shared = a.hypotheses.map((h) => h.id).filter((id) => b.hypotheses.some((h) => h.id === id));
  assert.deepEqual(shared, [], 'hypothesis ids must differ across accounts');
  assert.notEqual(a.account.id, b.account.id);
});

test('every generated scenario step carries the capability it proposes', async () => {
  const fetchImpl = async (url) => (url === 'https://acme.com/'
    ? htmlResponse('<title>Acme</title><p>Acme runs Kubernetes with an on-call rotation.</p>')
    : new Response('', { status: 404 }));
  const bundle = await researchDomain('acme.com', { fetchImpl, lookupImpl: publicLookup, now: '2026-01-05T10:00:00.000Z' });
  assert.equal(bundle.scenarioSteps.length, 6);
  for (const step of bundle.scenarioSteps) assert.match(step.capabilityId, /^cap-/);
});

test('replaying the same capture reproduces byte-identical output, ids included', () => {
  const capture = {
    domain: 'acme.com',
    pages: [page('https://acme.com/', 'Acme runs Kubernetes, Datadog and an on-call rotation.', 'Acme')],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  };
  assert.equal(JSON.stringify(buildBundle(capture)), JSON.stringify(buildBundle(capture)));
});
