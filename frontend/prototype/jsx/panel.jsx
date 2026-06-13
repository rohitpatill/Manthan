// ============ Manthan — live panel (rounds, synthesis) & frozen record ============

const ROUND_META = {
  1: { title: 'Round 1 — Independent answers', sub: 'The identical brief, dispatched in parallel. No expert sees another\u2019s answer.' },
  2: { title: 'Round 2 — The debate', sub: 'Each expert has privately read the others\u2019 Round 1 positions — revising, defending, or updating.' },
};

// ---------- live cost ticker (header) ----------
function SessionCostTicker({ ses }) {
  const state = useStore();
  const base = API.sessionCost(ses.id);
  // add partial cost of anything currently streaming
  let extra = 0, extraTok = 0;
  [1, 2].forEach((r) => {
    Object.entries(ses.rounds[r] || {}).forEach(([eid, resp]) => {
      if (resp.status === 'streaming') {
        const e = API.expertById(eid);
        const t = Catalog.estimateTokens(resp.text);
        if (e) { extra += Catalog.costOf(e.provider, e.model, 0, t); extraTok += t; }
      }
    });
    const syn = ses.syntheses[r];
    if (syn && syn.status === 'streaming' && state.defaultModel) {
      const t = Catalog.estimateTokens(syn.text);
      extra += Catalog.costOf(state.defaultModel.provider, state.defaultModel.model, 0, t); extraTok += t;
    }
  });
  if (!base.calls && !extra) return null;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', fontSize: 12.5, color: 'var(--ink-3)' }} className="mono">
      <span>{Catalog.fmtTok(base.inTok + base.outTok + extraTok)} tok</span>
      <span style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ink)' }}>{Catalog.fmtCost(base.cost + extra)}</span>
    </div>
  );
}

