// Incident Lens - app.js
// Independent concept by Ayo Ahmed. Not affiliated with incident.io.
//
// Architecture (mirrors PRD section 5 + section 7):
//  1. Data access  - fetch fixtures/kb once at startup, no network after that.
//  2. Records      - factories that mirror data/schema.md 1:1.
//  3. Deterministic core - Matcher (product/integration recommendations) and
//     Roi (business case math) are pure functions with no DOM/state access.
//     Nothing generative runs in this build: preloaded fixtures are fixed
//     data and live lookups are rule-based extraction from public pages, so
//     the deterministic core is the only thing that decides recommendations
//     or numbers.
//  4. State + Storage - single mutable state object, localStorage-backed
//     feedback/event trail.
//  5. Screens - pure-ish render(state) -> html string functions, one per
//     screen, that never touch localStorage/fetch directly.
//  6. Router/init - wires hash routes to screens and re-renders on state change.
//
// This file is written in sections; each section is syntactically complete
// on its own so `node --check public/app.js` passes after every step.

'use strict';

import { shareHash, parseRoute, applyRoiPayload } from './share-link.js';

/* =========================================================================
 * Section 1 - constants, utils, storage, records, data loading
 * ========================================================================= */

const MATCHER_VERSION = 'matcher-v1.0';
const ROI_VERSION = 'roi-v1.0';
const APP_VERSION = 'incident-lens-1.0.0';

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

