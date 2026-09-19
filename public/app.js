// Incident Lens - app.js
// Audition build - not affiliated with incident.io.
//
// Architecture (mirrors PRD section 5 + section 7):
//  1. Data access  - fetch fixtures/kb once at startup, no network after that.
//  2. Models       - factories that mirror data/schema.md 1:1.
//  3. Deterministic core - Matcher (product/integration recommendations) and
//     Roi (business case math) are pure functions with no DOM/state access.
//     There are no model-call paths in this build; anything AI would touch
//     (extraction/summarization/question drafting) is precomputed into the
//     fixtures, so the deterministic core is the only thing that decides
//     recommendations or numbers.
//  4. State + Storage - single mutable state object, localStorage-backed
//     feedback/event trail.
//  5. Screens - pure-ish render(state) -> html string functions, one per
//     screen, that never touch localStorage/fetch directly.
//  6. Router/init - wires hash routes to screens and re-renders on state change.
//
// This file is written in sections; each section is syntactically complete
// on its own so `node --check public/app.js` passes after every step.

'use strict';

/* =========================================================================
 * Section 1 - constants, utils, storage, models, data loading
 * ========================================================================= */

const MATCHER_VERSION = 'matcher-v1.0';
const ROI_VERSION = 'roi-v1.0';
const APP_VERSION = 'incident-lens-audition-0.1.0';

const DATA_URLS = {
  fixtures: './data/fixtures.json',
  productKb: './data/product-kb.json',
};

/* ---------- generic utils ---------- */

