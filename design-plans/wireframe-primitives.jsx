// Shared sketchy wireframe primitives. Exposed on window so other Babel
// scripts can use them.

const Annot = ({ children, side = 'right', top = 12, offset = 12, w = 160 }) => {
  const showAnnot = window.__wfTweaks?.annot ?? true;
  if (!showAnnot) return null;
  const style = {
    position: 'absolute',
    top,
    width: w,
    fontFamily: 'var(--wf-hand)',
    fontSize: 14,
    lineHeight: 1.15,
    color: 'var(--wf-accent)',
    pointerEvents: 'none',
    zIndex: 5,
  };
  if (side === 'right') style.left = `calc(100% + ${offset}px)`;
  else if (side === 'left') { style.right = `calc(100% + ${offset}px)`; style.textAlign = 'right'; }
  else if (side === 'top') { style.bottom = `calc(100% + ${offset}px)`; style.top = 'auto'; }
  else if (side === 'bottom') { style.top = `calc(100% + ${offset}px)`; }
  return (
    <div style={style}>
      <span style={{ display: 'inline-block' }}>{children}</span>
    </div>
  );
};

// Sketchy box wrapper with optional double-line border
const Box = ({ children, style, dashed, accent, filled, double, onClick, className }) => {
  const s = {
    border: `${dashed ? '2px dashed' : '2px solid'} ${accent ? 'var(--wf-accent)' : 'var(--wf-ink)'}`,
    borderRadius: 6,
    background: filled ? 'var(--wf-ink-soft)' : 'transparent',
    boxShadow: double ? '3px 3px 0 0 var(--wf-ink)' : 'none',
    position: 'relative',
    ...style,
  };
  return <div className={className} style={s} onClick={onClick}>{children}</div>;
};

// Sketchy button
const Btn = ({ children, primary, ghost, small, style, accent, fullWidth, onClick }) => {
  const pad = small ? '6px 12px' : '10px 16px';
  const fs = small ? 13 : 15;
  const s = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: pad,
    fontFamily: 'var(--wf-hand)',
    fontSize: fs,
    border: ghost ? 'none' : `2px solid ${accent ? 'var(--wf-accent)' : 'var(--wf-ink)'}`,
    background: primary ? 'var(--wf-accent)' : (ghost ? 'transparent' : 'var(--wf-paper)'),
    color: primary ? 'var(--wf-paper)' : 'var(--wf-ink)',
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: primary ? '2px 2px 0 0 var(--wf-ink)' : 'none',
    width: fullWidth ? '100%' : 'auto',
    whiteSpace: 'nowrap',
    ...style,
  };
  return <button style={s} onClick={onClick}>{children}</button>;
};

// Squiggly text-line placeholder
const Line = ({ w = '100%', h = 8, color, style }) => (
  <div style={{
    height: h, width: w,
    background: color || 'var(--wf-ink-mute)',
    borderRadius: 3, ...style,
  }} />
);

// Stack of text lines
const TextLines = ({ rows = 3, widths, gap = 7, h = 7 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
    {Array.from({ length: rows }).map((_, i) => (
      <Line key={i} h={h} w={widths ? widths[i % widths.length] : `${65 + ((i * 17) % 30)}%`} />
    ))}
  </div>
);

// Heading text (handwritten by default)
const H = ({ children, size = 18, weight = 600, style }) => (
  <div style={{
    fontFamily: 'var(--wf-hand)',
    fontSize: size, fontWeight: weight,
    color: 'var(--wf-ink)', lineHeight: 1.15,
    ...style,
  }}>{children}</div>
);

// Caption / small label
const Cap = ({ children, style, color }) => (
  <div style={{
    fontFamily: 'var(--wf-hand)',
    fontSize: 12, color: color || 'var(--wf-ink-fade)',
    letterSpacing: 0.2, ...style,
  }}>{children}</div>
);

// "Image" placeholder (diagonally hatched)
const ImgSlot = ({ w = '100%', h = 80, label, style }) => (
  <div style={{
    width: w, height: h,
    border: '2px solid var(--wf-ink)',
    borderRadius: 5,
    background: 'repeating-linear-gradient(135deg, transparent 0 6px, var(--wf-ink-mute) 6px 7px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--wf-mono)', fontSize: 11, color: 'var(--wf-ink-fade)',
    ...style,
  }}>{label}</div>
);

// Small chip / pill
const Chip = ({ children, active, accent, small, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: small ? '2px 8px' : '4px 10px',
    fontFamily: 'var(--wf-hand)',
    fontSize: small ? 11 : 13,
    border: `1.5px solid ${active || accent ? 'var(--wf-accent)' : 'var(--wf-ink)'}`,
    background: active ? 'var(--wf-accent-soft)' : 'transparent',
    color: active ? 'var(--wf-accent)' : 'var(--wf-ink)',
    borderRadius: 999,
    ...style,
  }}>{children}</span>
);

