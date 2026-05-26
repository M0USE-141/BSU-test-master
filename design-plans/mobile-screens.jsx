// Mobile wireframes — 2 variants
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame } = window;

// Bottom nav (4-5 buttons)
const BottomNav = ({ items, active }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-around',
    borderTop: '2px solid var(--wf-ink)',
    background: 'var(--wf-paper)',
    padding: '8px 4px 10px',
    flexShrink: 0,
  }}>
    {items.map(([k, label]) => {
      const a = label === active;
      return (
        <div key={label} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          padding: '4px 10px', borderRadius: 8,
          background: a ? 'var(--wf-accent-soft)' : 'transparent',
          color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
          minWidth: 50,
        }}>
          <Icon kind={k} size={20}/>
          <Cap style={{ color: 'inherit', fontWeight: a ? 700 : 400 }}>{label}</Cap>
        </div>
      );
    })}
  </div>
);

// Status bar (sketchy)
const PhoneTop = () => (
  <div style={{
    display: 'flex', justifyContent: 'space-between',
    fontFamily: 'var(--wf-hand)', fontSize: 12,
    padding: '8px 18px 4px', flexShrink: 0,
  }}>
    <span>9:41</span>
    <span>● ● ● ▮</span>
  </div>
);

// === Mobile A (final): combined — bottom nav from A, hero + pill + tilt from B ===
const MobileA = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ flex: 1, padding: '4px 16px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <Cap>good evening,</Cap>
          <H size={22} weight={700}>Aliya</H>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="search" size={16}/>
          </Box>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Icon kind="bell" size={16}/>
            <span style={{ position: 'absolute', top: 4, right: 6, width: 7, height: 7, borderRadius: 999, background: 'var(--wf-accent)' }}/>
          </Box>
        </div>
      </div>

      {/* Streak card */}
      <Box style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Box style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--wf-accent-soft)', borderColor: 'var(--wf-accent)' }}>
          <Icon kind="flame" size={18} color="var(--wf-accent)"/>
        </Box>
        <div style={{ flex: 1 }}>
          <H size={14} weight={700}>7-day streak</H>
          <Cap>3 tests today · 88% avg</Cap>
        </div>
        <Icon kind="chevR" size={16}/>
      </Box>

      {/* Hero "Up next" card — from MobileB */}
      <Box double style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
        <Cap>up next</Cap>
        <H size={20} weight={700} style={{ marginTop: 4 }}>Anatomy Midterm</H>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Chip small>46 q</Chip>
          <Chip small>~9 min</Chip>
          <Chip small accent>resume</Chip>
        </div>
        <div style={{ position: 'absolute', right: 14, top: 14, width: 56, height: 56, border: '4px solid var(--wf-ink-mute)', borderRightColor: 'var(--wf-accent)', borderTopColor: 'var(--wf-accent)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <H size={12} weight={700}>72%</H>
        </div>
        <Btn primary fullWidth style={{ marginTop: 14 }}><Icon kind="play" size={14}/> Start</Btn>
      </Box>

      {/* Segmented pill My/Shared/Public — from MobileB */}
      <Box style={{ display: 'flex', padding: 3, borderRadius: 999 }}>
        {['My 12', 'Shared 5', 'Public 23'].map((t, i) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '6px 0',
            borderRadius: 999, fontFamily: 'var(--wf-hand)', fontSize: 13,
            background: i === 0 ? 'var(--wf-accent)' : 'transparent',
            color: i === 0 ? 'var(--wf-paper)' : 'var(--wf-ink)',
            fontWeight: i === 0 ? 700 : 400,
          }}>{t}</div>
        ))}
      </Box>

      <H size={14} weight={600}>Continue</H>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
        {[1, 2, 3].map((i) => (
          <Box key={i} style={{ width: 150, padding: 10, flexShrink: 0 }}>
            <ImgSlot h={70} label="cover"/>
            <H size={13} weight={600} style={{ marginTop: 6 }}>Anatomy Q{i}</H>
            <Cap>46 q · last 2d</Cap>
            <div style={{ marginTop: 6, height: 4, background: 'var(--wf-ink-mute)', borderRadius: 999 }}>
              <div style={{ width: `${30 + i * 18}%`, height: '100%', background: 'var(--wf-accent)', borderRadius: 999 }}/>
            </div>
          </Box>
        ))}
      </div>

      <H size={14} weight={600}>All collections</H>
      {/* Tilted card stack — from MobileB */}
      {[
        ['Anatomy Midterm', '46 q · my', '72%'],
        ['JS fundamentals', '30 q · public', '88%'],
        ['Phys chem ch.4', '18 q · my', '—'],
        ['CS history', '12 q · shared', '54%'],
      ].map(([t, m, s], i) => (
        <Box key={i} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10, transform: `rotate(${i % 2 ? -0.3 : 0.3}deg)` }}>
          <Box style={{ width: 38, height: 38, borderRadius: 6, background: 'var(--wf-ink-soft)', borderColor: 'var(--wf-ink-mute)' }}/>
          <div style={{ flex: 1 }}>
            <H size={13} weight={600}>{t}</H>
            <Cap>{m}</Cap>
          </div>
          <H size={13} weight={700} style={{ color: 'var(--wf-accent)' }}>{s}</H>
        </Box>
      ))}

      <Annot side="left" top={170} offset={-110} w={100}>
        merged: hero +<br/>pill + tilt
      </Annot>
    </div>
    <BottomNav active="Home" items={[
      ['home', 'Home'],
      ['doc', 'Tests'],
      ['chart', 'Stats'],
      ['user', 'Profile'],
    ]}/>
  </Frame>
);

