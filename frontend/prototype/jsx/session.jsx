// ============ Manthan — session flow: configure → intake → approval ============

// ---------- /new : configure the council ----------
function NewSession() {
  const state = useStore();
  const [selected, setSelected] = useState([]);
  const [round2, setRound2] = useState(true);
  const [synthesis, setSynthesis] = useState(true);
  const [title, setTitle] = useState('');
  const [suggestText, setSuggestText] = useState('');
  const [suggested, setSuggested] = useState(null);
  const [suggesting, setSuggesting] = useState(false);

  const usable = state.experts.filter((e) => !expertNeedsReassignment(e));
  const blocked = state.experts.filter(expertNeedsReassignment);

  const toggle = (id) => setSelected((s) =>
    s.includes(id) ? s.filter((x) => x !== id) : (s.length >= 10 ? s : [...s, id]));

  const suggest = async () => {
    if (!suggestText.trim()) return;
    setSuggesting(true); setSuggested(null);
    await new Promise((r) => setTimeout(r, 900));
    const scored = usable.map((e) => {
      const arch = Gen.archetypeOf(e);
      const kw = {
        economist: /money|cost|price|market|invest|revenue|fund|budget|financ|econom/i,
        strategist: /compet|rival|market|timing|win|strategy|launch|war|move/i,
        engineer: /build|technical|system|ship|software|infra|product|feasib/i,
        psychologist: /team|people|morale|culture|hire|fire|layoff|motiv|burn/i,
        ethicist: /ethic|fair|right|harm|moral|layoff|customer|promise|trust/i,
        scientist: /evidence|data|test|research|experiment|medical|health|science/i,
      }[arch];
      return { e, score: (kw && kw.test(suggestText) ? 2 : 0) + (arch !== 'generic' ? 1 : 0) };
    }).sort((a, b) => b.score - a.score);
    const pick = scored.slice(0, Math.min(4, scored.length)).map((s) => s.e.id);
    setSuggested(pick);
    setSelected(pick);
    setSuggesting(false);
  };

  const begin = () => {
    const id = API.createSession({ expertIds: selected, round2, synthesis, title: title.trim() || null });
    navigate('/session/' + id);
  };

  return (
    <Page title="Convene the Council" sub="Choose who deliberates and how far the deliberation goes. You'll brief them next.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 15 }}>Select experts</h3>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: selected.length ? 'var(--primary)' : 'var(--ink-3)' }}>
                {selected.length}/10 selected
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>Minimum 1, maximum 10. Diverse lenses beat redundant brilliance.</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: 'var(--primary-tint)', borderRadius: 10, alignItems: 'center' }}>
              <ManthanMark size={18} color="var(--primary)" />
              <input className="input" style={{ background: '#fff' }} placeholder="Unsure? Describe the problem and Manthan AI will suggest a panel…"
                value={suggestText} onChange={(e) => setSuggestText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && suggest()} />
              <button className="btn btn-primary" onClick={suggest} disabled={suggesting || !suggestText.trim()}>
                {suggesting ? <span className="thinking-dots"><span></span><span></span><span></span></span> : 'Suggest'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
              {usable.map((e) => {
                const on = selected.includes(e.id);
                const sug = suggested && suggested.includes(e.id);
                return (
                  <button key={e.id} onClick={() => toggle(e.id)}
                    style={{
                      display: 'flex', gap: 11, alignItems: 'center', textAlign: 'left', cursor: 'pointer',
                      padding: '11px 13px', borderRadius: 11, fontFamily: 'inherit',
                      border: '1.5px solid ' + (on ? 'var(--primary)' : 'var(--line)'),
                      background: on ? 'var(--primary-tint)' : '#fff',
                      transition: 'border-color .12s, background .12s',
                    }}>
                    <ExpertAvatar expert={e} size={34} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }} className="truncate">{e.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }} className="truncate">{e.title}</span>
                    </span>
                    {sug ? <span className="badge badge-blue" title="Suggested by Manthan AI"><Icon name="spark" size={10} /></span> : null}
                    <span style={{
                      width: 18, height: 18, borderRadius: 6, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid ' + (on ? 'var(--primary)' : '#C9D1DC'), background: on ? 'var(--primary)' : '#fff', color: '#fff',
                    }}>{on ? <Icon name="check" size={11} /> : null}</span>
                  </button>
                );
              })}
            </div>
            {blocked.length ? (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icon name="warn" size={13} style={{ color: 'var(--amber)' }} />
                {blocked.length} expert{blocked.length > 1 ? 's' : ''} hidden — assigned to providers without a valid key (fix in Experts or Settings).
              </p>
            ) : null}
            {usable.length === 0 ? (
              <EmptyState icon="users" title="No usable experts" body="Add experts in the Experts tab, or re-add provider keys in Settings." />
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 36 }}>
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h3 style={{ fontSize: 15 }}>Deliberation</h3>
            <Toggle value={round2} onChange={setRound2} label="Round 2 — the debate"
              sub="Each expert privately reads the others' answers, then revises or defends. Two rounds max." />
            <Toggle value={synthesis} onChange={setSynthesis} label="Synthesis"
              sub={'One combined verdict' + (state.defaultModel ? ' from ' + state.defaultModel.model : '') + ': agreements, conflicts, final recommendation.'} />
            <div>
              <label className="field-label">Session title <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(optional — auto-named from your brief)</span></label>
              <input className="input" placeholder="Auto-generated" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-lg" disabled={selected.length < 1} onClick={begin}>
            Begin briefing <Icon name="right" size={14} />
          </button>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
            Next: brief Manthan AI on the problem. Nothing reaches the experts until you approve the compiled brief.
          </p>
        </div>
      </div>
    </Page>
  );
}