let __uidCounter = 0;
function uid(prefix) {
  __uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${__uidCounter.toString(36)}`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function fmtDate(iso) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtMoney(n, opts) {
  const o = opts || {};
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(Math.round(v));
  return `${sign}$${abs.toLocaleString('en-US')}${o.suffix || ''}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function toNumber(v, fallback) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

function byId(list, id) {
  return (list || []).find((x) => x.id === id) || null;
}

function nowIso() {
  return new Date().toISOString();
}

/* ---------- storage (localStorage-backed feedback / event trail) ---------- */

const STORAGE_PREFIX = 'incident-lens:v1:';

const Storage = {
  available: (() => {
    try {
      const k = '__incident_lens_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })(),
  get(name, fallback) {
    if (!Storage.available) return fallback;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + name);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    if (!Storage.available) return false;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/* ---------- models (mirror data/schema.md 1:1) ---------- */

const Models = {
  account(a) {
    return {
      id: a.id,
      domain: a.domain,
      name: a.name,
      industry: a.industry || null,
      createdAt: a.createdAt || nowIso(),
      alreadyCustomer: !!a.alreadyCustomer,
    };
  },
  evidence(e) {
    return {
      id: e.id,
      accountId: e.accountId,
      claim: e.claim,
      url: e.url,
      observedAt: e.observedAt,
      confidence: e.confidence, // high|medium|low
      kind: e.kind, // observed|inferred
    };
  },
  signal(s) {
    return {
      id: s.id,
      accountId: s.accountId,
      label: s.label,
      evidenceIds: s.evidenceIds || [],
      strength: s.strength,
    };
  },
  hypothesis(h) {
    return {
      id: h.id,
      accountId: h.accountId,
      statement: h.statement,
      evidenceIds: h.evidenceIds || [],
      status: 'hypothesis',
    };
  },
  capability(c) {
    return {
      id: c.id,
      product: c.product,
      name: c.name,
      description: c.description,
      sourceUrl: c.sourceUrl,
    };
  },
  integration(i) {
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      sourceUrl: i.sourceUrl,
    };
  },
  recommendation({ id, accountId, capabilityId, integrationId, ruleId, reasons, evidenceIds }) {
    return {
      id: id || uid('rec'),
      accountId,
      capabilityId: capabilityId || null,
      integrationId: integrationId || null,
      ruleId,
      reasons: reasons || [],
      evidenceIds: evidenceIds || [],
    };
  },
  scenarioStep(s) {
    return {
      order: s.order,
      phase: s.phase, // alert|routing|investigation|response|customer-update|postmortem
      text: s.text,
      personalizedFrom: s.personalizedFrom || [],
    };
  },
  roiAssumption({ id, key, label, value, unit, editable, note, min, step, lever }) {
    return {
      id: id || uid('roi'),
      key,
      label,
      value,
      unit,
      editable: editable !== false,
      note: note || '',
      min: min == null ? 0 : min,
      step: step == null ? 1 : step,
      lever, // downtime|engineer-time|consolidation
    };
  },
  briefVersion({ id, accountId, version, mode, createdAt }) {
    return {
      id: id || uid('brief'),
      accountId,
      version,
      mode, // internal|share
      matcherVersion: MATCHER_VERSION,
      roiVersion: ROI_VERSION,
      createdAt: createdAt || nowIso(),
    };
  },
  feedbackEvent({ id, briefId, useful, comment, at }) {
    return {
      id: id || uid('fb'),
      briefId,
      useful: !!useful,
      comment: comment || '',
      at: at || nowIso(),
    };
  },
};

/* ---------- event trail (system proof: useful/not-useful + interactions) ---------- */

const EventTrail = {
  all() {
    return Storage.get('events', []);
  },
  record(type, detail) {
    const events = EventTrail.all();
    events.push({ id: uid('evt'), type, detail: detail || {}, at: nowIso() });
    // Keep the trail bounded so a long demo session doesn't bloat localStorage.
    while (events.length > 200) events.shift();
    Storage.set('events', events);
    return events;
  },
  forAccount(accountId) {
    return EventTrail.all().filter((e) => e.detail && e.detail.accountId === accountId);
  },
};

const FeedbackStore = {
  all() {
    return Storage.get('feedback', []);
  },
  add(feedbackEvent) {
    const list = FeedbackStore.all();
    list.push(feedbackEvent);
    Storage.set('feedback', list);
    return list;
  },
  forBrief(briefId) {
    return FeedbackStore.all().filter((f) => f.briefId === briefId);
  },
};

const BriefVersionStore = {
  all() {
    return Storage.get('briefVersions', []);
  },
  add(briefVersion) {
    const list = BriefVersionStore.all();
    list.push(briefVersion);
    Storage.set('briefVersions', list);
    return list;
  },
  latestFor(accountId, mode) {
    const list = BriefVersionStore.all().filter((b) => b.accountId === accountId && b.mode === mode);
    return list.length ? list[list.length - 1] : null;
  },
  nextVersionNumber(accountId, mode) {
    const list = BriefVersionStore.all().filter((b) => b.accountId === accountId && b.mode === mode);
    return list.length + 1;
  },
};

/* ---------- data loading (fetch once at startup, no network after) ---------- */

const DataStore = {
  status: 'idle', // idle|loading|ready|error
  error: null,
  accounts: [], // [{ account, evidences, signals, hypotheses, scenarioSteps }]
  capabilities: [],
  integrations: [],

  async load() {
    DataStore.status = 'loading';
    try {
      const [fixturesRes, kbRes] = await Promise.all([
        fetch(DATA_URLS.fixtures, { cache: 'no-store' }),
        fetch(DATA_URLS.productKb, { cache: 'no-store' }),
      ]);
      if (!fixturesRes.ok) throw new Error(`fixtures.json ${fixturesRes.status}`);
      if (!kbRes.ok) throw new Error(`product-kb.json ${kbRes.status}`);
      const fixturesJson = await fixturesRes.json();
      const kbJson = await kbRes.json();

      const fixtures = Array.isArray(fixturesJson.fixtures) ? fixturesJson.fixtures : [];
      if (!fixtures.length) throw new Error('fixtures.json contained no fixtures');

      DataStore.accounts = fixtures.map((fx) => ({
        account: Models.account(fx.account),
        evidences: (fx.evidences || []).map(Models.evidence),
        signals: (fx.signals || []).map(Models.signal),
        hypotheses: (fx.hypotheses || []).map(Models.hypothesis),
        scenarioSteps: (fx.scenarioSteps || []).map(Models.scenarioStep).sort((a, b) => a.order - b.order),
      }));
      DataStore.capabilities = (kbJson.capabilities || []).map(Models.capability);
      DataStore.integrations = (kbJson.integrations || []).map(Models.integration);

      DataStore.status = 'ready';
    } catch (err) {
      DataStore.status = 'error';
      DataStore.error = err && err.message ? err.message : String(err);
    }
    return DataStore.status;
  },

  getAccountBundle(accountId) {
    return DataStore.accounts.find((a) => a.account.id === accountId) || null;
  },
};

/* =========================================================================
 * Section 2 - deterministic core: Matcher + Roi
 * These are pure functions: (data in) -> (data out), no DOM, no storage,
 * no fetch. Every recommendation and every ROI number must be traceable
 * back to a rule/formula defined here. Nothing here calls a model; a model
 * is not used anywhere in this build, only precomputed fixture content.
 * ========================================================================= */

const Matcher = {
  version: MATCHER_VERSION,

  // Capability rules: deterministic keyword tests against a signal's label.
  // Each match produces a Recommendation whose `reasons` explain exactly why,
  // and whose `evidenceIds` point back at the evidence behind that signal.
  CAPABILITY_RULES: [
    {
      id: 'rule-vendor-status-page',
      test: (label) => label.includes('statuspage') && !label.includes('incident.io'),
      capabilityIds: ['cap-stat-1', 'cap-stat-2'],
      reason: (label) => `Runs customer status updates on a third-party tool (signal: "${label}"). incident.io Status Pages would let the same team publish updates from inside the incident workflow instead of a separate product.`,
    },
    {
      id: 'rule-existing-customer-expansion',
      test: (label) => label.includes('incident.io status page') || label.includes('incident.io customer'),
      capabilityIds: ['cap-oncall-1', 'cap-inv-1'],
      reason: (label) => `Already trusts incident.io for at least one workflow (signal: "${label}"), which lowers the switching cost of expanding into on-call routing and investigations.`,
    },
    {
      id: 'rule-generalist-team',
      test: (label) => label.includes('generalist') || label.includes('fullstack engineering'),
      capabilityIds: ['cap-inv-1', 'cap-nexus-1'],
      reason: (label) => `Team is described as generalist rather than dedicated SRE (signal: "${label}"), so an AI-drafted root-cause hypothesis and a conversational assistant reduce the specialist knowledge an on-call generalist needs on the spot.`,
    },
    {
      id: 'rule-dedicated-oncall-team',
      test: (label) => label.includes('dedicated sre') || label.includes('platform team'),
      capabilityIds: ['cap-oncall-2', 'cap-oncall-3'],
      reason: (label) => `Runs a dedicated on-call rotation (signal: "${label}"), where shadow scheduling and automatic alert grouping directly reduce rotation toil and noise.`,
    },
    {
      id: 'rule-complex-infra',
      test: (label) => label.includes('kubernetes') || label.includes('multi-cloud'),
      capabilityIds: ['cap-inv-2'],
      reason: (label) => `Infrastructure spans multiple clusters/clouds (signal: "${label}"), so mapping blast radius before investigating matters more than in a single-service stack.`,
    },
    {
      id: 'rule-public-postmortem-culture',
      test: (label) => label.includes('postmortem') || label.includes('transparent incident culture'),
      capabilityIds: ['cap-resp-4'],
      reason: (label) => `Already publishes detailed public postmortems (signal: "${label}"). Automated timeline-to-postmortem drafting saves the writing time without changing that transparency habit.`,
    },
    {
      id: 'rule-inhouse-tooling',
      test: (label) => label.includes('in-house') || label.includes('custom tooling'),
      capabilityIds: ['cap-resp-3'],
      reason: (label) => `Built and presumably maintains an internal tool for the same job (signal: "${label}"). A native, supported automated-communication feature removes that maintenance burden.`,
    },
    {
      id: 'rule-database-heavy',
      test: (label) => label.includes('postgresql') || label.includes('redis') || label.includes('database'),
      capabilityIds: ['cap-inv-3'],
      reason: (label) => `Stack is database-heavy (signal: "${label}"), where pulling telemetry and query state in parallel shortens investigation time on data-layer incidents.`,
    },
    {
      id: 'rule-cicd-heavy',
      test: (label) => label.includes('ci/cd') || label.includes('workflows'),
      capabilityIds: ['cap-resp-2'],
      reason: (label) => `Ships through a documented CI/CD pipeline (signal: "${label}"), which is the kind of repeatable process that benefits from an encoded, automated runbook.`,
    },
  ],

  // Deterministic text-scan for integrations: an integration is only ever
  // recommended when its exact name appears in the account's own public
  // evidence text, never guessed. The account's own name is excluded so a
  // company is never "matched" to an integration of the same name as itself.
  matchIntegrations(accountBundle, integrations) {
    const { account, evidences, signals } = accountBundle;
    const haystacks = [
      ...evidences.map((e) => ({ text: e.claim, evidenceIds: [e.id] })),
      ...signals.map((s) => ({ text: s.label, evidenceIds: s.evidenceIds })),
    ];
    const recs = [];
    integrations.forEach((integration) => {
      if (integration.name.toLowerCase() === account.name.toLowerCase()) return;
      const re = new RegExp(`\\b${integration.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const hit = haystacks.find((h) => re.test(h.text));
      if (!hit) return;
      recs.push(Models.recommendation({
        accountId: account.id,
        integrationId: integration.id,
        ruleId: 'rule-mentioned-in-evidence',
        reasons: [`Public evidence explicitly mentions "${integration.name}" ("${hit.text}"), so the official incident.io ${integration.name} integration would plug directly into the workflow they already run.`],
        evidenceIds: hit.evidenceIds,
      }));
    });
    return recs;
  },

  matchCapabilities(accountBundle, capabilities) {
    const { account, signals } = accountBundle;
    const recs = [];
    signals.forEach((signal) => {
      const label = signal.label.toLowerCase();
      Matcher.CAPABILITY_RULES.forEach((rule) => {
        if (!rule.test(label)) return;
        rule.capabilityIds.forEach((capId) => {
          if (!byId(capabilities, capId)) return;
          recs.push(Models.recommendation({
            accountId: account.id,
            capabilityId: capId,
            ruleId: rule.id,
            reasons: [rule.reason(signal.label)],
            evidenceIds: signal.evidenceIds,
          }));
        });
      });
    });
    return recs;
  },

  // Full deterministic recommendation set for an account: capabilities +
  // integrations, each carrying its rule id and evidence so "why this?" is
  // always answerable from the object alone.
  buildRecommendations(accountBundle, capabilities, integrations) {
    return [
      ...Matcher.matchCapabilities(accountBundle, capabilities),
      ...Matcher.matchIntegrations(accountBundle, integrations),
    ];
  },

  // Discovery questions are deterministically derived from the fixture's
  // hypotheses (never invented facts) - a question form of an inference.
  deriveDiscoveryQuestions(hypotheses) {
    return hypotheses.map((h) => {
      const trimmed = h.statement.trim();
      if (trimmed.endsWith('?')) return trimmed;
      const lower = trimmed.slice(0, 1).toLowerCase() + trimmed.slice(1);
      return `Worth asking: does it hold that ${lower.replace(/\.$/, '')}?`;
    });
  },
};

const Roi = {
  version: ROI_VERSION,

  // Baseline assumptions are seeded per account (industry-flavoured, always
  // editable, always labelled as an illustrative starting point - never a
  // guarantee). RoiAssumption entities, one per lever input.
  baselineAssumptions(accountBundle) {
    const industry = (accountBundle.account.industry || '').toLowerCase();
    const scale = industry.includes('bank') ? 1.6 : industry.includes('cloud') ? 1.3 : 1;
    return [
      Models.roiAssumption({
        key: 'incidentsPerMonth', label: 'Incidents per month', value: Math.round(4 * scale), unit: 'incidents',
        note: 'Illustrative starting point based on account size/industry - replace with the prospect\'s own number.', min: 0, step: 1, lever: 'downtime',
      }),
      Models.roiAssumption({
        key: 'minutesReducedPerIncident', label: 'Downtime reduced per incident', value: Math.round(18 * scale), unit: 'minutes',
        note: 'Faster routing/investigation is assumed to shave this many minutes off mean time to resolution.', min: 0, step: 1, lever: 'downtime',
      }),
      Models.roiAssumption({
        key: 'costPerMinuteDowntime', label: 'Cost of downtime', value: industry.includes('bank') ? 400 : 150, unit: '$ / minute',
        note: 'Benchmark placeholder - swap for the prospect\'s own revenue-at-risk figure.', min: 0, step: 10, lever: 'downtime',
      }),
      Models.roiAssumption({
        key: 'hoursReclaimedPerIncident', label: 'Engineer hours reclaimed per incident', value: 2.5, unit: 'hours',
        note: 'Time saved on manual paging, timeline-building and status drafting per incident.', min: 0, step: 0.5, lever: 'engineer-time',
      }),
      Models.roiAssumption({
        key: 'engineerHourlyRate', label: 'Fully loaded engineer rate', value: 90, unit: '$ / hour',
        note: 'Illustrative fully-loaded engineering cost - not a real payroll figure.', min: 0, step: 5, lever: 'engineer-time',
      }),
      Models.roiAssumption({
        key: 'toolsConsolidated', label: 'Point tools consolidated', value: accountBundle.account.alreadyCustomer ? 1 : 2, unit: 'tools',
        note: 'Paging/status/timeline tools this account could retire by consolidating onto incident.io.', min: 0, step: 1, lever: 'consolidation',
      }),
      Models.roiAssumption({
        key: 'costPerTool', label: 'Average cost per tool', value: 220, unit: '$ / month',
        note: 'Illustrative average monthly seat/licence cost for a point tool being replaced.', min: 0, step: 10, lever: 'consolidation',
      }),
    ];
  },

  assumptionsAsMap(assumptions) {
    const map = {};
    assumptions.forEach((a) => { map[a.key] = a.value; });
    return map;
  },

  // Pure calculation: given a map of assumption values, return the three
  // lever results, each with its visible formula, plus a total. Never
  // called a "guarantee" anywhere it is displayed.
  calculate(values) {
    const v = values;
    const downtimeMonthly = v.incidentsPerMonth * v.minutesReducedPerIncident * v.costPerMinuteDowntime;
    const engineerTimeMonthly = v.incidentsPerMonth * v.hoursReclaimedPerIncident * v.engineerHourlyRate;
    const consolidationMonthly = v.toolsConsolidated * v.costPerTool;
    const totalMonthly = downtimeMonthly + engineerTimeMonthly + consolidationMonthly;
    return {
      downtime: {
        monthly: downtimeMonthly,
        annual: downtimeMonthly * 12,
        formula: 'incidents/month × minutes reduced/incident × $/minute downtime',
      },
      engineerTime: {
        monthly: engineerTimeMonthly,
        annual: engineerTimeMonthly * 12,
        formula: 'incidents/month × hours reclaimed/incident × $/engineer-hour',
      },
      consolidation: {
        monthly: consolidationMonthly,
        annual: consolidationMonthly * 12,
        formula: 'tools consolidated × $/tool/month',
      },
      total: { monthly: totalMonthly, annual: totalMonthly * 12 },
    };
  },
};

/* =========================================================================
 * Section 3 - app state + generic UI chrome (toast, actionbar, steprail,
 * mode switch). Screens (section 4+) read this state and render into #view;
 * they do not own DOM wiring for the shared chrome.
 * ========================================================================= */

const state = {
  status: 'loading', // loading|ready|error
  mode: 'internal', // internal|share
  route: { name: 'picker', accountId: null },
  roiByAccount: {}, // accountId -> { assumptions: RoiAssumption[] }
  builtBrief: {}, // accountId -> true once "Build the reliability story" has been tapped
};

const dom = {
  view: document.getElementById('view'),
  steprail: document.getElementById('steprail'),
  modeSwitch: document.getElementById('mode-switch'),
  actionbar: document.getElementById('actionbar'),
  toast: document.getElementById('toast'),
  vMatcher: document.getElementById('v-matcher'),
  vRoi: document.getElementById('v-roi'),
};

let toastTimer = null;
function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 2600);
}

function setActionBar(html) {
  if (!html) {
    dom.actionbar.hidden = true;
    dom.actionbar.innerHTML = '';
    return;
  }
  dom.actionbar.hidden = false;
  dom.actionbar.innerHTML = html;
}

// One shared step rail across the account-scoped AE screens. Hidden on the
// picker and on share mode (share mode is a single consolidated screen).
const AE_STEPS = [
  { key: 'evidence', label: 'Evidence', n: 1 },
  { key: 'brief', label: 'Brief', n: 2 },
  { key: 'scenario', label: 'Scenario', n: 3 },
  { key: 'roi', label: 'ROI', n: 4 },
];

function renderStepRail(accountId, activeKey) {
  if (!accountId || state.mode === 'share') {
    dom.steprail.hidden = true;
    dom.steprail.innerHTML = '';
    return;
  }
  const activeIdx = AE_STEPS.findIndex((s) => s.key === activeKey);
  const items = AE_STEPS.map((s, i) => {
    const isCurrent = s.key === activeKey;
    const isDone = i < activeIdx;
    return `<li>
      <a href="#/a/${accountId}/${s.key}" ${isCurrent ? 'aria-current="step"' : ''} class="${isDone ? 'done' : ''}">
        <span class="n">${s.n}</span>${escapeHtml(s.label)}
      </a>
    </li>`;
  }).join('');
  dom.steprail.innerHTML = `<div class="wrap"><ol>${items}</ol></div>`;
  dom.steprail.hidden = false;
}

function renderModeSwitch(accountId) {
  if (!accountId) {
    dom.modeSwitch.hidden = true;
    dom.modeSwitch.innerHTML = '';
    return;
  }
  dom.modeSwitch.hidden = false;
  dom.modeSwitch.innerHTML = `
    <button type="button" data-mode-switch="internal" aria-pressed="${state.mode === 'internal'}">AE view</button>
    <button type="button" data-mode-switch="share" aria-pressed="${state.mode === 'share'}">Share</button>
  `;
}

dom.modeSwitch.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-mode-switch]');
  if (!btn) return;
  const target = btn.getAttribute('data-mode-switch');
  if (target === state.mode) return;
  const accountId = state.route.accountId;
  if (!accountId) return;
  EventTrail.record('mode-switch', { accountId, from: state.mode, to: target });
  if (target === 'share') {
    location.hash = `#/a/${accountId}/share`;
  } else {
    location.hash = `#/a/${accountId}/brief`;
  }
});

function ensureRoiState(accountId) {
  if (!state.roiByAccount[accountId]) {
    const bundle = DataStore.getAccountBundle(accountId);
    state.roiByAccount[accountId] = { assumptions: Roi.baselineAssumptions(bundle) };
  }
  return state.roiByAccount[accountId];
}

let lastRouteKey = null;
function renderView(html) {
  dom.view.innerHTML = html;
  // Focus for keyboard/skip-link users without letting the browser yank the
  // page so the title hides behind the sticky rail. Scroll to top only when
  // the route actually changed; in-screen state changes keep their position.
  dom.view.focus({ preventScroll: true });
  const key = location.hash || '#/';
  if (key !== lastRouteKey) window.scrollTo(0, 0);
  lastRouteKey = key;
}

function renderLoading(label) {
  renderView(`
    <div class="loading-block" role="status" aria-live="polite">
      <div class="eyebrow">Incident Lens</div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <p class="muted small">${escapeHtml(label || 'Loading…')}</p>
    </div>
  `);
}

function renderFailure(title, message, retryHash, opts) {
  const o = opts || {};
  const action = o.reload
    ? `<button class="btn btn-primary" type="button" onclick="location.reload()">Reload the page</button>`
    : `<a class="btn btn-primary" href="${retryHash || '#/'}">Back to accounts</a>`;
  renderView(`
    <div class="section-head">
      <div class="eyebrow">Something did not load</div>
      <h1>Stopped, not stuck</h1>
    </div>
    <div class="failure" role="alert">
      <h3>${escapeHtml(title)}</h3>
      <p class="small">${escapeHtml(message)}</p>
      <p class="small muted">We stop here rather than show a blank screen or invent data.</p>
      <div class="row" style="margin-top:14px;">${action}</div>
    </div>
  `);
}

function renderEmpty(title, message) {
  return `<div class="empty"><h3>${escapeHtml(title)}</h3><p class="small">${escapeHtml(message)}</p></div>`;
}

/* =========================================================================
 * Section 4 - shared chip helpers + account picker screen
 * ========================================================================= */

function kindChip(kind) {
  if (kind === 'observed') return `<span class="chip chip-observed"><span class="g">●</span> Observed</span>`;
  if (kind === 'inferred') return `<span class="chip chip-inferred"><span class="g">◐</span> Inferred</span>`;
  return `<span class="chip chip-unknown"><span class="g">?</span> Unknown</span>`;
}

function confidenceChip(confidence) {
  const label = confidence ? confidence[0].toUpperCase() + confidence.slice(1) : 'Unknown';
  return `<span class="chip ${confidence === 'high' ? 'chip-strong' : ''}">${escapeHtml(label)} confidence</span>`;
}

// Source link pill. Host is legible at a glance; the full URL stays in href/title.
function sourceLink(url, label) {
  let host = url, path = '';
  try {
    const u = new URL(url);
    host = u.host.replace(/^www\./, '');
    path = (u.pathname + u.search).replace(/\/$/, '');
  } catch { /* leave as-is */ }
  const text = label
    ? `<span class="host">${escapeHtml(label)}</span>`
    : `<span class="host">${escapeHtml(host)}</span>${path ? `<span class="path">${escapeHtml(path)}</span>` : ''}`;
  return `<a class="srclink" href="${escapeHtml(url)}" title="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}<span class="ext" aria-hidden="true">↗</span></a>`;
}

function customerChip(alreadyCustomer) {
  return alreadyCustomer ? `<span class="chip chip-customer">Existing incident.io customer</span>` : '';
}

// Plainspoken note about how the fixtures were chosen. Shown on the picker
// (below the fixtures) and in prospect-share mode, next to the disclaimer.
function aboutBuildNote() {
  return `
    <aside class="about-build" aria-labelledby="about-build-title">
      <div class="eyebrow" id="about-build-title">About this build</div>
      <p class="hand">Two of the three prospects we first picked, Linear and Render, turned out to already be incident.io customers. Public evidence said so - the same check this product runs on every account - so both were swapped for clean prospects.</p>
      <p class="tiny muted">Audition build - not affiliated with incident.io. Fixtures are precomputed from public pages; nothing here is a live call.</p>
    </aside>
  `;
}

function evidenceCountSummary(bundle) {
  const observed = bundle.evidences.filter((e) => e.kind === 'observed').length;
  const inferred = bundle.evidences.filter((e) => e.kind === 'inferred').length;
  return { observed, inferred, total: bundle.evidences.length };
}

function screenAccountPicker() {
  renderStepRail(null);
  renderModeSwitch(null);

  if (state.status === 'error') {
    setActionBar('');
    renderFailure(
      'Fixtures failed to load',
      `Could not load the cached prospect data (${DataStore.error || 'unknown error'}). A reload is the only dependency this demo has.`,
      '#/',
      { reload: true },
    );
    return;
  }

  if (!DataStore.accounts.length) {
    setActionBar('');
    renderView(`
      <div class="section-head">
        <div class="eyebrow">Incident Lens</div>
        <h1>Pick a preloaded prospect</h1>
      </div>
      ${renderEmpty('No fixtures available', 'This build ships with three precomputed prospects. None loaded - check data/fixtures.json.')}
    `);
    return;
  }

  const cards = DataStore.accounts.map((bundle) => {
    const { account } = bundle;
    const counts = evidenceCountSummary(bundle);
    return `
      <button class="card card-tap account-card" type="button" data-goto="#/a/${account.id}/evidence" data-account-id="${account.id}">
        <div class="between">
          <div>
            <h3>${escapeHtml(account.name)}</h3>
            <div class="dom">${escapeHtml(account.domain)}${account.industry ? ' · ' + escapeHtml(account.industry) : ''}</div>
          </div>
          ${customerChip(account.alreadyCustomer)}
        </div>
        <div class="freshness">Evidence observed <span class="mono">${fmtDate(account.createdAt)}</span></div>
        <div class="preview">
          ${bundle.signals.slice(0, 3).map((s) => `<span class="chip">${escapeHtml(s.label)}</span>`).join('')}
        </div>
        <div class="account-foot">
          <span class="small muted">${counts.total} sources · ${counts.observed} observed${counts.inferred ? `, ${counts.inferred} inferred` : ''}</span>
          <span class="open-cue" aria-hidden="true">Open →</span>
        </div>
      </button>
    `;
  }).join('');

  renderView(`
    <div class="section-head">
      <div class="eyebrow">Prospects<span class="sep">·</span>${DataStore.accounts.length} preloaded</div>
      <h1>Who are we walking into?</h1>
      <p class="lede">Three prospects, researched from public pages and ready in under a second. Every claim is observed with a source or clearly marked as a hypothesis.</p>
    </div>
    <div class="stack">
      ${cards}
    </div>
    ${aboutBuildNote()}
    <div class="section-head">
      <div class="eyebrow">Optional<span class="sep">·</span>Fails closed</div>
      <h3 class="h-quiet">Try a live domain</h3>
      <p class="small muted">Live scraping isn't part of this audition build. Enter a domain to see how the app stops instead of inventing data.</p>
    </div>
    <form id="domain-form" class="card domain-form" role="search">
      <label class="small" for="domain-input" style="font-weight:600;">Prospect domain</label>
      <div class="row" style="flex-wrap:nowrap;">
        <input id="domain-input" name="domain" type="text" inputmode="url" autocomplete="off" placeholder="e.g. acme.com" class="text-input" />
        <button class="btn btn-dark" type="submit">Look up</button>
      </div>
    </form>
  `);
  setActionBar('');

  dom.view.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = btn.getAttribute('data-goto'); });
  });

  const form = document.getElementById('domain-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const raw = document.getElementById('domain-input').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!raw) return;
    const match = DataStore.accounts.find((b) => b.account.domain.toLowerCase() === raw || b.account.domain.toLowerCase().includes(raw));
    EventTrail.record('domain-lookup', { domain: raw, matched: !!match });
    if (match) {
      location.hash = `#/a/${match.account.id}/evidence`;
    } else {
      showToast(`No live analysis in this audition build - "${raw}" isn't one of the three fixtures. Pick one above instead.`);
    }
  });
}

/* =========================================================================
 * Section 5 - evidence ledger + account brief ("build the reliability story")
 * ========================================================================= */

function accountHeader(account, subtitle) {
  return `
    <div class="section-head account-head">
      <div class="eyebrow">Prospect${account.industry ? `<span class="sep">·</span>${escapeHtml(account.industry)}` : ''}</div>
      <div class="between">
        <h1>${escapeHtml(account.name)}</h1>
        ${customerChip(account.alreadyCustomer)}
      </div>
      <div class="account-domain mono">${escapeHtml(account.domain)}</div>
      ${subtitle ? `<p class="lede">${subtitle}</p>` : ''}
    </div>
  `;
}

function evidenceCardHtml(evidence) {
  return `
    <div class="ev ${evidence.kind}">
      <div class="chiprow">${kindChip(evidence.kind)}${confidenceChip(evidence.confidence)}</div>
      <p class="claim">${escapeHtml(evidence.claim)}</p>
      <dl class="meta">
        <dt>Source</dt><dd>${sourceLink(evidence.url)}</dd>
        <dt>Observed</dt><dd class="mono">${fmtDate(evidence.observedAt)}</dd>
      </dl>
    </div>
  `;
}

function screenEvidence(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return renderFailure('Account not found', 'That prospect id does not match a loaded fixture.', '#/');
  renderStepRail(accountId, 'evidence');
  renderModeSwitch(accountId);

  const counts = evidenceCountSummary(bundle);
  const list = bundle.evidences.length
    ? bundle.evidences.map(evidenceCardHtml).join('')
    : renderEmpty('No evidence yet', 'This account has no evidence cards loaded, so no brief can be generated - unsupported claims are blocked, not invented.');

  renderView(`
    ${accountHeader(bundle.account, `Every claim below is public, dated and linked. Nothing is presented as fact without a source.`)}
    <div class="section-head">
      <div class="eyebrow">Evidence<span class="sep">·</span>${counts.total} source${counts.total === 1 ? '' : 's'}<span class="sep">·</span>${counts.observed} observed, ${counts.inferred} inferred</div>
    </div>
    <div class="ev-list">
      ${list}
    </div>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-primary btn-block" href="#/a/${accountId}/brief">Build the reliability story</a>
    </div>
  `);
}

function hypothesisCard(h, evidences) {
  const supporting = h.evidenceIds.map((id) => byId(evidences, id)).filter(Boolean);
  return `
    <div class="card hyp">
      ${kindChip('inferred')}
      <p class="claim">${escapeHtml(h.statement)}</p>
      <p class="tiny muted" style="margin-bottom:6px;">Supporting evidence</p>
      <ul class="list-plain small">
        ${supporting.map((e) => `<li class="hyp-ev"><span>${escapeHtml(e.claim)}</span>${sourceLink(e.url)}</li>`).join('') || '<li class="muted">None linked</li>'}
      </ul>
    </div>
  `;
}

function recommendationCard(rec, capabilities, integrations, evidences) {
  const capability = rec.capabilityId ? byId(capabilities, rec.capabilityId) : null;
  const integration = rec.integrationId ? byId(integrations, rec.integrationId) : null;
  const area = capability ? capability.product : `${integration.category} integration`;
  const title = capability ? capability.name : integration.name;
  const desc = capability ? capability.description : `Official incident.io integration (${integration.category}).`;
  const sourceUrl = capability ? capability.sourceUrl : integration.sourceUrl;
  const supporting = rec.evidenceIds.map((id) => byId(evidences, id)).filter(Boolean);
  return `
    <div class="card rec">
      <div class="rec-head"><span class="chip">${escapeHtml(area)}</span></div>
      <h3>${escapeHtml(title)}</h3>
      <p class="small muted">${escapeHtml(desc)}</p>
      <p class="rec-why"><strong>Why this?</strong> ${escapeHtml(rec.reasons[0])}</p>
      <div class="rec-foot">
        ${sourceLink(sourceUrl, 'Official incident.io page')}
        ${supporting.map((e) => sourceLink(e.url, `Evidence: ${e.claim.slice(0, 36)}${e.claim.length > 36 ? '…' : ''}`)).join('')}
      </div>
      <p class="tiny muted" style="margin-top:10px;">Rule <span class="mono">${escapeHtml(rec.ruleId)}</span></p>
    </div>
  `;
}

function screenBrief(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return renderFailure('Account not found', 'That prospect id does not match a loaded fixture.', '#/');
  renderStepRail(accountId, 'brief');
  renderModeSwitch(accountId);

  const { account, evidences, signals, hypotheses } = bundle;
  const built = !!state.builtBrief[accountId];

  if (!built) {
    renderView(`
      ${accountHeader(account, 'Signals are normalized from the evidence ledger. Tap below to turn them into three evidence-backed hypotheses and a deterministic product map.')}
      <div class="section-head"><div class="eyebrow">Signals<span class="sep">·</span>${signals.length} normalized from evidence</div></div>
      <div class="card">
        <div class="chiprow">
          ${signals.map((s) => `<span class="chip chip-strong">${escapeHtml(s.label)}</span>`).join('')}
        </div>
      </div>
      <div class="empty" style="margin-top:14px;">
        <h3>Nothing written yet - on purpose</h3>
        <p class="small">Tap <strong>Build the reliability story</strong> and these ${signals.length} signals become three hypotheses, discovery questions and a product map. All from cached evidence; no network call, nothing invented.</p>
        <div class="skeleton-preview" aria-hidden="true">
          <div class="skeleton skeleton-line" style="width:56%"></div>
          <div class="skeleton skeleton-line" style="width:84%"></div>
          <div class="skeleton skeleton-line" style="width:70%"></div>
        </div>
      </div>
    `);
    setActionBar(`
      <div class="wrap">
        <button class="btn btn-primary btn-block" type="button" id="build-story-btn">Build the reliability story</button>
      </div>
    `);
    document.getElementById('build-story-btn').addEventListener('click', () => {
      state.builtBrief[accountId] = true;
      const version = BriefVersionStore.nextVersionNumber(accountId, 'internal');
      const brief = Models.briefVersion({ accountId, version, mode: 'internal' });
      BriefVersionStore.add(brief);
      EventTrail.record('brief-built', { accountId, version, mode: 'internal' });
      showToast('Reliability story generated from cached evidence - no network call made.');
      render();
    });
    return;
  }

  if (hypotheses.length !== 3) {
    EventTrail.record('hypothesis-count-warning', { accountId, count: hypotheses.length });
  }

  const recs = Matcher.buildRecommendations(bundle, DataStore.capabilities, DataStore.integrations);
  const capRecs = recs.filter((r) => r.capabilityId);
  const intRecs = recs.filter((r) => r.integrationId);
  const questions = Matcher.deriveDiscoveryQuestions(hypotheses);
  const brief = BriefVersionStore.latestFor(accountId, 'internal');

  renderView(`
    ${accountHeader(account, 'Fact kept apart from interpretation: hypotheses are marked inferred, and every recommendation shows its rule and evidence.')}

    <div class="section-head">
      <div class="eyebrow">Reliability story<span class="sep">·</span>${hypotheses.length} hypotheses</div>
      <h2>Three things worth checking</h2>
      <p class="small muted">Never presented as fact - always "might" or "could", always linked to evidence.</p>
    </div>
    <div class="stack">
      ${hypotheses.map((h) => hypothesisCard(h, evidences)).join('')}
    </div>

    <div class="section-head">
      <div class="eyebrow">Discovery<span class="sep">·</span>${questions.length} questions</div>
      <h2>Ask, don't assert</h2>
      <p class="small muted">Deterministically derived from the hypotheses above - drafting only, never a claim.</p>
    </div>
    <div class="card">
      <ol class="qlist">
        ${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
      </ol>
    </div>

    <div class="section-head">
      <div class="eyebrow">Product map<span class="sep">·</span>${capRecs.length} capability match${capRecs.length === 1 ? '' : 'es'}</div>
      <h2>Where incident.io fits</h2>
      <p class="small muted">Matcher <span class="mono">${escapeHtml(Matcher.version)}</span>, deterministic rules only - every match shows its rule and evidence.</p>
    </div>
    <div class="stack">
      ${capRecs.length ? capRecs.map((r) => recommendationCard(r, DataStore.capabilities, DataStore.integrations, evidences)).join('') : renderEmpty('No capability matches', 'No signal matched a capability rule for this account.')}
    </div>

    <div class="section-head">
      <div class="eyebrow">Integrations<span class="sep">·</span>${intRecs.length} named in evidence</div>
      <h2>Plugs into what they run</h2>
      <p class="small muted">Only recommended when the integration's name appears in the account's own public evidence.</p>
    </div>
    <div class="stack">
      ${intRecs.length ? intRecs.map((r) => recommendationCard(r, DataStore.capabilities, DataStore.integrations, evidences)).join('') : renderEmpty('No integration matches', 'No public evidence explicitly named one of the official integrations for this account.')}
    </div>

    ${brief ? `<p class="tiny muted" style="margin-top:18px;">Brief v${brief.version} · generated ${fmtDate(brief.createdAt)} · matcher ${escapeHtml(brief.matcherVersion)}</p>` : ''}

    <div class="card card-quiet" style="margin-top:16px;">
      <h4>Was this brief useful?</h4>
      <p class="small muted" style="margin-top:-2px;">Recorded against brief v${brief ? brief.version : 1} so the matcher can be tuned.</p>
      <div class="row">
        <button class="btn" type="button" data-feedback="useful" aria-pressed="false">Useful</button>
        <button class="btn" type="button" data-feedback="not-useful" aria-pressed="false">Not useful</button>
      </div>
      <p class="tiny muted" id="feedback-ack" style="margin-top:8px;" role="status"></p>
    </div>

    <div class="section-head"><div class="eyebrow">Internal<span class="sep">·</span>Sales only</div><h3 class="h-quiet">Salesforce-ready payload</h3><p class="small muted">Typed preview only - the integration boundary, no real CRM call.</p></div>
    <div class="callout callout-internal">
      <strong>Internal</strong> · sales-only section, removed automatically in share mode.
    </div>
    <details class="disclosure" style="margin-top:10px;">
      <summary>Show the typed Opportunity payload</summary>
      <pre class="pre" id="sf-payload">${escapeHtml(JSON.stringify(buildSalesforcePayload(bundle, recs, Roi.calculate(Roi.assumptionsAsMap(ensureRoiState(accountId).assumptions)), brief), null, 2))}</pre>
    </details>
    <div class="row" style="margin-top:10px;">
      <button class="btn" type="button" id="copy-sf-payload">Copy JSON</button>
    </div>

    <div class="section-head"><div class="eyebrow">Internal<span class="sep">·</span>This session</div><h3 class="h-quiet">Event trail</h3></div>
    <ul class="trail">
      ${EventTrail.forAccount(accountId).slice(-6).reverse().map((e) => `<li><time>${fmtDate(e.at)}</time><span>${escapeHtml(e.type)}</span></li>`).join('') || '<li class="muted">No events recorded yet this session.</li>'}
    </ul>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-primary btn-block" href="#/a/${accountId}/scenario">See the personalized scenario</a>
    </div>
  `);

  dom.view.querySelectorAll('[data-feedback]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const useful = btn.getAttribute('data-feedback') === 'useful';
      const fb = Models.feedbackEvent({ briefId: brief ? brief.id : uid('brief'), useful });
      FeedbackStore.add(fb);
      EventTrail.record('feedback', { accountId, useful });
      dom.view.querySelectorAll('[data-feedback]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      document.getElementById('feedback-ack').textContent = useful
        ? 'Thanks - recorded as useful.'
        : 'Thanks - recorded as not useful.';
    });
  });

  const copyPayloadBtn = document.getElementById('copy-sf-payload');
  if (copyPayloadBtn) {
    copyPayloadBtn.addEventListener('click', async () => {
      const text = document.getElementById('sf-payload').textContent;
      EventTrail.record('sf-payload-copied', { accountId });
      try {
        await navigator.clipboard.writeText(text);
        showToast('Salesforce-ready payload copied (no real CRM call made).');
      } catch {
        showToast('Could not access clipboard - select the payload text manually.');
      }
    });
  }
}

