// Combined desktop screen: V1 (right-side test info) + V2 (vertical icon rail)
// Plus a small <RichBlock> renderer that mixes text / image / MathML in one cell.
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, CollectionsPane } = window;

// ── Rich content renderer ────────────────────────────────────────────────
// Each block can have text / img / formula. Renders inline-mixed.
const RichBlock = ({ blocks = [], size = 14 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {blocks.map((b, i) => {
      if (b.text) {
        return <div key={i} style={{ fontSize: size, lineHeight: 1.4 }}>{b.text}</div>;
      }
      if (b.formula) {
        return (
          <div key={i} style={{
            display: 'inline-block', alignSelf: 'flex-start',
            padding: '6px 12px', background: 'var(--wf-ink-soft)',
            border: '1.5px solid var(--wf-ink-mute)', borderRadius: 4,
            fontFamily: 'var(--wf-mono)', fontSize: size + 1,
          }}>
            ƒ <em style={{ fontStyle: 'italic' }}>{b.formula}</em>
          </div>
        );
      }
      if (b.img) {
        return <ImgSlot key={i} h={b.h || 90} w={b.w || '60%'} label={b.img}/>;
      }
      return null;
    })}
  </div>
);

// ── Combined desktop ─────────────────────────────────────────────────────
const DesktopCombined = () => {
  const tabs = [
    ['doc', 'Info', true],
    ['chart', 'Stats', false],
    ['edit', 'Edit', false],
    ['clock', 'Activity', false],
    ['user', 'Access', false],
  ];
  return (
    <Frame>
      {/* Top app bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)',
        gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <H size={22} weight={700}>TestMaster</H>
          <Cap>· dashboard</Cap>
        </div>
        <Box style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 380 }}>
          <Icon kind="search" size={14}/>
          <Cap>jump to test, question, person…</Cap>
        </Box>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="globe"/><Icon kind="bell"/>
          <Box style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="user" size={16}/>
          </Box>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CollectionsPane width={260} activeId="t2" />

        {/* Vertical icon rail */}
        <div style={{
          width: 72, borderRight: '2px dashed var(--wf-ink-mute)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, padding: '14px 0', flexShrink: 0, position: 'relative',
        }}>
          {tabs.map(([k, l, a]) => (
            <div key={l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 4px', width: 58, borderRadius: 6,
              background: a ? 'var(--wf-accent-soft)' : 'transparent',
              color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
              border: a ? '2px solid var(--wf-accent)' : '2px solid transparent',
            }}>
              <Icon kind={k} size={20}/>
              <Cap style={{ color: 'inherit', fontSize: 11 }}>{l}</Cap>
            </div>
          ))}
          <Annot side="right" top={6} offset={6} w={110}>
            vertical rail<br/>(from V2) →
          </Annot>
        </div>

        {/* Right content — V1's "Test info" body */}
        <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
            <div style={{ flex: 1 }}>
              <Cap>collection</Cap>
              <H size={28} weight={700} style={{ marginTop: 2 }}>Anatomy Midterm</H>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Chip small accent>◆ private</Chip>
                <Chip small>46 questions</Chip>
                <Chip small>11 attempts</Chip>
                <Chip small>last edit · 2d</Chip>
              </div>
            </div>
            <Btn primary><Icon kind="play" size={16}/> Start test</Btn>
            <Btn><Icon kind="cog" size={16}/> Pre-test settings</Btn>
          </div>

          {/* tabs removed — vertical rail replaces them */}

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
            <Box style={{ padding: 16 }}>
              <H size={15} weight={600} style={{ marginBottom: 8 }}>Description</H>
              <TextLines rows={5} widths={['92%', '78%', '88%', '60%', '70%']} />
            </Box>
            <Box style={{ padding: 16 }}>
              <H size={15} weight={600} style={{ marginBottom: 10 }}>At a glance</H>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['46', 'questions'], ['11', 'attempts'], ['72%', 'avg score'], ['9 min', 'avg time']].map(([n, l]) => (
                  <Box key={l} style={{ padding: '10px 12px' }}>
                    <H size={22} weight={700}>{n}</H>
                    <Cap>{l}</Cap>
                  </Box>
                ))}
              </div>
            </Box>
          </div>

          {/* Sample question preview — mixed content */}
          <Box style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <H size={15} weight={600}>Sample question · mixed content</H>
              <Cap>text + image + formula</Cap>
            </div>
            <RichBlock blocks={[
              { text: 'Given the diagram below, identify the labeled organelle and write the matching equation for ATP yield:' },
              { img: 'cell-diagram.png', h: 90, w: '40%' },
              { formula: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + 36 ATP' },
            ]}/>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { k: 'A', blocks: [{ text: 'Mitochondrion · 36 ATP' }, { formula: 'ΔG = −686 kcal' }] },
                { k: 'B', blocks: [{ text: 'Nucleus' }, { img: 'opt-b.png', h: 40, w: '60%' }] },
                { k: 'C', blocks: [{ text: 'Ribosome · protein synthesis only' }] },
                { k: 'D', blocks: [{ formula: '2H₂ + O₂ → 2H₂O' }, { text: 'unrelated' }] },
              ].map((a) => (
                <Box key={a.k} style={{ padding: 10, display: 'flex', gap: 10 }}>
                  <Cap style={{ minWidth: 14 }}>{a.k}</Cap>
                  <div style={{ flex: 1 }}>
                    <RichBlock blocks={a.blocks} size={12}/>
                  </div>
                </Box>
              ))}
            </div>
            <Annot side="right" top={6} offset={4} w={140}>
              questions + answers<br/>can mix text /<br/>image / formula
            </Annot>
          </Box>

          <Stickie style={{ position: 'absolute', right: 24, bottom: 24, width: 200 }}>
            V1 info layout + V2<br/>vertical rail. Tabs at top<br/>stay (3 horizontal) or<br/>collapse to rail-only.
          </Stickie>
        </div>
      </div>
    </Frame>
  );
};

Object.assign(window, { DesktopCombined, RichBlock });
