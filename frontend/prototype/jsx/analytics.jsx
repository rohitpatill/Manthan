// ============ Manthan — usage & cost analytics ============

function rollup(usage, keyFn) {
  const map = new Map();
  usage.forEach((u) => {
    const k = keyFn(u);
    if (k == null) return;
    const cur = map.get(k) || { cost: 0, inTok: 0, outTok: 0, cached: 0, calls: 0 };
    cur.cost += Catalog.costOf(u.provider, u.model, u.inTok, u.outTok, u.cachedTok);
    cur.inTok += u.inTok; cur.outTok += u.outTok; cur.cached += (u.cachedTok || 0); cur.calls += 1;
    map.set(k, cur);
  });
  return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cost - a.cost);
}

function BarList({ rows, labelOf, colorOf, valueOf, fmt }) {
  const max = Math.max(...rows.map(valueOf), 1e-9);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }} className="truncate">{labelOf(r)}</span>
            <span className="mono" style={{ color: 'var(--ink-2)', fontWeight: 700, flex: 'none' }}>{fmt(valueOf(r))}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--line-2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: (valueOf(r) / max * 100) + '%', background: colorOf(r), transition: 'width .3s' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailySpend({ usage }) {
  const days = 30;
  const buckets = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    buckets.push({ ts: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cost: 0 });
  }
  usage.forEach((u) => {
    const b = buckets.find((b) => u.ts >= b.ts && u.ts < b.ts + 86400e3);
    if (b) b.cost += Catalog.costOf(u.provider, u.model, u.inTok, u.outTok, u.cachedTok);
  });
  const max = Math.max(...buckets.map((b) => b.cost), 1e-9);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
        {buckets.map((b, i) => (
          <div key={i} title={b.label + ' — ' + Catalog.fmtCost(b.cost)}
            style={{
              flex: 1, borderRadius: '3px 3px 0 0', minHeight: b.cost > 0 ? 4 : 1,
              height: Math.max(b.cost > 0 ? 4 : 1, (b.cost / max) * 116),
              background: b.cost > 0 ? 'var(--primary)' : 'var(--line)',
              opacity: b.cost > 0 ? 0.85 : 1, cursor: 'default',
            }}></div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
        <span>{buckets[0].label}</span><span>{buckets[Math.floor(days / 2)].label}</span><span>Today</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }} className="mono">{value}</div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function Analytics() {
  const state = useStore();
  const usage = state.usage;
  const totals = usage.reduce((a, u) => {
    a.cost += Catalog.costOf(u.provider, u.model, u.inTok, u.outTok, u.cachedTok);
    a.inTok += u.inTok; a.outTok += u.outTok; a.cached += (u.cachedTok || 0);
    return a;
  }, { cost: 0, inTok: 0, outTok: 0, cached: 0 });

  if (usage.length === 0) {
    return (
      <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys.">
        <EmptyState icon="chart" title="Nothing measured yet"
          body="Every call — intake turns, expert rounds, syntheses — is metered here by token and dollar. Run your first council session to populate it."
          action={<button className="btn btn-primary" onClick={() => navigate('/new')}><Icon name="spark" size={14} /> Convene the Council</button>} />
      </Page>
    );
  }

  const byProvider = rollup(usage, (u) => u.provider);
  const byModel = rollup(usage, (u) => u.provider + '::' + u.model);
  const byExpert = rollup(usage.filter((u) => u.expertId), (u) => u.expertId);
  const bySession = rollup(usage.filter((u) => u.sessionId), (u) => u.sessionId);
  const byKind = rollup(usage, (u) => u.kind);
  const KIND_LABEL = { expert: 'Expert rounds', synthesis: 'Synthesis', intake: 'Intake chat', builder: 'Persona builder' };

  const cell = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 20 };

  return (
    <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys — by model, provider, expert, and session." wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="Total spend" value={Catalog.fmtCost(totals.cost)} sub={usage.length + ' calls metered'} />
        <StatCard label="Input tokens" value={Catalog.fmtTok(totals.inTok)} sub={Catalog.fmtTok(totals.cached) + ' served from cache'} />
        <StatCard label="Output tokens" value={Catalog.fmtTok(totals.outTok)} />
        <StatCard label="Sessions" value={String(state.sessions.length)} sub={state.sessions.filter((s) => s.status === 'frozen').length + ' frozen'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>Daily spend — last 30 days</h4>
          <DailySpend usage={usage} />
        </div>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By provider</h4>
          <BarList rows={byProvider} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={(r) => Catalog.CATALOG[r.key] ? Catalog.CATALOG[r.key].color : 'var(--primary)'}
            labelOf={(r) => Catalog.CATALOG[r.key] ? Catalog.CATALOG[r.key].label : r.key} />
          <h4 style={{ fontSize: 13.5, margin: '20px 0 14px' }}>By call type</h4>
          <BarList rows={byKind} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={() => 'var(--ink-3)'} labelOf={(r) => KIND_LABEL[r.key] || r.key} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By expert</h4>
          <BarList rows={byExpert} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={(r) => { const e = API.expertById(r.key); return e ? e.color : 'var(--primary)'; }}
            labelOf={(r) => {
              const e = API.expertById(r.key);
              return e ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ExpertAvatar expert={e} size={18} /> {e.name}</span> : 'Deleted expert';
            }} />
        </div>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By session</h4>
          <BarList rows={bySession} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={() => 'var(--gold)'}
            labelOf={(r) => { const s = state.sessions.find((x) => x.id === r.key); return s ? s.title : 'Deleted session'; }} />
        </div>
      </div>

      <div style={cell}>
        <h4 style={{ fontSize: 13.5, marginBottom: 12 }}>By model</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={{ padding: '6px 8px' }}>Model</th>
              <th style={{ padding: '6px 8px' }}>Provider</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Calls</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>In</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Out</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cached</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody className="mono">
            {byModel.map((r) => {
              const [prov, model] = r.key.split('::');
              const p = Catalog.CATALOG[prov];
              return (
                <tr key={r.key} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{model}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
                      <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: p ? p.color : '#999', display: 'inline-block' }}></span>{p ? p.label : prov}
                    </span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{r.calls}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Catalog.fmtTok(r.inTok)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Catalog.fmtTok(r.outTok)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-3)' }}>{r.cached ? Catalog.fmtTok(r.cached) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{Catalog.fmtCost(r.cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

Object.assign(window, { Analytics });