/* =========================================================================
 * Section 6 - scenario player (6-step incident timeline)
 * ========================================================================= */

const PHASE_LABEL = {
  alert: 'Alert',
  routing: 'Routing',
  investigation: 'Investigation',
  response: 'Response',
  'customer-update': 'Customer update',
  postmortem: 'Postmortem',
};

const scenarioActiveStep = {}; // accountId -> order (1-based)

function scenarioStepHtml(step, signals, isActive, isDone, showState) {
  const personalized = step.personalizedFrom.map((id) => byId(signals, id)).filter(Boolean);
  const stateClass = isActive ? 'is-active' : isDone ? 'is-done' : '';
  const stateChip = showState === false ? ''
    : isActive ? '<span class="chip chip-live">Live now</span>'
    : isDone ? '<span class="chip chip-observed">Done</span>'
    : '<span class="chip chip-unknown">Up next</span>';
  return `
    <li class="${stateClass}" ${isActive ? 'aria-current="step"' : ''}>
      <span class="node" aria-hidden="true">${isDone ? '✓' : step.order}</span>
      <div class="step-card">
        <div class="step-head">
          <span class="step-phase">${escapeHtml(PHASE_LABEL[step.phase] || step.phase)}</span>
          ${stateChip}
        </div>
        <p>${escapeHtml(step.text)}</p>
        ${personalized.length
          ? `<div class="step-src"><span class="tiny muted">From observed signals</span><div class="chiprow">${personalized.map((s) => `<span class="chip chip-strong">${escapeHtml(s.label)}</span>`).join('')}</div></div>`
          : `<span class="chip chip-unknown"><span class="g">?</span> Illustrative - not tied to observed evidence</span>`}
      </div>
    </li>
  `;
}

