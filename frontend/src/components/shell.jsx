// ============ Manthan — app shell (sidebar + layout) ============
import React from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, ManthanMark } from './ui';

export function navigate(path) { location.hash = '#' + path; }

function Sidebar({ route }) {
  const state = useStore();
  const items = [
    { path: '/home', icon: 'home', label: 'Sessions' },
    { path: '/experts', icon: 'users', label: 'Experts' },
    { path: '/analytics', icon: 'chart', label: 'Analytics' },
    { path: '/settings', icon: 'gear', label: 'Settings' },
  ];
  const validKeys = Catalog.PROVIDERS.filter((p) => API.keyValid(p));
  return (
    <aside style={{
      width: 228, flex: 'none', background: 'var(--navy)', color: 'var(--navy-ink)',
      display: 'flex', flexDirection: 'column', padding: '20px 14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 10px 22px', color: '#fff' }}>
        <ManthanMark size={26} color="#E8B54D" />
        <span style={{ fontWeight: 800, fontSize: 17.5, letterSpacing: '-0.01em' }}>Manthan</span>
      </div>

      <button className="btn btn-gold" style={{ width: '100%', height: 40, marginBottom: 18 }}
        onClick={() => navigate('/new')}>
        <Icon name="spark" size={15} /> Convene the Council
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => {
          const active = route.startsWith(it.path) || (it.path === '/home' && (route.startsWith('/session') || route === '/' || route === ''));
          return (
            <a key={it.path} href={'#' + it.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 8,
                color: active ? '#fff' : 'var(--navy-ink)', textDecoration: 'none', fontWeight: 600, fontSize: 13.5,
                background: active ? 'var(--navy-3)' : 'transparent', transition: 'background .12s, color .12s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <Icon name={it.icon} size={16} /> {it.label}
            </a>
          );
        })}
      </nav>

      <div style={{ flex: 1 }}></div>

      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--navy-line)', fontSize: 11.5, color: 'var(--navy-ink-2)', lineHeight: 1.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Icon name="key" size={13} />
          <span>{validKeys.length}/3 providers connected</span>
        </div>
        {state.defaultModel ? (
          <div className="truncate" title={'Manthan AI runs on ' + state.defaultModel.model}>
            Manthan AI · {state.defaultModel.model}
          </div>
        ) : null}
        <div style={{ marginTop: 8, opacity: 0.7 }}>Local-first · your keys, your data</div>
      </div>
    </aside>
  );
}

export function Shell({ route, children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar route={route} />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}

export function Page({ title, sub, actions, children, wide }) {
  return (
    <div style={{ maxWidth: wide ? 1320 : 1080, margin: '0 auto', padding: '36px 40px 64px' }}>
      {title ? (
        <header style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 26 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 23 }}>{title}</h1>
            {sub ? <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 5, maxWidth: 560 }}>{sub}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </div>
  );
}
