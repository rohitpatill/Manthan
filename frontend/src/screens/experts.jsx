// ============ Manthan — experts library, editor & Manthan AI builder ============
import React, { useState, useEffect, useRef } from 'react';
import { API } from '../lib/store';
import { Catalog } from '../lib/catalog';
import {
  useStore, Icon, ExpertAvatar, ModelChip, ModelPicker, Md,
  Modal, ModalHeader, Confirm, Menu, EmptyState, ChatBubble, ManthanMark,
} from '../components/ui';
import { Page } from '../components/shell';

export function expertNeedsReassignment(expert) { return !API.keyValid(expert.provider); }

// ---------- editor modal ----------
export function ExpertEditor({ initial, onClose }) {
  const state = useStore();
  const [draft, setDraft] = useState(() => ({
    name: '', title: '', persona: '', avatar: null,
    provider: null, model: null, maxWords: 300, domain: '',
    ...(initial || {}),
  }));
  const existingDomains = Array.from(new Set(state.experts.map((e) => e.domain).filter(Boolean))).sort();
  const NEW_DOMAIN = '__new__';
  const [domainMode, setDomainMode] = useState(
    () => (draft.domain && !existingDomains.includes(draft.domain) ? 'new' : 'pick'));
  const [avatarMode, setAvatarMode] = useState('upload');
  const [urlDraft, setUrlDraft] = useState(draft.avatar ? draft.avatar.value : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const canSave = draft.name.trim() && draft.title.trim() && draft.persona.trim() && draft.provider && draft.model;

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const url = await API.uploadAvatar(f);
      set('avatar', { value: url });
    } catch (err) { setError(err.message); }
  };

  const save = async () => {
    setSaving(true); setError(null);
    try { await API.saveExpert(draft); onClose(); }
    catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <Modal width={680} onClose={onClose}>
      <ModalHeader title={initial && initial.id ? 'Edit expert' : 'New expert'}
        sub="A reusable persona you can convene in any session." onClose={onClose} />
      <div style={{ padding: '16px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <ExpertAvatar expert={draft} size={72} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={'btn btn-sm ' + (avatarMode === 'upload' ? 'btn-ghost' : 'btn-subtle')} title="Upload image"
                onClick={() => { setAvatarMode('upload'); fileRef.current && fileRef.current.click(); }}><Icon name="upload" size={12} /></button>
              <button className={'btn btn-sm ' + (avatarMode === 'url' ? 'btn-ghost' : 'btn-subtle')} title="Image URL"
                onClick={() => setAvatarMode(avatarMode === 'url' ? 'upload' : 'url')}><Icon name="link" size={12} /></button>
              {draft.avatar ? <button className="btn btn-subtle btn-sm" title="Remove avatar" onClick={() => { set('avatar', null); setUrlDraft(''); }}><Icon name="x" size={12} /></button> : null}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field-label">Name</label>
              <input className="input" value={draft.name} placeholder="Dr. Meera Iyer" onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Title / short description</label>
              <input className="input" value={draft.title} placeholder="Neurologist — clinical decision-making" onChange={(e) => set('title', e.target.value)} />
            </div>
            {avatarMode === 'url' ? (
              <div>
                <label className="field-label">Avatar image URL</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={urlDraft} placeholder="https://…/portrait.jpg" onChange={(e) => setUrlDraft(e.target.value)} />
                  <button className="btn btn-ghost" onClick={() => set('avatar', urlDraft.trim() ? { value: urlDraft.trim() } : null)}>Apply</button>
                </div>
                <p className="field-hint">Loaded at runtime; falls back to initials if it breaks.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <label className="field-label">Detailed persona</label>
          <textarea className="textarea" rows={8} value={draft.persona}
            placeholder="Who they are, how they think, what they value, their lens on problems…"
            onChange={(e) => set('persona', e.target.value)} />
          <p className="field-hint">Sent as the system prompt for every call this expert makes. More specific = more genuinely different perspective.</p>
        </div>

        <div>
          <label className="field-label">Assigned model</label>
          <ModelPicker value={draft.provider ? { provider: draft.provider, model: draft.model } : null}
            onChange={(v) => setDraft((d) => ({ ...d, provider: v.provider, model: v.model }))} />
          <p className="field-hint">Match the model to the kind of thinking — only providers with valid keys are listed.</p>
        </div>

        <div>
          <label className="field-label">Max answer length (words)</label>
          <input className="input" type="number" min={50} max={500} step={10}
            style={{ maxWidth: 140 }}
            value={draft.maxWords}
            onChange={(e) => set('maxWords', e.target.value === '' ? '' : Math.max(50, Math.min(500, Number(e.target.value) || 0)))}
            onBlur={(e) => { if (e.target.value === '' || Number(e.target.value) < 50) set('maxWords', 300); }} />
          <p className="field-hint">How long this expert's answers may run, in both rounds. ~300 is the sweet spot — long enough to reason, short enough to read. Max 500.</p>
        </div>

        <div>
          <label className="field-label">Domain</label>
          {domainMode === 'new' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={draft.domain} placeholder="e.g. Law, Architecture, Sports Science"
                autoFocus onChange={(e) => set('domain', e.target.value)} />
              {existingDomains.length ? (
                <button className="btn btn-ghost" onClick={() => { setDomainMode('pick'); set('domain', ''); }}>Pick existing</button>
              ) : null}
            </div>
          ) : (
            <select className="input" value={existingDomains.includes(draft.domain) ? draft.domain : ''}
              onChange={(e) => {
                if (e.target.value === NEW_DOMAIN) { setDomainMode('new'); set('domain', ''); }
                else set('domain', e.target.value);
              }}>
              <option value="">Others (uncategorized)</option>
              {existingDomains.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value={NEW_DOMAIN}>+ Create new domain…</option>
            </select>
          )}
          <p className="field-hint">Groups this expert on the library screen. Leave as "Others" if none fit.</p>
        </div>
        {error ? <p style={{ color: 'var(--red)', fontSize: 12.5 }}><Icon name="warn" size={13} /> {error}</p> : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '6px 24px 22px' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!canSave || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save expert'}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Manthan AI builder ----------
export function BuilderChat({ onClose, onDraftReady }) {
  const [msgs, setMsgs] = useState([{
    role: 'assistant',
    text: "Describe the expert you need — the perspective, the temperament, the domain. For example: \"a skeptical macro-economist\" or \"a trauma surgeon who has seen every triage go wrong.\" I'll draft the complete persona.",
  }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(''); setBusy(true); setDraft(null);
    const history = [...msgs.slice(1), { role: 'user', text }]; // skip canned greeting
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '', thinking: true }]);
    try {
      const { message, draft: d } = await API.builderChat(history);
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: 'assistant', text: message }; return c; });
      setDraft(d);
    } catch (e) {
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: 'assistant', text: '⚠ ' + e.message }; return c; });
    }
    setBusy(false);
  };

  return (
    <Modal width={880} onClose={onClose}>
      <ModalHeader title="Build an expert with Manthan AI" sub="Describe who you need; review and edit the draft before saving." onClose={onClose} />
      <div style={{ display: 'flex', gap: 0, height: 480, borderTop: '1px solid var(--line-2)', marginTop: 16 }}>
        <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line-2)' }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {msgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--line-2)' }}>
            <input className="input" placeholder="I need a skeptical macro-economist…" value={input} disabled={busy}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} autoFocus />
            <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}><Icon name="send" size={14} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--surface-2)', borderRadius: '0 0 16px 0' }}>
          {draft ? (
            <div className="fade-up">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <ExpertAvatar expert={{ ...draft, color: '#54417E' }} size={44} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{draft.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{draft.title}</div>
                </div>
              </div>
              {draft.provider ? <ModelChip provider={draft.provider} model={draft.model} /> : null}
              <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', paddingRight: 6 }}>
                <Md text={draft.persona} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}
                onClick={() => onDraftReady(draft)}>
                Review &amp; save this expert
              </button>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--ink-3)', textAlign: 'center', padding: 20 }}>
              <ManthanMark size={34} color="var(--line)" />
              <p style={{ fontSize: 12.5, maxWidth: 220 }}>The drafted persona will appear here for review.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- library ----------
function ExpertCard({ expert, onEdit }) {
  const [confirm, setConfirm] = useState(false);
  const invalid = expertNeedsReassignment(expert);
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <ExpertAvatar expert={expert} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }} className="truncate">{expert.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }} className="clamp2">{expert.title}</div>
        </div>
        <Menu items={[
          { icon: 'edit', label: 'Edit', onClick: () => onEdit(expert) },
          { icon: 'copy', label: 'Duplicate', onClick: () => API.duplicateExpert(expert.id) },
          { icon: 'trash', label: 'Delete', danger: true, onClick: () => setConfirm(true) },
        ]} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, flex: 1 }} className="clamp2">
        {(expert.persona || '').split('\n')[0]}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <ModelChip provider={expert.provider} model={expert.model} invalid={invalid} />
        {expert.packKey ? <span className="badge badge-gray">Manthan pack</span> : null}
        {expert.starter ? <span className="badge badge-gray">Starter — editable</span> : null}
      </div>
      {invalid ? (
        <div className="badge badge-red" style={{ alignSelf: 'flex-start' }}>
          <Icon name="warn" size={11} /> Needs reassignment — no valid {Catalog.CATALOG[expert.provider] ? Catalog.CATALOG[expert.provider].label : expert.provider} key
        </div>
      ) : null}
      {confirm ? (
        <Confirm title="Delete this expert?" body={`${expert.name} will be removed from your library. Past sessions keep their record.`}
          onConfirm={() => API.deleteExpert(expert.id)} onClose={() => setConfirm(false)} />
      ) : null}
    </div>
  );
}