function screenScenario(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return renderFailure('Account not found', 'That prospect id does not match a loaded fixture.', '#/');
  renderStepRail(accountId, 'scenario');
  renderModeSwitch(accountId);

  const { account, signals, scenarioSteps } = bundle;
  if (!scenarioSteps.length) {
    renderView(`
      ${accountHeader(account)}
      ${renderEmpty('No scenario available', 'This fixture has no scenario steps loaded.')}
    `);
    setActionBar(`<div class="wrap"><a class="btn btn-primary btn-block" href="#/a/${accountId}/roi">Go to ROI</a></div>`);
    return;
  }

  if (!scenarioActiveStep[accountId]) scenarioActiveStep[accountId] = 1;
  const active = clamp(scenarioActiveStep[accountId], 1, scenarioSteps.length);

  renderView(`
    ${accountHeader(account, 'A compact incident walkthrough personalized to their observed or hypothesized stack. Steps not tied to public evidence are clearly marked illustrative, never presented as fact.')}
    <div class="section-head"><div class="eyebrow">Scenario<span class="sep">·</span>Step ${active} of ${scenarioSteps.length}<span class="sep">·</span>${escapeHtml(PHASE_LABEL[scenarioSteps[active - 1].phase] || scenarioSteps[active - 1].phase)}</div></div>
    <ol class="rail">
      ${scenarioSteps.map((s) => scenarioStepHtml(s, signals, s.order === active, s.order < active)).join('')}
    </ol>
  `);

  setActionBar(`
    <div class="wrap">
      <button class="btn" type="button" id="scn-prev" ${active <= 1 ? 'disabled' : ''} aria-label="Previous step">← Prev</button>
      <span class="hint" style="flex:1; text-align:center;">Step ${active} of ${scenarioSteps.length}<br><strong>${escapeHtml(PHASE_LABEL[scenarioSteps[active - 1].phase])}</strong></span>
      ${active < scenarioSteps.length
        ? `<button class="btn btn-primary" type="button" id="scn-next">Next →</button>`
        : `<a class="btn btn-primary" href="#/a/${accountId}/roi">To ROI →</a>`}
    </div>
  `);

  // Animate the state change only: bring the newly active step into view.
  const step = (delta) => {
    scenarioActiveStep[accountId] = clamp(active + delta, 1, scenarioSteps.length);
    render();
    const li = dom.view.querySelector('.rail li.is-active');
    if (li) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const prevBtn = document.getElementById('scn-prev');
  const nextBtn = document.getElementById('scn-next');
  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));
}

