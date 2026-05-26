// Additional mobile screens — variety across nav patterns and screens.
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars, Heatmap, RichBlock } = window;

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
          padding: '4px 8px', borderRadius: 8,
          background: a ? 'var(--wf-accent-soft)' : 'transparent',
          color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
          minWidth: 46,
        }}>
          <Icon kind={k} size={20}/>
          <Cap style={{ color: 'inherit', fontWeight: a ? 700 : 400 }}>{label}</Cap>
        </div>
      );
    })}
  </div>
);

const FRAME_PHONE = { width: '100%', height: '100%' };

// === Mobile V3: Pill nav (5 buttons, floating pill) ====================
const MobileC = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ flex: 1, padding: '4px 16px 80px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <H size={22} weight={700}>Library</H>
        <div style={{ display: 'flex', gap: 8 }}>
          <Icon kind="search" size={18}/>
          <Icon kind="filter" size={18}/>
        </div>
      </div>
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

      <Cap>folders</Cap>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['Anatomy', 6], ['Math', 4], ['Languages', 2], ['CS', 3]].map(([n, c]) => (
          <Box key={n} style={{ padding: 12 }}>
            <Icon kind="doc" size={20} color="var(--wf-accent)"/>
            <H size={14} weight={600} style={{ marginTop: 6 }}>{n}</H>
            <Cap>{c} tests</Cap>
          </Box>
        ))}
      </div>

      <Cap style={{ marginTop: 6 }}>tests</Cap>
      {[
        ['Anatomy Midterm', '46 q · 88%'],
        ['JS fundamentals', '30 q · 92%'],
        ['Phys chem ch.4', '18 q · —'],
        ['English idioms', '60 q · 71%'],
      ].map(([t, m], i) => (
        <Box key={i} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Box style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--wf-ink-soft)', borderColor: 'var(--wf-ink-mute)' }}/>
          <div style={{ flex: 1 }}>
            <H size={13} weight={600}>{t}</H>
            <Cap>{m}</Cap>
          </div>
          <Icon kind="chevR" size={14}/>
        </Box>
      ))}

      <Annot side="left" top={120} offset={-110} w={100}>
        pill nav<br/>floats clean
      </Annot>
    </div>

    {/* Floating pill nav */}
    <div style={{
      position: 'absolute', bottom: 14, left: 16, right: 16,
      background: 'var(--wf-ink)', borderRadius: 999,
      padding: '10px 6px', display: 'flex', justifyContent: 'space-around',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)',
    }}>
      {[
        ['home', 'Home', false],
        ['doc', 'Tests', true],
        ['plus', '', false],
        ['chart', 'Stats', false],
        ['user', 'Me', false],
      ].map(([k, l, a], i) => {
        const isFab = k === 'plus';
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            color: a ? 'var(--wf-accent)' : 'var(--wf-paper)',
            background: isFab ? 'var(--wf-accent)' : 'transparent',
            width: isFab ? 38 : 'auto', height: isFab ? 38 : 'auto', borderRadius: 999,
            justifyContent: 'center',
            padding: isFab ? 0 : '0 4px',
          }}>
            <Icon kind={k} size={isFab ? 18 : 18} color={isFab ? 'var(--wf-paper)' : (a ? 'var(--wf-accent)' : 'var(--wf-paper)')}/>
            {l && <span style={{ fontFamily: 'var(--wf-hand)', fontSize: 10 }}>{l}</span>}
          </div>
        );
      })}
    </div>
  </Frame>
);

