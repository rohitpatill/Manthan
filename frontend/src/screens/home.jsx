// ============ Manthan — home / sessions list ============
import React, { useEffect, useState } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, ExpertAvatar, Menu, Confirm, EmptyState, SessionStatus, fmtDate } from '../components/ui';
import { navigate, Page } from '../components/shell';

function SessionRow({ ses }) {
  const [confirm, setConfirm] = useState(false);
  const experts = ses.experts;
  return (
    <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s' }}
      onClick={() => navigate('/session/' + ses.id)}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = '#CDD5E0'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--line)'; }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }} className="truncate">{ses.title}</span>
          <SessionStatus status={ses.status} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 14 }}>
          <span>{fmtDate(ses.createdAt)}</span>
          <span>{experts.length} expert{experts.length === 1 ? '' : 's'}</span>
          {ses.round2 ? <span>2 rounds</span> : null}
          {ses.synthesis ? <span>synthesis</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {experts.slice(0, 6).map((e, i) => (
          <div key={e.id} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid #fff', borderRadius: '50%' }}>
            <ExpertAvatar expert={e} size={28} />
          </div>
        ))}
        {experts.length > 6 ? <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>+{experts.length - 6}</span> : null}
      </div>
      <span className="mono" style={{ width: 64, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
        {ses.totalCost ? Catalog.fmtCost(ses.totalCost) : '—'}
      </span>
      <div onClick={(e) => e.stopPropagation()}>
        <Menu items={[
          { icon: 'edit', label: 'Rename', onClick: () => {
              const t = prompt('Rename session', ses.title);
              if (t && t.trim()) API.renameSession(ses.id, t.trim());
            } },
          { icon: 'trash', label: 'Delete', danger: true, onClick: () => setConfirm(true) },
        ]} />
      </div>
      {confirm ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Confirm title="Delete this session?" body={`"${ses.title}" and its full record will be permanently removed.`}
            onConfirm={() => API.deleteSession(ses.id)} onClose={() => setConfirm(false)} />
        </div>
      ) : null}
    </div>
  );
}

export function Home() {
  const state = useStore();
  useEffect(() => { API.loadSessions().then(() => null).catch(() => null); }, []);
  const sessions = state.sessions;
  const live = sessions.filter((s) => s.status !== 'frozen');
  const frozen = sessions.filter((s) => s.status === 'frozen');
  return (
    <Page
      title="Sessions"
      sub="Every deliberation, in progress and archived. A finished session freezes into a permanent record."
      actions={<button className="btn btn-primary" onClick={() => navigate('/new')}><Icon name="spark" size={14} /> Convene the Council</button>}>
      {sessions.length === 0 ? (
        <EmptyState icon="spark" title="No sessions yet"
          body="Convene your first council: pick the experts, brief Manthan AI on your problem, and watch independent minds work it in parallel."
          action={<button className="btn btn-primary btn-lg" onClick={() => navigate('/new')}><Icon name="spark" size={15} /> Convene the Council</button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {live.length ? (
            <section>
              <h3 style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>In progress</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{live.map((s) => <SessionRow key={s.id} ses={s} />)}</div>
            </section>
          ) : null}
          {frozen.length ? (
            <section>
              <h3 style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Frozen archive</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{frozen.map((s) => <SessionRow key={s.id} ses={s} />)}</div>
            </section>
          ) : null}
        </div>
      )}
    </Page>
  );
}