// === Mobile V2: novel — FAB-centered nav, "card stack" tests ===
const MobileB = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ flex: 1, padding: '4px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Icon kind="menu" size={22}/>
        <H size={18} weight={700}>Tests</H>
        <Icon kind="search" size={20}/>
      </div>

      {/* Big hero card */}
      <Box double style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
        <Cap>up next</Cap>
        <H size={20} weight={700} style={{ marginTop: 4 }}>Anatomy Midterm</H>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Chip small>46 q</Chip>
          <Chip small>~9 min</Chip>
          <Chip small accent>resume</Chip>
        </div>
        {/* mini progress ring placeholder */}
        <div style={{ position: 'absolute', right: 14, top: 14, width: 56, height: 56, border: '4px solid var(--wf-ink-mute)', borderRightColor: 'var(--wf-accent)', borderTopColor: 'var(--wf-accent)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <H size={12} weight={700}>72%</H>
        </div>
        <Btn primary fullWidth style={{ marginTop: 14 }}><Icon kind="play" size={14}/> Start</Btn>
      </Box>

      {/* Segmented My / Shared / Public */}
      <Box style={{ display: 'flex', padding: 3, borderRadius: 999 }}>
        {['My', 'Shared', 'Public'].map((t, i) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '6px 0',
            borderRadius: 999, fontFamily: 'var(--wf-hand)', fontSize: 13,
            background: i === 0 ? 'var(--wf-accent)' : 'transparent',
            color: i === 0 ? 'var(--wf-paper)' : 'var(--wf-ink)',
            fontWeight: i === 0 ? 700 : 400,
          }}>{t}</div>
        ))}
      </Box>

      {/* Card-stack list */}
      {[
        ['JS fundamentals', 'public · 30 q'],
        ['CS history quiz', 'shared · 12 q'],
        ['English idioms', 'my · 60 q'],
      ].map(([t, m], i) => (
        <Box key={i} style={{ padding: 12, transform: `rotate(${i % 2 ? -0.3 : 0.4}deg)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <H size={14} weight={600}>{t}</H>
            <Cap>›</Cap>
          </div>
          <Cap style={{ marginTop: 2 }}>{m}</Cap>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <Chip small>last 88%</Chip>
            <Chip small>3 attempts</Chip>
          </div>
        </Box>
      ))}

      <Annot side="left" top={120} offset={-100} w={100}>
        novel: card<br/>stack, slight<br/>tilt
      </Annot>
    </div>

    {/* Bottom nav with center FAB */}
    <div style={{
      position: 'relative',
      borderTop: '2px solid var(--wf-ink)',
      display: 'flex', justifyContent: 'space-around',
      padding: '10px 4px 12px',
      flexShrink: 0,
    }}>
      {[
        ['home', 'Home'],
        ['chart', 'Stats'],
      ].map(([k, l]) => (
        <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Icon kind={k} size={20}/>
          <Cap>{l}</Cap>
        </div>
      ))}
      {/* spacer for FAB */}
      <div style={{ width: 60 }}/>
      {[
        ['doc', 'Tests'],
        ['user', 'Me'],
      ].map(([k, l]) => (
        <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Icon kind={k} size={20}/>
          <Cap>{l}</Cap>
        </div>
      ))}
      {/* FAB */}
      <div style={{
        position: 'absolute',
        left: '50%', top: -22, transform: 'translateX(-50%)',
        width: 56, height: 56, borderRadius: 999,
        background: 'var(--wf-accent)', color: 'var(--wf-paper)',
        border: '2.5px solid var(--wf-ink)',
        boxShadow: '2px 3px 0 var(--wf-ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon kind="plus" size={26} color="var(--wf-paper)"/>
      </div>
    </div>
  </Frame>
);

Object.assign(window, { MobileA, MobileB });