// Deterministic content-addressed id: same stable inputs -> same id, always.
// Used for every object produced by the deterministic core (recommendations,
// ROI assumptions) so identical inputs produce identical objects - no clock,
// no counter, no randomness.
function hashId(prefix, ...parts) {
  const input = parts.map((p) => (Array.isArray(p) ? p.join(',') : String(p == null ? '' : p))).join('|');
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36).padStart(7, '0')}`;
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

/* ---------- records (mirror data/schema.md 1:1) ---------- */

// Closed vocabularies from data/schema.md. Anything outside them is coerced to
// the neutral member rather than silently carried through.
const EVIDENCE_SOURCE_TYPES = ['status-page', 'careers', 'engineering', 'blog', 'github', 'homepage', 'other'];
const SCENARIO_ACTORS = ['prospect', 'incident.io', 'system'];
const SCENARIO_PHASES = ['alert', 'routing', 'investigation', 'response', 'customer-update', 'postmortem'];
// Provenance of an ROI input: what kind of claim the starting number is.
const ROI_SOURCES = ['account-size-heuristic', 'industry-benchmark', 'illustrative-placeholder', 'account-evidence'];
const ROI_SOURCE_LABEL = {
  'account-size-heuristic': 'Scaled from account size/industry',
  'industry-benchmark': 'Industry benchmark placeholder',
  'illustrative-placeholder': 'Illustrative placeholder',
  'account-evidence': 'Derived from this account\'s public evidence',
};

const SOURCE_TYPE_LABEL = {
  'status-page': 'Status page', careers: 'Careers page', engineering: 'Engineering page',
  blog: 'Blog post', github: 'GitHub', homepage: 'Company homepage', other: 'Public page',
};

const Records = {
  account(a) {
    return {
      id: a.id,
      domain: a.domain,
      name: a.name,
      industry: a.industry || null,
      createdAt: a.createdAt || nowIso(),
      // Unknown is a real state, not a default of false: a live public-page
      // lookup cannot establish customer status, so null is carried through and
      // rendered/exported as unknown.
      alreadyCustomer: a.alreadyCustomer == null ? (a.live ? null : false) : !!a.alreadyCustomer,
      live: !!a.live,
    };
  },
  evidence(e) {
    return {
      id: e.id,
      accountId: e.accountId,
      claim: e.claim,
      url: e.url,
      // What the page called itself, and what kind of public page it was, so a
      // reader can tell a careers ad apart from a status page or an engineering
      // post without opening the link.
      sourceTitle: e.sourceTitle || '',
      sourceType: EVIDENCE_SOURCE_TYPES.includes(e.sourceType) ? e.sourceType : 'other',
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
      // Ids of the signals this hypothesis draws on, plus an explicit 0-1
      // confidence: a hypothesis must always show what it is built on and how
      // strongly it is held (PRD section 5, "Hypothesis").
      signalIds: h.signalIds || [],
      confidence: clamp(toNumber(h.confidence, 0.5), 0, 1),
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
      // Relationships, not just metadata (PRD section 5, "Integration"):
      // signalPatterns are the public phrases that indicate this tool, which is
      // how an integration is linked to a Signal/Evidence; capabilityIds are the
      // incident.io capabilities it feeds once connected.
      signalPatterns: (i.signalPatterns || []).map((p) => String(p).toLowerCase()),
      capabilityIds: i.capabilityIds || [],
    };
  },
  recommendation({ id, accountId, capabilityId, integrationId, ruleId, reasons, evidenceIds }) {
    return {
      id: id || hashId('rec', accountId, ruleId, capabilityId || '', integrationId || '', (evidenceIds || []).slice().sort()),
      accountId,
      capabilityId: capabilityId || null,
      integrationId: integrationId || null,
      ruleId,
      reasons: reasons || [],
      evidenceIds: evidenceIds || [],
    };
  },
  scenarioStep(s) {
    const personalizedFrom = s.personalizedFrom || [];
    return {
      order: s.order,
      phase: s.phase, // alert|routing|investigation|response|customer-update|postmortem
      text: s.text,
      personalizedFrom,
      // Who acts, what they act on, and whether the step is grounded in public
      // evidence or is an illustrative hypothesis.
      actor: SCENARIO_ACTORS.includes(s.actor) ? s.actor : 'prospect', // prospect|incident.io|system
      system: s.system || '',
      // The incident.io capability this moment of the walkthrough proposes.
      // Kept separate from `system`, which names the tool they are observed (or
      // hypothesized) to use today: the step shows the current workflow and the
      // proposed capability side by side rather than conflating them.
      capabilityId: s.capabilityId || null,
      origin: s.origin === 'evidence' || s.origin === 'hypothesis'
        ? s.origin
        : (personalizedFrom.length ? 'evidence' : 'hypothesis'),
    };
  },
  roiAssumption({ id, accountId, key, label, value, unit, editable, note, min, step, lever, source, scenario }) {
    return {
      id: id || hashId('roi', accountId, key, lever),
      accountId: accountId || null,
      key,
      label,
      value,
      unit,
      editable: editable !== false,
      note: note || '',
      min: min == null ? 0 : min,
      step: step == null ? 1 : step,
      lever, // downtime|engineer-time|consolidation
      // Where the number came from, as a closed vocabulary rather than only
      // prose, and the scenario phase whose cost/time it moves. Both are
      // required by PRD section 5 ("named input, value, unit, source, editable
      // flag and scenario") so a figure can never be shown without saying what
      // kind of claim it is.
      source: ROI_SOURCES.includes(source) ? source : 'illustrative-placeholder',
      scenario: SCENARIO_PHASES.includes(scenario) ? scenario : null,
    };
  },
  briefVersion({ id, accountId, version, mode, createdAt, assumptions, content }) {
    const c = content || {};
    return {
      id: id || uid('brief'),
      accountId,
      version,
      mode, // internal|share
      matcherVersion: MATCHER_VERSION, // rules version this brief was generated with
      roiVersion: ROI_VERSION,
      // Immutable snapshot of the ROI assumptions as they stood when saved, so
      // a stored version never re-renders with numbers it was not saved with.
      roiAssumptions: Object.freeze((assumptions || []).map((a) => Object.freeze({
        id: a.id, key: a.key, label: a.label, value: a.value, unit: a.unit, lever: a.lever,
        source: a.source, scenario: a.scenario,
      }))),
      // Immutable snapshot of the brief as generated, not just its ROI inputs:
      // a stored version can be re-read exactly as it was written, even if the
      // matcher rules or the account's evidence change later.
      content: Object.freeze({
        headline: c.headline || '',
        hypotheses: Object.freeze((c.hypotheses || []).map((h) => Object.freeze({
          id: h.id, statement: h.statement, confidence: h.confidence, evidenceIds: Object.freeze((h.evidenceIds || []).slice()),
        }))),
        questions: Object.freeze((c.questions || []).slice()),
        recommendations: Object.freeze((c.recommendations || []).map((r) => Object.freeze({
          id: r.id, ruleId: r.ruleId, title: r.title, area: r.area, reason: r.reason,
          evidenceIds: Object.freeze((r.evidenceIds || []).slice()),
        }))),
        scenarioSteps: Object.freeze((c.scenarioSteps || []).map((s) => Object.freeze({
          order: s.order, phase: s.phase, text: s.text, actor: s.actor, system: s.system, origin: s.origin,
          capabilityId: s.capabilityId,
        }))),
      }),
      createdAt: createdAt || nowIso(),
    };
  },
  feedbackEvent({ id, briefId, recommendationId, useful, comment, at }) {
    return {
      id: id || uid('fb'),
      briefId,
      // Set when the feedback is about one specific recommendation; null when
      // it is about the brief as a whole.
      recommendationId: recommendationId || null,
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
};

/* ---------- live bundle persistence ----------------------------------------
 * Fixtures ship with the build, but a live-researched bundle only exists
 * because someone ran a lookup. Keeping it in memory meant a reload (or a
 * re-opened link) lost the prospect entirely, so the full bundle is written to
 * a versioned localStorage key and hydrated back into DataStore on load.
 * ------------------------------------------------------------------------- */

const LIVE_BUNDLES_KEY = 'il-live-bundles-v1';
const LIVE_BUNDLES_MAX = 12;

const LiveBundleStore = {
  all() {
    const list = Storage.get(LIVE_BUNDLES_KEY, []);
    return Array.isArray(list) ? list.filter((b) => b && b.account && b.account.id) : [];
  },
  save(bundle) {
    const list = LiveBundleStore.all().filter((b) => b.account.id !== bundle.account.id);
    list.unshift(bundle);
    while (list.length > LIVE_BUNDLES_MAX) list.pop();
    Storage.set(LIVE_BUNDLES_KEY, list);
    return list;
  },
  // Domain of a stored live bundle, used to offer a re-run when a link points
  // at a live account this browser never researched.
  domainFor(accountId) {
    const found = LiveBundleStore.all().find((b) => b.account.id === accountId);
    return found ? found.account.domain : null;
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

      DataStore.accounts = fixtures.map((fx) => DataStore.normalizeBundle(fx));
      DataStore.capabilities = (kbJson.capabilities || []).map(Records.capability);
      DataStore.integrations = (kbJson.integrations || []).map(Records.integration);
      DataStore.hydrateLiveBundles();

      DataStore.status = 'ready';
    } catch (err) {
      DataStore.status = 'error';
      DataStore.error = err && err.message ? err.message : String(err);
    }
    return DataStore.status;
  },

  normalizeBundle(fx) {
    return {
      account: Records.account(fx.account),
      evidences: (fx.evidences || []).map(Records.evidence),
      signals: (fx.signals || []).map(Records.signal),
      hypotheses: (fx.hypotheses || []).map(Records.hypothesis),
      scenarioSteps: (fx.scenarioSteps || []).map(Records.scenarioStep).sort((a, b) => a.order - b.order),
      research: fx.research || null,
    };
  },

  // `persist: false` is used when hydrating from storage, so reading a bundle
  // back does not rewrite what it was just read from.
  addLiveBundle(raw, opts) {
    const bundle = DataStore.normalizeBundle(raw);
    const index = DataStore.accounts.findIndex((a) => a.account.id === bundle.account.id);
    if (index >= 0) DataStore.accounts[index] = bundle;
    else DataStore.accounts.unshift(bundle);
    if (!opts || opts.persist !== false) LiveBundleStore.save(bundle);
    return bundle;
  },

  // Live bundles researched in an earlier session, restored so a reload or a
  // re-opened link still finds the prospect.
  hydrateLiveBundles() {
    LiveBundleStore.all().forEach((raw) => {
      try { DataStore.addLiveBundle(raw, { persist: false }); } catch { /* skip an unreadable stored bundle rather than failing the whole load */ }
    });
    return DataStore.accounts;
  },

  getAccountBundle(accountId) {
    return DataStore.accounts.find((a) => a.account.id === accountId) || null;
  },
};

/* =========================================================================
 * Section 2 - deterministic core: Matcher + Roi
 * These are pure functions: (data in) -> (data out), no DOM, no storage,
 * no fetch. Every recommendation and every ROI number must be traceable
 * back to a rule/formula defined here. Nothing generative runs here.
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
      reason: (label) => `Team is described as generalist rather than dedicated SRE (signal: "${label}"), so an automatically drafted root-cause hypothesis and a conversational assistant reduce the specialist knowledge an on-call generalist needs on the spot.`,
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

  /* ---- claims guard for LIVE accounts ------------------------------------
   * Live extraction establishes exactly one thing: that a term appeared on a
   * public page. It does not establish that the company runs that thing, staffs
   * a rotation, or has any workflow at all. Fixture accounts are curated, so
   * their reasons stand as written; for `account.live === true` accounts every
   * reason is rebuilt as observation-then-hypothesis, named against the kind of
   * page the mention came from. "Publicly mentions X" never becomes "runs X".
   * ---------------------------------------------------------------------- */

  // Names the evidence kind behind a match, e.g. "their public careers page".
  mentionSource(evidences, evidenceIds) {
    const ev = (evidenceIds || []).map((id) => byId(evidences, id)).find(Boolean);
    if (!ev) return 'their public pages';
    const label = (SOURCE_TYPE_LABEL[ev.sourceType] || SOURCE_TYPE_LABEL.other).toLowerCase();
    return ev.sourceType === 'github' ? 'their public GitHub presence' : `their public ${label}`;
  },

  guardedCapabilityReason(signal, capability, evidences) {
    const src = Matcher.mentionSource(evidences, signal.evidenceIds);
    return `${src.slice(0, 1).toUpperCase()}${src.slice(1)} mentions "${signal.label}". `
      + 'A mention on a public page is an observation, not a confirmed practice - nothing read here shows how, or whether, they work this way. '
      + `If discovery confirms it reflects their setup, ${capability.product} - ${capability.name} is the capability worth exploring.`;
  },

  guardedIntegrationReason(integration, hit, evidences) {
    const src = Matcher.mentionSource(evidences, hit.evidenceIds);
    return `${src.slice(0, 1).toUpperCase()}${src.slice(1)} names "${integration.name}" ("${hit.text}"). `
      + 'A public mention is not evidence that it sits in their incident workflow. '
      + `If it does, incident.io has an official ${integration.name} integration to check against it.`;
  },

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
    const wordRe = (term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    integrations.forEach((integration) => {
      if (integration.name.toLowerCase() === account.name.toLowerCase()) return;
      // The integration's own name plus its declared signal phrases ("amazon web
      // services" for AWS): that list is the declared link between an Integration
      // and the Signals/Evidence that indicate it. Still an exact word match -
      // nothing is inferred beyond the phrase appearing in their own evidence.
      const patterns = [integration.name, ...integration.signalPatterns].map(wordRe);
      const hit = haystacks.find((h) => patterns.some((re) => re.test(h.text)));
      if (!hit) return;
      recs.push(Records.recommendation({
        accountId: account.id,
        integrationId: integration.id,
        ruleId: 'rule-mentioned-in-evidence',
        reasons: [account.live
          ? Matcher.guardedIntegrationReason(integration, hit, evidences)
          : `Public evidence explicitly mentions "${integration.name}" ("${hit.text}"), so the official incident.io ${integration.name} integration would plug directly into the workflow they already run.`],
        evidenceIds: hit.evidenceIds,
      }));
    });
    return recs;
  },

  matchCapabilities(accountBundle, capabilities) {
    const { account, signals, evidences } = accountBundle;
    const recs = [];
    signals.forEach((signal) => {
      const label = signal.label.toLowerCase();
      Matcher.CAPABILITY_RULES.forEach((rule) => {
        if (!rule.test(label)) return;
        rule.capabilityIds.forEach((capId) => {
          const capability = byId(capabilities, capId);
          if (!capability) return;
          recs.push(Records.recommendation({
            accountId: account.id,
            capabilityId: capId,
            ruleId: rule.id,
            reasons: [account.live
              ? Matcher.guardedCapabilityReason(signal, capability, evidences)
              : rule.reason(signal.label)],
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
    const accountId = accountBundle.account.id;
    const scale = industry.includes('bank') ? 1.6 : industry.includes('cloud') ? 1.3 : 1;
    // Every assumption is scoped to the account so its id is content-derived
    // (account + key + lever) rather than clock/counter based.
    const assumption = (spec) => Records.roiAssumption({ ...spec, accountId });
    return [
      assumption({
        key: 'incidentsPerMonth', label: 'Incidents per month', value: Math.round(4 * scale), unit: 'incidents',
        note: 'Illustrative starting point based on account size/industry - replace with the prospect\'s own number.', min: 0, step: 1, lever: 'downtime',
        source: 'account-size-heuristic', scenario: 'alert',
      }),
      assumption({
        key: 'minutesReducedPerIncident', label: 'Downtime reduced per incident', value: Math.round(18 * scale), unit: 'minutes',
        note: 'Faster routing/investigation is assumed to shave this many minutes off mean time to resolution.', min: 0, step: 1, lever: 'downtime',
        source: 'illustrative-placeholder', scenario: 'investigation',
      }),
      assumption({
        key: 'costPerMinuteDowntime', label: 'Cost of downtime', value: industry.includes('bank') ? 400 : 150, unit: '$ / minute',
        note: 'Benchmark placeholder - swap for the prospect\'s own revenue-at-risk figure.', min: 0, step: 10, lever: 'downtime',
        source: 'industry-benchmark', scenario: 'response',
      }),
      assumption({
        key: 'hoursReclaimedPerIncident', label: 'Engineer hours reclaimed per incident', value: 2.5, unit: 'hours',
        note: 'Time saved on manual paging, timeline-building and status drafting per incident.', min: 0, step: 0.5, lever: 'engineer-time',
        source: 'illustrative-placeholder', scenario: 'postmortem',
      }),
      assumption({
        key: 'engineerHourlyRate', label: 'Fully loaded engineer rate', value: 90, unit: '$ / hour',
        note: 'Illustrative fully-loaded engineering cost - not a real payroll figure.', min: 0, step: 5, lever: 'engineer-time',
        source: 'industry-benchmark', scenario: 'postmortem',
      }),
      assumption({
        key: 'toolsConsolidated', label: 'Point tools consolidated', value: accountBundle.account.alreadyCustomer ? 1 : 2, unit: 'tools',
        note: 'Paging/status/timeline tools this account could retire by consolidating onto incident.io.', min: 0, step: 1, lever: 'consolidation',
        source: 'account-evidence', scenario: 'customer-update',
      }),
      assumption({
        key: 'costPerTool', label: 'Average cost per tool', value: 220, unit: '$ / month',
        note: 'Illustrative average monthly seat/licence cost for a point tool being replaced.', min: 0, step: 10, lever: 'consolidation',
        source: 'industry-benchmark', scenario: 'routing',
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
  roiHydrated: {}, // accountId -> true once the URL's ROI assumptions were applied
  builtBrief: {}, // accountId -> true once "Build the reliability story" has been tapped
  // Persisted data read once per route by the controller and handed to the
  // render functions, so no render function reads/writes localStorage itself.
  viewData: {}, // accountId -> { internalBrief, shareBrief, recentEvents }
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
let toastHideTimer = null;
function showToast(message) {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  dom.toast.classList.remove('is-leaving');
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimer = setTimeout(() => {
    // Let the exit animation run before the element is removed from layout.
    dom.toast.classList.add('is-leaving');
    toastHideTimer = setTimeout(() => {
      dom.toast.hidden = true;
      dom.toast.classList.remove('is-leaving');
    }, 240);
  }, 2600);
}

// Brief success state on a button after an action lands (copy link, copy
// payload): the label swaps to a check + confirmation, then restores. Orange
// means "action available"; charcoal here means "done".
function flashButtonSuccess(btn, label) {
  if (!btn || btn.dataset.flashing) return;
  const original = btn.innerHTML;
  btn.dataset.flashing = '1';
  btn.classList.add('is-success');
  btn.innerHTML = `<span class="check" aria-hidden="true">✓</span>${escapeHtml(label)}`;
  setTimeout(() => {
    btn.classList.remove('is-success');
    btn.innerHTML = original;
    delete btn.dataset.flashing;
  }, 1800);
}

function setActionBar(html) {
  if (!html) {
    dom.actionbar.hidden = true;
    dom.actionbar.innerHTML = '';
    return;
  }
  dom.actionbar.hidden = false;
  dom.actionbar.innerHTML = html;
  // Slide the bar in only with a fresh screen (set by renderView, which every
  // screen calls first); in-screen re-renders keep it still.
  dom.actionbar.classList.toggle('bar-enter', viewIsFresh);
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
  // Patch the existing pills when the rail already belongs to this account, so
  // the current/done state change can transition instead of being rebuilt.
  const existing = Array.from(dom.steprail.querySelectorAll('li > a'));
  const sameRail = existing.length === AE_STEPS.length
    && existing[0].getAttribute('href') === `#/a/${accountId}/${AE_STEPS[0].key}`;
  if (sameRail) {
    existing.forEach((a, i) => {
      if (AE_STEPS[i].key === activeKey) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
      a.classList.toggle('done', i < activeIdx);
    });
  } else {
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
  }
  dom.steprail.hidden = false;
}

