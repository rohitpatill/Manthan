// ============ Manthan — app root: routing + tweaks ============

const ACCENTS = {
  'Ocean indigo': { primary: '#1D4C8F', deep: '#163C72', tint: '#EBF2FA', line: '#C9DAEE' },
  'Deep teal': { primary: '#19655B', deep: '#114A43', tint: '#E9F4F1', line: '#C2DFD8' },
  'Plum': { primary: '#54417E', deep: '#403061', tint: '#F0EDF7', line: '#D6CDE8' },
};
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "streamSpeed": 1,
  "simulateFailure": false,
  "accent": "Ocean indigo"
}/*EDITMODE-END*/;

function useRoute() {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const fn = () => setRoute(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return route;
}

function App() {
  const state = useStore();
  const route = useRoute();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // expose run-behavior tweaks to the mock API layer
  useEffect(() => { window.__manthanTweaks = t; }, [t]);
  // apply accent palette
  useEffect(() => {
    const a = ACCENTS[t.accent] || ACCENTS['Ocean indigo'];
    const r = document.documentElement.style;
    r.setProperty('--primary', a.primary); r.setProperty('--primary-deep', a.deep);
    r.setProperty('--primary-tint', a.tint); r.setProperty('--primary-line', a.line);
  }, [t.accent]);

  // routing guards
  useEffect(() => {
    if (!state.onboarded && route !== '/onboarding') navigate('/onboarding');
    else if (state.onboarded && (route === '/' || route === '' || route === '/onboarding')) navigate('/home');
  }, [state.onboarded, route]);

  const tweaks = (
    <TweaksPanel>
      <TweakSection label="Mock behavior" />
      <TweakSlider label="Streaming speed" value={t.streamSpeed} min={0.25} max={8} step={0.25} unit="×"
        onChange={(v) => setTweak('streamSpeed', v)} />
      <TweakToggle label="Simulate a failed expert" value={t.simulateFailure}
        onChange={(v) => setTweak('simulateFailure', v)} />
      <TweakSection label="Theme" />
      <TweakColor label="Accent" value={(ACCENTS[t.accent] || ACCENTS['Ocean indigo']).primary}
        options={Object.values(ACCENTS).map((a) => a.primary)}
        onChange={(v) => setTweak('accent', Object.keys(ACCENTS).find((k) => ACCENTS[k].primary === v) || 'Ocean indigo')} />
    </TweaksPanel>
  );

  if (!state.onboarded || route === '/onboarding') {
    return <div data-screen-label="Onboarding"><Onboarding />{tweaks}</div>;
  }

  let screen = null, label = 'Sessions';
  if (route === '/new') { screen = <NewSession />; label = 'Convene the Council'; }
  else if (route.startsWith('/session/')) { screen = <SessionScreen id={route.split('/')[2]} />; label = 'Council Session'; }
  else if (route.startsWith('/experts')) { screen = <Experts />; label = 'Experts'; }
  else if (route.startsWith('/analytics')) { screen = <Analytics />; label = 'Analytics'; }
  else if (route.startsWith('/settings')) { screen = <Settings />; label = 'Settings'; }
  else screen = <Home />;

  return (
    <div data-screen-label={label} style={{ height: '100%' }}>
      <Shell route={route}>{screen}</Shell>
      {tweaks}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