// ---------- phase stepper ----------
function PhaseStepper({ ses }) {
  const phases = [
    { key: 'brief', label: 'Brief' },
    { key: 'r1', label: 'Round 1' },
    ses.synthesis ? { key: 's1', label: ses.round2 ? 'Synthesis' : 'Synthesis' } : null,
    ses.round2 ? { key: 'r2', label: 'Round 2' } : null,
    ses.round2 && ses.synthesis ? { key: 's2', label: 'Final synthesis' } : null,
    { key: 'frozen', label: 'Frozen' },
  ].filter(Boolean);
  const currentKey = {
    'round1': 'r1', 'round1-partial': 'r1', 'synthesis1': 's1',
    'round2': 'r2', 'round2-partial': 'r2', 'synthesis2': 's2', 'frozen': 'frozen',
  }[ses.status] || 'brief';
  const ci = phases.findIndex((p) => p.key === currentKey);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
      {phases.map((p, i) => {
        const done = i < ci || ses.status === 'frozen';
        const active = i === ci && ses.status !== 'frozen';
        return (
          <React.Fragment key={p.key}>
            {i > 0 ? <span style={{ width: 26, height: 1.5, background: i <= ci ? 'var(--primary)' : 'var(--line)', margin: '0 6px' }}></span> : null}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 17, height: 17, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                background: done ? 'var(--primary)' : active ? 'var(--primary-tint)' : 'var(--line-2)',
                border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                color: '#fff',
              }}>
                {done ? <Icon name="check" size={10} /> : active ? <span className="status-dot status-streaming" style={{ width: 6, height: 6 }}></span> : null}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--primary)' : done ? 'var(--ink-2)' : 'var(--ink-3)' }}>{p.label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------- panel summary strip: every avatar + stance at a glance ----------
function SummaryStrip({ ses, round }) {
  const experts = ses.expertIds.map(API.expertById).filter(Boolean);
  const resps = ses.rounds[round] || {};
  return (
    <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h4 style={{ fontSize: 11.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Panel at a glance — {round === 2 ? 'Round 2' : 'Round 1'} stances
        </h4>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 14 }}>
        {experts.map((e) => {
          const r = resps[e.id] || { status: 'queued' };
          return (
            <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ExpertAvatar expert={e} size={26} />
                <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }} className="truncate">{e.name.split(' ').slice(-1)[0]}</span>
                <span className={'status-dot status-' + r.status} title={r.status}></span>
              </div>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, color: r.stance ? 'var(--ink-2)' : 'var(--ink-3)', fontStyle: r.stance ? 'normal' : 'italic' }} className="clamp2">
                {r.stance || (r.status === 'failed' ? 'Call failed' : r.status === 'thinking' ? 'Thinking…' : r.status === 'queued' ? 'Queued' : '…')}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- expert response card ----------
const STATUS_LABEL = { queued: 'Queued', thinking: 'Thinking', streaming: 'Streaming', done: 'Done', failed: 'Failed' };
function ExpertResponseCard({ ses, round, expert, frozen }) {
  const r = (ses.rounds[round] || {})[expert.id] || { status: 'queued' };
  const [expanded, setExpanded] = useState(false);
  const long = (r.text || '').length > 700;
  const showBody = r.status === 'streaming' || r.status === 'done';
  return (
    <div className="card fade-up" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, borderColor: r.status === 'failed' ? 'var(--red)' : undefined }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <ExpertAvatar expert={expert} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }} className="truncate">{expert.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }} className="truncate">{expert.title}</div>
        </div>
        {!frozen ? (
          <span className="chip" style={{ gap: 7 }}>
            <span className={'status-dot status-' + r.status}></span>{STATUS_LABEL[r.status]}
          </span>
        ) : <ModelChip provider={expert.provider} model={expert.model} />}
      </div>

      {r.stance ? (
        <div style={{ background: 'var(--primary-tint)', border: '1px solid var(--primary-line)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--primary-deep)', lineHeight: 1.5 }}>
          {r.stance}
        </div>
      ) : null}

      {r.status === 'thinking' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)', fontSize: 12.5, padding: '6px 0' }}>
          <span className="churn" style={{ width: 22, height: 22 }}><i></i><i></i><i></i></span>
          {expert.model} is working the brief…
        </div>
      ) : null}
      {r.status === 'queued' ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: '6px 0' }}>Waiting to dispatch…</div>
      ) : null}

      {showBody ? (
        <div>
          <div style={{
            maxHeight: expanded || !long ? 'none' : 215, overflow: 'hidden', position: 'relative',
          }}>
            <Md text={r.text} />
            {r.status === 'streaming' ? <span className="caret"></span> : null}
            {!expanded && long ? (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'linear-gradient(transparent, var(--surface))' }}></div>
            ) : null}
          </div>
          {long ? (
            <button className="btn btn-subtle btn-sm" style={{ marginTop: 6, color: 'var(--primary)' }} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Collapse' : 'Read full response'} <Icon name={expanded ? 'down' : 'right'} size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
            </button>
          ) : null}
        </div>
      ) : null}

      {r.status === 'failed' ? (
        <div style={{ background: 'var(--red-tint)', borderRadius: 9, padding: '11px 13px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 600, marginBottom: 8, display: 'flex', gap: 7 }}>
            <Icon name="warn" size={14} style={{ marginTop: 1, flex: 'none' }} /> {r.error || 'The model call failed.'}
          </p>
          {!frozen ? (
            <button className="btn btn-ghost btn-sm" onClick={() => API.retryExpert(ses.id, round, expert.id)}>
              <Icon name="retry" size={13} /> Retry {expert.name.split(' ').slice(-1)[0]} only
            </button>
          ) : <p style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Session froze with this call incomplete.</p>}
        </div>
      ) : null}

      {r.usage && (r.status === 'done') ? (
        <div style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', gap: 12 }} className="mono">
          <span>{Catalog.fmtTok(r.usage.inTok)} in · {Catalog.fmtTok(r.usage.outTok)} out</span>
          <span>{Catalog.fmtCost(Catalog.costOf(expert.provider, expert.model, r.usage.inTok, r.usage.outTok))}</span>
        </div>
      ) : null}
    </div>
  );
}

// ---------- round section ----------
function RoundSection({ ses, round, frozen }) {
  const experts = ses.expertIds.map(API.expertById).filter(Boolean);
  const meta = ROUND_META[round];
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h3 style={{ fontSize: 16 }}>{meta.title}</h3>
        {round === 2 ? <span className="badge badge-blue">The churning intensifies</span> : null}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>{meta.sub}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
        {experts.map((e) => <ExpertResponseCard key={e.id} ses={ses} round={round} expert={e} frozen={frozen} />)}
      </div>
    </section>
  );
}

