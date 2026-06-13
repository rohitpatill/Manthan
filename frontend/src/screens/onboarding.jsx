// ============ Manthan — first-run onboarding & key cards ============
import React, { useState } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import { useStore, Icon, ManthanMark, ModelPicker } from '../components/ui';
import { navigate } from '../components/shell';

export function ProviderKeyCard({ provider, compact }) {
  const state = useStore();
  const p = Catalog.CATALOG[provider];
  const k = state.keys[provider];
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const status = k ? k.status : 'none';
  const showInput = status === 'none' || status === 'invalid' || editing;

  const submit = async () => {
    if (!draft.trim()) return;
    setEditing(false);
    await API.validateAndSaveKey(provider, draft.trim());
    setDraft('');
  };

  return (
    <div className="card" style={{ padding: compact ? 16 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showInput || status !== 'none' ? 12 : 0 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: p.color, color: '#fff', flex: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em',
        }}>{p.short}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.models.length} models</div>
        </div>
        {status === 'valid' ? <span className="badge badge-green"><Icon name="check" size={11} /> Valid</span> : null}
        {status === 'validating' ? <span className="badge badge-blue"><span className="thinking-dots"><span></span><span></span><span></span></span> Validating</span> : null}
        {status === 'invalid' ? <span className="badge badge-red"><Icon name="x" size={11} /> Invalid</span> : null}
      </div>

      {status === 'valid' && !editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '6px 10px' }}>{k.masked}</code>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(true); setDraft(''); }}>Replace</button>
          <button className="btn btn-danger btn-sm" onClick={() => API.deleteKey(provider)} title="Delete key"><Icon name="trash" size={13} /></button>
        </div>
      ) : null}

      {showInput && status !== 'validating' ? (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="password" placeholder={p.keyName + '  (' + p.keyHint + ')'} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
            <button className="btn btn-primary" onClick={submit} disabled={!draft.trim()}>Validate</button>
            {editing ? <button className="btn btn-subtle" onClick={() => setEditing(false)}>Cancel</button> : null}
          </div>
          {status === 'invalid' && k && k.error ? (
            <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Icon name="warn" size={14} style={{ marginTop: 1 }} /> {k.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Onboarding() {
  const state = useStore();
  const [step, setStep] = useState(0);
  const anyValid = Catalog.PROVIDERS.some((p) => API.keyValid(p));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 10, color: '#fff' }}>
          <ManthanMark size={34} color="#E8B54D" />
          <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>Manthan</span>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--navy-ink)', fontSize: 14, marginBottom: 30, lineHeight: 1.6 }}>
          One problem. A council of AI experts — each on the model best suited to its thinking.<br />
          Independent answers, open debate, one synthesis.
        </p>

        <div className="card" style={{ padding: 28, borderRadius: 18 }}>
          {step === 0 ? (
            <div className="fade-up">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontSize: 18 }}>Connect a provider</h2>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>Step 1 of 2</span>
              </div>
              <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 18 }}>
                Manthan runs entirely on your own API keys — no account, no cloud. Paste a key for at
                least one provider; keys are stored encrypted on your machine.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Catalog.PROVIDERS.map((p) => <ProviderKeyCard key={p} provider={p} compact />)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
                <button className="btn btn-primary btn-lg" disabled={!anyValid} onClick={() => setStep(1)}>
                  Continue <Icon name="right" size={14} />
                </button>
              </div>
              {!anyValid ? <p style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>Validate at least one key to continue.</p> : null}
            </div>
          ) : (
            <div className="fade-up">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontSize: 18 }}>Choose your default model</h2>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>Step 2 of 2</span>
              </div>
              <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 18 }}>
                This single model powers <strong>Manthan AI</strong> — the guide that takes your briefing,
                helps build expert personas, and writes the final synthesis. Experts each get their own
                model later. You can change this anytime in Settings.
              </p>
              <ModelPicker value={state.defaultModel} onChange={(v) => API.setDefaultModel(v.provider, v.model)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
                <button className="btn btn-subtle" onClick={() => setStep(0)}><Icon name="left" size={14} /> Back</button>
                <button className="btn btn-primary btn-lg" disabled={!state.defaultModel}
                  onClick={async () => { await API.completeOnboarding(); navigate('/home'); }}>
                  Enter Manthan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