// Group experts by domain; "Others" (blank domain) always sorts last.
function groupByDomain(experts) {
  const map = new Map();
  for (const e of experts) {
    const key = (e.domain || '').trim() || 'Others';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === 'Others' ? 1 : b[0] === 'Others' ? -1 : a[0].localeCompare(b[0])))
    .map(([domain, list]) => ({ domain, experts: list }));
}

// Session-scoped memory of which domains are expanded (survives re-renders, resets on reload).
const openDomains = new Set();
let autoOpenedFirst = false;

// ---------- domain accordion ----------
function DomainAccordion({ groups, onEdit }) {
  // Auto-open the first domain ONCE on initial mount; afterwards the user is free to
  // collapse everything (including the first) and it stays collapsed.
  if (!autoOpenedFirst && groups.length) { openDomains.add(groups[0].domain); autoOpenedFirst = true; }
  const [, force] = useState(0);
  const toggle = (domain) => {
    if (openDomains.has(domain)) openDomains.delete(domain); else openDomains.add(domain);
    force((n) => n + 1);
  };
  const allOpen = groups.every((g) => openDomains.has(g.domain));
  const setAll = (open) => {
    openDomains.clear();
    if (open) groups.forEach((g) => openDomains.add(g.domain));
    force((n) => n + 1);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setAll(!allOpen)}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map(({ domain, experts }) => {
          const open = openDomains.has(domain);
          return (
            <div key={domain} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => toggle(domain)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                         background: open ? 'var(--surface-2)' : 'transparent', border: 0,
                         padding: '14px 18px', cursor: 'pointer', transition: 'background .12s' }}
                onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}>
                <Icon name="right" size={13}
                  style={{ color: 'var(--ink-3)', flex: 'none', transition: 'transform .15s',
                           transform: open ? 'rotate(90deg)' : 'none' }} />
                <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '.01em', flex: 1 }}>{domain}</span>
                <span className="badge badge-gray" style={{ flex: 'none' }}>{experts.length}</span>
              </button>
              {open ? (
                <div className="fade-up" style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--line-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14, marginTop: 14 }}>
                    {experts.map((e) => <ExpertCard key={e.id} expert={e} onEdit={onEdit} />)}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- import pack modal ----------