// === Mobile V4: Top tab bar (no bottom nav) ================================
const MobileD = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ padding: '0 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 8px' }}>
        <Icon kind="menu" size={22}/>
        <H size={18} weight={700}>TestMaster</H>
        <Icon kind="user" size={20}/>
      </div>
      <Tabs items={['Home', 'Tests', 'Stats', 'Me']} active="Tests"/>
    </div>

    <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <Box style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon kind="search" size={14}/>
        <Cap>search 40 tests…</Cap>
      </Box>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip small active>My</Chip><Chip small>Shared</Chip><Chip small>Public</Chip>
        <Chip small>Recent</Chip><Chip small>Favorites</Chip>
      </div>

      {/* Tests grouped by status */}
      <Cap>in progress · 2</Cap>
      {[1, 2].map((i) => (
        <Box key={i} style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <H size={14} weight={600}>Anatomy · part {i}</H>
            <Cap>{i * 30}%</Cap>
          </div>
          <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
            <div style={{ width: `${i * 30}%`, height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
          </div>
          <Cap style={{ marginTop: 6 }}>resume · {15 + i} q left</Cap>
        </Box>
      ))}

      <Cap style={{ marginTop: 8 }}>everything else</Cap>
      {[
        ['JS fundamentals', 'public'],
        ['CS history', 'shared'],
        ['Idioms set 2', 'my'],
      ].map(([t, tag], i) => (
        <Box key={i} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <H size={13} weight={600} style={{ flex: 1 }}>{t}</H>
          <Chip small>{tag}</Chip>
        </Box>
      ))}

      <Annot side="left" top={50} offset={-100} w={90}>top tabs<br/>= web-like</Annot>
    </div>
  </Frame>
);

// === Mobile · Stats screen ============================================
const MobileStats = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ padding: '4px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <Icon kind="chevL" size={20}/>
      <H size={17} weight={700}>My statistics</H>
      <Icon kind="filter" size={18}/>
    </div>
    <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip small active>30d</Chip><Chip small>90d</Chip><Chip small>All</Chip>
      </div>

      <Box double style={{ padding: 14 }}>
        <Cap>overall accuracy</Cap>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <H size={36} weight={700}>82%</H>
          <Cap style={{ color: 'var(--wf-accent)' }}>+4 vs prev</Cap>
        </div>
        <SparkLine values={[55, 60, 62, 58, 65, 70, 72, 75, 78, 82]} h={50}/>
      </Box>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['7', 'streak'], ['41', 'tests'], ['8:12', 'avg time'], ['1,847', 'questions']].map(([n, l]) => (
          <Box key={l} style={{ padding: 10 }}>
            <H size={20} weight={700}>{n}</H>
            <Cap>{l}</Cap>
          </Box>
        ))}
      </div>

      <Box style={{ padding: 12 }}>
        <H size={13} weight={600}>Activity</H>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
          <Heatmap weeks={9}/>
        </div>
      </Box>

      <Box style={{ padding: 12 }}>
        <H size={13} weight={600} style={{ marginBottom: 6 }}>Weak topics</H>
        {[['Krebs cycle', 52], ['Formulas', 41]].map(([t, p], i) => (
          <div key={i} style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Cap style={{ color: 'var(--wf-ink)' }}>{t}</Cap><Cap>{p}%</Cap>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--wf-ink-soft)', marginTop: 3 }}>
              <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: 'var(--wf-ink)' }}/>
            </div>
          </div>
        ))}
        <Btn small ghost accent style={{ marginTop: 8, padding: 0 }}>practice weak spots →</Btn>
      </Box>

      <Annot side="left" top={140} offset={-100} w={90}>
        same data,<br/>thumb-friendly
      </Annot>
    </div>
    <BottomNav active="Stats" items={[
      ['home', 'Home'], ['doc', 'Tests'], ['chart', 'Stats'], ['user', 'Me'],
    ]}/>
  </Frame>
);

