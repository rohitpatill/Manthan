// ============ Manthan — app root: routing ============
import React, { useState, useEffect } from 'react';
import { API } from './lib/store';
import { useStore, ManthanMark, Icon } from './components/ui';
import { Shell, navigate } from './components/shell';
import { Onboarding } from './screens/onboarding';
import { Home } from './screens/home';
import { Experts } from './screens/experts';
import { NewSession, SessionScreen } from './screens/session';
import { Analytics } from './screens/analytics';
import { Settings } from './screens/settings';

function useRoute() {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const fn = () => setRoute(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return route;
}

export default function App() {
  const state = useStore();
  const route = useRoute();

  useEffect(() => { API.init(); }, []);

  useEffect(() => {
    if (!state.loaded) return;
    if (!state.onboarded && route !== '/onboarding') navigate('/onboarding');
    else if (state.onboarded && (route === '/' || route === '' || route === '/onboarding')) navigate('/home');
  }, [state.onboarded, state.loaded, route]);

  if (!state.loaded) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'var(--navy)' }}>
        <ManthanMark size={44} color="#E8B54D" />
        <p style={{ color: 'var(--navy-ink)', fontSize: 13 }}>Churning…</p>
      </div>
    );
  }

  if (state.loadError) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div className="card" style={{ maxWidth: 480, padding: 28, textAlign: 'center' }}>
          <Icon name="warn" size={28} style={{ color: 'var(--amber)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Backend unreachable</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 18 }}>{state.loadError}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!state.onboarded || route === '/onboarding') {
    return <Onboarding />;
  }

  let screen = null;
  if (route === '/new') screen = <NewSession />;
  else if (route.startsWith('/session/')) screen = <SessionScreen id={route.split('/')[2]} />;
  else if (route.startsWith('/experts')) screen = <Experts />;
  else if (route.startsWith('/analytics')) screen = <Analytics />;
  else if (route.startsWith('/settings')) screen = <Settings />;
  else screen = <Home />;

  return <Shell route={route}>{screen}</Shell>;
}