function ImportPackModal({ onClose }) {
  const state = useStore();
  const [preview, setPreview] = useState(null);
  const [model, setModel] = useState(state.defaultModel || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { API.previewPack().then(setPreview).catch((e) => setError(e.message)); }, []);

  const run = async () => {
    if (!model) return;
    setBusy(true); setError(null);
    try { const added = await API.importPack(model.provider, model.model); setDone(added); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal width={560} onClose={onClose}>
      <ModalHeader title="Import the Manthan expert pack"
        sub="A curated library of experts across many domains. Pick one model for them all." onClose={onClose} />
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {done !== null ? (
          <div className="fade-up" style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Imported {done} expert{done === 1 ? '' : 's'}.</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>They’re grouped by domain in your library. Edit any of them freely.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="field-label">Model for all imported experts</label>
              <ModelPicker value={model} onChange={setModel} />
              <p className="field-hint">Every imported expert is assigned this model. You can change individual experts afterward.</p>
            </div>
            {preview ? (
              <div className="card" style={{ padding: 14, background: 'var(--surface-2)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  Adding {preview.to_add} of {preview.total}
                  {preview.already_present ? ` · ${preview.already_present} already in your library (skipped)` : ''}
                </p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  Across {preview.domains.length} domains: {preview.domains.join(', ')}.
                  {preview.to_add === 0 ? ' Nothing new to import.' : ''}
                </p>
              </div>
            ) : <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Loading pack…</p>}
            {error ? <p style={{ color: 'var(--red)', fontSize: 12.5 }}><Icon name="warn" size={13} /> {error}</p> : null}
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '6px 24px 22px' }}>
        <button className="btn btn-ghost" onClick={onClose}>{done !== null ? 'Close' : 'Cancel'}</button>
        {done === null ? (
          <button className="btn btn-primary" disabled={!model || busy || (preview && preview.to_add === 0)} onClick={run}>
            {busy ? 'Importing…' : `Import ${preview ? preview.to_add : ''} experts`}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

export function Experts() {
  const state = useStore();
  const [editing, setEditing] = useState(null);
  const [builder, setBuilder] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const createRef = useRef(null);
  useEffect(() => {
    if (!createOpen) return;
    const fn = (e) => { if (createRef.current && !createRef.current.contains(e.target)) setCreateOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [createOpen]);

  const needsFix = state.experts.filter(expertNeedsReassignment);

  return (
    <Page
      title="Experts"
      sub="Reusable personas, each assigned to the model best suited to its kind of thinking. Build once, convene in any session."
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-subtle" onClick={() => setImporting(true)}><Icon name="spark" size={14} /> Import experts</button>
        <div ref={createRef} style={{ position: 'relative' }}>
          <button className="btn btn-primary" onClick={() => setCreateOpen(!createOpen)}><Icon name="plus" size={14} /> New expert</button>
          {createOpen ? (
            <div className="card fade-up" style={{ position: 'absolute', right: 0, top: '112%', zIndex: 50, minWidth: 230, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
              {[
                { icon: 'chat', label: 'Draft with Manthan AI', sub: 'Describe who you need', onClick: () => { setCreateOpen(false); setBuilder(true); } },
                { icon: 'edit', label: 'Create manually', sub: 'Full persona form', onClick: () => { setCreateOpen(false); setEditing({}); } },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick}
                  style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '10px 12px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--line-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                  <Icon name={it.icon} size={16} style={{ marginTop: 2, color: 'var(--primary)' }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>{it.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{it.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        </div>
      }>
      {needsFix.length ? (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 18, borderColor: 'var(--red)', background: 'var(--red-tint)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="warn" size={16} style={{ color: 'var(--red)' }} />
          <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
            {needsFix.length} expert{needsFix.length > 1 ? 's' : ''} assigned to a provider without a valid key — reassign their model or re-add the key in Settings.
          </span>
        </div>
      ) : null}
      {state.experts.length === 0 ? (
        <EmptyState icon="users" title="No experts yet"
          body="An expert is a persona plus a model. Describe one to Manthan AI, or write the persona yourself."
          action={<button className="btn btn-primary" onClick={() => setBuilder(true)}><Icon name="chat" size={14} /> Draft with Manthan AI</button>} />
      ) : (
        <DomainAccordion groups={groupByDomain(state.experts)} onEdit={setEditing} />
      )}
      {editing ? <ExpertEditor initial={editing} onClose={() => setEditing(null)} /> : null}
      {builder ? (
        <BuilderChat onClose={() => setBuilder(false)}
          onDraftReady={(d) => { setBuilder(false); setEditing({ ...d }); }} />
      ) : null}
      {importing ? <ImportPackModal onClose={() => setImporting(false)} /> : null}
    </Page>
  );
}