/* =========================================================================
 * Section 7 - ROI panel (three editable levers, visible formulas, reset)
 * ========================================================================= */

const LEVER_META = {
  downtime: { title: 'Downtime / MTTR', hint: 'Faster routing and investigation reduces minutes of downtime per incident.' },
  'engineer-time': { title: 'Reclaimed engineer time', hint: 'Automation reduces manual paging, timeline-building and status drafting.' },
  consolidation: { title: 'Tool consolidation', hint: 'Retiring point tools removes their standalone licence cost.' },
};

function leverResultHtml(result) {
  return `
    <div class="num">${fmtMoney(result.monthly)}<span>/mo</span></div>
    <div class="small muted">${fmtMoney(result.annual)}/yr</div>
    <div class="formula">${escapeHtml(result.formula)}</div>
  `;
}

// The one deep-burgundy pause in the flow: the conclusion, in white serif, with its formula beside it.
function totalResultHtml(total) {
  return `
    <div class="pause-num serif">${fmtMoney(total.monthly)}<span class="per">/mo</span></div>
    <div class="pause-yr">${fmtMoney(total.annual)} a year, illustrative</div>
    <div class="formula">downtime + engineer time + tool consolidation, added monthly</div>
  `;
}

function leverHtml(leverKey, assumptions, result) {
  const meta = LEVER_META[leverKey];
  const fields = assumptions.filter((a) => a.lever === leverKey);
  return `
    <div class="lever">
      <h3>${escapeHtml(meta.title)}</h3>
      <p class="small muted">${escapeHtml(meta.hint)}</p>
      ${fields.map((a) => `
        <div class="field">
          <label for="roi-${a.key}">${escapeHtml(a.label)}</label>
          <div class="field-input">
            <input id="roi-${a.key}" type="number" data-roi-key="${a.key}" value="${a.value}" min="${a.min}" step="${a.step}" inputmode="decimal" />
            <span class="unit">${escapeHtml(a.unit)}</span>
          </div>
          <span class="note">${escapeHtml(a.note)}</span>
        </div>
      `).join('')}
      <div class="result" id="result-${leverKey}">${leverResultHtml(result)}</div>
    </div>
  `;
}

