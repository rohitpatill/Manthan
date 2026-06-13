// ============ Manthan — usage & cost analytics (premium dashboard) ============
import React, { useEffect, useState, useMemo } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, EmptyState } from '../components/ui';
import { navigate, Page } from '../components/shell';

const RANGES = [{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: 'all', label: 'All time' }];
const GRANS = [{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }];
const PROVIDER_OPTS = [{ id: 'all', label: 'All providers' }, { id: 'openai', label: 'OpenAI' }, { id: 'gemini', label: 'Gemini' }, { id: 'anthropic', label: 'Anthropic' }];

const PURPOSE_LABEL = {
  expert_r1: 'Expert rounds (R1)', expert_r2: 'Expert rounds (R2)',
  synthesis_r1: 'Synthesis (R1)', synthesis_r2: 'Synthesis (R2)',
  intake: 'Intake chat', builder: 'Persona builder', suggest: 'Panel suggestions',
};
const provColor = (p) => (Catalog.CATALOG[p] ? Catalog.CATALOG[p].color : 'var(--primary)');

// ---------- small UI atoms ----------
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 2 }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{
            border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
            background: value === o.id ? 'var(--surface)' : 'transparent',
            color: value === o.id ? 'var(--primary)' : 'var(--ink-3)',
            boxShadow: value === o.id ? 'var(--shadow-sm)' : 'none', transition: 'all .12s',
          }}>{o.label}</button>
      ))}
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

const cell = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: 20, minWidth: 0 };

// ---------- hero: spend over time (area chart, SVG) ----------
function SpendChart({ series, granularity, height = 300 }) {
  const W = 760, padL = 8, padB = 26, padT = 12;
  const H = height;
  const pts = series.map((s) => ({ label: s.bucket, cost: s.cost }));
  const max = Math.max(...pts.map((p) => p.cost), 1e-9);
  const n = pts.length;
  const innerW = W - padL * 2, innerH = H - padB - padT;
  const x = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (c) => padT + innerH - (c / max) * innerH;
  const [hover, setHover] = useState(null);

  const GRAN_WORD = { daily: 'days', weekly: 'weeks', monthly: 'months' }[granularity] || 'periods';
  if (!n) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--ink-3)' }}>
      <Icon name="chart" size={26} style={{ opacity: 0.5 }} />
      <p style={{ fontSize: 13 }}>No spend in this range.</p>
    </div>
  );
  if (n === 1) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--ink-3)', textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }} className="mono">{Catalog.fmtCost(pts[0].cost)}</div>
      <p style={{ fontSize: 13, maxWidth: 280 }}>
        Only one {granularity === 'daily' ? 'day' : granularity.replace('ly', '')} of activity so far — a trend line needs at least two {GRAN_WORD}.
        Keep using Manthan and the curve will fill in.
      </p>
    </div>
  );

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.cost)}`).join(' ');
  const area = `${line} L ${x(n - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;
  const fmtLabel = (lab) => {
    const d = new Date(lab + (lab.length === 10 ? 'T00:00:00' : ''));
    if (granularity === 'monthly') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const ticks = n <= 8 ? pts.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spendFill)" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <rect x={x(i) - innerW / (2 * Math.max(n, 1))} y={padT} width={innerW / Math.max(n, 1)} height={innerH}
              fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(p.cost)} r={hover === i ? 4 : 0} fill="var(--primary)" />
          </g>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize="10.5" fill="var(--ink-3)"
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{fmtLabel(pts[i].label)}</text>
        ))}
      </svg>
      {hover != null ? (
        <div style={{
          position: 'absolute', left: `${(x(hover) / W) * 100}%`, top: 0, transform: 'translateX(-50%)',
          background: 'var(--navy)', color: '#fff', fontSize: 11.5, fontWeight: 700, padding: '5px 9px',
          borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap',
        }} className="mono">
          {fmtLabel(pts[hover].label)} · {Catalog.fmtCost(pts[hover].cost)}
        </div>
      ) : null}
    </div>
  );
}

