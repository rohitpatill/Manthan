// Headless E2E: drives the SAME REST + SSE endpoints the frontend store uses,
// through the Vite proxy (so it proves proxy + backend + SSE parsing together).
// Run: node e2e/flow.mjs  (backend in MOCK mode on :8000, Vite on BASE below)
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5178';
let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass++; console.log('  [PASS]', label); } else { fail++; console.log('  [FAIL]', label, extra); } };

async function http(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(BASE + path, opts);
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.detail) || res.statusText); e.status = res.status; throw e; }
  return data;
}
async function sse(path, body, onEvent) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { let d = res.statusText; try { d = (await res.json()).detail; } catch {} const e = new Error(d); e.status = res.status; throw e; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of block.split('\n')) if (line.startsWith('data:')) { try { onEvent(JSON.parse(line.slice(5).trim())); } catch {} }
    }
  }
}

(async () => {
  console.log(`\n=== Manthan frontend E2E (via ${BASE}) ===\n`);

  console.log('[1] Providers + catalog (frontend pulls models from here)');
  const prov = await http('GET', '/api/providers');
  ok('catalog has 3 providers with models', ['openai','gemini','anthropic'].every(p => prov.catalog[p].models.length > 0));
  // ensure keys (mock backend already imported .env or accepts good-*)
  for (const p of ['openai','gemini','anthropic']) {
    try { await http('POST', '/api/providers', { provider_type: p, api_key: 'good-' + p }); } catch {}
  }
  const prov2 = await http('GET', '/api/providers');
  ok('masked_key returned for storage display', prov2.providers.every(x => x.masked_key));
  await http('PUT', '/api/providers/default-model', { provider_type: 'openai', model_id: 'gpt-4o-mini' });
  ok('default model set', true);

  console.log('[2] Experts: seed + builder + manual create');
  await http('POST', '/api/seed-starters');
  let experts = (await http('GET', '/api/experts')).experts;
  ok('starter experts present', experts.length >= 6);
  const b = await http('POST', '/api/experts/builder/chat', { messages: [{ role: 'user', content: 'a ruthless growth marketer' }] });
  ok('builder returns a draft expert', !!(b.expert && b.expert.name), JSON.stringify(b).slice(0,120));
  const created = await http('POST', '/api/experts', {
    name: 'E2E Tester', title: 'QA', persona: 'Checks everything twice and trusts nothing.',
    provider_type: 'anthropic', model_id: 'claude-haiku-4.5', avatar_url: 'https://example.com/x.png' });
  ok('manual expert created', !!created.expert.id);

  console.log('[3] Session: create → intake → dispatch (SSE) → synthesis → round2 → freeze');
  experts = (await http('GET', '/api/experts')).experts;
  const ids = experts.slice(0, 3).map(e => e.id);
  const sess = await http('POST', '/api/sessions', { title: '', expert_ids: ids, round2_enabled: true, synthesis_enabled: true });
  const sid = sess.session.id;
  ok('session created with 3 experts', sess.experts.length === 3);

  const r1 = await http('POST', `/api/sessions/${sid}/intake`, { message: 'hi' });
  ok('intake: thin input not ready', r1.ready_to_dispatch === false);
  const r2 = await http('POST', `/api/sessions/${sid}/intake`, { message: 'READY: should we adopt a 4-day work week at full pay for a 40-person firm? weigh finance, morale, delivery. give a recommendation.' });
  ok('intake: ready + brief compiled', r2.ready_to_dispatch === true && r2.compiled_brief.length > 20);

  let starts = 0, dones = 0, chunks = 0, stageDone = null;
  await sse(`/api/sessions/${sid}/dispatch`, { brief: r2.compiled_brief }, (ev) => {
    if (ev.type === 'expert_start') starts++;
    if (ev.type === 'expert_done') dones++;
    if (ev.type === 'chunk') chunks++;
    if (ev.type === 'stage_done') stageDone = ev;
  });
  ok('round1 SSE: 3 starts, 3 done, chunks streamed', starts === 3 && dones === 3 && chunks > 3, `starts=${starts} done=${dones} chunks=${chunks}`);

  let synDone = false;
  await sse(`/api/sessions/${sid}/synthesize?round=1`, undefined, (ev) => { if (ev.type === 'synthesis_done') synDone = true; });
  ok('synthesis r1 done', synDone);

  let d2 = 0;
  await sse(`/api/sessions/${sid}/round2`, undefined, (ev) => { if (ev.type === 'expert_done') d2++; });
  ok('round2 done for all', d2 === 3, `done=${d2}`);

  let frozen = null;
  await sse(`/api/sessions/${sid}/synthesize?round=2`, undefined, (ev) => { if (ev.type === 'stage_done') frozen = ev; });
  ok('final synthesis freezes session', frozen && frozen.session_status === 'frozen', JSON.stringify(frozen));

  console.log('[4] Frozen detail has full record + per-call usage');
  const detail = await http('GET', `/api/sessions/${sid}`);
  ok('session frozen in DB', detail.session.status === 'frozen');
  ok('6 expert responses + 2 syntheses', detail.responses.filter(r=>r.kind==='expert').length === 6 && detail.responses.filter(r=>r.kind==='synthesis').length === 2);
  ok('intake messages stored (4)', detail.intake_messages.length === 4);
  ok('usage_log present with cost', detail.usage_log.length > 0 && detail.usage_totals.cost > 0);

  console.log('[5] Frozen session is read-only');
  try { await http('POST', `/api/sessions/${sid}/intake`, { message: 'more' }); ok('frozen rejects intake', false); }
  catch (e) { ok('frozen rejects intake (409)', e.status === 409); }

  console.log('[6] Analytics rollups');
  const a = await http('GET', '/api/analytics');
  ok('analytics totals + breakdowns', a.totals.calls > 0 && a.by_model.length && a.by_expert.length && a.by_session.length && a.by_purpose.length);

  console.log('[7] Sessions list summary shape');
  const list = await http('GET', '/api/sessions');
  ok('session row has experts + cost', list.sessions.length >= 1 && list.sessions[0].experts !== undefined);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