function screenRoi(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return renderFailure('Account not found', 'That prospect id does not match a loaded fixture.', '#/');
  renderStepRail(accountId, 'roi');
  renderModeSwitch(accountId);

  const roiState = ensureRoiState(accountId);
  const values = Roi.assumptionsAsMap(roiState.assumptions);
  const results = Roi.calculate(values);

  renderView(`
    ${accountHeader(bundle.account, 'Three editable levers. Every formula stays visible next to its result and nothing here is a guarantee - these are assumptions you and the prospect can change together.')}

    <div class="section-head"><div class="eyebrow">Business case<span class="sep">·</span>3 editable levers</div></div>
    ${leverHtml('downtime', roiState.assumptions, results.downtime)}
    ${leverHtml('engineer-time', roiState.assumptions, results.engineerTime)}
    ${leverHtml('consolidation', roiState.assumptions, results.consolidation)}

    <section class="pause" aria-labelledby="roi-total-title">
      <div class="eyebrow" id="roi-total-title">Illustrative total<span class="sep">·</span>Not a guarantee</div>
      <div id="result-total">${totalResultHtml(results.total)}</div>
      <p class="pause-note">Built from the editable assumptions above and always disclosed alongside the number. Change any input and this changes with it.</p>
    </section>

    <div class="row" style="margin-top:14px;">
      <button class="btn" type="button" id="roi-reset">Reset to fixture baseline</button>
    </div>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-primary btn-block" href="#/a/${accountId}/share">Switch to share mode</a>
    </div>
  `);

  // Editing an input recomputes and patches only the affected result blocks,
  // so focus/caret position survives - the "changing one input updates the
  // result immediately" requirement without fighting the browser's cursor.
  function refreshResults() {
    const vals = Roi.assumptionsAsMap(roiState.assumptions);
    const res = Roi.calculate(vals);
    document.getElementById('result-downtime').innerHTML = leverResultHtml(res.downtime);
    document.getElementById('result-engineer-time').innerHTML = leverResultHtml(res.engineerTime);
    document.getElementById('result-consolidation').innerHTML = leverResultHtml(res.consolidation);
    document.getElementById('result-total').innerHTML = totalResultHtml(res.total);
  }

  dom.view.querySelectorAll('[data-roi-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-roi-key');
      const assumption = roiState.assumptions.find((a) => a.key === key);
      if (!assumption) return;
      assumption.value = clamp(toNumber(input.value, assumption.value), assumption.min, Infinity);
      EventTrail.record('roi-edit', { accountId, key, value: assumption.value });
      refreshResults();
    });
  });

  document.getElementById('roi-reset').addEventListener('click', () => {
    state.roiByAccount[accountId] = { assumptions: Roi.baselineAssumptions(bundle) };
    EventTrail.record('roi-reset', { accountId });
    showToast('ROI assumptions reset to the fixture baseline.');
    screenRoi(accountId);
  });
}

