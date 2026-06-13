// ============ Manthan — usage & cost analytics (backend rollups) ============
import React, { useEffect } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, EmptyState } from '../components/ui';
import { navigate, Page } from '../components/shell';

function BarList({ rows, labelOf, colorOf, valueOf, fmt }) {
  const max = Math.max(...rows.map(valueOf), 1e-9);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i}>
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

function DailySpend({ byDay }) {
  const days = 30;
  const buckets = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const costByDay = {};
  byDay.forEach((d) => { costByDay[d.day] = d.cost; });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cost: costByDay[key] || 0 });
  }
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

const PURPOSE_LABEL = {
  expert_r1: 'Expert rounds (R1)', expert_r2: 'Expert rounds (R2)',
  synthesis_r1: 'Synthesis (R1)', synthesis_r2: 'Synthesis (R2)',
  intake: 'Intake chat', builder: 'Persona builder', suggest: 'Panel suggestions',
};

export function Analytics() {
  const state = useStore();
  useEffect(() => { API.loadAnalytics().catch(() => null); }, []);
  const a = state.analytics;

  if (!a) {
    return (
      <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-3)', padding: 40 }}>
          <span className="churn" style={{ width: 24, height: 24 }}><i></i><i></i><i></i></span> Loading…
        </div>
      </Page>
    );
  }
  if (!a.totals.calls) {
    return (
      <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys.">
        <EmptyState icon="chart" title="Nothing measured yet"
          body="Every call — intake turns, expert rounds, syntheses — is metered here by token and dollar. Run your first council session to populate it."
          action={<button className="btn btn-primary" onClick={() => navigate('/new')}><Icon name="spark" size={14} /> Convene the Council</button>} />
      </Page>
    );
  }

  const cell = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 20 };
  const frozenCount = state.sessions.filter((s) => s.status === 'frozen').length;

  return (
    <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys — by model, provider, expert, and session." wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="Total spend" value={Catalog.fmtCost(a.totals.cost)} sub={a.totals.calls + ' calls metered'} />
        <StatCard label="Input tokens" value={Catalog.fmtTok(a.totals.input_tokens)} sub={Catalog.fmtTok(a.totals.cached_tokens) + ' served from cache'} />
        <StatCard label="Output tokens" value={Catalog.fmtTok(a.totals.output_tokens)} />
        <StatCard label="Sessions" value={String(state.sessions.length)} sub={frozenCount + ' frozen'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>Daily spend — last 30 days</h4>
          <DailySpend byDay={a.by_day} />
        </div>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By provider</h4>
          <BarList rows={a.by_provider} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={(r) => Catalog.CATALOG[r.provider_type] ? Catalog.CATALOG[r.provider_type].color : 'var(--primary)'}
            labelOf={(r) => Catalog.CATALOG[r.provider_type] ? Catalog.CATALOG[r.provider_type].label : r.provider_type} />
          <h4 style={{ fontSize: 13.5, margin: '20px 0 14px' }}>By call type</h4>
          <BarList rows={a.by_purpose} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={() => 'var(--ink-3)'} labelOf={(r) => PURPOSE_LABEL[r.purpose] || r.purpose} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By expert</h4>
          <BarList rows={a.by_expert.filter((r) => r.expert_name !== 'Manthan AI')} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={() => 'var(--primary)'} labelOf={(r) => r.expert_name} />
        </div>
        <div style={cell}>
          <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By session</h4>
          <BarList rows={a.by_session} valueOf={(r) => r.cost} fmt={Catalog.fmtCost}
            colorOf={() => 'var(--gold)'} labelOf={(r) => r.title || 'Deleted session'} />
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
            {a.by_model.map((r, i) => {
              const p = Catalog.CATALOG[r.provider_type];
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{r.model_id}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p ? p.color : '#999', display: 'inline-block' }}></span>{p ? p.label : r.provider_type}
                    </span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{r.calls}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Catalog.fmtTok(r.input_tokens)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Catalog.fmtTok(r.output_tokens)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-3)' }}>{r.cached_tokens ? Catalog.fmtTok(r.cached_tokens) : '—'}</td>
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