// ---------- donut: spend share by provider ----------
function Donut({ rows }) {
  const total = rows.reduce((a, r) => a + r.cost, 0) || 1e-9;
  const R = 64, sw = 22, C = 80;
  let acc = 0;
  const arcs = rows.map((r) => {
    const frac = r.cost / total;
    const seg = { ...r, frac, start: acc };
    acc += frac;
    return seg;
  });
  const circumference = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width={C * 2} height={C * 2} style={{ flex: 'none' }}>
        <g transform={`rotate(-90 ${C} ${C})`}>
          {arcs.map((a, i) => (
            <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={provColor(a.provider_type)} strokeWidth={sw}
              strokeDasharray={`${a.frac * circumference} ${circumference}`}
              strokeDashoffset={-a.start * circumference} />
          ))}
        </g>
        <text x={C} y={C - 4} textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--ink)" className="mono">{Catalog.fmtCost(total)}</text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>total spend</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: provColor(a.provider_type), flex: 'none' }}></span>
            <span style={{ fontWeight: 700, flex: 1 }}>{Catalog.CATALOG[a.provider_type] ? Catalog.CATALOG[a.provider_type].label : a.provider_type}</span>
            <span className="mono" style={{ color: 'var(--ink-3)' }}>{Math.round(a.frac * 100)}%</span>
            <span className="mono" style={{ fontWeight: 700, width: 56, textAlign: 'right' }}>{Catalog.fmtCost(a.cost)}</span>
          </div>
        ))}
        {!rows.length ? <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>No data</span> : null}
      </div>
    </div>
  );
}

// ---------- horizontal bar list (call types) ----------
function BarList({ rows, labelOf, colorOf, valueOf }) {
  const max = Math.max(...rows.map(valueOf), 1e-9);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }} className="truncate">{labelOf(r)}</span>
            <span className="mono" style={{ color: 'var(--ink-2)', fontWeight: 700, flex: 'none' }}>{Catalog.fmtCost(valueOf(r))}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--line-2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: (valueOf(r) / max * 100) + '%', background: colorOf(r), transition: 'width .3s' }}></div>
          </div>
        </div>
      ))}
      {!rows.length ? <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>No data</span> : null}
    </div>
  );
}

