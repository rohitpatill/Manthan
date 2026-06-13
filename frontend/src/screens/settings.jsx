// ============ Manthan — settings ============
import React, { useState } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, ManthanMark, ModelPicker, Confirm } from '../components/ui';
import { navigate, Page } from '../components/shell';
import { ProviderKeyCard } from './onboarding';
import { expertNeedsReassignment } from './experts';

export function Settings() {
  const state = useStore();
  const [confirmReset, setConfirmReset] = useState(null); // 'data' | 'all'
  const orphans = state.experts.filter(expertNeedsReassignment);

  return (
    <Page title="Settings" sub="Provider keys, the default model behind Manthan AI, and local data controls.">
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
            Manthan is local-first and single-user: sessions, experts, and usage live in a local SQLite
            database next to the backend.
          </p>
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5 }}>Reset data (keep keys)</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Delete all sessions, experts, and usage history; re-seed the starter experts. Keys and default model stay.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset('data')}>Reset</button>
            </div>
            <hr className="hr" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5 }}>Start from scratch</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Clear keys, sessions, experts, and usage — replays the first-run onboarding.</p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset('all')}>Clear &amp; replay onboarding</button>
            </div>
          </div>
        </section>
      </div>

      {confirmReset ? (
        <Confirm
          title={confirmReset === 'data' ? 'Reset all data?' : 'Clear everything?'}
          body={confirmReset === 'data'
            ? 'All sessions, experts, and usage history will be permanently deleted. Provider keys are kept.'
            : 'All keys, sessions, experts, and usage will be cleared. You’ll land on first-run onboarding.'}
          confirmLabel={confirmReset === 'data' ? 'Reset' : 'Clear everything'}
          onConfirm={async () => {
            const all = confirmReset === 'all';
            await API.clearData(!all);
            if (all) navigate('/onboarding');
            else { await API.seedStarters(); navigate('/home'); }
          }}
          onClose={() => setConfirmReset(null)} />
      ) : null}
    </Page>
  );
}
