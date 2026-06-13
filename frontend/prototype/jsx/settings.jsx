// ============ Manthan — settings ============

function Settings() {
  const state = useStore();
  const [confirmReset, setConfirmReset] = useState(null); // 'seeded' | 'empty'
  const orphans = state.experts.filter(expertNeedsReassignment);

  return (
    <Page title="Settings" sub="Provider keys, the default model behind Manthan AI, and prototype controls.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 720 }}>
        <section>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Provider keys</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
            Stored encrypted, used only from your machine. Model pickers across the app only ever show
            models from providers with a currently valid key.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Catalog.PROVIDERS.map((p) => <ProviderKeyCard key={p} provider={p} />)}
          </div>
          {orphans.length ? (
            <div className="card" style={{ padding: '12px 16px', marginTop: 12, borderColor: 'var(--red)', background: 'var(--red-tint)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="warn" size={15} style={{ color: 'var(--red)', flex: 'none' }} />
              <span style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 600, flex: 1 }}>
                {orphans.map((e) => e.name).join(', ')} {orphans.length > 1 ? 'are' : 'is'} assigned to a provider without a valid key.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/experts')}>Reassign</button>
            </div>
          ) : null}
        </section>

        <section>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Default model — Manthan AI</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
            Powers the intake chat, the persona builder, and every synthesis. Experts keep their own
            individually assigned models.
          </p>
          <div className="card" style={{ padding: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <ManthanMark size={20} color="#E8B54D" />
            </span>
            <ModelPicker value={state.defaultModel} onChange={(v) => API.setDefaultModel(v.provider, v.model)} />
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Local data</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
            Manthan is local-first and single-user: sessions, experts, and usage live in a local database.
            These controls reset the prototype's mock data.
          </p>
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5 }}>Reset to seeded demo</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Restore the starter experts, sample frozen sessions, and usage history.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset('seeded')}>Reset</button>
            </div>
            <hr className="hr" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5 }}>Start from scratch</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Clear keys, sessions, and usage — replays the first-run onboarding (starter experts kept).</p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset('empty')}>Clear &amp; replay onboarding</button>
            </div>
          </div>
        </section>
      </div>

      {confirmReset ? (
        <Confirm
          title={confirmReset === 'seeded' ? 'Reset to seeded demo?' : 'Clear everything?'}
          body={confirmReset === 'seeded'
            ? 'Your current sessions, experts, and usage will be replaced by the demo dataset.'
            : 'All keys, sessions, and usage will be cleared. You\u2019ll land on first-run onboarding.'}
          confirmLabel={confirmReset === 'seeded' ? 'Reset' : 'Clear everything'}
          onConfirm={() => {
            const empty = confirmReset === 'empty';
            API.resetAll(empty);
            navigate(empty ? '/onboarding' : '/home');
          }}
          onClose={() => setConfirmReset(null)} />
      ) : null}
    </Page>
  );
}

Object.assign(window, { Settings });