// ---------- sortable breakdown table ----------
function SortTable({ title, rows, columns, defaultSort }) {
  const [sort, setSort] = useState(defaultSort || 'cost');
  const [dir, setDir] = useState('desc');
  const sorted = useMemo(() => {
    const s = [...rows].sort((a, b) => (a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : 0));
    return dir === 'desc' ? s.reverse() : s;
  }, [rows, sort, dir]);
  const click = (key) => { if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc'); else { setSort(key); setDir('desc'); } };
  return (
    <div style={cell}>
      <h4 style={{ fontSize: 13.5, marginBottom: 12 }}>{title}</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {columns.map((c) => (
              <th key={c.key} onClick={() => c.sortable !== false && click(c.key)}
                style={{ padding: '6px 8px', textAlign: c.right ? 'right' : 'left', cursor: c.sortable !== false ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
                {c.label}{sort === c.key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="mono">
          {sorted.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--line-2)' }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '8px', textAlign: c.right ? 'right' : 'left', fontWeight: c.bold ? 700 : 400, color: c.muted ? 'var(--ink-3)' : 'var(--ink)' }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!sorted.length ? <tr><td colSpan={columns.length} style={{ padding: 16, color: 'var(--ink-3)', textAlign: 'center' }}>No data in this range.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

// ---------- screen ----------
export function Analytics() {
  const state = useStore();
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState('daily');
  const [provider, setProvider] = useState('all');
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?range=${range}&granularity=${granularity}&provider=${provider}`)
      .then((r) => r.json()).then((d) => { setA(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [range, granularity, provider]);

  const empty = a && a.totals.calls === 0 && provider === 'all' && range === 'all';
  const frozenCount = state.sessions.filter((s) => s.status === 'frozen').length;

  const filterBar = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
      <Segmented options={RANGES} value={range} onChange={setRange} />
      <div style={{ flex: 1 }} />
      <select className="select" style={{ width: 'auto' }} value={provider} onChange={(e) => setProvider(e.target.value)}>
        {PROVIDER_OPTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  );

  if (!a && loading) {
    return <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys." wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-3)', padding: 40 }}>
        <span className="churn" style={{ width: 24, height: 24 }}><i></i><i></i><i></i></span> Loading…
      </div></Page>;
  }
  if (empty) {
    return <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys.">
      <EmptyState icon="chart" title="Nothing measured yet"
        body="Every call — intake turns, expert rounds, syntheses — is metered here by token and dollar. Run your first council session to populate it."
        action={<button className="btn btn-primary" onClick={() => navigate('/new')}><Icon name="spark" size={14} /> Convene the Council</button>} />
    </Page>;
  }

  const t = a.totals;
  const cachedPct = t.input_tokens ? Math.round((t.cached_tokens / t.input_tokens) * 100) : 0;

  return (
    <Page title="Analytics" sub="Token usage and spend across every call Manthan makes with your keys — by model, provider, expert, and session." wide>
      {filterBar}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
        <StatCard label="Total spend" value={Catalog.fmtCost(t.cost)} sub={t.calls + ' calls metered'} />
        <StatCard label="Input tokens" value={Catalog.fmtTok(t.input_tokens)} sub={cachedPct + '% served from cache'} />
        <StatCard label="Output tokens" value={Catalog.fmtTok(t.output_tokens)} />
        <StatCard label="Sessions" value={String(state.sessions.length)} sub={frozenCount + ' frozen'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 14, marginBottom: 14, alignItems: 'stretch', opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
        <div style={{ ...cell, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <h4 style={{ fontSize: 13.5 }}>Spend over time</h4>
            <Segmented options={GRANS} value={granularity} onChange={setGranularity} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <SpendChart series={a.series} granularity={granularity} />
          </div>
        </div>
        <div style={{ ...cell, display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: 13.5, marginBottom: 16 }}>Spend share by provider</h4>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><Donut rows={a.by_provider} /></div>
        </div>
      </div>

      <div style={{ ...cell, marginBottom: 14, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
        <h4 style={{ fontSize: 13.5, marginBottom: 14 }}>By call type</h4>
        <BarList rows={a.by_purpose} valueOf={(r) => r.cost}
          colorOf={() => 'var(--ink-3)'} labelOf={(r) => PURPOSE_LABEL[r.purpose] || r.purpose} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 14, opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
        <SortTable title="By expert" rows={a.by_expert.filter((r) => r.expert_name !== 'Manthan AI')}
          columns={[
            { key: 'expert_name', label: 'Expert', bold: true, sortable: false },
            { key: 'calls', label: 'Calls', right: true },
            { key: 'output_tokens', label: 'Out', right: true, muted: true, render: (r) => Catalog.fmtTok(r.output_tokens) },
            { key: 'cost', label: 'Cost', right: true, bold: true, render: (r) => Catalog.fmtCost(r.cost) },
          ]} />
        <SortTable title="By session" rows={a.by_session}
          columns={[
            { key: 'title', label: 'Session', bold: true, sortable: false, render: (r) => <span className="truncate" style={{ display: 'inline-block', maxWidth: 200 }}>{r.title || 'Untitled'}</span> },
            { key: 'calls', label: 'Calls', right: true },
            { key: 'cost', label: 'Cost', right: true, bold: true, render: (r) => Catalog.fmtCost(r.cost) },
          ]} />
      </div>

      <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
        <SortTable title="By model" rows={a.by_model}
          columns={[
            { key: 'model_id', label: 'Model', bold: true, sortable: false },
            { key: 'provider_type', label: 'Provider', sortable: false, render: (r) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: provColor(r.provider_type), display: 'inline-block' }}></span>
                {Catalog.CATALOG[r.provider_type] ? Catalog.CATALOG[r.provider_type].label : r.provider_type}
              </span>) },
            { key: 'calls', label: 'Calls', right: true },
            { key: 'input_tokens', label: 'In', right: true, muted: true, render: (r) => Catalog.fmtTok(r.input_tokens) },
            { key: 'output_tokens', label: 'Out', right: true, muted: true, render: (r) => Catalog.fmtTok(r.output_tokens) },
            { key: 'cached_tokens', label: 'Cached', right: true, muted: true, render: (r) => r.cached_tokens ? Catalog.fmtTok(r.cached_tokens) : '—' },
            { key: 'cost', label: 'Cost', right: true, bold: true, render: (r) => Catalog.fmtCost(r.cost) },
          ]} />
      </div>
    </Page>
  );
}