// ---------- intake chat ----------
function IntakeChat({ ses }) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(null); // partial assistant text
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const experts = ses.expertIds.map(API.expertById).filter(Boolean);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(''); setBusy(true); setStreaming('');
    await API.intakeTurn(ses.id, text, (acc) => setStreaming(acc));
    setStreaming(null); setBusy(false);
  };

  const msgs = ses.intake;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {msgs.length === 0 && streaming === null ? (
          <div style={{ textAlign: 'center', margin: 'auto', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><ManthanMark size={40} color="var(--primary)" /></div>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Brief Manthan AI</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.65 }}>
              Describe the problem as you would to a trusted chief of staff — the situation, the stakes,
              what kind of advice you want. I'll ask what I need, then compile one precise brief for
              your {experts.length}-expert panel. They answer independently and blind.
            </p>
          </div>
        ) : null}
        {msgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
        {streaming !== null ? <ChatBubble msg={{ role: 'assistant', text: streaming, streaming: true }} /> : null}
      </div>
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea className="textarea" rows={2} style={{ minHeight: 52 }} placeholder="Describe the problem…" value={input} disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} autoFocus />
          <button className="btn btn-primary" style={{ height: 'auto' }} onClick={send} disabled={busy || !input.trim()}>
            <Icon name="send" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, textAlign: 'center' }}>
          Intake runs on your default model. The experts are not called until you approve the brief.
        </p>
      </div>
    </div>
  );
}

