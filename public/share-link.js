// Share-link state. A share link must reopen the exact numbers the AE was
// looking at, so ROI assumptions (and, for live accounts, the researched
// domain) travel in the URL hash: `#/a/<id>/share?roi=key:value;key:value&d=<domain>`.
// Pure functions only, so the browser app and the test suite share one copy.

function toNumber(v, fallback) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

export const RoiUrl = {
  encode(assumptions) {
    return assumptions.map((a) => `${a.key}:${a.value}`).join(';');
  },
  decode(raw) {
    const out = {};
    String(raw || '').split(';').forEach((pair) => {
      const [key, value] = pair.split(':');
      const n = toNumber(value, null);
      if (key && n != null) out[key] = n;
    });
    return out;
  },
};

// Live share links carry the researched domain as well as the ROI assumptions:
// a live account id is a hash, so without the domain a recipient who has never
// run that lookup has nothing to re-run.
export function shareHash(account, assumptions) {
  const domainParam = account.live ? `&d=${encodeURIComponent(account.domain)}` : '';
  return `#/a/${account.id}/share?roi=${encodeURIComponent(RoiUrl.encode(assumptions))}${domainParam}`;
}

export const pickerRoute = () => ({ name: 'picker', accountId: null, screen: null, query: {} });

export function parseRoute(hash) {
  const [path, search] = (hash || '').replace(/^#/, '').split('?');
  const query = {};
  if (search) {
    // Malformed percent-encoding ("%zz", a bare "%") falls back to the picker
    // instead of throwing.
    try {
      search.split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    } catch {
      return pickerRoute();
    }
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'picker', accountId: null, screen: null, query };
  if (parts[0] === 'a' && parts[1]) {
    return { name: 'account', accountId: parts[1], screen: parts[2] || 'evidence', query };
  }
  return { name: 'picker', accountId: null, screen: null, query };
}

// Applies a link's ROI payload on top of the baseline assumptions. Keys the
// link omits keep the baseline value; values below an assumption's minimum
// are clamped up to it. Returns new objects and never mutates the baseline.
export function applyRoiPayload(baseline, payload) {
  const overrides = RoiUrl.decode(payload);
  return baseline.map((a) => (Object.prototype.hasOwnProperty.call(overrides, a.key)
    ? { ...a, value: Math.max(a.min ?? -Infinity, overrides[a.key]) }
    : { ...a }));
}
