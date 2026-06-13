// ============ Manthan — experts library, editor & Manthan AI builder ============

function expertNeedsReassignment(expert) { return !API.keyValid(expert.provider); }

// ---------- editor modal ----------
function ExpertEditor({ initial, onClose }) {
  const [draft, setDraft] = useState(() => ({
    name: '', title: '', persona: '', avatar: null,
    provider: null, model: null,
    ...(initial || {}),
  }));
  const [avatarMode, setAvatarMode] = useState('upload');
  const [urlDraft, setUrlDraft] = useState(draft.avatar && draft.avatar.type === 'url' ? draft.avatar.value : '');
  const fileRef = useRef(null);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const canSave = draft.name.trim() && draft.title.trim() && draft.persona.trim() && draft.provider && draft.model;

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => set('avatar', { type: 'upload', value: reader.result });
    reader.readAsDataURL(f);
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
              <button className={'btn btn-sm ' + (avatarMode === 'upload' ? 'btn-ghost' : 'btn-subtle')} onClick={() => { setAvatarMode('upload'); fileRef.current && fileRef.current.click(); }}><Icon name="upload" size={12} /></button>
              <button className={'btn btn-sm ' + (avatarMode === 'url' ? 'btn-ghost' : 'btn-subtle')} onClick={() => setAvatarMode(avatarMode === 'url' ? 'upload' : 'url')}><Icon name="link" size={12} /></button>
              {draft.avatar ? <button className="btn btn-subtle btn-sm" onClick={() => { set('avatar', null); setUrlDraft(''); }}><Icon name="x" size={12} /></button> : null}
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
                  <button className="btn btn-ghost" onClick={() => set('avatar', urlDraft.trim() ? { type: 'url', value: urlDraft.trim() } : null)}>Apply</button>
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
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '6px 24px 22px' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!canSave}
          onClick={() => { API.saveExpert(draft); onClose(); }}>Save expert</button>
      </div>
    </Modal>
  );
}

// ---------- Manthan AI builder ----------
function BuilderChat({ onClose, onDraftReady }) {
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
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '', streaming: true }]);
    const { draft: d } = await API.builderChat(text, (acc) => {
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: 'assistant', text: acc, streaming: true }; return c; });
    });
    setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { ...c[c.length - 1], streaming: false }; return c; });
    setDraft(d); setBusy(false);
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
              <ModelChip provider={draft.provider} model={draft.model} />
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

function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser ? (
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', color: '#E8B54D', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 2 }}>
          <ManthanMark size={16} color="#E8B54D" />
        </span>
      ) : null}
      <div style={{
        maxWidth: '82%', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.6,
        background: isUser ? 'var(--primary)' : 'var(--surface-2)',
        color: isUser ? '#fff' : 'var(--ink)',
        border: isUser ? 'none' : '1px solid var(--line-2)',
        borderTopLeftRadius: isUser ? 12 : 4, borderTopRightRadius: isUser ? 4 : 12,
      }}>
        <Md text={msg.text} className={isUser ? '' : ''} />
        {msg.streaming ? <span className="caret"></span> : null}
      </div>
    </div>
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
        {expert.persona.split('\n')[0]}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <ModelChip provider={expert.provider} model={expert.model} invalid={invalid} />
        {expert.starter ? <span className="badge badge-gray">Starter — editable</span> : null}
      </div>
      {invalid ? (
        <div className="badge badge-red" style={{ alignSelf: 'flex-start' }}>
          <Icon name="warn" size={11} /> Needs reassignment — no valid {Catalog.CATALOG[expert.provider].label} key
        </div>
      ) : null}
      {confirm ? (
        <Confirm title="Delete this expert?" body={`${expert.name} will be removed from your library. Past sessions keep their record.`}
          onConfirm={() => API.deleteExpert(expert.id)} onClose={() => setConfirm(false)} />
      ) : null}
    </div>
  );
}

function Experts() {
  const state = useStore();
  const [editing, setEditing] = useState(null); // expert object or {} for new
  const [builder, setBuilder] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {state.experts.map((e) => <ExpertCard key={e.id} expert={e} onEdit={setEditing} />)}
        </div>
      )}
      {editing ? <ExpertEditor initial={editing.id ? editing : editing} onClose={() => setEditing(null)} /> : null}
      {builder ? (
        <BuilderChat onClose={() => setBuilder(false)}
          onDraftReady={(d) => { setBuilder(false); setEditing({ ...d }); }} />
      ) : null}
    </Page>
  );
}

Object.assign(window, { Experts, ExpertEditor, BuilderChat, ChatBubble, expertNeedsReassignment });