/* =========================================================================
 * Section 8 - Salesforce-ready payload (typed, mock, no real CRM call)
 * ========================================================================= */

function buildSalesforcePayload(bundle, recs, roiResults, briefVersion) {
  const { account, hypotheses } = bundle;
  const capNames = recs.filter((r) => r.capabilityId).map((r) => byId(DataStore.capabilities, r.capabilityId)).filter(Boolean).map((c) => `${c.product}: ${c.name}`);
  const intNames = recs.filter((r) => r.integrationId).map((r) => byId(DataStore.integrations, r.integrationId)).filter(Boolean).map((i) => i.name);
  return {
    object: 'Opportunity',
    mock: true,
    integrationBoundary: 'No real Salesforce API call is made anywhere in this build - this is a typed preview of the payload shape only.',
    externalId: account.id,
    fields: {
      Account_Name__c: account.name,
      Domain__c: account.domain,
      Industry__c: account.industry || null,
      Already_Customer__c: account.alreadyCustomer,
      Reliability_Hypotheses__c: hypotheses.map((h) => h.statement),
      Recommended_Capabilities__c: capNames,
      Recommended_Integrations__c: intNames,
      Estimated_Monthly_Value_Usd__c: Math.round(roiResults.total.monthly),
      Estimated_Annual_Value_Usd__c: Math.round(roiResults.total.annual),
      Estimate_Is_Guaranteed__c: false,
      Brief_Version__c: briefVersion ? briefVersion.version : null,
      Brief_Mode__c: briefVersion ? briefVersion.mode : null,
      Matcher_Version__c: MATCHER_VERSION,
      Roi_Version__c: ROI_VERSION,
      Generated_At__c: nowIso(),
    },
  };
}

/* =========================================================================
 * Section 9 - share mode (prospect-safe, one consolidated screen)
 * ========================================================================= */