// ---------- synthesis ----------
function SynthesisCard({ ses, round, frozen }) {
  const state = useStore();
  const syn = ses.syntheses[round];
  if (!syn) return null;
  const label = round === 2 || !ses.round2 ? 'Final synthesis — the council\u2019s verdict' : 'Synthesis of Round 1';
  return (
    <section className="fade-up" style={{ marginBottom: 28 }}>
      <div className="card" style={{ borderColor: 'var(--gold-line)', background: 'var(--gold-tint)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <ManthanMark size={20} color="#fff" />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, color: 'var(--gold-deep)' }}>{label}</h3>
            <p style={{ fontSize: 11.5, color: 'var(--gold-deep)', opacity: 0.75 }}>
              Manthan AI{state.defaultModel ? ' · ' + state.defaultModel.model : ''} — who said what, where they conflict, what to do.
            </p>
          </div>
          {syn.status === 'thinking' ? <span className="churn" style={{ width: 24, height: 24 }}><i></i><i></i><i></i></span> : null}
        </div>
        {syn.status === 'thinking' ? (
          <p style={{ fontSize: 13, color: 'var(--gold-deep)', fontStyle: 'italic' }}>Reading the full panel…</p>
        ) : (
          <div>
            <Md text={syn.text} />
            {syn.status === 'streaming' ? <span className="caret caret-gold"></span> : null}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- failure / interruption banners ----------
function RunBanners({ ses }) {
  useStore();
  const running = API.isRunning(ses.id);
  const partial = ses.status === 'round1-partial' || ses.status === 'round2-partial';
  const round = ses.status === 'round2-partial' ? 2 : 1;
  if (partial && !running) {
    const failed = Object.entries(ses.rounds[round]).filter(([, r]) => r.status === 'failed');
    return (
      <div className="card fade-up" style={{ padding: '14px 18px', marginBottom: 20, borderColor: 'var(--red)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Icon name="warn" size={17} style={{ color: 'var(--red)', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontWeight: 700, fontSize: 13.5 }}>{failed.length} of {ses.expertIds.length} expert calls failed in Round {round}.</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>The rest of the panel is unaffected. Retry the failures, or continue — the synthesis will note who's missing.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={async () => {
            await Promise.all(failed.map(([eid]) => API.retryExpert(ses.id, round, eid)));
            API.resume(ses.id, { skipFailed: true });
          }}><Icon name="retry" size={13} /> Retry failed</button>
          <button className="btn btn-ghost btn-sm" onClick={() => API.resume(ses.id, { skipFailed: true })}>Continue without them</button>
        </div>
      </div>
    );
  }
  const midRun = ['round1', 'synthesis1', 'round2', 'synthesis2'].includes(ses.status);
  if (midRun && !running) {
    return (
      <div className="card fade-up" style={{ padding: '14px 18px', marginBottom: 20, borderColor: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="warn" size={17} style={{ color: 'var(--amber)', flex: 'none' }} />
        <p style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)' }}><strong>This run was interrupted</strong> (page reloaded mid-stream). Completed responses are safe; resume to finish the remaining calls.</p>
        <button className="btn btn-primary btn-sm" onClick={() => API.resume(ses.id)}><Icon name="retry" size={13} /> Resume run</button>
      </div>
    );
  }
  return null;
}

// ---------- live panel ----------
function LivePanel({ ses }) {
  const activeRound = (ses.status === 'round2' || ses.status === 'round2-partial' || ses.status === 'synthesis2' || Object.keys(ses.rounds[2] || {}).length) ? 2 : 1;
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 32px 64px' }}>
      <div style={{ marginBottom: 20 }}><PhaseStepper ses={ses} /></div>
      <RunBanners ses={ses} />
      <SummaryStrip ses={ses} round={activeRound} />
      <RoundSection ses={ses} round={1} />
      {ses.syntheses[1] ? <SynthesisCard ses={ses} round={1} /> : null}
      {Object.keys(ses.rounds[2] || {}).length ? <RoundSection ses={ses} round={2} /> : null}
      {ses.syntheses[2] ? <SynthesisCard ses={ses} round={2} /> : null}
    </div>
  );
}

// ---------- frozen record ----------
function Collapsible({ title, sub, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: open ? '12px 12px 0 0' : 12,
          padding: '13px 18px', fontFamily: 'inherit',
        }}>
        <Icon name="down" size={14} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', color: 'var(--ink-3)' }} />
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{title}</span>
        {sub ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span> : null}
      </button>
      {open ? (
        <div style={{ border: '1px solid var(--line)', borderTop: 0, borderRadius: '0 0 12px 12px', padding: 20, background: 'var(--surface-2)' }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function FrozenView({ ses }) {
  const experts = ses.expertIds.map(API.expertById).filter(Boolean);
  const state = useStore();
  const totals = API.sessionCost(ses.id);
  const expertUsage = state.usage.filter((u) => u.sessionId === ses.id);
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 32px 64px' }}>
      <div className="card" style={{ padding: '18px 22px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', flex: 'none' }}>
          <Icon name="lock" size={19} />
        </span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{ fontWeight: 800, fontSize: 14.5 }}>Frozen on {fmtDate(ses.frozenAt)} — read-only forever.</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>The complete record of this deliberation: intake, brief, every response, and cost.</p>
        </div>
        <div style={{ display: 'flex', gap: 22 }} className="mono">
          {[
            [totals.calls, 'calls'],
            [Catalog.fmtTok(totals.inTok), 'tokens in'],
            [Catalog.fmtTok(totals.outTok), 'tokens out'],
            [Catalog.fmtCost(totals.cost), 'total cost'],
          ].map(([v, l]) => (
            <div key={l} style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>{v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Collapsible title="Intake — briefing Manthan AI" sub={ses.intake.length + ' messages'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
          {ses.intake.map((m, i) => <ChatBubble key={i} msg={m} />)}
        </div>
      </Collapsible>

      <Collapsible title="The approved brief" sub="what every expert received" defaultOpen>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: 760 }}>{ses.brief}</div>
      </Collapsible>

      <Collapsible title={ROUND_META[1].title} sub={experts.length + ' experts'} defaultOpen>
        <SummaryStrip ses={ses} round={1} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
          {experts.map((e) => <ExpertResponseCard key={e.id} ses={ses} round={1} expert={e} frozen />)}
        </div>
      </Collapsible>

      {ses.syntheses[1] ? (
        <Collapsible title={ses.round2 ? 'Synthesis of Round 1' : 'Final synthesis'} defaultOpen={!ses.round2}>
          <SynthesisCard ses={ses} round={1} frozen />
        </Collapsible>
      ) : null}

      {Object.keys(ses.rounds[2] || {}).length ? (
        <Collapsible title={ROUND_META[2].title} sub={experts.length + ' experts'}>
          <SummaryStrip ses={ses} round={2} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
            {experts.map((e) => <ExpertResponseCard key={e.id} ses={ses} round={2} expert={e} frozen />)}
          </div>
        </Collapsible>
      ) : null}

      {ses.syntheses[2] ? (
        <Collapsible title="Final synthesis — the council's verdict" defaultOpen>
          <SynthesisCard ses={ses} round={2} frozen />
        </Collapsible>
      ) : null}

      <Collapsible title="Cost breakdown" sub={Catalog.fmtCost(totals.cost)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={{ padding: '6px 8px' }}>Call</th><th style={{ padding: '6px 8px' }}>Model</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>In</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Out</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cached</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody className="mono">
            {expertUsage.map((u) => {
              const e = u.expertId ? API.expertById(u.expertId) : null;
              return (
                <tr key={u.id} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{e ? e.name : u.kind === 'synthesis' ? 'Synthesis (Manthan AI)' : 'Intake (Manthan AI)'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--ink-3)' }}>{u.model}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{Catalog.fmtTok(u.inTok)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{Catalog.fmtTok(u.outTok)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--ink-3)' }}>{u.cachedTok ? Catalog.fmtTok(u.cachedTok) : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{Catalog.fmtCost(Catalog.costOf(u.provider, u.model, u.inTok, u.outTok, u.cachedTok))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>
    </div>
  );
}

Object.assign(window, { LivePanel, FrozenView, SessionCostTicker, PhaseStepper, SummaryStrip, ExpertResponseCard, RoundSection, SynthesisCard, RunBanners, Collapsible });
