import test from 'node:test';
import assert from 'node:assert/strict';
import { RoiUrl, shareHash, parseRoute, applyRoiPayload } from '../public/share-link.js';

const baseline = [
  { key: 'incidentsPerMonth', value: 12, min: 0 },
  { key: 'minutesReducedPerIncident', value: 18, min: 0 },
  { key: 'costPerMinuteDowntime', value: 400, min: 0 },
];

test('a share link round-trips the exact ROI values on screen', () => {
  const edited = baseline.map((a) => ({ ...a, value: a.key === 'incidentsPerMonth' ? 27 : a.key === 'costPerMinuteDowntime' ? 1250.5 : a.value }));
  const route = parseRoute(shareHash({ id: 'acc-monzo', live: false }, edited));
  assert.equal(route.screen, 'share');
  assert.equal(route.accountId, 'acc-monzo');
  assert.equal(route.query.d, undefined);
  assert.deepEqual(applyRoiPayload(baseline, route.query.roi).map((a) => a.value), [27, 18, 1250.5]);
});

test('a live share link carries the researched domain', () => {
  const route = parseRoute(shareHash({ id: 'live_abc', live: true, domain: 'incident.io' }, baseline));
  assert.equal(route.query.d, 'incident.io');
  assert.equal(route.accountId, 'live_abc');
});

test('missing keys fall back to the baseline, negatives clamp to the minimum, baseline is not mutated', () => {
  const out = applyRoiPayload(baseline, 'incidentsPerMonth:-5;bogus:9');
  assert.deepEqual(out.map((a) => a.value), [0, 18, 400]);
  assert.equal(baseline[0].value, 12);
});

test('garbage payloads and malformed links never crash', () => {
  assert.deepEqual(RoiUrl.decode('a:b;;:3;x'), {});
  assert.equal(parseRoute('#/a/x/share?roi=%zz').name, 'picker');
});
