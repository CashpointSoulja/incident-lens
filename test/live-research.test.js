import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain } from '../live-research.js';

test('normalizes a public-looking company URL to its domain', () => {
  assert.equal(normalizeDomain('https://www.Example.com/path'), 'example.com');
  assert.equal(normalizeDomain('incident.io'), 'incident.io');
});

test('rejects hosts that are not public company domains', () => {
  for (const value of ['', 'localhost', '127.0.0.1', 'file:///tmp/x']) {
    assert.throws(() => normalizeDomain(value));
  }
});