function renderModeSwitch(accountId) {
  if (!accountId) {
    dom.modeSwitch.hidden = true;
    dom.modeSwitch.innerHTML = '';
    return;
  }
  dom.modeSwitch.hidden = false;
  const buttons = dom.modeSwitch.querySelectorAll('[data-mode-switch]');
  if (buttons.length === 2) {
    // Patch in place so the pressed state slides rather than re-mounts.
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-mode-switch') === state.mode)));
    return;
  }
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
  recordEvent('mode-switch', { accountId, from: state.mode, to: target });
  if (target === 'share') {
    // Carry the current assumptions into the share URL so the link is shareable as-is.
    const bundle = DataStore.getAccountBundle(accountId);
    if (!bundle) return;
    location.hash = shareHash(bundle.account, ensureRoiState(accountId).assumptions);
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

/* ---------- share-link state (ROI assumptions travel in the URL hash) ------
 * A share link must reopen the same numbers the AE was looking at, so the
 * current assumptions are encoded compactly into the hash as
 * `#/a/<id>/share?roi=key:value;key:value` and applied on load. Missing or
 * unparseable params fall back to the fixture baseline.
 * ------------------------------------------------------------------------- */

function shareUrl(account, assumptions) {
  return `${location.origin}${location.pathname}${location.search}${shareHash(account, assumptions)}`;
}

// Hydration is keyed on the payload the link carries, not on the account alone:
// opening a second link for the same prospect with different assumptions must
// display that second link's numbers. The key is the raw `roi` parameter, so
// re-rendering (or editing inside) the same link does not stomp on live edits,
// while a genuinely different payload re-seeds from the baseline - keys the new
// link omits fall back to the baseline instead of inheriting the old link's
// value. Navigating to a route with no `roi` parameter at all changes nothing,
// so AE-side edits survive moving between screens.
function hydrateRoiFromRoute(accountId, query) {
  const payload = (query && query.roi) || '';
  const known = Object.prototype.hasOwnProperty.call(state.roiHydrated, accountId);
  if (known && (!payload || state.roiHydrated[accountId] === payload)) return ensureRoiState(accountId);
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return ensureRoiState(accountId);
  const assumptions = applyRoiPayload(Roi.baselineAssumptions(bundle), payload);
  state.roiByAccount[accountId] = { assumptions };
  state.roiHydrated[accountId] = payload;
  return state.roiByAccount[accountId];
}

/* ---------- controller actions ----------------------------------------------
 * These are the only functions allowed to touch the storage helpers
 * (EventTrail / FeedbackStore / BriefVersionStore). They are called from event
 * handlers and from the router before a screen renders; render functions read
 * the results from `state.viewData` instead of the stores.
 * ------------------------------------------------------------------------- */

function recordEvent(type, detail) {
  return EventTrail.record(type, detail);
}

function loadAccountViewData(accountId) {
  const snapshot = {
    internalBrief: BriefVersionStore.latestFor(accountId, 'internal'),
    shareBrief: BriefVersionStore.latestFor(accountId, 'share'),
    recentEvents: EventTrail.forAccount(accountId).slice(-6).reverse(),
  };
  state.viewData[accountId] = snapshot;
  return snapshot;
}

/* Route preparation for every account-scoped screen. Everything a screen needs
 * is resolved here - the bundle, the deterministic recommendations, the
 * knowledge base, the ROI assumptions (initialized, not created by a render),
 * the share link and the brief version that identifies the displayed snapshot.
 * The result is handed to the screen as an argument, so no render function
 * reads DataStore, LiveBundleStore or any other store itself. */
function prepareAccountView(accountId, screen) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return null;
  const assumptions = ensureRoiState(accountId).assumptions;
  const recommendations = Matcher.buildRecommendations(bundle, DataStore.capabilities, DataStore.integrations);
  const view = {
    accountId,
    screen,
    bundle,
    recommendations,
    capabilities: DataStore.capabilities,
    integrations: DataStore.integrations,
    assumptions,
    content: buildBriefContent(bundle, recommendations, DataStore.capabilities, DataStore.integrations),
    shareHash: shareHash(bundle.account, assumptions),
    built: !!state.builtBrief[accountId],
    brief: null,
    recentEvents: [],
  };
  if (screen === 'share') {
    view.brief = ensureShareVersion(accountId, view.content, assumptions);
    view.built = true;
  } else if (state.builtBrief[accountId]) {
    // A story on screen always has a version behind it - including one first
    // built by opening a share link - so feedback is never recorded against a
    // null brief id, and the label always names the snapshot being displayed.
    view.brief = versionForDisplay(accountId, 'internal', view.content, assumptions);
    view.built = true;
  }
  const snapshot = loadAccountViewData(accountId);
  snapshot.view = view;
  view.recentEvents = snapshot.recentEvents;
  return view;
}

// Controller action: the ROI reset button asks for a fresh baseline; reading
// the bundle for it happens here, not in the render.
function resetRoiAssumptions(accountId) {
  const bundle = DataStore.getAccountBundle(accountId);
  if (!bundle) return null;
  state.roiByAccount[accountId] = { assumptions: Roi.baselineAssumptions(bundle) };
  recordEvent('roi-reset', { accountId });
  return state.roiByAccount[accountId];
}

// Controller action: the domain a live-recovery link points at, read from the
// link itself or from a bundle this browser stored earlier.
function recoveryDomainFor(route) {
  return (route.query && route.query.d) || LiveBundleStore.domainFor(route.accountId) || '';
}

// The generated brief as content: hypotheses, discovery questions, the
// deterministic product map and the scenario, resolved to the copy actually
// shown. Pure - it reads the bundle and the knowledge base, nothing else.
function buildBriefContent(bundle, recs, capabilities, integrations) {
  const { account, hypotheses, scenarioSteps } = bundle;
  return {
    headline: `${account.name} - reliability story from ${bundle.evidences.length} public source${bundle.evidences.length === 1 ? '' : 's'}`,
    hypotheses: hypotheses.map((h) => ({ id: h.id, statement: h.statement, confidence: h.confidence, evidenceIds: h.evidenceIds })),
    questions: Matcher.deriveDiscoveryQuestions(hypotheses),
    recommendations: recs.map((r) => {
      const capability = r.capabilityId ? byId(capabilities, r.capabilityId) : null;
      const integration = r.integrationId ? byId(integrations, r.integrationId) : null;
      return {
        id: r.id,
        ruleId: r.ruleId,
        title: capability ? capability.name : integration ? integration.name : '',
        area: capability ? capability.product : integration ? `${integration.category} integration` : '',
        reason: r.reasons[0] || '',
        evidenceIds: r.evidenceIds,
      };
    }),
    scenarioSteps,
  };
}

// Freeze a brief version together with the content and the ROI assumptions it
// was saved with. Both can be passed in, so a version always snapshots exactly
// what the screen is about to display rather than re-deriving it later.
function saveVersion(accountId, mode, opts) {
  const o = opts || {};
  const bundle = DataStore.getAccountBundle(accountId);
  const content = o.content
    || (bundle ? buildBriefContent(bundle, Matcher.buildRecommendations(bundle, DataStore.capabilities, DataStore.integrations), DataStore.capabilities, DataStore.integrations) : null);
  const brief = Records.briefVersion({
    accountId,
    version: BriefVersionStore.nextVersionNumber(accountId, mode),
    mode,
    assumptions: o.assumptions || ensureRoiState(accountId).assumptions,
    content,
  });
  BriefVersionStore.add(brief);
  recordEvent('brief-built', { accountId, version: brief.version, mode });
  const snapshot = loadAccountViewData(accountId);
  // Keep the in-memory snapshot correct even when localStorage is unavailable.
  if (mode === 'share') snapshot.shareBrief = brief;
  else snapshot.internalBrief = brief;
  return brief;
}

/* A version label has to identify the snapshot actually on screen. The stored
 * snapshot is compared against what is about to be displayed - the brief content
 * and the ROI assumptions - and the existing version is reused only when they
 * match. A different payload (a second share link with different numbers, an
 * account whose evidence changed) gets its own version instead of being labelled
 * with an earlier version's number while showing different figures. */
function snapshotSignature(content, assumptions) {
  const c = content || {};
  return JSON.stringify({
    headline: c.headline || '',
    hypotheses: (c.hypotheses || []).map((h) => h.id),
    recommendations: (c.recommendations || []).map((r) => r.id),
    scenario: (c.scenarioSteps || []).map((s) => `${s.order}:${s.text}`),
    roi: (assumptions || []).map((a) => `${a.key}:${a.value}`),
  });
}

function versionForDisplay(accountId, mode, content, assumptions) {
  const latest = BriefVersionStore.latestFor(accountId, mode);
  if (latest && snapshotSignature(latest.content, latest.roiAssumptions) === snapshotSignature(content, assumptions)) return latest;
  return saveVersion(accountId, mode, { content, assumptions });
}

// Share mode implies the reliability story exists, so the story is marked built
// and a share version covering the displayed snapshot always exists - that is
// the version feedback from a share-first session is attached to.
function ensureShareVersion(accountId, content, assumptions) {
  state.builtBrief[accountId] = true;
  return versionForDisplay(accountId, 'share', content, assumptions);
}

// Fixture sanity check: the PRD promises three hypotheses per account, so a
// mismatch is recorded as an event by the controller (never from a render).
function checkFixtureIntegrity(accountId, bundle) {
  if (bundle.hypotheses.length !== 3) {
    recordEvent('hypothesis-count-warning', { accountId, count: bundle.hypotheses.length });
  }
}

// Controller action for a live lookup: fetch, persist the bundle so it survives
// a reload, and record the event trail. Shared by the picker form and the
// recovery screen, which differ only in how they report progress.
async function runLiveResearch(rawDomain) {
  recordEvent('domain-lookup-started', { domain: rawDomain });
  let payload;
  try {
    const response = await fetch(`/api/research?domain=${encodeURIComponent(rawDomain)}`, { cache: 'no-store' });
    payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Research failed (${response.status}).`);
  } catch (error) {
    const message = error && error.message ? error.message : 'Live research failed. Try the root company domain.';
    recordEvent('domain-lookup-failed', { domain: rawDomain, error: message });
    throw new Error(message);
  }
  const bundle = DataStore.addLiveBundle(payload);
  recordEvent('domain-lookup-completed', { domain: bundle.account.domain, accountId: bundle.account.id, sources: bundle.evidences.length });
  return bundle;
}

function recordFeedback(accountId, briefId, useful, recommendationId) {
  const recId = recommendationId || null;
  const fb = FeedbackStore.add(Records.feedbackEvent({ briefId, recommendationId: recId, useful }));
  recordEvent(recId ? 'recommendation-feedback' : 'feedback', { accountId, useful, briefId, recommendationId: recId });
  return fb;
}

let lastRouteKey = null;
// True while the current render is a genuine screen change (route or
// loading -> ready). Entrance motion runs only then; in-screen re-renders
// (scenario step, ROI reset) swap content with no decorative motion.
let viewIsFresh = false;
// Set by a screen right before render() when an in-route state change deserves
// a full entrance anyway (the "Build the reliability story" reveal).
let forceFreshRender = false;
const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderView(html) {
  const key = `${state.status === 'loading' ? 'loading:' : ''}${location.hash || '#/'}`;
  viewIsFresh = forceFreshRender || key !== lastRouteKey;
  forceFreshRender = false;
  dom.view.innerHTML = `<div class="screen${viewIsFresh ? ' screen-enter' : ''}">${html}</div>`;
  // Focus for keyboard/skip-link users without letting the browser yank the
  // page so the title hides behind the sticky rail. Scroll to top only when
  // the route actually changed; in-screen state changes keep their position.
  dom.view.focus({ preventScroll: true });
  // Instant, not smooth: the content already changed, so animating the scroll
  // would drag the new screen upwards. Smooth scrolling is for in-page moves.
  if (viewIsFresh) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
  if (alreadyCustomer) return `<span class="chip chip-customer">Existing incident.io customer</span>`;
  // null = nothing public established it either way. Saying so is honest; a
  // silent absence would read as "confirmed not a customer".
  if (alreadyCustomer == null) return `<span class="chip chip-unknown"><span class="g">?</span> Customer status not publicly confirmed</span>`;
  return '';
}

// Plainspoken note about how the fixtures were chosen. Shown on the picker
// (below the fixtures) and in prospect-share mode, next to the disclaimer.
function aboutBuildNote() {
  return `
    <aside class="about-build" aria-labelledby="about-build-title">
      <div class="eyebrow" id="about-build-title">How live mode works</div>
      <p class="hand">Enter a company domain. Incident Lens reads public pages now, separates observed evidence from hypotheses, then carries the result through the same brief, scenario, ROI and share flow.</p>
      <p class="tiny muted">Smallest honest v1: public company site, status page, engineering/blog pages and careers routes. Some sites block automated reading; those lookups fail instead of filling gaps with guesses.</p>
    </aside>
  `;
}

// Copy guard for live accounts, used by both the AE brief and the share view.
// A live lookup establishes only that a term appeared on a public page, so the
// surrounding copy has to frame capability fit as a hypothesis. Fixture copy is
// curated evidence and is left exactly as written.
const LiveCopy = {
  note(account) {
    return account.live
      ? 'Live research establishes only that these terms appear on public pages we could read. How they actually work is a hypothesis to test, not a finding.'
      : '';
  },
  pick(account, liveText, fixtureText) {
    return account.live ? liveText : fixtureText;
  },
};

function evidenceCountSummary(bundle) {
  const observed = bundle.evidences.filter((e) => e.kind === 'observed').length;
  const inferred = bundle.evidences.filter((e) => e.kind === 'inferred').length;
  return { observed, inferred, total: bundle.evidences.length };
}

/* A link can point at a live account this browser has never researched: it was
 * shared with someone else, or local storage was cleared. A live account id is a
 * content hash of the domain, so the domain cannot be read back out of the id -
 * it comes from a stored bundle when there is one, or from the `d` parameter the
 * share link carries. Either way the answer is an offer to re-run the lookup,
 * never a dead end. */
// `domain` is resolved by the controller (recoveryDomainFor) from the link and
// the stored live bundles; this render reads no store itself.
function screenLiveRecovery(accountId, domain) {
  renderStepRail(null);
  renderModeSwitch(null);
  setActionBar('');
  renderView(`
    <div class="section-head">
      <div class="eyebrow">Live prospect<span class="sep">·</span>Not in this browser</div>
      <h1>This link needs a fresh lookup</h1>
      <p class="lede">Live research is held locally, so a link opened in another browser (or after local data was cleared) has no bundle to show. Nothing is reconstructed from memory - re-run the lookup and the same public pages are read again.</p>
    </div>
    <form id="recover-form" class="card domain-form live-domain-form">
      <label class="small" for="recover-input" style="font-weight:600;">Company domain</label>
      <div class="row" style="flex-wrap:nowrap;">
        <input id="recover-input" name="domain" type="text" inputmode="url" autocomplete="off" class="text-input" placeholder="e.g. incident.io" value="${escapeHtml(domain)}" required />
        <button class="btn btn-primary" id="recover-submit" type="submit">Re-run live research</button>
      </div>
      <div class="tiny muted" id="recover-status" role="status" aria-live="polite">${domain
        ? `We know this link pointed at <span class="mono">${escapeHtml(domain)}</span>. Re-running reads its public pages now - results can differ from what the sender saw.`
        : 'The domain is not recoverable from the link alone. Enter it to run the same lookup.'}</div>
      <p class="tiny muted"><span class="mono">${escapeHtml(accountId)}</span></p>
    </form>
    <div class="row" style="margin-top:12px;"><a class="btn" href="#/">Back to prospects</a></div>
  `);

  document.getElementById('recover-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = document.getElementById('recover-input');
    const submit = document.getElementById('recover-submit');
    const status = document.getElementById('recover-status');
    const raw = input.value.trim();
    if (!raw) return;
    input.disabled = true;
    submit.disabled = true;
    submit.classList.add('is-working');
    submit.setAttribute('aria-busy', 'true');
    submit.innerHTML = '<span class="spinner" aria-hidden="true"></span>Researching…';
    status.classList.remove('is-error');
    status.textContent = 'Reading public pages now. Anything we cannot read is left out, not guessed.';
    try {
      const bundle = await runLiveResearch(raw);
      if (bundle.account.id === accountId) {
        showToast('Live research re-run - this link works again.');
        forceFreshRender = true;
        render();
      } else {
        showToast(`Researched ${bundle.account.domain}, which is a different prospect to the one this link pointed at.`);
        location.hash = `#/a/${bundle.account.id}/evidence`;
      }
    } catch (error) {
      status.textContent = error && error.message ? error.message : 'Live research failed. Try the root company domain.';
      status.classList.add('is-error');
      input.disabled = false;
      submit.disabled = false;
      submit.classList.remove('is-working');
      submit.removeAttribute('aria-busy');
      submit.textContent = 'Re-run live research';
      input.focus();
    }
  });
}