// === Mobile · During-test ==============================================
const MobileTaking = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <Icon kind="x" size={20}/>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
        <div style={{ width: '35%', height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
      </div>
      <Cap>7/20</Cap>
      <Cap><Icon kind="clock" size={12}/> 4:18</Cap>
    </div>

    <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <Cap>2 points · multiple choice</Cap>
      <H size={20} weight={700} style={{ lineHeight: 1.3 }}>
        Identify the labeled organelle and write the equation for ATP yield.
      </H>
      <RichBlock blocks={[
        { img: 'cell-diagram.png', h: 110, w: '100%' },
        { formula: 'C₆H₁₂O₆ + 6O₂ → ?' },
      ]}/>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {[
          { k: 'A', blocks: [{ text: 'Mitochondrion' }, { formula: '36 ATP' }], sel: true },
          { k: 'B', blocks: [{ text: 'Nucleus' }, { img: 'opt-b.png', h: 32, w: '50%' }] },
          { k: 'C', blocks: [{ text: 'Ribosome' }] },
          { k: 'D', blocks: [{ formula: '2H₂ + O₂ → 2H₂O' }] },
        ].map((a) => (
          <Box key={a.k} style={{
            padding: 12, display: 'flex', gap: 12,
            borderColor: a.sel ? 'var(--wf-accent)' : 'var(--wf-ink)',
            background: a.sel ? 'var(--wf-accent-soft)' : 'transparent',
          }}>
            <Box style={{ width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: a.sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>
              <H size={12} weight={700} style={{ color: a.sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>{a.k}</H>
            </Box>
            <div style={{ flex: 1 }}>
              <RichBlock blocks={a.blocks} size={13}/>
            </div>
          </Box>
        ))}
      </div>
      <Annot side="right" top={130} offset={4} w={100}>
        answers can mix<br/>text + img +<br/>formula
      </Annot>
    </div>

    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '2px solid var(--wf-ink)', flexShrink: 0 }}>
      <Btn ghost style={{ flex: 1 }}><Icon kind="chevL" size={14}/> Prev</Btn>
      <Btn primary style={{ flex: 2 }}>Next <Icon kind="chevR" size={14}/></Btn>
    </div>
  </Frame>
);

// === Mobile · Results ==================================================
const MobileResults = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ flex: 1, padding: '8px 16px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <Icon kind="x" size={20} style={{ alignSelf: 'flex-end' }}/>
      <Cap>nice work</Cap>
      <div style={{
        width: 140, height: 140, borderRadius: 999,
        border: '5px solid var(--wf-accent)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <H size={40} weight={700}>88%</H>
        <Cap>17 / 20</Cap>
      </div>
      <H size={18} weight={700}>+14% vs last time</H>

      <Box style={{ padding: 12, width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
          {[['7:12', 'total'], ['22s', 'avg'], ['+1', 'streak']].map(([n, l], i) => (
            <div key={i}>
              <H size={18} weight={700}>{n}</H>
              <Cap>{l}</Cap>
            </div>
          ))}
        </div>
      </Box>

      <Box style={{ padding: 12, width: '100%' }}>
        <H size={13} weight={600} style={{ marginBottom: 8 }}>Question by question</H>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const wrong = [3, 7, 14].includes(i);
            return (
              <Box key={i} style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontFamily: 'var(--wf-hand)',
                background: wrong ? 'transparent' : 'var(--wf-accent-soft)',
                borderColor: wrong ? 'var(--wf-ink)' : 'var(--wf-accent)',
              }}>{wrong ? '✗' : '✓'}</Box>
            );
          })}
        </div>
      </Box>

      <div style={{ display: 'flex', gap: 8, width: '100%', padding: '8px 0 16px' }}>
        <Btn ghost style={{ flex: 1 }}>Review</Btn>
        <Btn primary style={{ flex: 1 }}>Try again</Btn>
      </div>
    </div>
  </Frame>
);

// === Mobile · Editor ===================================================
const MobileEditor = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '2px solid var(--wf-ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon kind="chevL" size={18}/>
        <H size={15} weight={600}>Edit · Anatomy</H>
      </div>
      <Btn small primary>Save</Btn>
    </div>

    <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      {/* Question scroller — horizontal */}
      <Cap>questions · 8</Cap>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, margin: '0 -16px', padding: '0 16px 6px' }}>
        <Box dashed accent style={{ minWidth: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon kind="plus" size={18} color="var(--wf-accent)"/>
        </Box>
        {Array.from({ length: 8 }).map((_, i) => (
          <Box key={i} style={{
            minWidth: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            borderColor: i === 2 ? 'var(--wf-accent)' : 'var(--wf-ink)',
            background: i === 2 ? 'var(--wf-accent-soft)' : 'transparent',
          }}>
            <Cap style={{ fontSize: 14, color: i === 2 ? 'var(--wf-accent)' : 'var(--wf-ink)', fontWeight: 600 }}>#{i + 1}</Cap>
          </Box>
        ))}
      </div>

      <Cap>question #3</Cap>
      <Box style={{ padding: 10 }}>
        <H size={15} weight={600}>Identify the labeled structure</H>
      </Box>

      <Cap>question type</Cap>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip small active>Multi</Chip><Chip small>T/F</Chip>
        <Chip small>Fill</Chip><Chip small>Formula</Chip><Chip small>Match</Chip>
      </div>

      <Cap>content (mixable)</Cap>
      <Box style={{ padding: 10 }}>
        <RichBlock blocks={[
          { text: 'Given the diagram and equation…' },
          { img: 'cell.png', h: 70, w: '100%' },
          { formula: 'C₆H₁₂O₆ + 6O₂ →' },
        ]}/>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <Btn small ghost>+ text</Btn>
          <Btn small ghost>+ image</Btn>
          <Btn small ghost>+ formula</Btn>
        </div>
      </Box>

      <Cap>answers</Cap>
      {[
        ['A', 'Mitochondrion', true],
        ['B', 'Nucleus', false],
      ].map(([k, v, ok]) => (
        <Box key={k} style={{
          padding: 10, display: 'flex', alignItems: 'center', gap: 8,
          borderColor: ok ? 'var(--wf-accent)' : 'var(--wf-ink)',
          background: ok ? 'var(--wf-accent-soft)' : 'transparent',
        }}>
          <Cap>{k}</Cap>
          <H size={13} weight={500} style={{ flex: 1 }}>{v}</H>
          <Icon kind="trash" size={14}/>
        </Box>
      ))}
      <Btn small ghost accent fullWidth><Icon kind="plus" size={14} color="var(--wf-accent)"/> Add answer</Btn>

      <Annot side="left" top={120} offset={-100} w={90}>
        horizontal Q<br/>scroller saves<br/>vertical space
      </Annot>
    </div>
  </Frame>
);

// === Mobile · Profile ==================================================
const MobileProfile = () => (
  <Frame>
    <PhoneTop/>
    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Box style={{ width: 80, height: 80, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon kind="user" size={40}/>
        </Box>
        <H size={20} weight={700}>Aliya M.</H>
        <Cap>aliya@uni.edu · joined Mar 2026</Cap>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <Chip small accent>🔥 7 day streak</Chip>
          <Chip small>level 12</Chip>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[['41', 'tests taken'], ['12', 'tests made'], ['82%', 'accuracy']].map(([n, l], i) => (
          <Box key={i} style={{ padding: 10, textAlign: 'center' }}>
            <H size={18} weight={700}>{n}</H>
            <Cap>{l}</Cap>
          </Box>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>
        <Cap>account</Cap>
        {[
          ['cog', 'Settings'],
          ['globe', 'Language · English'],
          ['bell', 'Notifications'],
          ['doc', 'My tests'],
          ['chart', 'Statistics'],
          ['user', 'Privacy'],
        ].map(([k, l]) => (
          <Box key={l} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <Icon kind={k} size={16}/>
            <H size={13} weight={500} style={{ flex: 1 }}>{l}</H>
            <Icon kind="chevR" size={14}/>
          </Box>
        ))}
      </div>

      <Annot side="left" top={20} offset={-100} w={90}>profile +<br/>account menu</Annot>
    </div>
    <BottomNav active="Me" items={[
      ['home', 'Home'], ['doc', 'Tests'], ['chart', 'Stats'], ['user', 'Me'],
    ]}/>
  </Frame>
);

// === Mobile · Drawer / nav menu ========================================
const MobileDrawer = () => (
  <Frame style={{ position: 'relative' }}>
    {/* dimmed background */}
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 0 }}/>
    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '78%', background: 'var(--wf-paper)', borderLeft: '2px solid var(--wf-ink)', zIndex: 1, display: 'flex', flexDirection: 'column', padding: '20px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <H size={20} weight={700}>Menu</H>
        <Icon kind="x" size={20}/>
      </div>

      <Box style={{ marginTop: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Box style={{ width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon kind="user" size={18}/>
        </Box>
        <div style={{ flex: 1 }}>
          <H size={14} weight={600}>Aliya M.</H>
          <Cap>aliya@uni.edu</Cap>
        </div>
        <Icon kind="chevR" size={14}/>
      </Box>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          ['home', 'Home', false],
          ['doc', 'My tests', true],
          ['chart', 'Statistics', false],
          ['bell', 'Notifications', false, '3'],
          ['edit', 'Change requests', false, '2'],
          ['cog', 'Settings', false],
          ['globe', 'Language · en', false],
        ].map(([k, l, a, badge]) => (
          <div key={l} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 6,
            background: a ? 'var(--wf-accent-soft)' : 'transparent',
            color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
          }}>
            <Icon kind={k} size={18}/>
            <H size={14} weight={a ? 700 : 500} style={{ flex: 1, color: 'inherit' }}>{l}</H>
            {badge && <Chip small accent>{badge}</Chip>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}/>
      <Btn ghost fullWidth>Sign out</Btn>
    </div>
    <Annot side="left" top={40} offset={20} w={90}>slide-in<br/>full menu</Annot>
  </Frame>
);

Object.assign(window, { MobileC, MobileD, MobileStats, MobileTaking, MobileResults, MobileEditor, MobileProfile, MobileDrawer });
