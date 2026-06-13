// ============ Manthan — shared UI primitives ============
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---- store hook ----
function useStore() {
  const [, force] = useState(0);
  useEffect(() => API.subscribe(() => force((n) => n + 1)), []);
  return API.getState();
}

// ---- icons (stroke, 16px grid) ----
function Icon({ name, size = 16, style }) {
  const paths = {
    home: <path d="M3 7.5 8 3l5 4.5V13a.8.8 0 0 1-.8.8H9.5V10h-3v3.8H3.8A.8.8 0 0 1 3 13V7.5Z" />,
    users: <><circle cx="5.5" cy="5.5" r="2.3" /><path d="M1.8 13.2c0-2 1.7-3.4 3.7-3.4s3.7 1.4 3.7 3.4" /><circle cx="11" cy="5" r="1.8" /><path d="M10.6 9.6c1.9 0 3.6 1.3 3.6 3.2" /></>,
    chart: <><path d="M2.5 2.5v11h11" /><path d="M5.5 10.5V7" /><path d="M8.5 10.5V4.5" /><path d="M11.5 10.5V6" /></>,
    gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" /></>,
    plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
    send: <path d="M14 2 7.3 8.7M14 2 9.7 14l-2.4-5.3L2 6.3 14 2Z" />,
    edit: <path d="M11.3 2.5l2.2 2.2-8 8-3 .8.8-3 8-8ZM10 3.8l2.2 2.2" />,
    trash: <path d="M2.8 4.3h10.4M6.3 4.3V2.9h3.4v1.4M4.3 4.3l.7 9h6l.7-9M6.8 7v4M9.2 7v4" />,
    copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>,
    check: <path d="M3 8.5 6.5 12 13 4.5" />,
    x: <path d="M4 4l8 8M12 4l-8 8" />,
    warn: <><path d="M8 2 14.5 13.5h-13L8 2Z" /><path d="M8 6.5v3.2" /><circle cx="8" cy="11.8" r=".4" fill="currentColor" /></>,
    retry: <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8" />,
    lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
    key: <><circle cx="5" cy="11" r="2.8" /><path d="M7 9 13.5 2.5M11 5l2 2M9 7l1.6 1.6" /></>,
    left: <path d="M10 3 5 8l5 5" />,
    right: <path d="M6 3l5 5-5 5" />,
    down: <path d="M3 6l5 5 5-5" />,
    dots: <><circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" /></>,
    spark: <path d="M8 1.5 9.6 6 14 8l-4.4 2L8 14.5 6.4 10 2 8l4.4-2L8 1.5Z" />,
    doc: <><path d="M4 1.8h5.5L12.5 5v9.2h-8.5V1.8Z" /><path d="M9.3 1.8V5h3.2M6 8h4.5M6 10.5h4.5" /></>,
    chat: <path d="M2.5 3.5h11v7h-6L4 13.5v-3H2.5v-7Z" />,
    upload: <path d="M8 10.5V3M5 5.5 8 2.5l3 3M3 13h10" />,
    link: <><path d="M6.5 9.5 9.5 6.5" /><path d="M7.5 4.5 9 3a2.5 2.5 0 0 1 3.5 3.5L11 8M5 8 3.5 9.5A2.5 2.5 0 0 0 7 13l1.5-1.5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }}>
      {paths[name] || null}
    </svg>
  );
}

// ---- Manthan mark: three nested churn arcs ----
function ManthanMark({ size = 26, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flex: 'none' }}>
      <circle cx="16" cy="16" r="13.5" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeDasharray="58 27" transform="rotate(-50 16 16)" />
      <circle cx="16" cy="16" r="8.5" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeDasharray="34 20" transform="rotate(120 16 16)" />
      <circle cx="16" cy="16" r="3" fill={color} />
    </svg>
  );
}

// ---- avatar with graceful fallback ----
function ExpertAvatar({ expert, size = 36, style }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [expert && expert.avatar]);
  const initials = (expert.name || '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0]).filter((c, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
  const showImg = expert.avatar && expert.avatar.value && !broken;
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: expert.color || 'var(--primary)', ...style }}>
      {showImg
        ? <img src={expert.avatar.value} alt={expert.name} onError={() => setBroken(true)} />
        : <span>{initials}</span>}
    </div>
  );
}