function screenShare(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return renderFailure('Account not found', 'That prospect id does not match a loaded fixture.', '#/');
  renderStepRail(null); // share mode is a single screen, not part of the AE step flow
  renderModeSwitch(accountId);

  const { account, evidences, hypotheses, scenarioSteps, signals } = bundle;
  const recs = Matcher.buildRecommendations(bundle, DataStore.capabilities, DataStore.integrations);
  const capRecs = recs.filter((r) => r.capabilityId);
  const intRecs = recs.filter((r) => r.integrationId);
  const roiState = ensureRoiState(accountId);
  const values = Roi.assumptionsAsMap(roiState.assumptions);
  const results = Roi.calculate(values);

  if (!state.builtBrief[accountId]) state.builtBrief[accountId] = true; // sharing implies the story exists
  let brief = BriefVersionStore.latestFor(accountId, 'share');
  if (!brief) {
    brief = Models.briefVersion({ accountId, version: BriefVersionStore.nextVersionNumber(accountId, 'share'), mode: 'share' });
    BriefVersionStore.add(brief);
    EventTrail.record('brief-built', { accountId, version: brief.version, mode: 'share' });
  }

  renderView(`
    ${accountHeader(account, 'A prospect-safe summary: sources and uncertainty stay visible, internal notes and sales-only language are removed.')}

    <div class="section-head"><div class="eyebrow">Evidence<span class="sep">·</span>${evidences.length} public source${evidences.length === 1 ? '' : 's'}</div><h2>What we found publicly</h2><p class="small muted">Each claim carries its source and the date we saw it.</p></div>
    <div class="ev-list">
      ${evidences.map(evidenceCardHtml).join('')}
    </div>

    <div class="section-head"><div class="eyebrow">Reliability story<span class="sep">·</span>${hypotheses.length} hypotheses</div><h2>Worth discussing</h2><p class="small muted">Marked as hypotheses, not facts.</p></div>
    <div class="stack">${hypotheses.map((h) => hypothesisCard(h, evidences)).join('')}</div>

    <div class="section-head"><div class="eyebrow">Product map<span class="sep">·</span>${capRecs.length + intRecs.length} match${capRecs.length + intRecs.length === 1 ? '' : 'es'}</div><h2>Where incident.io could help</h2><p class="small muted">Each match links the official product page and the public evidence behind it.</p></div>
    <div class="stack">
      ${[...capRecs, ...intRecs].map((r) => recommendationCardShare(r, DataStore.capabilities, DataStore.integrations, evidences)).join('') || renderEmpty('No matches yet', 'No deterministic match found for this account.')}
    </div>

    <div class="section-head"><div class="eyebrow">Scenario<span class="sep">·</span>${scenarioSteps.length} steps</div><h2>An incident, as it would run</h2><p class="small muted">Steps not tied to public evidence are marked illustrative.</p></div>
    <ol class="rail">
      ${scenarioSteps.map((s) => scenarioStepHtml(s, signals, false, false, false)).join('')}
    </ol>

    <div class="section-head"><div class="eyebrow">Business case<span class="sep">·</span>3 editable levers</div><h2>Illustrative business case</h2><p class="small muted">Editable - change any assumption to match reality.</p></div>
    ${leverHtml('downtime', roiState.assumptions, results.downtime)}
    ${leverHtml('engineer-time', roiState.assumptions, results.engineerTime)}
    ${leverHtml('consolidation', roiState.assumptions, results.consolidation)}
    <section class="pause" aria-labelledby="roi-total-title">
      <div class="eyebrow" id="roi-total-title">Illustrative total<span class="sep">·</span>Not a guarantee</div>
      <div id="result-total">${totalResultHtml(results.total)}</div>
      <p class="pause-note">An editable starting point for a real conversation, not a promise. Change any assumption above and this changes with it.</p>
    </section>

    <div class="card card-quiet" style="margin-top:16px;">
      <h4>Share this view</h4>
      <p class="small muted">Stable link - reopens this exact prospect-safe summary.</p>
      <div class="row" style="flex-wrap:nowrap;">
        <input id="share-url" type="text" readonly value="${escapeHtml(location.href)}" class="text-input" style="font-size:13px; background:var(--white);" aria-label="Share link" />
        <button class="btn btn-primary" type="button" id="copy-share-url">Copy link</button>
      </div>
    </div>

    ${aboutBuildNote()}
    <p class="tiny muted" style="margin-top:14px;">Brief v${brief.version} (share) · generated ${fmtDate(brief.createdAt)} · Incident Lens is an audition build, not affiliated with incident.io.</p>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-dark btn-block" href="#/a/${accountId}/brief">Back to AE view</a>
    </div>
  `);

  dom.view.querySelectorAll('[data-roi-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-roi-key');
      const assumption = roiState.assumptions.find((a) => a.key === key);
      if (!assumption) return;
      assumption.value = clamp(toNumber(input.value, assumption.value), assumption.min, Infinity);
      EventTrail.record('roi-edit', { accountId, key, value: assumption.value, mode: 'share' });
      const vals = Roi.assumptionsAsMap(roiState.assumptions);
      const res = Roi.calculate(vals);
      document.getElementById(`result-${assumption.lever}`).innerHTML = leverResultHtml(res[assumption.lever === 'engineer-time' ? 'engineerTime' : assumption.lever]);
      document.getElementById('result-total').innerHTML = totalResultHtml(res.total);
    });
  });

  document.getElementById('copy-share-url').addEventListener('click', async () => {
    const input = document.getElementById('share-url');
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Share link copied.');
    } catch {
      showToast('Could not access clipboard - link is selected, copy manually.');
    }
    EventTrail.record('share-link-copied', { accountId });
  });
}

function recommendationCardShare(rec, capabilities, integrations, evidences) {
  const capability = rec.capabilityId ? byId(capabilities, rec.capabilityId) : null;
  const integration = rec.integrationId ? byId(integrations, rec.integrationId) : null;
  const area = capability ? capability.product : `${integration.category} integration`;
  const title = capability ? capability.name : integration.name;
  const desc = capability ? capability.description : `Official incident.io integration (${integration.category}).`;
  const sourceUrl = capability ? capability.sourceUrl : integration.sourceUrl;
  const supporting = rec.evidenceIds.map((id) => byId(evidences, id)).filter(Boolean);
  return `
    <div class="card rec">
      <div class="rec-head"><span class="chip">${escapeHtml(area)}</span></div>
      <h3>${escapeHtml(title)}</h3>
      <p class="small muted">${escapeHtml(desc)}</p>
      <p class="rec-why">${escapeHtml(rec.reasons[0])}</p>
      <div class="rec-foot">
        ${sourceLink(sourceUrl, 'Official incident.io page')}
        ${supporting.map((e) => sourceLink(e.url, `Evidence: ${e.claim.slice(0, 36)}${e.claim.length > 36 ? '…' : ''}`)).join('')}
      </div>
    </div>
  `;
}

/* =========================================================================
 * Section 10 - router + init
 * Parses the hash route, keeps `state.route`/`state.mode` in sync, and
 * dispatches to the right screen function. This is the only place that
 * decides which screen renders; screens themselves never navigate directly
 * except through location.hash / <a href> so the URL is always the source
 * of truth (needed for the share mode's "stable share URL").
 * ========================================================================= */

function parseRoute(hash) {
  const clean = (hash || '').replace(/^#/, '');
  const parts = clean.split('/').filter(Boolean); // e.g. ['a', '<id>', 'evidence']
  if (parts.length === 0) return { name: 'picker', accountId: null, screen: null };
  if (parts[0] === 'a' && parts[1]) {
    const screen = parts[2] || 'evidence';
    return { name: 'account', accountId: parts[1], screen };
  }
  return { name: 'picker', accountId: null, screen: null };
}

function render() {
  if (state.status === 'loading') {
    dom.steprail.hidden = true;
    dom.modeSwitch.hidden = true;
    setActionBar('');
    renderLoading('Loading three cached prospects. No network after this.');
    return;
  }
  if (state.status === 'error') {
    screenAccountPicker();
    return;
  }

  const route = parseRoute(location.hash);
  state.route = route;

  if (route.name === 'picker') {
    state.mode = 'internal';
    screenAccountPicker();
    return;
  }

  const bundle = DataStore.getAccountBundle(route.accountId);
  if (!bundle) {
    dom.steprail.hidden = true;
    dom.modeSwitch.hidden = true;
    setActionBar('');
    renderFailure('Prospect not found', 'That link does not match one of the three loaded fixtures.', '#/');
    return;
  }

  state.mode = route.screen === 'share' ? 'share' : 'internal';

  switch (route.screen) {
    case 'evidence':
      screenEvidence(route.accountId);
      break;
    case 'brief':
      screenBrief(route.accountId);
      break;
    case 'scenario':
      screenScenario(route.accountId);
      break;
    case 'roi':
      screenRoi(route.accountId);
      break;
    case 'share':
      screenShare(route.accountId);
      break;
    default:
      location.hash = `#/a/${route.accountId}/evidence`;
  }
}

function init() {
  if (dom.vMatcher) dom.vMatcher.textContent = MATCHER_VERSION;
  if (dom.vRoi) dom.vRoi.textContent = ROI_VERSION;

  window.addEventListener('hashchange', render);

  DataStore.load().then((status) => {
    state.status = status;
    if (status === 'error') {
      // eslint-disable-next-line no-console
      console.error('Incident Lens: failed to load fixtures/knowledge base -', DataStore.error);
    }
    render();
  });

  render(); // show the loading state immediately, no blank screen while fetch is in flight
}

init();