// ---------- brief approval ----------
function BriefApproval({ ses }) {
  const state = useStore();
  const [brief, setBrief] = useState(ses.brief || '');
  const experts = ses.expertIds.map(API.expertById).filter(Boolean);
  const est = useMemo(() => API.estimateRun({ ...ses, brief }), [brief, ses.expertIds, ses.round2, ses.synthesis]);
  const blocked = experts.filter(expertNeedsReassignment);

  const dispatch = () => {
    API.dispatch(ses.id, brief); // fire & forget — UI follows session state
  };

  return (
    <div style={{ maxWidth: 1010, margin: '0 auto', padding: '32px 32px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span className="badge badge-amber"><Icon name="doc" size={12} /> Approval required</span>
      </div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Review the brief before it reaches the council</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 22, maxWidth: 620 }}>
        Every expert receives <em>exactly</em> this text — independently, with no knowledge of each other.
        Edit anything Manthan AI got wrong; {experts.length} parallel calls are too expensive to spend on a misunderstood brief.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 22, alignItems: 'start' }}>
        <textarea className="textarea card" style={{ minHeight: 420, padding: 22, fontSize: 13.5, lineHeight: 1.7, borderRadius: 'var(--r-lg)' }}
          value={brief} onChange={(e) => setBrief(e.target.value)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 32 }}>
          <div className="card" style={{ padding: 18 }}>
            <h4 style={{ fontSize: 13, marginBottom: 10 }}>The panel</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {experts.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <ExpertAvatar expert={e} size={26} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0 }} className="truncate">{e.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }} className="truncate">{e.model}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h4 style={{ fontSize: 13, marginBottom: 8 }}>Estimated cost</h4>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }} className="mono">
              {Catalog.fmtCost(est.lo)} – {Catalog.fmtCost(est.hi)}
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.6 }}>
              {est.calls} model calls: {experts.length} expert{experts.length > 1 ? 's' : ''}
              {ses.round2 ? ' × 2 rounds' : ''}{ses.synthesis ? (ses.round2 ? ' + 2 syntheses' : ' + synthesis') : ''}.
              Output capped at ~{Math.round(API.OUTPUT_CAP_TOK * 0.75)} words each.
            </p>
          </div>
          {blocked.length ? (
            <div className="card" style={{ padding: 14, borderColor: 'var(--red)', background: 'var(--red-tint)' }}>
              <p style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 600 }}>
                {blocked.map((e) => e.name).join(', ')} can't be called — provider key missing. Fix in Settings first.
              </p>
            </div>
          ) : null}
          <button className="btn btn-gold btn-lg" onClick={dispatch} disabled={!brief.trim() || blocked.length > 0}>
            <Icon name="spark" size={15} /> Brief the Council
          </button>
          <button className="btn btn-subtle" onClick={() => API.updateSession(ses.id, (x) => { x.status = 'briefing'; })}>
            <Icon name="left" size={13} /> Back to briefing chat
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- session orchestrator ----------
function SessionScreen({ id }) {
  useStore();
  const ses = API.getSession(id);
  if (!ses) {
    return <Page title="Session not found" sub="It may have been deleted."><button className="btn btn-ghost" onClick={() => navigate('/home')}><Icon name="left" size={13} /> All sessions</button></Page>;
  }
  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px',
      borderBottom: '1px solid var(--line)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 20,
    }}>
      <button className="btn btn-subtle btn-sm" onClick={() => navigate('/home')} aria-label="All sessions"><Icon name="left" size={14} /></button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {ses.status === 'frozen'
          ? <span style={{ fontWeight: 700, fontSize: 15 }} className="truncate">{ses.title}</span>
          : <EditableTitle value={ses.title} onChange={(t) => { API.renameSession(id, t); API.updateSession(id, (x) => { x._renamed = true; }); }} style={{ fontWeight: 700, fontSize: 15 }} />}
        <SessionStatus status={ses.status} />
      </div>
      <SessionCostTicker ses={ses} />
    </div>
  );

  let body = null;
  if (ses.status === 'briefing') body = <IntakeChat ses={ses} />;
  else if (ses.status === 'awaiting-approval') body = <BriefApproval key={ses.brief} ses={ses} />;
  else if (ses.status === 'frozen') body = <FrozenView ses={ses} />;
  else body = <LivePanel ses={ses} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {header}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{body}</div>
    </div>
  );
}

Object.assign(window, { NewSession, SessionScreen, IntakeChat, BriefApproval });
