// ============ Manthan — real API client + reactive store ============
// Every action talks to the FastAPI backend (REST + SSE). Components read
// state via useStore() (defined in ui.jsx) and call API.* actions.
import { Catalog } from './catalog';

const ONBOARD_KEY = 'manthan:onboarded';

// ---------------- reactive state ----------------
const state = {
  loaded: false,
  loadError: null,
  onboarded: !!localStorage.getItem(ONBOARD_KEY),
  keys: {},            // provider -> {masked, status: 'valid'|'invalid'|'validating', error}
  defaultModel: null,  // {provider, model}
  synthesisMaxWords: 700,
  experts: [],
  sessions: [],        // summary rows
  details: {},         // sessionId -> normalized detail
  analytics: null,
};

const listeners = new Set();
let rafPending = false;
function notify() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; listeners.forEach((fn) => fn(state)); });
}

const COLORS = ['#1D6E8C', '#6B4FA1', '#9A6A0F', '#3D5A45', '#A14F66', '#4A5A78', '#7A4A2B', '#2F6B5E', '#84502F', '#54417E'];
const colorFor = (id) => COLORS[Math.abs(Number(id) || 0) % COLORS.length];
const parseTs = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).getTime() : null);

// ---------------- HTTP helpers ----------------
async function http(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const detail = (data && data.detail) || res.statusText || 'Request failed';
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    err.status = res.status;
    throw err;
  }
  return data;
}

// POST that returns an SSE stream; calls onEvent(parsedJson) per `data:` line.
// `signal` (optional) lets the caller abort the stream mid-flight (Stop button).
async function sseStream(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch (e) {}
    const err = new Error(detail); err.status = res.status; throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) {
          try { onEvent(JSON.parse(line.slice(5).trim())); } catch (e) { /* skip */ }
        }
      }
    }
  }
}

// ---------------- mappers ----------------
function mapExpert(e) {
  return {
    id: e.id, name: e.name, title: e.title, persona: e.persona,
    avatar: e.avatar_url ? { value: e.avatar_url } : null,
    provider: e.provider_type, model: e.model_id,
    maxWords: e.max_words ?? 300,
    domain: e.domain || '', packKey: e.pack_key || '',
    starter: !!e.is_starter, color: colorFor(e.id),
  };
}

function mapSessionExpert(se) {
  return {
    id: se.id, expertId: se.expert_id, name: se.name, title: se.title, persona: se.persona,
    avatar: se.avatar_url ? { value: se.avatar_url } : null,
    provider: se.provider_type, model: se.model_id, maxWords: se.max_words ?? 300,
    overridden: !!se.overridden, color: colorFor(se.id),
  };
}

