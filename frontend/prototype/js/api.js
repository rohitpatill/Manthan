// ============ Manthan — mock API layer ============
// Single service layer. Every "endpoint" the real FastAPI backend will expose
// has a counterpart here; components never fabricate data themselves.
// Swap implementation: replace bodies with fetch()/SSE against http://localhost:8000.
(function () {
  const { CATALOG, costOf, estimateTokens } = window.Catalog;
  const LS_KEY = 'manthan:v1';
  const OUTPUT_CAP_TOK = 600; // ~450 words

  // ---------------- store ----------------
  function freshSeededState() {
    return {
      onboarded: true,
      keys: {
        openai: { masked: 'sk-…k3Pq', status: 'valid', addedAt: Date.now() - 86400e3 * 21 },
        gemini: { masked: 'AIza…9xVd', status: 'valid', addedAt: Date.now() - 86400e3 * 21 },
        anthropic: { masked: 'sk-ant-…Tm2w', status: 'valid', addedAt: Date.now() - 86400e3 * 21 },
      },
      defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
      experts: JSON.parse(JSON.stringify(window.Seed.EXPERTS)),
      sessions: JSON.parse(JSON.stringify(window.Seed.SESSIONS)),
      usage: JSON.parse(JSON.stringify(window.Seed.USAGE)),
    };
  }
  function freshEmptyState() {
    return {
      onboarded: false,
      keys: {},
      defaultModel: null,
      experts: JSON.parse(JSON.stringify(window.Seed.EXPERTS)),
      sessions: [],
      usage: [],
    };
  }

  let state;
  try {
    const raw = localStorage.getItem(LS_KEY);
    state = raw ? JSON.parse(raw) : freshSeededState();
  } catch (e) { state = freshSeededState(); }

  const listeners = new Set();
  let rafPending = false;
  function notify() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      listeners.forEach((fn) => fn(state));
    });
  }
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    }, 400);
  }
  function mutate(fn) { fn(state); persist(); notify(); }

  // ---------------- helpers ----------------
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const speed = () => (window.__manthanTweaks && window.__manthanTweaks.streamSpeed) || 1;
  const failuresOn = () => !!(window.__manthanTweaks && window.__manthanTweaks.simulateFailure);

  function getSession(id) { return state.sessions.find((s) => s.id === id); }
  function expertById(id) { return state.experts.find((e) => e.id === id); }
  function keyValid(provider) { return state.keys[provider] && state.keys[provider].status === 'valid'; }
  function validModels() {
    const out = [];
    Object.values(CATALOG).forEach((p) => {
      if (keyValid(p.id)) p.models.forEach((m) => out.push({ provider: p.id, model: m.id, in: m.in, out: m.out }));
    });
    return out;
  }

  function pushUsage(rec) {
    mutate((s) => { s.usage.push({ id: uid('u'), ts: Date.now(), cachedTok: 0, ...rec }); });
  }

  // Stream `full` text in word-chunks. onChunk(textSoFar). Returns a controller.
  function streamText(full, onChunk, onDone, opts = {}) {
    const words = full.split(/(\s+)/);
    let i = 0, acc = '', cancelled = false, failAt = opts.failAt || -1;
    function tick() {
      if (cancelled) return;
      const sp = speed();
      const burst = Math.max(1, Math.round((2 + Math.random() * 4) * sp));
      for (let b = 0; b < burst && i < words.length; b++) acc += words[i++];
      onChunk(acc);
      if (failAt > 0 && acc.length >= failAt) { opts.onFail && opts.onFail(); return; }
      if (i >= words.length) { onDone && onDone(acc); return; }
      setTimeout(tick, (40 + Math.random() * 70) / sp);
    }
    setTimeout(tick, (opts.delay || 0) / speed());
    return { cancel: () => { cancelled = true; } };
  }

  // ---------------- providers / keys ----------------
  async function validateAndSaveKey(provider, rawKey) {
    mutate((s) => { s.keys[provider] = { masked: maskKey(rawKey), status: 'validating', addedAt: Date.now() }; });
    await sleep(900 + Math.random() * 700);
    const key = (rawKey || '').trim();
    let error = null;
    if (key.length < 12) error = 'Key looks malformed — too short for a ' + CATALOG[provider].label + ' key.';
    else if (/bad|invalid|test/i.test(key)) error = 'Provider returned 401 invalid_api_key — the key was rejected.';
    mutate((s) => {
      s.keys[provider] = error
        ? { masked: maskKey(rawKey), status: 'invalid', error, addedAt: Date.now() }
        : { masked: maskKey(rawKey), status: 'valid', addedAt: Date.now() };
      // default model housekeeping
      if (!error && !s.defaultModel) s.defaultModel = { provider, model: CATALOG[provider].models[0].id };
    });
    return { valid: !error, error };
  }
  function maskKey(k) {
    k = (k || '').trim();
    if (k.length < 8) return k.slice(0, 2) + '…';
    return k.slice(0, Math.min(6, k.length - 4)).replace(/./g, (c, idx) => (idx < 4 ? c : '•')) + '…' + k.slice(-4);
  }
  function deleteKey(provider) {
    mutate((s) => {
      delete s.keys[provider];
      if (s.defaultModel && s.defaultModel.provider === provider) {
        const firstValid = Object.keys(s.keys).find((p) => s.keys[p].status === 'valid');
        s.defaultModel = firstValid ? { provider: firstValid, model: CATALOG[firstValid].models[0].id } : null;
      }
    });
  }
  function setDefaultModel(provider, model) { mutate((s) => { s.defaultModel = { provider, model }; }); }
  function completeOnboarding() { mutate((s) => { s.onboarded = true; }); }

  // ---------------- experts ----------------
  function saveExpert(expert) {
    mutate((s) => {
      const i = s.experts.findIndex((e) => e.id === expert.id);
      if (i >= 0) s.experts[i] = { ...s.experts[i], ...expert, starter: s.experts[i].starter && !expert._editedHard ? s.experts[i].starter : false };
      else s.experts.push({ id: uid('exp'), color: pickColor(s.experts.length), starter: false, avatar: null, ...expert });
    });
  }
  function duplicateExpert(id) {
    const e = expertById(id); if (!e) return;
    mutate((s) => {
      s.experts.push({ ...JSON.parse(JSON.stringify(e)), id: uid('exp'), starter: false, name: e.name + ' (copy)' });
    });
  }
  function deleteExpert(id) { mutate((s) => { s.experts = s.experts.filter((e) => e.id !== id); }); }
  const COLORS = ['#1D6E8C', '#6B4FA1', '#9A6A0F', '#3D5A45', '#A14F66', '#4A5A78', '#7A4A2B', '#2F6B5E', '#84502F', '#54417E'];
  function pickColor(n) { return COLORS[n % COLORS.length]; }

  // Manthan AI persona builder chat — returns {message, draft}
  async function builderChat(description, onChunk) {
    const draft = window.Gen.builderDraft(description);
    const reply = window.Gen.builderReply(description, draft);
    await sleep(700 / speed());
    return new Promise((resolve) => {
      streamText(reply, onChunk, (full) => {
        pushUsage({
          sessionId: null, kind: 'builder', expertId: null,
          provider: state.defaultModel.provider, model: state.defaultModel.model,
          inTok: estimateTokens(description) + 220, outTok: estimateTokens(reply + draft.persona),
        });
        resolve({ message: full, draft });
      }, { delay: 300 });
    });
  }

  // ---------------- sessions ----------------
  function createSession({ expertIds, round2, synthesis, title }) {
    const ses = {
      id: uid('ses'),
      title: title || autoTitle(),
      createdAt: Date.now(), frozenAt: null,
      status: 'briefing',
      expertIds, round2, synthesis,
      intake: [], brief: null,
      rounds: { 1: {}, 2: {} },
      syntheses: { 1: null, 2: null },
    };
    mutate((s) => { s.sessions.unshift(ses); });
    return ses.id;
  }
  function autoTitle() {
    const n = state.sessions.length + 1;
    return 'Council session ' + n;
  }
  function renameSession(id, title) { mutate((s) => { const x = s.sessions.find((q) => q.id === id); if (x) x.title = title; }); }
  function deleteSession(id) { mutate((s) => { s.sessions = s.sessions.filter((q) => q.id !== id); }); }
  function updateSession(id, fn) { mutate((s) => { const x = s.sessions.find((q) => q.id === id); if (x) fn(x); }); }

  // intake turn — streams the Manthan AI reply
  async function intakeTurn(sessionId, userText, onChunk) {
    const ses = getSession(sessionId);
    updateSession(sessionId, (x) => { x.intake.push({ role: 'user', text: userText }); });
    const userMsgs = getSession(sessionId).intake.filter((m) => m.role === 'user').map((m) => m.text);
    const reply = window.Gen.intakeReply(userMsgs);
    await sleep(500 / speed());
    return new Promise((resolve) => {
      streamText(reply.text, onChunk, (full) => {
        updateSession(sessionId, (x) => {
          x.intake.push({ role: 'assistant', text: full });
          if (reply.ready) { x.brief = reply.brief; x.status = 'awaiting-approval'; }
        });
        pushUsage({
          sessionId, kind: 'intake', expertId: null,
          provider: state.defaultModel.provider, model: state.defaultModel.model,
          inTok: estimateTokens(userMsgs.join(' ')) + 350, outTok: estimateTokens(full),
          cachedTok: userMsgs.length > 1 ? 300 : 0,
        });
        resolve({ ready: reply.ready, brief: reply.brief || null });
      }, { delay: 200 });
    });
  }

  // auto-generate title from brief
  function titleFromBrief(brief) {
    let s = (brief.split(/\n/).find((l) => l.trim() && !/^SITUATION/i.test(l.trim())) || '').trim();
    s = s.split(/(?<=[.!?])\s/)[0] || s;
    if (s.length > 56) s = s.slice(0, 53).trimEnd() + '…';
    return s || null;
  }

  // cost estimate before dispatch
  function estimateRun(ses) {
    const brief = ses.brief || '';
    const briefTok = estimateTokens(brief) + 450; // + persona/system
    const experts = ses.expertIds.map(expertById).filter(Boolean);
    let lo = 0, hi = 0;
    const perRound = (extraIn) => experts.reduce((acc, e) => {
      acc.lo += costOf(e.provider, e.model, briefTok + extraIn, 400);
      acc.hi += costOf(e.provider, e.model, briefTok + extraIn, OUTPUT_CAP_TOK);
      return acc;
    }, { lo: 0, hi: 0 });
    const r1 = perRound(0); lo += r1.lo; hi += r1.hi;
    const peerTok = experts.length * 550;
    if (ses.round2) { const r2 = perRound(peerTok); lo += r2.lo; hi += r2.hi; }
    if (ses.synthesis && state.defaultModel) {
      const synIn = briefTok + peerTok;
      const times = ses.round2 ? 2 : 1;
      lo += times * costOf(state.defaultModel.provider, state.defaultModel.model, synIn, 500);
      hi += times * costOf(state.defaultModel.provider, state.defaultModel.model, synIn, 800);
    }
    return { lo, hi, calls: experts.length * (ses.round2 ? 2 : 1) + (ses.synthesis ? (ses.round2 ? 2 : 1) : 0) };
  }

  // ---------------- the run orchestrator ----------------
  // Runs a round: every expert streams in parallel. Mutates session state per chunk.
  const liveControllers = {}; // sessionId -> [controllers]
  const activeRuns = new Set();
  function isRunning(sessionId) { return activeRuns.has(sessionId); }

  function runRound(sessionId, round) {
    const ses = getSession(sessionId);
    const experts = ses.expertIds.map(expertById).filter(Boolean);
    updateSession(sessionId, (x) => {
      x.status = round === 1 ? 'round1' : 'round2';
      experts.forEach((e) => {
        if (!x.rounds[round][e.id] || x.rounds[round][e.id].status !== 'done')
          x.rounds[round][e.id] = { status: 'queued', stance: null, text: '' };
      });
    });
    const failIdx = failuresOn() && experts.length > 1 ? 1 : -1;
    return Promise.all(experts.map((e, idx) => {
      const existing = getSession(sessionId).rounds[round][e.id];
      if (existing && existing.status === 'done') return Promise.resolve();
      return runExpert(sessionId, round, e, idx, idx === failIdx);
    }));
  }

  function runExpert(sessionId, round, expert, idx, shouldFail) {
    const ses = getSession(sessionId);
    const peers = ses.expertIds.filter((id) => id !== expert.id).map(expertById).filter(Boolean);
    const { stance, text } = window.Gen.expertResponse(expert, ses.brief, round, peers);
    const full = stance + '\n\n' + text;
    const thinkMs = (600 + Math.random() * 1800 + idx * 250) / speed();
    updateSession(sessionId, (x) => { x.rounds[round][expert.id] = { status: 'thinking', stance: null, text: '' }; });
    return new Promise((resolve) => {
      setTimeout(() => {
        const ctrl = streamText(text,
          (acc) => {
            updateSession(sessionId, (x) => {
              const r = x.rounds[round][expert.id];
              r.status = 'streaming'; r.stance = stance; r.text = acc;
            });
          },
          (acc) => {
            const inTok = estimateTokens(ses.brief) + 450 + (round === 2 ? peers.length * 550 : 0);
            const outTok = estimateTokens(stance + acc);
            updateSession(sessionId, (x) => {
              const r = x.rounds[round][expert.id];
              r.status = 'done'; r.text = acc;
              r.usage = { inTok, outTok };
            });
            pushUsage({ sessionId, kind: 'expert', expertId: expert.id, provider: expert.provider, model: expert.model, inTok, outTok, cachedTok: round === 2 ? Math.round(inTok * 0.3) : 0 });
            resolve('done');
          },
          {
            failAt: shouldFail ? Math.round(text.length * 0.3) : -1,
            onFail: () => {
              updateSession(sessionId, (x) => {
                const r = x.rounds[round][expert.id];
                r.status = 'failed';
                r.error = expert.provider === 'openai' ? '429 rate_limit_exceeded — provider throttled the request mid-stream.' : 'Provider returned 529 overloaded_error — the call was dropped mid-stream.';
              });
              resolve('failed');
            },
          });
        (liveControllers[sessionId] = liveControllers[sessionId] || []).push(ctrl);
      }, thinkMs);
    });
  }

  async function retryExpert(sessionId, round, expertId) {
    const expert = expertById(expertId);
    activeRuns.add(sessionId); notify();
    try {
      updateSession(sessionId, (x) => { x.rounds[round][expertId] = { status: 'queued', stance: null, text: '' }; });
      return await runExpert(sessionId, round, expert, 0, false);
    } finally { activeRuns.delete(sessionId); notify(); }
  }

  function runSynthesis(sessionId, round) {
    const ses = getSession(sessionId);
    const experts = ses.expertIds.map(expertById).filter(Boolean);
    const ok = experts.filter((e) => ses.rounds[round][e.id] && ses.rounds[round][e.id].status === 'done');
    const missing = experts.filter((e) => !ok.includes(e)).map((e) => e.name);
    const answers = {};
    ok.forEach((e) => { answers[e.id] = ses.rounds[round][e.id]; });
    const text = window.Gen.synthesisText(ok, answers, round, missing);
    updateSession(sessionId, (x) => { x.status = 'synthesis' + round; x.syntheses[round] = { status: 'thinking', text: '' }; });
    return new Promise((resolve) => {
      setTimeout(() => {
        streamText(text,
          (acc) => updateSession(sessionId, (x) => { x.syntheses[round] = { status: 'streaming', text: acc }; }),
          (acc) => {
            const inTok = estimateTokens(ses.brief) + ok.reduce((a, e) => a + estimateTokens(answers[e.id].text), 0) + 300;
            const outTok = estimateTokens(acc);
            updateSession(sessionId, (x) => { x.syntheses[round] = { status: 'done', text: acc, usage: { inTok, outTok } }; });
            pushUsage({ sessionId, kind: 'synthesis', expertId: null, provider: state.defaultModel.provider, model: state.defaultModel.model, inTok, outTok });
            resolve();
          }, { delay: 400 });
      }, 900 / speed());
    });
  }

  function freezeSession(sessionId) {
    updateSession(sessionId, (x) => { x.status = 'frozen'; x.frozenAt = Date.now(); });
  }

  // Full configured flow after brief approval. UI calls this once.
  async function dispatch(sessionId, editedBrief, opts = {}) {
    activeRuns.add(sessionId); notify();
    try {
      updateSession(sessionId, (x) => {
        x.brief = editedBrief;
        if (!x._renamed && titleFromBrief(editedBrief) && /^Council session \d+$/.test(x.title)) x.title = titleFromBrief(editedBrief);
      });
      await runRound(sessionId, 1);
      if (anyFailed(sessionId, 1) && !opts.continueOnFail) {
        updateSession(sessionId, (x) => { x.status = 'round1-partial'; });
        return 'partial';
      }
      return await continueAfterRound1(sessionId);
    } finally { activeRuns.delete(sessionId); notify(); }
  }

  // Resume an interrupted or partial run from wherever the session data left off.
  async function resume(sessionId, opts = {}) {
    const ses = getSession(sessionId);
    if (!ses || ses.status === 'frozen' || isRunning(sessionId)) return;
    activeRuns.add(sessionId); notify();
    try {
      const st = ses.status;
      if (st === 'round1' || st === 'round1-partial') {
        if (!opts.skipFailed) await runRound(sessionId, 1);
        if (anyFailed(sessionId, 1) && !opts.skipFailed) {
          updateSession(sessionId, (x) => { x.status = 'round1-partial'; });
          return 'partial';
        }
        return await continueAfterRound1(sessionId);
      }
      if (st === 'synthesis1') return await continueAfterRound1(sessionId);
      if (st === 'round2' || st === 'round2-partial') {
        if (!opts.skipFailed) await runRound(sessionId, 2);
        if (anyFailed(sessionId, 2) && !opts.skipFailed) {
          updateSession(sessionId, (x) => { x.status = 'round2-partial'; });
          return 'partial2';
        }
        return await continueAfterRound2(sessionId);
      }
      if (st === 'synthesis2') return await continueAfterRound2(sessionId);
    } finally { activeRuns.delete(sessionId); notify(); }
  }

  function anyFailed(sessionId, round) {
    const ses = getSession(sessionId);
    return Object.values(ses.rounds[round]).some((r) => r.status === 'failed');
  }

  async function continueAfterRound1(sessionId) {
    const ses = getSession(sessionId);
    if (ses.synthesis) await runSynthesis(sessionId, 1);
    if (ses.round2) {
      await runRound(sessionId, 2);
      if (anyFailed(sessionId, 2)) { updateSession(sessionId, (x) => { x.status = 'round2-partial'; }); return 'partial2'; }
      return continueAfterRound2(sessionId);
    }
    freezeSession(sessionId);
    return 'frozen';
  }
  async function continueAfterRound2(sessionId) {
    const ses = getSession(sessionId);
    if (ses.synthesis) await runSynthesis(sessionId, 2);
    freezeSession(sessionId);
    return 'frozen';
  }

  // session-level cost rollup from usage records
  function sessionCost(sessionId) {
    return state.usage.filter((u) => u.sessionId === sessionId)
      .reduce((acc, u) => {
        acc.cost += costOf(u.provider, u.model, u.inTok, u.outTok, u.cachedTok);
        acc.inTok += u.inTok; acc.outTok += u.outTok; acc.cached += (u.cachedTok || 0); acc.calls += 1;
        return acc;
      }, { cost: 0, inTok: 0, outTok: 0, cached: 0, calls: 0 });
  }

  // ---------------- reset ----------------
  function resetAll(toEmpty) {
    state = toEmpty ? freshEmptyState() : freshSeededState();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    notify();
  }

  window.API = {
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getState: () => state,
    // providers
    validateAndSaveKey, deleteKey, setDefaultModel, completeOnboarding, keyValid, validModels,
    // experts
    saveExpert, duplicateExpert, deleteExpert, builderChat, expertById,
    // sessions
    createSession, renameSession, deleteSession, getSession, updateSession,
    intakeTurn, estimateRun, dispatch, retryExpert, runRound, runSynthesis,
    continueAfterRound1, continueAfterRound2, anyFailed, freezeSession, sessionCost,
    resume, isRunning, resetAll,
    OUTPUT_CAP_TOK,
  };
})();