// `catalog` is prepared by the controller: { accounts, error }. The picker, like
// every other screen, renders from what it was handed.
function screenAccountPicker(catalog) {
  const { accounts, error } = catalog;
  renderStepRail(null);
  renderModeSwitch(null);

  if (state.status === 'error') {
    setActionBar('');
    renderFailure(
      'Fixtures failed to load',
      `Could not load the cached prospect data (${error || 'unknown error'}). A reload is the only dependency this demo has.`,
      '#/',
      { reload: true },
    );
    return;
  }

  if (!accounts.length) {
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

  const cards = accounts.map((bundle) => {
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
    <section class="hero" aria-labelledby="hero-title">
      <div class="eyebrow eyebrow-live">Live research<span class="sep">·</span>Public evidence only</div>
      <h1 class="hero-title" id="hero-title">Research any company live</h1>
      <p class="lede hero-lede">Enter a domain. Incident Lens checks public reliability signals now, cites every observed claim, and labels every inference.</p>
      <form id="domain-form" class="card domain-form live-domain-form" role="search">
        <label class="small" for="domain-input" style="font-weight:600;">Company domain</label>
        <div class="row" style="flex-wrap:nowrap;">
          <input id="domain-input" name="domain" type="text" inputmode="url" autocomplete="off" placeholder="e.g. incident.io" class="text-input" required />
          <button class="btn btn-primary" id="domain-submit" type="submit">Research live</button>
        </div>
        <div class="tiny muted" id="domain-status" role="status" aria-live="polite">Reads the company site, status page, engineering blog and careers pages. Public pages only, every claim linked.</div>
      </form>
    </section>
    <div class="section-head picker-examples"><div class="eyebrow">Recent examples<span class="sep">·</span>${accounts.filter((b) => !b.account.live).length} preloaded</div></div>
    <div class="stack">
      ${cards}
    </div>
    ${aboutBuildNote()}
  `);
  setActionBar('');

  dom.view.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = btn.getAttribute('data-goto'); });
  });

  const form = document.getElementById('domain-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = document.getElementById('domain-input');
    const submit = document.getElementById('domain-submit');
    const status = document.getElementById('domain-status');
    const raw = input.value.trim();
    if (!raw) return;
    submit.disabled = true;
    submit.classList.add('is-working');
    submit.setAttribute('aria-busy', 'true');
    submit.innerHTML = '<span class="spinner" aria-hidden="true"></span>Researching…';
    input.disabled = true;
    status.classList.remove('is-error');
    // Live progress: the set of public routes being checked, with a moving
    // highlight for activity. No checkmarks - nothing is claimed as read until
    // the ledger renders with its dated, linked evidence.
    const routes = ['Company site', 'Status page', 'Engineering blog', 'Careers', 'Open source'];
    status.innerHTML = `
      <div class="research-progress">
        <div class="progress-bar" aria-hidden="true"><span></span></div>
        <div class="progress-routes" aria-hidden="true">
          <span class="tiny muted">Checking</span>
          ${routes.map((r, i) => `<span class="chip${i === 0 ? ' is-now' : ''}">${escapeHtml(r)}</span>`).join('')}
        </div>
        <p class="tiny muted">Reading public pages now. Usually 10–30 seconds; anything we cannot read is left out, not guessed.</p>
      </div>`;
    let routeIdx = 0;
    const cycle = setInterval(() => {
      routeIdx = (routeIdx + 1) % routes.length;
      status.querySelectorAll('.progress-routes .chip').forEach((c, j) => c.classList.toggle('is-now', j === routeIdx));
    }, 1800);
    try {
      const bundle = await runLiveResearch(raw);
      clearInterval(cycle);
      location.hash = `#/a/${bundle.account.id}/evidence`;
    } catch (error) {
      clearInterval(cycle);
      status.textContent = error && error.message ? error.message : 'Live research failed. Try the root company domain.';
      status.classList.add('is-error');
      submit.disabled = false;
      submit.classList.remove('is-working');
      submit.removeAttribute('aria-busy');
      submit.textContent = 'Research live';
      input.disabled = false;
      input.focus();
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

function sourceTypeChip(sourceType) {
  return `<span class="chip">${escapeHtml(SOURCE_TYPE_LABEL[sourceType] || SOURCE_TYPE_LABEL.other)}</span>`;
}

function evidenceCardHtml(evidence) {
  return `
    <div class="ev ${evidence.kind}">
      <div class="chiprow">${kindChip(evidence.kind)}${confidenceChip(evidence.confidence)}${sourceTypeChip(evidence.sourceType)}</div>
      <p class="claim">${escapeHtml(evidence.claim)}</p>
      <dl class="meta">
        <dt>Source</dt><dd>${sourceLink(evidence.url)}</dd>
        ${evidence.sourceTitle ? `<dt>Page</dt><dd>${escapeHtml(evidence.sourceTitle)}</dd>` : ''}
        <dt>Observed</dt><dd class="mono">${fmtDate(evidence.observedAt)}</dd>
      </dl>
    </div>
  `;
}

// `view` is the controller-prepared state (prepareAccountView); this function
// reads nothing but its argument.
function screenEvidence(view) {
  const { accountId, bundle } = view;
  renderStepRail(accountId, 'evidence');
  renderModeSwitch(accountId);

  const counts = evidenceCountSummary(bundle);
  const list = bundle.evidences.length
    ? bundle.evidences.map(evidenceCardHtml).join('')
    : renderEmpty('No evidence yet', 'This account has no evidence cards loaded, so no brief can be generated - unsupported claims are blocked, not invented.');

  renderView(`
    ${accountHeader(bundle.account, `Every claim below is public, dated and linked. Nothing is presented as fact without a source.${bundle.account.live && bundle.research ? ` Live lookup read ${bundle.research.pagesRead} of ${bundle.research.pagesChecked} routes.` : ''}`)}
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

// One renderer for both surfaces. The AE view adds the "Why this?" lead-in and
// the rule id; the prospect-safe share view shows the same reason without the
// internal rule plumbing. The lookup/markup itself is shared so the two views
// can never drift apart.
function recommendationCard(rec, capabilities, integrations, evidences, opts) {
  const mode = (opts && opts.mode) === 'share' ? 'share' : 'internal';
  const capability = rec.capabilityId ? byId(capabilities, rec.capabilityId) : null;
  const integration = rec.integrationId ? byId(integrations, rec.integrationId) : null;
  const area = capability ? capability.product : `${integration.category} integration`;
  const title = capability ? capability.name : integration.name;
  const desc = capability ? capability.description : `Official incident.io integration (${integration.category}).`;
  const sourceUrl = capability ? capability.sourceUrl : integration.sourceUrl;
  const supporting = rec.evidenceIds.map((id) => byId(evidences, id)).filter(Boolean);
  // An integration is declared as feeding specific capabilities, so the card says
  // which ones rather than leaving the relationship implicit.
  const feeds = integration ? integration.capabilityIds.map((id) => byId(capabilities, id)).filter(Boolean) : [];
  return `
    <div class="card rec">
      <div class="rec-head"><span class="chip">${escapeHtml(area)}</span></div>
      <h3>${escapeHtml(title)}</h3>
      <p class="small muted">${escapeHtml(desc)}</p>
      ${feeds.length ? `<p class="tiny muted">Feeds: ${feeds.map((c) => escapeHtml(`${c.product} - ${c.name}`)).join(' · ')}</p>` : ''}
      <p class="rec-why">${mode === 'internal' ? '<strong>Why this?</strong> ' : ''}${escapeHtml(rec.reasons[0])}</p>
      <div class="rec-foot">
        ${sourceLink(sourceUrl, 'Official incident.io page')}
        ${supporting.map((e) => sourceLink(e.url, `Evidence: ${e.claim.slice(0, 36)}${e.claim.length > 36 ? '…' : ''}`)).join('')}
      </div>
      ${mode === 'internal' ? `
      <p class="tiny muted" style="margin-top:10px;">Rule <span class="mono">${escapeHtml(rec.ruleId)}</span></p>
      <div class="row" style="margin-top:6px;">
        <button class="btn btn-sm" type="button" data-rec-feedback="useful" data-rec-id="${escapeHtml(rec.id)}" aria-pressed="false">Good match</button>
        <button class="btn btn-sm" type="button" data-rec-feedback="not-useful" data-rec-id="${escapeHtml(rec.id)}" aria-pressed="false">Off the mark</button>
      </div>` : ''}
    </div>
  `;
}

function screenBrief(view) {
  const { accountId, bundle, capabilities, integrations, assumptions } = view;
  renderStepRail(accountId, 'brief');
  renderModeSwitch(accountId);

  const { account, evidences, signals, hypotheses } = bundle;
  const built = view.built;

  if (!built) {
    renderView(`
      ${accountHeader(account, 'Signals are normalized from the evidence ledger. Tap below to turn them into evidence-backed hypotheses and a deterministic product map.')}
      <div class="section-head"><div class="eyebrow">Signals<span class="sep">·</span>${signals.length} normalized from evidence</div></div>
      <div class="card">
        <div class="chiprow">
          ${signals.map((s) => `<span class="chip chip-strong">${escapeHtml(s.label)}</span>`).join('')}
        </div>
      </div>
      <div class="empty" style="margin-top:14px;">
        <h3>Nothing written yet - on purpose</h3>
        <p class="small">Tap <strong>Build the reliability story</strong> and these ${signals.length} signals become ${hypotheses.length} evidence-backed hypothes${hypotheses.length === 1 ? 'is' : 'es'}, discovery questions and a product map. All from the evidence ledger; nothing invented.</p>
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
      const btn = document.getElementById('build-story-btn');
      if (!btn || btn.dataset.working) return;
      const finish = () => {
        // The controller saves the version for the snapshot it is about to
        // display (prepareAccountView); this handler only flips the state.
        state.builtBrief[accountId] = true;
        forceFreshRender = true; // same route, but the story arriving deserves a full entrance
        render();
        showToast('Reliability story generated from the evidence ledger.');
      };
      if (prefersReducedMotion()) { finish(); return; }
      // Staged reveal (~1s): name what is actually being used, in order. The
      // result is deterministic and instant; this only makes the step legible.
      const stages = [`Reading ${signals.length} signals`, `Drafting ${hypotheses.length} hypothes${hypotheses.length === 1 ? 'is' : 'es'}`, 'Matching capabilities by rule'];
      btn.dataset.working = '1';
      btn.classList.add('is-working');
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span class="btn-stage">${escapeHtml(stages[0])}</span>`;
      const ghost = dom.view.querySelector('.empty');
      if (ghost) ghost.classList.add('is-building');
      stages.slice(1).forEach((label, i) => setTimeout(() => {
        const fresh = document.createElement('span');
        fresh.className = 'btn-stage';
        fresh.textContent = label;
        const current = btn.querySelector('.btn-stage');
        if (current) current.replaceWith(fresh);
      }, 330 * (i + 1)));
      setTimeout(finish, 330 * stages.length + 60);
    });
    return;
  }

  // Recommendations, the knowledge base, the brief version and the event trail
  // were all resolved by the controller (prepareAccountView) before this render
  // ran; render functions never touch the stores themselves.
  const recs = view.recommendations;
  const capRecs = recs.filter((r) => r.capabilityId);
  const intRecs = recs.filter((r) => r.integrationId);
  const questions = Matcher.deriveDiscoveryQuestions(hypotheses);
  const { brief, recentEvents } = view;

  renderView(`
    ${accountHeader(account, LiveCopy.pick(account,
      'Fact kept apart from interpretation. For a live lookup the facts are the public mentions themselves; everything drawn from them is phrased as a hypothesis, with its rule and evidence shown.',
      'Fact kept apart from interpretation: hypotheses are marked inferred, and every recommendation shows its rule and evidence.'))}

    <div class="section-head">
      <div class="eyebrow">Reliability story<span class="sep">·</span>${hypotheses.length} hypotheses</div>
      <h2>${hypotheses.length === 1 ? 'One thing worth checking' : hypotheses.length ? `${hypotheses.length} things worth checking` : 'Nothing to check yet'}</h2>
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
      <h2>${LiveCopy.pick(account, 'Where incident.io might fit', 'Where incident.io fits')}</h2>
      <p class="small muted">Matcher <span class="mono">${escapeHtml(Matcher.version)}</span>, deterministic rules only - every match shows its rule and evidence. ${escapeHtml(LiveCopy.note(account))}</p>
    </div>
    <div class="stack">
      ${capRecs.length ? capRecs.map((r) => recommendationCard(r, capabilities, integrations, evidences)).join('') : renderEmpty('No capability matches', 'No signal matched a capability rule for this account.')}
    </div>

    <div class="section-head">
      <div class="eyebrow">Integrations<span class="sep">·</span>${intRecs.length} named in evidence</div>
      <h2>${LiveCopy.pick(account, 'Named on their public pages', 'Plugs into what they run')}</h2>
      <p class="small muted">${LiveCopy.pick(account,
        'Only listed when the name appears on a public page we read. A mention is not evidence that the tool sits in their incident workflow.',
        'Only recommended when the integration\'s name appears in the account\'s own public evidence.')}</p>
    </div>
    <div class="stack">
      ${intRecs.length ? intRecs.map((r) => recommendationCard(r, capabilities, integrations, evidences)).join('') : renderEmpty('No integration matches', 'No public evidence explicitly named one of the official integrations for this account.')}
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
      <pre class="pre" id="sf-payload">${escapeHtml(JSON.stringify(buildSalesforcePayload(bundle, recs, Roi.calculate(Roi.assumptionsAsMap(assumptions)), brief, capabilities, integrations), null, 2))}</pre>
    </details>
    <div class="row" style="margin-top:10px;">
      <button class="btn" type="button" id="copy-sf-payload">Copy JSON</button>
    </div>

    <div class="section-head"><div class="eyebrow">Internal<span class="sep">·</span>This session</div><h3 class="h-quiet">Event trail</h3></div>
    <ul class="trail">
      ${recentEvents.map((e) => `<li><time>${fmtDate(e.at)}</time><span>${escapeHtml(e.type)}</span></li>`).join('') || '<li class="muted">No events recorded yet this session.</li>'}
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
      recordFeedback(accountId, brief ? brief.id : null, useful);
      dom.view.querySelectorAll('[data-feedback]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      document.getElementById('feedback-ack').textContent = useful
        ? 'Thanks - recorded as useful.'
        : 'Thanks - recorded as not useful.';
    });
  });

  // Feedback on a single recommendation carries that recommendation's id, so
  // the matcher can be tuned rule by rule rather than only brief by brief.
  dom.view.querySelectorAll('[data-rec-feedback]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-rec-id');
      const useful = btn.getAttribute('data-rec-feedback') === 'useful';
      recordFeedback(accountId, brief ? brief.id : null, useful, recId);
      dom.view.querySelectorAll(`[data-rec-id="${recId}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      showToast(useful ? 'Recorded: good match.' : 'Recorded: off the mark.');
    });
  });

  const copyPayloadBtn = document.getElementById('copy-sf-payload');
  if (copyPayloadBtn) {
    copyPayloadBtn.addEventListener('click', async () => {
      const text = document.getElementById('sf-payload').textContent;
      recordEvent('sf-payload-copied', { accountId });
      try {
        await navigator.clipboard.writeText(text);
        flashButtonSuccess(copyPayloadBtn, 'Copied');
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

const ACTOR_LABEL = {
  prospect: 'Their team',
  'incident.io': 'incident.io',
  system: 'Automated system',
};

const scenarioActiveStep = {}; // accountId -> order (1-based)

function scenarioStepHtml(step, signals, capabilities, isActive, isDone, showState) {
  const personalized = step.personalizedFrom.map((id) => byId(signals, id)).filter(Boolean);
  // The step names the tool they use today (`system`) and, separately, the
  // incident.io capability being proposed for that moment - so a walkthrough
  // that coordinates in FireHydrant and publishes to Atlassian Statuspage still
  // shows what incident.io would do there, without overwriting what they run.
  const capability = step.capabilityId ? byId(capabilities, step.capabilityId) : null;
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
        <p class="tiny muted">${escapeHtml(ACTOR_LABEL[step.actor] || ACTOR_LABEL.prospect)}${step.system ? ` · ${escapeHtml(step.system)}` : ''}</p>
        ${capability ? `<p class="tiny muted">Where incident.io would fit: ${sourceLink(capability.sourceUrl, `${capability.product} - ${capability.name}`)}</p>` : ''}
        ${step.origin === 'evidence' && personalized.length
          ? `<div class="step-src"><span class="tiny muted">From observed signals</span><div class="chiprow">${personalized.map((s) => `<span class="chip chip-strong">${escapeHtml(s.label)}</span>`).join('')}</div></div>`
          : `<span class="chip chip-unknown"><span class="g">?</span> Illustrative - not tied to observed evidence</span>`}
      </div>
    </li>
  `;
}

function screenScenario(view) {
  const { accountId, bundle } = view;
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
    ${accountHeader(account, LiveCopy.pick(account,
      'A compact incident walkthrough. Systems named here come from public mentions, not a confirmed inventory - the walkthrough is a hypothesis to test, and steps not tied to public evidence are marked illustrative.',
      'A compact incident walkthrough personalized to their observed or hypothesized stack. Steps not tied to public evidence are clearly marked illustrative, never presented as fact.'))}
    <div class="section-head"><div class="eyebrow">Scenario<span class="sep">·</span>Step ${active} of ${scenarioSteps.length}<span class="sep">·</span>${escapeHtml(PHASE_LABEL[scenarioSteps[active - 1].phase] || scenarioSteps[active - 1].phase)}</div></div>
    <ol class="rail">
      ${scenarioSteps.map((s) => scenarioStepHtml(s, signals, view.capabilities, s.order === active, s.order < active)).join('')}
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

// Money amounts carry their raw value so an in-place refresh can count from the
// previous figure to the new one instead of snapping.
function amount(n) {
  return `<span class="amt" data-value="${Math.round(Number.isFinite(n) ? n : 0)}">${fmtMoney(n)}</span>`;
}

function leverResultHtml(result) {
  return `
    <div class="num">${amount(result.monthly)}<span>/mo</span></div>
    <div class="small muted">${amount(result.annual)}/yr</div>
    <div class="formula">${escapeHtml(result.formula)}</div>
  `;
}

// The one deep-burgundy pause in the flow: the conclusion, in white serif, with its formula beside it.
function totalResultHtml(total) {
  return `
    <div class="pause-num serif">${amount(total.monthly)}<span class="per">/mo</span></div>
    <div class="pause-yr">${amount(total.annual)} a year, illustrative</div>
    <div class="formula">downtime + engineer time + tool consolidation, added monthly</div>
  `;
}

// Count a money figure from its previous value to the new one (~450ms, ease-out).
// The final frame always writes the exact deterministic value; reduced-motion
// users get that value immediately.
const amountTweens = new WeakMap(); // el -> requestAnimationFrame id
function tweenAmount(el, from, to) {
  if (amountTweens.has(el)) cancelAnimationFrame(amountTweens.get(el));
  if (!Number.isFinite(from) || from === to || prefersReducedMotion()) {
    el.textContent = fmtMoney(to);
    return;
  }
  const start = performance.now();
  const duration = 450;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtMoney(from + (to - from) * eased);
    if (t < 1) amountTweens.set(el, requestAnimationFrame(tick));
    else amountTweens.delete(el);
  };
  amountTweens.set(el, requestAnimationFrame(tick));
}

// Patch every result block in place from the current assumptions. Shared by
// the AE ROI screen and the share view: one input (incidents/month) feeds more
// than one lever, so refreshing only the edited lever leaves a stale subtotal.
function refreshRoiResultBlocks(assumptions) {
  const res = Roi.calculate(Roi.assumptionsAsMap(assumptions));
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (!el) return;
    const previous = Array.from(el.querySelectorAll('.amt')).map((s) => toNumber(s.getAttribute('data-value'), NaN));
    el.innerHTML = html;
    el.querySelectorAll('.amt').forEach((s, i) => {
      s.classList.add('is-live');
      tweenAmount(s, previous[i], toNumber(s.getAttribute('data-value'), 0));
    });
  };
  set('result-downtime', leverResultHtml(res.downtime));
  set('result-engineer-time', leverResultHtml(res.engineerTime));
  set('result-consolidation', leverResultHtml(res.consolidation));
  set('result-total', totalResultHtml(res.total));
  return res;
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
          <span class="note">Source: ${escapeHtml(ROI_SOURCE_LABEL[a.source] || a.source)}${a.scenario ? ` · Scenario step: ${escapeHtml(PHASE_LABEL[a.scenario] || a.scenario)}` : ''}</span>
        </div>
      `).join('')}
      <div class="result" id="result-${leverKey}">${leverResultHtml(result)}</div>
    </div>
  `;
}

function screenRoi(view) {
  const { accountId, bundle, assumptions } = view;
  renderStepRail(accountId, 'roi');
  renderModeSwitch(accountId);

  const values = Roi.assumptionsAsMap(assumptions);
  const results = Roi.calculate(values);

  renderView(`
    ${accountHeader(bundle.account, 'Three editable levers. Every formula stays visible next to its result and nothing here is a guarantee - these are assumptions you and the prospect can change together.')}

    <div class="section-head"><div class="eyebrow">Business case<span class="sep">·</span>3 editable levers</div></div>
    ${leverHtml('downtime', assumptions, results.downtime)}
    ${leverHtml('engineer-time', assumptions, results.engineerTime)}
    ${leverHtml('consolidation', assumptions, results.consolidation)}

    <section class="pause" aria-labelledby="roi-total-title">
      <div class="eyebrow" id="roi-total-title">Illustrative total<span class="sep">·</span>Not a guarantee</div>
      <div id="result-total">${totalResultHtml(results.total)}</div>
      <p class="pause-note">Built from the editable assumptions above and always disclosed alongside the number. Change any input and this changes with it.</p>
    </section>

    <div class="row" style="margin-top:14px;">
      <button class="btn" type="button" id="roi-reset">Reset to baseline</button>
    </div>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-primary btn-block" id="to-share-link" href="${escapeHtml(view.shareHash)}">Switch to share mode</a>
    </div>
  `);

  // Editing an input recomputes and patches the result blocks in place, so
  // focus/caret position survives - the "changing one input updates the
  // result immediately" requirement without fighting the browser's cursor.
  dom.view.querySelectorAll('[data-roi-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-roi-key');
      const assumption = assumptions.find((a) => a.key === key);
      if (!assumption) return;
      assumption.value = clamp(toNumber(input.value, assumption.value), assumption.min, Infinity);
      recordEvent('roi-edit', { accountId, key, value: assumption.value });
      refreshRoiResultBlocks(assumptions);
      // Keep the share hand-off link carrying the assumptions as edited.
      const toShare = document.getElementById('to-share-link');
      if (toShare) toShare.setAttribute('href', shareHash(bundle.account, assumptions));
    });
  });

  document.getElementById('roi-reset').addEventListener('click', () => {
    // The reset itself is a controller action; the screen just re-renders.
    resetRoiAssumptions(accountId);
    showToast('ROI assumptions reset to the baseline.');
    render();
  });
}