function splitStanceText(content) {
  const c = (content || '').trim();
  const nl = c.indexOf('\n');
  const first = (nl >= 0 ? c.slice(0, nl) : c).trim().replace(/^[#*\-•\s]+/, '').replace(/\*\*/g, '');
  if (/^STANCE:/i.test(first)) {
    return { stance: first.slice(7).trim().replace(/\*+$/, '').trim(), text: nl >= 0 ? c.slice(nl + 1).trim() : '' };
  }
  return { stance: '', text: c };
}

function deriveStatus(d) {
  if (d.raw.status === 'frozen') return 'frozen';
  if (!d.brief) return d.pendingBrief ? 'awaiting-approval' : 'briefing';
  const failed = (r) => Object.values(d.rounds[r]).some((x) => x.status === 'failed');
  if (!d.raw.round1_done) return 'round1';
  if (d.synthesis && !d.raw.synth1_done) return failed(1) ? 'round1-partial' : 'synthesis1';
  if (!d.synthesis && failed(1) && !d.round2) return 'round1-partial';
  if (d.round2 && !d.raw.round2_done) return failed(1) && !Object.keys(d.rounds[2]).length && !d.synthesis ? 'round1-partial' : 'round2';
  if (d.round2 && d.synthesis && !d.raw.synth2_done) return failed(2) ? 'round2-partial' : 'synthesis2';
  return 'frozen';
}

function normalizeDetail(payload, prev) {
  const s = payload.session;
  const experts = payload.experts.map(mapSessionExpert);
  const rounds = { 1: {}, 2: {} };
  const syntheses = { 1: null, 2: null };
  payload.responses.forEach((r) => {
    if (r.kind === 'expert') {
      const { stance, text } = r.status === 'done' ? { stance: r.stance, text: splitStanceText(r.content).text } : { stance: '', text: '' };
      rounds[r.round][r.session_expert_id] = r.status === 'done'
        ? { status: 'done', stance, text }
        : { status: 'failed', stance: null, text: '', error: r.error };
    } else {
      syntheses[r.round] = { status: 'done', text: splitStanceText(r.content).text, stance: r.stance };
    }
  });
  const d = {
    id: s.id, title: s.title,
    round2: !!s.round2_enabled, synthesis: !!s.synthesis_enabled,
    brief: s.compiled_brief || null,
    intake: payload.intake_messages.map((m) => ({ role: m.role, text: m.content })),
    experts, expertIds: experts.map((e) => e.id),
    rounds, syntheses,
    usageTotals: payload.usage_totals, usageLog: payload.usage_log || [],
    createdAt: parseTs(s.created_at), frozenAt: s.status === 'frozen' ? parseTs(s.updated_at) : null,
    // pending brief is now persisted on the backend → survives refresh
    pendingBrief: s.pending_brief || (prev ? prev.pendingBrief : null) || null,
    raw: s,
  };
  d.status = deriveStatus(d);
  return d;
}

function mapSessionRow(s) {
  return {
    id: s.id, title: s.title, status: s.status,
    round2: !!s.round2_enabled, synthesis: !!s.synthesis_enabled,
    createdAt: parseTs(s.created_at),
    experts: (s.experts || []).map((e) => ({ ...e, avatar: e.avatar_url ? { value: e.avatar_url } : null, color: colorFor(e.id) })),
    totalCost: s.total_cost || 0,
  };
}

// ---------------- loaders ----------------
async function loadProviders() {
  const data = await http('GET', '/api/providers');
  Catalog.setModels(data.catalog);
  const keys = {};
  data.providers.forEach((p) => {
    keys[p.provider_type] = p.is_valid
      ? { masked: p.masked_key || '••••', status: 'valid' }
      : { masked: p.masked_key || '••••', status: 'invalid', error: p.validation_error };
  });
  // preserve transient 'validating' entries
  Object.entries(state.keys).forEach(([k, v]) => { if (v.status === 'validating') keys[k] = v; });
  state.keys = keys;
  state.defaultModel = data.default_model && data.default_model.provider_type
    ? { provider: data.default_model.provider_type, model: data.default_model.model_id } : null;
  state.synthesisMaxWords = data.synthesis_max_words ?? 700;
}

async function loadExperts() {
  const data = await http('GET', '/api/experts');
  state.experts = data.experts.map(mapExpert);
}

async function loadSessions() {
  const data = await http('GET', '/api/sessions');
  state.sessions = data.sessions.map(mapSessionRow);
}

async function loadDetail(id) {
  const payload = await http('GET', `/api/sessions/${id}`);
  state.details[id] = normalizeDetail(payload, state.details[id]);
  notify();
  return state.details[id];
}

async function loadAnalytics() {
  state.analytics = await http('GET', '/api/analytics');
  notify();
}

async function init() {
  try {
    await Promise.all([loadProviders(), loadExperts(), loadSessions()]);
    // auto-skip onboarding when keys + default model already configured (e.g. .env import)
    if (state.defaultModel && Object.values(state.keys).some((k) => k.status === 'valid')) {
      state.onboarded = true; localStorage.setItem(ONBOARD_KEY, '1');
    }
    state.loaded = true; state.loadError = null;
  } catch (e) {
    state.loaded = true; state.loadError = 'Cannot reach the Manthan backend on :8000 — start it with `python main.py` in backend/. (' + e.message + ')';
  }
  notify();
}

// ---------------- live run orchestration ----------------
const activeRuns = new Set();
const runControllers = {}; // sessionId -> AbortController for the live run
const isRunning = (id) => activeRuns.has(String(id));

function mutateDetail(id, fn) {
  const d = state.details[id];
  if (!d) return;
  fn(d);
  d.status = d._statusOverride || deriveStatus(d);
  notify();
}

function makeEventHandler(id) {
  // accumulates raw streamed text per expert; splits STANCE line on the fly
  const rawAcc = {};
  return (ev) => {
    const round = ev.round;
    if (ev.type === 'expert_start') {
      rawAcc[ev.expert_id] = '';
      mutateDetail(id, (d) => { d.rounds[round][ev.expert_id] = { status: 'thinking', stance: null, text: '' }; });
    } else if (ev.type === 'chunk' && ev.expert_id != null) {
      rawAcc[ev.expert_id] = (rawAcc[ev.expert_id] || '') + ev.text;
      const { stance, text } = splitStanceText(rawAcc[ev.expert_id]);
      mutateDetail(id, (d) => { d.rounds[round][ev.expert_id] = { status: 'streaming', stance: stance || null, text }; });
    } else if (ev.type === 'expert_done') {
      const { text } = splitStanceText(rawAcc[ev.expert_id] || '');
      mutateDetail(id, (d) => {
        d.rounds[round][ev.expert_id] = { status: 'done', stance: ev.stance, text, usage: { inTok: ev.usage.input_tokens, outTok: ev.usage.output_tokens, cost: ev.usage.cost } };
        d.usageTotals = { ...d.usageTotals, input_tokens: d.usageTotals.input_tokens + ev.usage.input_tokens, output_tokens: d.usageTotals.output_tokens + ev.usage.output_tokens, cost: d.usageTotals.cost + ev.usage.cost, calls: (d.usageTotals.calls || 0) + 1 };
      });
    } else if (ev.type === 'expert_failed') {
      mutateDetail(id, (d) => { d.rounds[round][ev.expert_id] = { status: 'failed', stance: null, text: '', error: ev.error }; });
    } else if (ev.type === 'synthesis_start') {
      rawAcc.__syn = '';
      mutateDetail(id, (d) => { d.syntheses[round] = { status: 'thinking', text: '' }; });
    } else if (ev.type === 'chunk' && ev.expert_id == null) {
      rawAcc.__syn = (rawAcc.__syn || '') + ev.text;
      const { text } = splitStanceText(rawAcc.__syn);
      mutateDetail(id, (d) => { d.syntheses[round] = { status: 'streaming', text }; });
    } else if (ev.type === 'synthesis_done') {
      const { text } = splitStanceText(rawAcc.__syn || '');
      mutateDetail(id, (d) => {
        d.syntheses[round] = { status: 'done', text, stance: ev.stance };
        d.usageTotals = { ...d.usageTotals, input_tokens: d.usageTotals.input_tokens + ev.usage.input_tokens, output_tokens: d.usageTotals.output_tokens + ev.usage.output_tokens, cost: d.usageTotals.cost + ev.usage.cost, calls: (d.usageTotals.calls || 0) + 1 };
      });
    } else if (ev.type === 'synthesis_failed') {
      mutateDetail(id, (d) => { d.syntheses[round] = { status: 'failed', text: '', error: ev.error }; });
    } else if (ev.type === 'stage_done') {
      mutateDetail(id, (d) => {
        if (ev.stage === 'round1') d.raw.round1_done = 1;
        if (ev.stage === 'round2') d.raw.round2_done = 1;
        if (ev.stage === 'synthesis1') d.raw.synth1_done = 1;
        if (ev.stage === 'synthesis2') d.raw.synth2_done = 1;
        if (ev.session_status === 'frozen') { d.raw.status = 'frozen'; d.frozenAt = Date.now(); }
      });
    }
  };
}

const anyFailed = (id, round) => {
  const d = state.details[id];
  return d ? Object.values(d.rounds[round]).some((r) => r.status === 'failed') : false;
};

function setOverride(id, status) {
  mutateDetail(id, (d) => { d._statusOverride = status || null; });
}

async function runStage(id, kind, round, signal) {
  const handler = makeEventHandler(id);
  const d = state.details[id];
  if (kind === 'round') {
    setOverride(id, round === 1 ? 'round1' : 'round2');
    mutateDetail(id, (det) => {
      det.experts.forEach((e) => {
        const cur = det.rounds[round][e.id];
        if (!cur || cur.status !== 'done') det.rounds[round][e.id] = { status: 'queued', stance: null, text: '' };
      });
    });
    if (round === 1) await sseStream(`/api/sessions/${id}/dispatch`, { brief: d.brief }, handler, signal);
    else await sseStream(`/api/sessions/${id}/round2`, undefined, handler, signal);
  } else {
    setOverride(id, 'synthesis' + round);
    await sseStream(`/api/sessions/${id}/synthesize?round=${round}`, undefined, handler, signal);
  }
  setOverride(id, null);
}

// run the full configured flow from wherever the session currently is
async function runFlow(id, opts = {}) {
  const key = String(id);
  if (activeRuns.has(key)) return;
  const controller = new AbortController();
  runControllers[key] = controller;
  const sig = controller.signal;
  activeRuns.add(key); notify();
  try {
    let d = state.details[id];
    if (!d.raw.round1_done) {
      await runStage(id, 'round', 1, sig);
      if (anyFailed(id, 1) && !opts.skipFailed) return 'partial';
    }
    d = state.details[id];
    if (d.synthesis && !d.raw.synth1_done) await runStage(id, 'synthesis', 1, sig);
    if (d.round2) {
      if (!d.raw.round2_done) {
        await runStage(id, 'round', 2, sig);
        if (anyFailed(id, 2) && !opts.skipFailed) return 'partial2';
      }
      d = state.details[id];
      if (d.synthesis && !d.raw.synth2_done) await runStage(id, 'synthesis', 2, sig);
    }
    await loadDetail(id);
    await loadSessions(); notify();
    return 'frozen';
  } catch (e) {
    // user-initiated stop: not an error — just reload into a resumable state
    if (e.name === 'AbortError' || sig.aborted) {
      setOverride(id, null);
      await loadDetail(id).catch(() => {});
      return 'stopped';
    }
    mutateDetail(id, (det) => { det.runError = e.message; });
    await loadDetail(id).catch(() => {});
    return 'error';
  } finally { activeRuns.delete(key); delete runControllers[key]; notify(); }
}

// ---------------- public API (actions) ----------------
export const API = {
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getState: () => state,
  init,

  // --- providers / keys ---
  keyValid: (p) => state.keys[p] && state.keys[p].status === 'valid',
  async validateAndSaveKey(provider, rawKey) {
    state.keys[provider] = { masked: '…', status: 'validating' }; notify();
    try {
      await http('POST', '/api/providers', { provider_type: provider, api_key: rawKey });
      // clear the transient 'validating' marker so loadProviders' preserve-loop
      // doesn't carry it over the fresh 'valid' status returned by the backend
      delete state.keys[provider];
      await loadProviders(); await loadExperts(); notify();
      return { valid: true };
    } catch (e) {
      state.keys[provider] = { masked: '', status: 'invalid', error: e.message }; notify();
      return { valid: false, error: e.message };
    }
  },
  async deleteKey(provider) {
    await http('DELETE', `/api/providers/${provider}`);
    await loadProviders(); await loadExperts(); notify();
  },
  async setDefaultModel(provider, model) {
    await http('PUT', '/api/providers/default-model', { provider_type: provider, model_id: model });
    state.defaultModel = { provider, model }; notify();
  },
  async setSynthesisMaxWords(words) {
    await http('PUT', '/api/providers/app-settings', { synthesis_max_words: words });
    state.synthesisMaxWords = words; notify();
  },
  async completeOnboarding() {
    try { await http('POST', '/api/seed-starters'); await loadExperts(); } catch (e) {}
    state.onboarded = true; localStorage.setItem(ONBOARD_KEY, '1'); notify();
  },

  // --- experts ---
  expertById(id) {
    return state.experts.find((e) => e.id === id)
      || Object.values(state.details).flatMap((d) => d.experts).find((e) => e.id === id);
  },
  async saveExpert(expert) {
    const body = {
      name: expert.name, title: expert.title, persona: expert.persona,
      avatar_url: expert.avatar ? expert.avatar.value : '',
      provider_type: expert.provider, model_id: expert.model,
      max_words: expert.maxWords ?? 300,
      domain: (expert.domain || '').trim(),
    };
    if (expert.id) await http('PUT', `/api/experts/${expert.id}`, body);
    else await http('POST', '/api/experts', body);
    await loadExperts(); notify();
  },
  async duplicateExpert(id) { await http('POST', `/api/experts/${id}/duplicate`); await loadExperts(); notify(); },
  async deleteExpert(id) { await http('DELETE', `/api/experts/${id}`); await loadExperts(); notify(); },
  async uploadAvatar(file) {
    const form = new FormData(); form.append('file', file);
    const res = await fetch('/api/uploads/avatar', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    return data.avatar_url;
  },
  async builderChat(messages) {
    const data = await http('POST', '/api/experts/builder/chat', {
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    });
    const draft = data.expert ? {
      name: data.expert.name, title: data.expert.title, persona: data.expert.persona,
      provider: data.expert.suggested_provider_type, model: data.expert.suggested_model_id,
      maxWords: data.expert.suggested_max_words ?? 300,
      domain: data.expert.suggested_domain || '',
    } : null;
    return { message: data.assistant_message, ready: data.ready, draft };
  },
  async suggestExperts(problem) {
    const data = await http('POST', '/api/experts/suggest', { problem });
    return { ids: data.expert_ids, reasoning: data.reasoning };
  },

  // --- sessions ---
  getSession: (id) => state.details[id],
  loadDetail, loadSessions, loadAnalytics,
  async createSession({ expertIds, round2, synthesis, title, modelOverrides }) {
    const overrides = {};
    Object.entries(modelOverrides || {}).forEach(([eid, v]) => {
      if (v && v.provider && v.model) overrides[eid] = { provider_type: v.provider, model_id: v.model };
    });
    const payload = await http('POST', '/api/sessions', {
      title: title || '', expert_ids: expertIds,
      round2_enabled: round2, synthesis_enabled: synthesis,
      model_overrides: overrides,
    });
    state.details[payload.session.id] = normalizeDetail(payload);
    await loadSessions(); notify();
    return payload.session.id;
  },
  async renameSession(id, title) {
    await http('PATCH', `/api/sessions/${id}`, { title });
    mutateDetail(id, (d) => { d.title = title; d._renamed = true; });
    await loadSessions(); notify();
  },
  async deleteSession(id) {
    await http('DELETE', `/api/sessions/${id}`);
    delete state.details[id];
    await loadSessions(); notify();
  },
  async intakeTurn(id, message) {
    mutateDetail(id, (d) => { d.intake.push({ role: 'user', text: message }); });
    try {
      const data = await http('POST', `/api/sessions/${id}/intake`, { message });
      mutateDetail(id, (d) => {
        d.intake.push({ role: 'assistant', text: data.assistant_message });
        if (data.ready_to_dispatch) d.pendingBrief = data.compiled_brief;
      });
      return data;
    } catch (e) {
      mutateDetail(id, (d) => { d.intake.push({ role: 'assistant', text: '⚠ ' + e.message }); });
      return { ready_to_dispatch: false };
    }
  },
  editBrief(id, brief) { mutateDetail(id, (d) => { d.pendingBrief = brief; }); },
  // persist the edited brief (called on blur) so a refresh restores the edits
  async saveBrief(id, brief) {
    try { await http('PUT', `/api/sessions/${id}/pending-brief`, { brief }); } catch (e) {}
  },
  async backToBriefing(id) {
    mutateDetail(id, (d) => { d.pendingBrief = null; });
    try { await http('POST', `/api/sessions/${id}/back-to-briefing`); } catch (e) {}
  },
  async dispatch(id, brief) {
    const d = state.details[id];
    mutateDetail(id, (det) => { det.brief = brief; det.pendingBrief = null; });
    if (/^Untitled Council Session/i.test(d.title)) {
      const t = titleFromBrief(brief);
      if (t) API.renameSession(id, t).catch(() => {});
    }
    return runFlow(id);
  },
  resume: (id, opts) => runFlow(id, opts),
  async retryExpert(id, round, expertId) {
    const key = String(id);
    activeRuns.add(key); notify();
    try {
      const handler = makeEventHandler(id);
      await sseStream(`/api/sessions/${id}/experts/${expertId}/retry`, { round }, handler);
    } finally { activeRuns.delete(key); notify(); }
  },
  anyFailed, isRunning,
  // abort the live run; partial results are kept and the session stays resumable
  stopRun(id) {
    const c = runControllers[String(id)];
    if (c) c.abort();
  },

  sessionCost(id) {
    const d = state.details[id];
    if (!d) return { cost: 0, inTok: 0, outTok: 0, cached: 0, calls: 0 };
    const t = d.usageTotals || {};
    return { cost: t.cost || 0, inTok: t.input_tokens || 0, outTok: t.output_tokens || 0, cached: t.cached_tokens || 0, calls: t.calls || 0 };
  },

  // pre-dispatch cost estimate (client-side, from catalog pricing)
  estimateRun(d, brief) {
    const OUT_CAP = 600;
    const briefTok = Catalog.estimateTokens(brief) + 450;
    let lo = 0, hi = 0;
    const perRound = (extraIn) => d.experts.reduce((acc, e) => {
      acc.lo += Catalog.costOf(e.provider, e.model, briefTok + extraIn, 400);
      acc.hi += Catalog.costOf(e.provider, e.model, briefTok + extraIn, OUT_CAP);
      return acc;
    }, { lo: 0, hi: 0 });
    const r1 = perRound(0); lo += r1.lo; hi += r1.hi;
    const peerTok = d.experts.length * 550;
    if (d.round2) { const r2 = perRound(peerTok); lo += r2.lo; hi += r2.hi; }
    if (d.synthesis && state.defaultModel) {
      const synIn = briefTok + peerTok;
      const times = d.round2 ? 2 : 1;
      lo += times * Catalog.costOf(state.defaultModel.provider, state.defaultModel.model, synIn, 500);
      hi += times * Catalog.costOf(state.defaultModel.provider, state.defaultModel.model, synIn, 800);
    }
    return { lo, hi, calls: d.experts.length * (d.round2 ? 2 : 1) + (d.synthesis ? (d.round2 ? 2 : 1) : 0) };
  },
  OUTPUT_CAP_TOK: 600,

  // --- admin ---
  async clearData(keepKeys, parts = { sessions: true, experts: true, analytics: true }) {
    const q = new URLSearchParams({
      keep_keys: String(keepKeys),
      sessions: String(parts.sessions !== false),
      experts: String(parts.experts !== false),
      analytics: String(parts.analytics !== false),
    });
    await http('POST', `/api/admin/clear-data?${q.toString()}`);
    state.details = {};
    if (!keepKeys) { state.onboarded = false; localStorage.removeItem(ONBOARD_KEY); }
    await Promise.all([loadProviders(), loadExperts(), loadSessions()]);
    state.analytics = null; notify();
  },
  async seedStarters() { await http('POST', '/api/seed-starters'); await loadExperts(); notify(); },
  async previewPack() { return http('GET', '/api/experts/pack/preview'); },
  async importPack(provider, model) {
    const data = await http('POST', '/api/experts/pack/import', { provider_type: provider, model_id: model });
    await loadExperts(); notify();
    return data.added;
  },
};

function titleFromBrief(brief) {
  let s = (brief.split(/\n/).find((l) => l.trim()) || '').trim();
  s = s.split(/(?<=[.!?])\s/)[0] || s;
  if (s.length > 56) s = s.slice(0, 53).trimEnd() + '…';
  return s || null;
}
