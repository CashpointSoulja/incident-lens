import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, isStatusPageUrl, sourceTypeForUrl, fetchPage, buildBundle, researchDomain, isPrivateIp } from '../live-research.js';

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

test('the response cap is spent in bytes received, not decoded characters', async () => {
  // 700k CJK characters = 2.1MB on the wire. A character-based cap accepted all
  // of it; a byte-based cap must stop at 700kB.
  const multibyte = `<title>大きい</title>${'漢'.repeat(700_000)}`;
  const raw = Buffer.from(multibyte, 'utf-8');
  assert.ok(raw.length > 2_000_000, `fixture must be ~2.1MB, was ${raw.length}`);
  const fetchImpl = async () => new Response(raw, { status: 200, headers: { 'content-type': 'text/html' } });
  const page = await fetchPage('https://acme.com/', fetchImpl, publicLookup);
  assert.ok(page, 'a large page is still read, just truncated');
  assert.ok(Buffer.byteLength(page.body, 'utf-8') <= 700_000, `body must be capped in bytes, was ${Buffer.byteLength(page.body, 'utf-8')}`);
  assert.ok(page.body.length < 300_000, `only ~233k multibyte chars fit in 700kB, got ${page.body.length} chars`);
  assert.match(page.title, /大きい/, 'the accepted bytes are decoded correctly');
});

test('non-public addresses are rejected across both IP families', async () => {
  const nonPublic = [
    '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
    '::1', '0:0:0:0:0:0:0:1', '::', 'fe80::1', 'fe80::1%eth0', 'febf::abcd', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:10.0.0.1', '::ffff:7f00:1', '::127.0.0.1',
    // The spelling of a mapped address must not decide the answer: compressed,
    // partly compressed, fully expanded and hex-embedded forms are one address.
    '0:0:0:0:0:ffff:7f00:1', '0::ffff:127.0.0.1', '0:0:0:0:0:ffff:127.0.0.1', '::ffff:0:127.0.0.1',
    '0:0:0:0:0:0:0:0', '0:0:0:0:0:ffff:a00:1', '::ffff:c0a8:1', '0:0:0:0:0:ffff:a9fe:a9fe',
    'fe80:0:0:0:0:0:0:1', 'fc00:0:0:0:0:0:0:1', 'ff02::1', 'ff00::', '2001:db8::1', '2001:0db8:1234::1',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', 'not-an-address',
  ];
  for (const address of nonPublic) assert.equal(isPrivateIp(address), true, `${address} must not count as public`);
  for (const address of ['93.184.216.34', '8.8.8.8', '100.63.255.255', '100.128.0.1', '223.255.255.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:93.184.216.34', '2606:4700::1111', '2606:4700:0:0:0:0:0:1111']) {
    assert.equal(isPrivateIp(address), false, `${address} is a public address`);
  }

  // Each family, exercised end to end through the injected resolver: a redirect
  // that lands on such an address is never requested.
  for (const address of ['::1', 'fe80::1', '::ffff:127.0.0.1', 'fc00::1', '100.64.0.1', '::',
    '0:0:0:0:0:ffff:7f00:1', '::ffff:7f00:1', '0::ffff:127.0.0.1', 'ff02::1', '224.0.0.1', '240.0.0.1']) {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      if (url === 'https://acme.com/') return redirectResponse('https://internal.example/admin');
      return htmlResponse('<title>internal</title>secrets');
    };
    const lookupImpl = async (host) => [{ address: host === 'internal.example' ? address : '93.184.216.34' }];
    assert.equal(await fetchPage('https://acme.com/', fetchImpl, lookupImpl), null, `redirect to ${address} must not be followed`);
    assert.deepEqual(seen, ['https://acme.com/'], `${address} must never be requested`);
  }

  // The guard must stay a guard, not a block: a genuinely public destination in
  // either family is still fetched through the same injected resolver.
  for (const address of ['93.184.216.34', '2606:4700::1111', '::ffff:93.184.216.34']) {
    const fetchImpl = async () => htmlResponse('<title>Public</title>hello');
    const lookupImpl = async () => [{ address }];
    const page = await fetchPage('https://acme.com/', fetchImpl, lookupImpl);
    assert.equal(page?.title, 'Public', `a host resolving to ${address} must still be read`);
  }
});

test('domain association is exact or a true subdomain, never a substring', () => {
  const lookalike = buildBundle({
    domain: 'acme.com',
    pages: [
      page('https://acme.com/', 'Acme builds widgets.', 'Acme'),
      page('https://github.com/acme', 'Open source from notacme.com. We run Kubernetes and Datadog at scale.', 'acme'),
    ],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  assert.deepEqual(lookalike.evidences.map((e) => e.url), ['https://acme.com/'], 'a page naming notacme.com is not associated with acme.com');
  assert.deepEqual(lookalike.signals, [], 'no Kubernetes/Datadog evidence may be manufactured from a lookalike domain');
  assert.equal(lookalike.evidences.some((e) => /GitHub presence/.test(e.claim)), false, 'no "linked" GitHub claim from a lookalike domain');

  const related = buildBundle({
    domain: 'acme.com',
    pages: [
      page('https://acme.com/', 'Acme builds widgets.', 'Acme'),
      page('https://status.acme.com/', 'All systems operational. No incident today.', 'Acme Status'),
      page('https://github.com/acme', 'Open source from the team at status.acme.com. We run Kubernetes.', 'acme'),
    ],
    pagesChecked: 9,
    capturedAt: '2026-01-05T10:00:00.000Z',
  });
  assert.ok(related.evidences.some((e) => e.url === 'https://status.acme.com/'), 'a true subdomain is associated');
  assert.ok(related.evidences.some((e) => /GitHub presence/.test(e.claim)), 'a GitHub page naming a subdomain of the target is associated');
  assert.ok(related.signals.some((s) => s.label === 'Kubernetes'));

  assert.equal(isStatusPageUrl('https://status.notacme.com/', 'acme.com'), false);
  assert.equal(sourceTypeForUrl('https://notgithub.io/acme'), 'other', 'a lookalike vendor host is not a GitHub source');
  assert.equal(sourceTypeForUrl('https://acme.github.io/'), 'github');
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
