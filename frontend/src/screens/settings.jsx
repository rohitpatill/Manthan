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
  const [confirmReset, setConfirmReset] = useState(null); // 'selective' | 'all'
  const [synthWords, setSynthWords] = useState(state.synthesisMaxWords);
  const [parts, setParts] = useState({ sessions: false, experts: false, analytics: false });
  const [busy, setBusy] = useState(false);
  const orphans = state.experts.filter(expertNeedsReassignment);

  const saveSynthWords = (raw) => {
    const n = Math.max(50, Math.min(2000, Number(raw) || 700));
    setSynthWords(n);
    if (n !== state.synthesisMaxWords) API.setSynthesisMaxWords(n);
  };

  const PART_LABELS = {
    sessions: { title: 'Sessions', note: 'Every council session and its briefing chat, answers, and syntheses.' },
    experts: { title: 'Experts', note: 'Your reusable persona library. Frozen sessions keep their own copy.' },
    analytics: { title: 'Analytics', note: 'Usage and cost history that powers the dashboard.' },
  };
  const anySelected = parts.sessions || parts.experts || parts.analytics;
  const selectedSummary = Object.keys(PART_LABELS)
    .filter((k) => parts[k]).map((k) => PART_LABELS[k].title.toLowerCase()).join(', ');

  const restoreStarters = async () => {
    setBusy(true);
    try { await API.seedStarters(); } finally { setBusy(false); }
  };

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
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Synthesis length</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
            The maximum length of the combined verdict Manthan AI writes after each round. Raise it for
            a thorough, detailed synthesis; lower it for a tight summary. Each expert's own answer length
            is set per expert in the Experts library.
          </p>
          <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <input className="input" type="number" min={50} max={2000} step={50}
              style={{ maxWidth: 140 }}
              value={synthWords}
              onChange={(e) => setSynthWords(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={(e) => saveSynthWords(e.target.value)} />
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>words · default 700</span>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Local data</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
            Manthan is local-first and single-user: sessions, experts, and usage live in a local SQLite
            database next to the backend.
          </p>
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13.5 }}>Reset data (keep keys)</p>
              <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
                Choose exactly what to delete. Provider keys and the default model are always kept.
                These are independent — clearing experts never breaks past sessions, which keep their own copy.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.keys(PART_LABELS).map((k) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={parts[k]} style={{ marginTop: 3, flex: 'none' }}
                      onChange={(e) => setParts((p) => ({ ...p, [k]: e.target.checked }))} />
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{PART_LABELS[k].title}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{PART_LABELS[k].note}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={!anySelected} onClick={() => setConfirmReset('selective')}>
                  Delete selected
                </button>
              </div>
            </div>
            <hr className="hr" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5 }}>Restore starter experts</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Re-add the built-in starter personas. Skipped if your library already has experts.</p>
              </div>
              <button className="btn btn-subtle btn-sm" disabled={busy} onClick={restoreStarters}>{busy ? 'Restoring…' : 'Restore'}</button>
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
          title={confirmReset === 'all' ? 'Clear everything?' : 'Delete selected data?'}
          body={confirmReset === 'all'
            ? 'All keys, sessions, experts, and usage will be cleared. You’ll land on first-run onboarding.'
            : `The following will be permanently deleted: ${selectedSummary}. Provider keys are kept.${parts.experts ? ' Frozen sessions keep their own copy of any cleared experts.' : ''}`}
          confirmLabel={confirmReset === 'all' ? 'Clear everything' : 'Delete'}
          onConfirm={async () => {
            const all = confirmReset === 'all';
            await API.clearData(!all, all ? undefined : parts);
            if (all) navigate('/onboarding');
            else { setParts({ sessions: false, experts: false, analytics: false }); setConfirmReset(null); }
          }}
          onClose={() => setConfirmReset(null)} />
      ) : null}
    </Page>
  );
}