/* =========================================================================
 * Section 8 - Salesforce-ready payload (typed, mock, no real CRM call)
 * ========================================================================= */

function buildSalesforcePayload(bundle, recs, roiResults, briefVersion, capabilities, integrations) {
  const { account, hypotheses } = bundle;
  const capNames = recs.filter((r) => r.capabilityId).map((r) => byId(capabilities, r.capabilityId)).filter(Boolean).map((c) => `${c.product}: ${c.name}`);
  const intNames = recs.filter((r) => r.integrationId).map((r) => byId(integrations, r.integrationId)).filter(Boolean).map((i) => i.name);
  return {
    object: 'Opportunity',
    mock: true,
    integrationBoundary: 'No real Salesforce API call is made anywhere in this build - this is a typed preview of the payload shape only.',
    externalId: account.id,
    fields: {
      Account_Name__c: account.name,
      Domain__c: account.domain,
      Industry__c: account.industry || null,
      // null, never false, when nothing read established customer status.
      Already_Customer__c: account.alreadyCustomer == null ? null : account.alreadyCustomer,
      Already_Customer_Evidence__c: account.alreadyCustomer == null ? 'unknown - not publicly confirmed' : 'from curated fixture data',
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
      App_Version__c: APP_VERSION,
      Generated_At__c: nowIso(),
    },
  };
}