// Sketchy icon — uses simple shapes only (per project guidance)
const Icon = ({ kind, size = 18, color }) => {
  const c = color || 'currentColor';
  const sw = 1.8;
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'plus':    return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'search':  return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>;
    case 'filter':  return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4"/></svg>;
    case 'star':    return <svg {...common}><path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2 8 13.7 4 9.8l5.5-.8z"/></svg>;
    case 'cog':     return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    case 'play':    return <svg {...common}><path d="M7 5l12 7-12 7z"/></svg>;
    case 'check':   return <svg {...common}><path d="M5 12l4 4 10-10"/></svg>;
    case 'x':       return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'edit':    return <svg {...common}><path d="M4 20l4-1L19 8l-3-3L5 16zM14 6l4 4"/></svg>;
    case 'trash':   return <svg {...common}><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>;
    case 'upload':  return <svg {...common}><path d="M12 4v12M7 9l5-5 5 5M4 20h16"/></svg>;
    case 'home':    return <svg {...common}><path d="M4 11l8-7 8 7v9H4z"/></svg>;
    case 'chart':   return <svg {...common}><path d="M4 20V8M10 20V4M16 20v-9M22 20H2"/></svg>;
    case 'user':    return <svg {...common}><circle cx="12" cy="9" r="4"/><path d="M4 20c1-4 5-6 8-6s7 2 8 6"/></svg>;
    case 'doc':     return <svg {...common}><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/></svg>;
    case 'clock':   return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>;
    case 'flame':   return <svg {...common}><path d="M12 3s5 4 5 9a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/></svg>;
    case 'chevR':   return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevL':   return <svg {...common}><path d="M15 6l-6 6 6 6"/></svg>;
    case 'bell':    return <svg {...common}><path d="M6 17h12l-2-2v-4a4 4 0 00-8 0v4z"/><path d="M10 20a2 2 0 004 0"/></svg>;
    case 'menu':    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'globe':   return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>;
    default:        return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
  }
};

// A "tab strip" used in collection detail views
const Tabs = ({ items, active, onChange }) => (
  <div style={{ display: 'flex', gap: 24, borderBottom: '2px solid var(--wf-ink-mute)', paddingBottom: 0 }}>
    {items.map((t) => {
      const isActive = t === active;
      return (
        <div key={t} onClick={() => onChange && onChange(t)} style={{
          fontFamily: 'var(--wf-hand)',
          fontSize: 16, padding: '8px 4px',
          color: isActive ? 'var(--wf-accent)' : 'var(--wf-ink)',
          borderBottom: isActive ? '3px solid var(--wf-accent)' : '3px solid transparent',
          marginBottom: -2, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
        }}>{t}</div>
      );
    })}
  </div>
);

// Tooltip-style post-it (yellow stickie inside an artboard)
const Stickie = ({ children, style }) => (
  <div style={{
    background: '#fef4a8', color: '#5a4a2a',
    fontFamily: 'var(--wf-hand)', fontSize: 13, lineHeight: 1.2,
    padding: '8px 10px', borderRadius: 3,
    boxShadow: '2px 3px 0 rgba(0,0,0,.1)',
    transform: 'rotate(-1.5deg)',
    maxWidth: 200,
    ...style,
  }}>{children}</div>
);

// Generic frame: white paper bg with thick ink border. Use as the root
// of every artboard for consistency.
const Frame = ({ children, style }) => (
  <div style={{
    width: '100%', height: '100%',
    background: 'var(--wf-paper)',
    color: 'var(--wf-ink)',
    fontFamily: 'var(--wf-hand)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    ...style,
  }}>{children}</div>
);

Object.assign(window, {
  Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame,
});