// ---- provider / model chips ----
function ModelChip({ provider, model, invalid }) {
  const p = Catalog.CATALOG[provider];
  return (
    <span className="chip" title={p ? p.label : provider} style={invalid ? { borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-tint)' } : null}>
      <span className="dot" style={{ background: invalid ? 'var(--red)' : (p ? p.color : '#999') }}></span>
      {model}
    </span>
  );
}

// ---- model picker: grouped by provider, gated by valid keys ----
function ModelPicker({ value, onChange, style }) {
  const state = useStore();
  const groups = Catalog.PROVIDERS.filter((p) => API.keyValid(p));
  const val = value ? value.provider + '::' + value.model : '';
  return (
    <select className="select" style={style} value={val}
      onChange={(e) => { const [p, m] = e.target.value.split('::'); onChange({ provider: p, model: m }); }}>
      {!val ? <option value="" disabled>Select a model…</option> : null}
      {groups.map((p) => (
        <optgroup key={p} label={Catalog.CATALOG[p].label}>
          {Catalog.CATALOG[p].models.map((m) => (
            <option key={m.id} value={p + '::' + m.id}>
              {m.id} — ${m.in}/${m.out} per 1M
            </option>
          ))}
        </optgroup>
      ))}
      {groups.length === 0 ? <option value="" disabled>No providers with valid keys</option> : null}
    </select>
  );
}

// ---- minimal markdown (paragraphs, **bold**, *italic*, numbered/asterisk lines) ----
function Md({ text, className }) {
  const html = useMemo(() => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc(text || '')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
      .split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br/>') + '</p>').join('');
  }, [text]);
  return <div className={'prose ' + (className || '')} dangerouslySetInnerHTML={{ __html: html }}></div>;
}

// ---- modal ----
function Modal({ width = 560, onClose, children, dismissable = true }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && dismissable) onClose && onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, dismissable]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose && onClose(); }}>
      <div className="modal" style={{ maxWidth: width }}>{children}</div>
    </div>
  );
}
function ModalHeader({ title, sub, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 24px 0' }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: 17 }}>{title}</h3>
        {sub ? <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 3 }}>{sub}</p> : null}
      </div>
      {onClose ? <button className="btn btn-subtle btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button> : null}
    </div>
  );
}

// ---- confirm ----
function Confirm({ title, body, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal width={420} onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <div style={{ padding: '12px 24px 0', color: 'var(--ink-2)', fontSize: 13.5 }}>{body}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '20px 24px 22px' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={'btn ' + (danger ? 'btn-primary' : 'btn-primary')} style={danger ? { background: 'var(--red)' } : null}
          onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ---- dropdown menu ----
function Menu({ items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-subtle btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-label="More actions">
        <Icon name="dots" />
      </button>
      {open ? (
        <div className="card fade-up" style={{ position: 'absolute', top: '110%', [align]: 0, zIndex: 50, minWidth: 160, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
          {items.filter(Boolean).map((it, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                background: 'none', border: 0, padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: it.danger ? 'var(--red)' : 'var(--ink)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = it.danger ? 'var(--red-tint)' : 'var(--line-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
              <Icon name={it.icon} size={14} />{it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- toggle ----
function Toggle({ value, onChange, label, sub, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        background: 'none', border: 0, padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}>
      <span style={{
        width: 38, height: 22, borderRadius: 999, flex: 'none', position: 'relative',
        background: value ? 'var(--primary)' : '#C9D1DC', transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: value ? 19 : 3, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .15s',
        }}></span>
      </span>
      <span>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>{label}</span>
        {sub ? <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 12 }}>{sub}</span> : null}
      </span>
    </button>
  );
}

// ---- empty state ----
function EmptyState({ icon, title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 32px', maxWidth: 420, margin: '0 auto' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: 'var(--primary-tint)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Icon name={icon} size={24} />
      </div>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>{title}</h3>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 18 }}>{body}</p>
      {action}
    </div>
  );
}

// ---- inline editable title ----
function EditableTitle({ value, onChange, style }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return (
      <input className="input" autoFocus value={draft} style={{ fontSize: 16, fontWeight: 700, ...style }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim()) onChange(draft.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }} />
    );
  }
  return (
    <button onClick={() => setEditing(true)} title="Rename"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'text', font: 'inherit', color: 'inherit', textAlign: 'left', ...style }}>
      <span>{value}</span><Icon name="edit" size={13} style={{ color: 'var(--ink-3)' }} />
    </button>
  );
}

// ---- status pill for sessions ----
function SessionStatus({ status }) {
  if (status === 'frozen') return <span className="badge badge-gray"><Icon name="lock" size={11} /> Frozen</span>;
  if (status === 'briefing') return <span className="badge badge-blue">Briefing</span>;
  if (status === 'awaiting-approval') return <span className="badge badge-amber">Brief ready</span>;
  if (status && status.includes('partial')) return <span className="badge badge-red">Needs attention</span>;
  return <span className="badge badge-blue">In progress</span>;
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 3600e3) return Math.max(1, Math.round(d / 60e3)) + 'm ago';
  if (d < 86400e3) return Math.round(d / 3600e3) + 'h ago';
  if (d < 86400e3 * 30) return Math.round(d / 86400e3) + 'd ago';
  return fmtDate(ts);
}

Object.assign(window, {
  useStore, Icon, ManthanMark, ExpertAvatar, ModelChip, ModelPicker, Md,
  Modal, ModalHeader, Confirm, Menu, Toggle, EmptyState, EditableTitle, SessionStatus,
  fmtDate, timeAgo,
});