/* =========================================================================
 * Section 9 - share mode (prospect-safe, one consolidated screen)
 * ========================================================================= */

function screenShare(view) {
  // Bundle, recommendations, knowledge base, ROI assumptions, share link and
  // the brief version identifying this exact snapshot were all resolved by the
  // controller (prepareAccountView) before this render ran; this function only
  // reads its argument - it never reaches a store, directly or via a helper.
  const { accountId, brief } = view;
  renderStepRail(null); // share mode is a single screen, not part of the AE step flow
  renderModeSwitch(accountId);

  const { bundle, recommendations: recs, capabilities, integrations, assumptions } = view;
  const { account, evidences, hypotheses, scenarioSteps, signals } = bundle;
  const capRecs = recs.filter((r) => r.capabilityId);
  const intRecs = recs.filter((r) => r.integrationId);
  const results = Roi.calculate(Roi.assumptionsAsMap(assumptions));

  renderView(`
    ${accountHeader(account, LiveCopy.pick(account,
      'A prospect-safe summary of a live public-page lookup. What was read is shown as read; anything about how you work is phrased as a question, not a claim. Internal notes and sales-only language are removed.',
      'A prospect-safe summary: sources and uncertainty stay visible, internal notes and sales-only language are removed.'))}

    <div class="section-head"><div class="eyebrow">Evidence<span class="sep">·</span>${evidences.length} public source${evidences.length === 1 ? '' : 's'}</div><h2>What we found publicly</h2><p class="small muted">Each claim carries its source and the date we saw it.</p></div>
    <div class="ev-list">
      ${evidences.map(evidenceCardHtml).join('')}
    </div>

    <div class="section-head"><div class="eyebrow">Reliability story<span class="sep">·</span>${hypotheses.length} hypotheses</div><h2>Worth discussing</h2><p class="small muted">Marked as hypotheses, not facts.</p></div>
    <div class="stack">${hypotheses.map((h) => hypothesisCard(h, evidences)).join('')}</div>

    <div class="section-head"><div class="eyebrow">Product map<span class="sep">·</span>${capRecs.length + intRecs.length} match${capRecs.length + intRecs.length === 1 ? '' : 'es'}</div><h2>${LiveCopy.pick(account, 'Where incident.io might help', 'Where incident.io could help')}</h2><p class="small muted">Each match links the official product page and the public evidence behind it. ${escapeHtml(LiveCopy.note(account))}</p></div>
    <div class="stack">
      ${[...capRecs, ...intRecs].map((r) => recommendationCard(r, capabilities, integrations, evidences, { mode: 'share' })).join('') || renderEmpty('No matches yet', 'No deterministic match found for this account.')}
    </div>

    <div class="section-head"><div class="eyebrow">Scenario<span class="sep">·</span>${scenarioSteps.length} steps</div><h2>An incident, as it would run</h2><p class="small muted">Steps not tied to public evidence are marked illustrative.${account.live ? ' Named systems come from public mentions, not a confirmed inventory.' : ''}</p></div>
    <ol class="rail">
      ${scenarioSteps.map((s) => scenarioStepHtml(s, signals, capabilities, false, false, false)).join('')}
    </ol>

    <div class="section-head"><div class="eyebrow">Business case<span class="sep">·</span>3 editable levers</div><h2>Illustrative business case</h2><p class="small muted">Editable - change any assumption to match reality.</p></div>
    ${leverHtml('downtime', assumptions, results.downtime)}
    ${leverHtml('engineer-time', assumptions, results.engineerTime)}
    ${leverHtml('consolidation', assumptions, results.consolidation)}
    <section class="pause" aria-labelledby="roi-total-title">
      <div class="eyebrow" id="roi-total-title">Illustrative total<span class="sep">·</span>Not a guarantee</div>
      <div id="result-total">${totalResultHtml(results.total)}</div>
      <p class="pause-note">An editable starting point for a real conversation, not a promise. Change any assumption above and this changes with it.</p>
    </section>

    <div class="card card-quiet" style="margin-top:16px;">
      <h4>Share this view</h4>
      <p class="small muted">Stable link - reopens this exact prospect-safe summary, including the ROI assumptions below.</p>
      <div class="row" style="flex-wrap:nowrap;">
        <input id="share-url" type="text" readonly value="${escapeHtml(shareUrl(account, assumptions))}" class="text-input" style="font-size:13px; background:var(--white);" aria-label="Share link" />
        <button class="btn btn-primary" type="button" id="copy-share-url">Copy link</button>
      </div>
    </div>

    ${aboutBuildNote()}
    <p class="tiny muted" style="margin-top:14px;" id="share-version-note">Brief v${brief.version} (share) · generated ${fmtDate(brief.createdAt)} · this label names the snapshot shown above. Independent concept by Ayo Ahmed. Not affiliated with incident.io.</p>
  `);

  setActionBar(`
    <div class="wrap">
      <a class="btn btn-dark btn-block" href="#/a/${accountId}/brief">Back to AE view</a>
    </div>
  `);

  dom.view.querySelectorAll('[data-roi-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-roi-key');
      const assumption = assumptions.find((a) => a.key === key);
      if (!assumption) return;
      assumption.value = clamp(toNumber(input.value, assumption.value), assumption.min, Infinity);
      recordEvent('roi-edit', { accountId, key, value: assumption.value, mode: 'share' });
      // Refresh every lever, not just the edited one: incidents/month feeds
      // both the downtime and the engineer-time subtotals.
      refreshRoiResultBlocks(assumptions);
      refreshShareUrlField(account, assumptions);
      // The numbers on screen are now the reader's edits, not the saved
      // snapshot, so the label stops claiming to name them.
      const note = document.getElementById('share-version-note');
      if (note) note.textContent = `Edited from brief v${brief.version} (share) · these figures are your unsaved edits, not the saved snapshot. Copy the link above to keep them. Independent concept by Ayo Ahmed. Not affiliated with incident.io.`;
    });
  });

  document.getElementById('copy-share-url').addEventListener('click', async () => {
    const input = document.getElementById('share-url');
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      flashButtonSuccess(document.getElementById('copy-share-url'), 'Copied');
      showToast('Share link copied.');
    } catch {
      showToast('Could not access clipboard - link is selected, copy manually.');
    }
    recordEvent('share-link-copied', { accountId });
  });
}

// Keep the share link in step with the assumptions currently on screen, so the
// copied URL always reproduces the numbers the prospect is looking at.
function refreshShareUrlField(account, assumptions) {
  const field = document.getElementById('share-url');
  if (field) field.value = shareUrl(account, assumptions);
}

/* =========================================================================
 * Section 10 - router + init
 * Parses the hash route, keeps `state.route`/`state.mode` in sync, and
 * dispatches to the right screen function. This is the only place that
 * decides which screen renders; screens themselves never navigate directly
 * except through location.hash / <a href> so the URL is always the source
 * of truth (needed for the share mode's "stable share URL").
 * ========================================================================= */

function render() {
  if (state.status === 'loading') {
    dom.steprail.hidden = true;
    dom.modeSwitch.hidden = true;
    setActionBar('');
    renderLoading('Loading three cached prospects. No network after this.');
    return;
  }
  // The catalog is the controller's read of the data store, handed to the
  // picker rather than read from inside it.
  const catalog = () => ({ accounts: DataStore.accounts, error: DataStore.error });
  if (state.status === 'error') {
    screenAccountPicker(catalog());
    return;
  }

  const route = parseRoute(location.hash);
  state.route = route;

  if (route.name === 'picker') {
    state.mode = 'internal';
    screenAccountPicker(catalog());
    return;
  }

  const bundle = DataStore.getAccountBundle(route.accountId);
  if (!bundle) {
    // A live account this browser does not hold gets a recovery offer; an
    // unknown fixture id is a genuinely broken link.
    if (route.accountId.startsWith('live_') || route.query.d) {
      screenLiveRecovery(route.accountId, recoveryDomainFor(route));
      return;
    }
    dom.steprail.hidden = true;
    dom.modeSwitch.hidden = true;
    setActionBar('');
    renderFailure('Prospect not found', 'That link does not match one of the loaded fixtures.', '#/');
    return;
  }

  state.mode = route.screen === 'share' ? 'share' : 'internal';

  // Controller work happens here, before any screen renders: hydrate the ROI
  // assumptions from the link, read the persisted brief/event data once, and
  // (for share links) make sure a share version exists.
  hydrateRoiFromRoute(route.accountId, route.query);
  checkFixtureIntegrity(route.accountId, bundle);
  const view = prepareAccountView(route.accountId, route.screen);
  if (!view) {
    renderFailure('Prospect not found', 'That link does not match one of the loaded prospects.', '#/');
    return;
  }

  switch (route.screen) {
    case 'evidence':
      screenEvidence(view);
      break;
    case 'brief':
      screenBrief(view);
      break;
    case 'scenario':
      screenScenario(view);
      break;
    case 'roi':
      screenRoi(view);
      break;
    case 'share':
      screenShare(view);
      break;
    default:
      location.hash = `#/a/${route.accountId}/evidence`;
  }
}

function init() {
  if (dom.vMatcher) dom.vMatcher.textContent = MATCHER_VERSION;
  if (dom.vRoi) dom.vRoi.textContent = ROI_VERSION;

  // The app route lives in the hash, so letting "Skip to content" navigate to
  // #view would throw the user back to the picker. Move focus to the main
  // region instead and leave the route exactly where it was.
  const skipLink = document.getElementById('skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      dom.view.focus({ preventScroll: true });
      dom.view.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }

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
