// Extra wireframes — test-taking, results, change-request, pre-test modal, empty state
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars } = window;

// === Pre-test settings modal (focused screenshot of just the modal) ===
const PreTestModal = () => (
  <Frame style={{ background: 'var(--wf-ink-soft)', padding: 28, alignItems: 'center', justifyContent: 'center' }}>
    <Box double style={{ width: '92%', maxWidth: 560, padding: 22, background: 'var(--wf-paper)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Cap>before you start</Cap>
          <H size={22} weight={700}>Anatomy Midterm · 46 questions</H>
        </div>
        <Icon kind="x" size={20}/>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Cap>Question count</Cap>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <Chip small>10</Chip><Chip small active>20</Chip><Chip small>30</Chip><Chip small>All 46</Chip>
            <Chip small>+ custom</Chip>
          </div>
        </div>
        <div>
          <Cap>Order</Cap>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Chip small active>Random</Chip><Chip small>Sequential</Chip><Chip small>Weakest first</Chip>
          </div>
        </div>
        <div>
          <Cap>Filter by tags</Cap>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <Chip small>cells</Chip><Chip small active>krebs</Chip><Chip small>skeletal</Chip>
            <Chip small>formulas</Chip><Chip small>+</Chip>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Cap>Time limit</Cap><Cap>9:00</Cap>
          </div>
          <div style={{ marginTop: 6, position: 'relative', height: 6, background: 'var(--wf-ink-soft)', borderRadius: 999 }}>
            <div style={{ width: '45%', height: '100%', background: 'var(--wf-accent)', borderRadius: 999 }}/>
            <div style={{ position: 'absolute', left: '45%', top: -5, width: 16, height: 16, borderRadius: 999, background: 'var(--wf-paper)', border: '2px solid var(--wf-accent)' }}/>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {['Show explanations after each Q', 'Allow skip', 'Show progress bar'].map((l, i) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: i === 2 ? 'var(--wf-ink-mute)' : 'var(--wf-accent)', background: i === 2 ? 'transparent' : 'var(--wf-accent-soft)' }}>
                {i !== 2 && <Icon kind="check" size={12} color="var(--wf-accent)"/>}
              </Box>
              <Cap style={{ color: 'var(--wf-ink)', fontSize: 13 }}>{l}</Cap>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <Btn ghost style={{ flex: 1 }}>Cancel</Btn>
        <Btn primary style={{ flex: 2 }}><Icon kind="play" size={16}/> Start 20 questions</Btn>
      </div>
      <Annot side="right" top={2} offset={6} w={130}>per-test config<br/>before start →</Annot>
    </Box>
  </Frame>
);

// === During-test screen ===
const TestTaking = () => (
  <Frame>
    {/* Top bar */}
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon kind="x" size={18}/>
        <Cap>Anatomy Midterm</Cap>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* progress dots */}
        <Cap>7 / 20</Cap>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
          <div style={{ width: '35%', height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
        </div>
        <Cap><Icon kind="clock" size={12}/> 4:18</Cap>
      </div>
      <Btn small ghost>Flag</Btn>
    </div>

    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, padding: '32px var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          <Cap>Question 7 of 20 · 2 pts</Cap>
          <H size={26} weight={700} style={{ marginTop: 6, lineHeight: 1.3 }}>
            Which structure is responsible for ATP production in eukaryotic cells?
          </H>
          <ImgSlot h={180} label="optional diagram" style={{ marginTop: 16 }}/>

          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['A', 'Mitochondrion', true],
              ['B', 'Nucleus', false],
              ['C', 'Ribosome', false],
              ['D', 'Golgi apparatus', false],
            ].map(([k, v, sel]) => (
              <Box key={k} style={{
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)',
                background: sel ? 'var(--wf-accent-soft)' : 'transparent',
              }}>
                <Box style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>
                  <H size={13} weight={700} style={{ color: sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>{k}</H>
                </Box>
                <H size={15} weight={500}>{v}</H>
              </Box>
            ))}
          </div>
        </div>
        <Annot side="left" top={120} offset={-160} w={150}>
          minimal chrome.<br/>focus = question.
        </Annot>
      </div>

      {/* Right rail: question pad */}
      <div style={{ width: 220, borderLeft: '2px dashed var(--wf-ink-mute)', padding: 'var(--wf-pad)' }}>
        <H size={13} weight={600} style={{ marginBottom: 10 }}>Questions</H>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const status = i < 6 ? 'done' : i === 6 ? 'current' : i === 3 ? 'flag' : '';
            return (
              <Box key={i} style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--wf-hand)', fontSize: 12,
                background: status === 'done' ? 'var(--wf-accent-soft)' : status === 'current' ? 'var(--wf-accent)' : 'transparent',
                color: status === 'current' ? 'var(--wf-paper)' : 'var(--wf-ink)',
                borderColor: status === 'flag' ? 'var(--wf-ink)' : status ? 'var(--wf-accent)' : 'var(--wf-ink-mute)',
                position: 'relative',
              }}>
                {i + 1}
                {status === 'flag' && <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 10 }}>⚑</span>}
              </Box>
            );
          })}
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Cap>● done · 6</Cap>
          <Cap>● current</Cap>
          <Cap>⚑ flagged · 1</Cap>
        </div>
      </div>
    </div>

    {/* Bottom bar */}
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px var(--wf-pad)', borderTop: '2px solid var(--wf-ink)', flexShrink: 0 }}>
      <Btn ghost><Icon kind="chevL" size={14}/> Previous</Btn>
      <Btn primary>Next <Icon kind="chevR" size={14}/></Btn>
    </div>
  </Frame>
);

// === Results screen ===
const ResultsScreen = () => (
  <Frame>
    <div style={{ padding: '14px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon kind="chevL"/>
        <H size={18} weight={700}>Results · Anatomy Midterm</H>
        <Cap>just now</Cap>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small ghost>Review answers</Btn>
        <Btn small ghost>Try again</Btn>
        <Btn small primary>Done</Btn>
      </div>
    </div>

    <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      {/* Hero score */}
      <Box double style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{
          width: 140, height: 140, borderRadius: 999,
          border: '5px solid var(--wf-accent)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <H size={42} weight={700}>88%</H>
          <Cap>17 / 20</Cap>
        </div>
        <div style={{ flex: 1 }}>
          <Cap>nice work</Cap>
          <H size={24} weight={700}>Beat your last by +14%</H>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            {[['7m 12s', 'total time'], ['22s', 'avg / q'], ['1', 'flagged'], ['+1', 'streak day']].map(([n, l], i) => (
              <div key={i}>
                <H size={20} weight={700}>{n}</H>
                <Cap>{l}</Cap>
              </div>
            ))}
          </div>
        </div>
      </Box>

      {/* Q-by-Q strip */}
      <Box style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <H size={14} weight={600}>Question by question</H>
          <Cap>tap to review →</Cap>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 1fr)', gap: 4 }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const wrong = [3, 7, 14].includes(i);
            return (
              <Box key={i} style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'var(--wf-hand)',
                background: wrong ? 'transparent' : 'var(--wf-accent-soft)',
                borderColor: wrong ? 'var(--wf-ink)' : 'var(--wf-accent)',
                color: wrong ? 'var(--wf-ink)' : 'var(--wf-accent)',
              }}>{wrong ? '✗' : '✓'}</Box>
            );
          })}
        </div>
      </Box>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 8 }}>Where you slipped</H>
          {[
            ['#4', 'Krebs cycle ATP'],
            ['#8', 'Match: organ → function'],
            ['#15', 'Solve 3x² + 2x − 1'],
          ].map(([n, t], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i ? '1.5px dashed var(--wf-ink-mute)' : 'none' }}>
              <div>
                <Cap>{n}</Cap>
                <H size={13} weight={500}>{t}</H>
              </div>
              <Cap>review →</Cap>
            </div>
          ))}
        </Box>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 8 }}>Trend</H>
          <SparkLine values={[58, 62, 68, 70, 74, 76, 88]} h={120}/>
          <Cap style={{ marginTop: 6 }}>last 7 attempts · climbing 📈</Cap>
        </Box>
      </div>

      <Stickie style={{ position: 'absolute', right: 16, bottom: 16, width: 180 }}>
        celebrate + diagnose<br/>in the same view.
      </Stickie>
    </div>
  </Frame>
);

// === Change-request review (owner) ===
const ChangeRequestScreen = () => (
  <Frame>
    <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon kind="chevL"/>
        <H size={18} weight={700}>Change requests</H>
        <Chip small accent>3 pending</Chip>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Chip small active>Pending 3</Chip>
        <Chip small>Approved 12</Chip>
        <Chip small>Rejected 4</Chip>
      </div>
    </div>

    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* L: list of CRs */}
      <div style={{ width: 280, borderRight: '2px solid var(--wf-ink)', overflowY: 'auto' }}>
        {[
          { who: 's.ivanov', q: '#3 · diagram label', when: '2h', active: true },
          { who: 'm.aliyeva', q: '#11 · add answer option', when: '5h' },
          { who: 'k.petrov', q: '#22 · fix typo in stem', when: '1d' },
        ].map((cr, i) => (
          <div key={i} style={{
            padding: '12px var(--wf-pad)',
            borderBottom: '1.5px dashed var(--wf-ink-mute)',
            background: cr.active ? 'var(--wf-accent-soft)' : 'transparent',
            borderLeft: cr.active ? '4px solid var(--wf-accent)' : '4px solid transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <H size={13} weight={cr.active ? 700 : 500}>{cr.who}</H>
              <Cap>{cr.when}</Cap>
            </div>
            <Cap style={{ marginTop: 3 }}>{cr.q}</Cap>
          </div>
        ))}
      </div>

      {/* R: diff view */}
      <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Cap>proposed by s.ivanov · 2h ago</Cap>
            <H size={20} weight={700}>Question #3 · diagram label</H>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn ghost><Icon kind="x" size={14}/> Reject</Btn>
            <Btn primary><Icon kind="check" size={14}/> Approve</Btn>
          </div>
        </div>

        <Cap style={{ marginTop: 14 }}>Reviewer note</Cap>
        <Box style={{ padding: 12, marginTop: 4, background: 'var(--wf-ink-soft)' }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--wf-hand)' }}>
            The current label "Nucleus" is wrong for this position in the diagram — it actually points to the nucleolus. Suggested fix below.
          </div>
        </Box>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <Box style={{ padding: 14 }}>
            <Cap style={{ color: 'var(--wf-ink-fade)' }}>— current</Cap>
            <H size={15} weight={600} style={{ marginTop: 6, textDecoration: 'line-through', textDecorationColor: 'var(--wf-ink-fade)' }}>
              Answer B · Nucleus
            </H>
            <TextLines rows={3} widths={['80%', '60%', '40%']} />
          </Box>
          <Box accent style={{ padding: 14, borderStyle: 'solid', borderColor: 'var(--wf-accent)', background: 'var(--wf-accent-soft)' }}>
            <Cap style={{ color: 'var(--wf-accent)' }}>+ proposed</Cap>
            <H size={15} weight={600} style={{ marginTop: 6 }}>Answer B · Nucleolus</H>
            <TextLines rows={3} widths={['80%', '60%', '50%']} />
          </Box>
        </div>

        <Cap style={{ marginTop: 16 }}>Discussion · 2</Cap>
        <Box style={{ padding: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <H size={13} weight={600}>m.aliyeva</H><Cap>1h</Cap>
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>agree — same issue noted in last term's feedback.</div>
        </Box>

        <Annot side="right" top={2} offset={6} w={130}>
          side-by-side diff<br/>+ approve / reject →
        </Annot>
      </div>
    </div>
  </Frame>
);

// === Empty state for brand-new users ===
const EmptyState = () => (
  <Frame>
    <div style={{ padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
      <H size={20} weight={700}>TestMaster</H>
      <Icon kind="user"/>
    </div>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* dimmed empty sidebar */}
      <div style={{ width: 260, borderRight: '2px solid var(--wf-ink)', padding: 'var(--wf-pad)', opacity: 0.5 }}>
        <Cap>collections</Cap>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Box dashed style={{ padding: 14 }}><Cap>nothing here yet</Cap></Box>
          <Box dashed style={{ padding: 14, height: 40 }}/>
          <Box dashed style={{ padding: 14, height: 40 }}/>
        </div>
      </div>
      <div style={{ flex: 1, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', position: 'relative' }}>
        <div style={{
          width: 130, height: 130, borderRadius: 999,
          background: 'var(--wf-accent-soft)', border: '2.5px dashed var(--wf-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon kind="doc" size={56} color="var(--wf-accent)"/>
        </div>
        <H size={28} weight={700} style={{ marginTop: 18 }}>Let's add your first test</H>
        <Cap style={{ fontSize: 14, marginTop: 6, maxWidth: 380, color: 'var(--wf-ink)' }}>
          Build from scratch — or drop a .docx file and we'll import questions, formulas and images for you.
        </Cap>
        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <Btn primary><Icon kind="plus" size={14}/> Create test</Btn>
          <Btn><Icon kind="upload" size={14}/> Import .docx</Btn>
          <Btn ghost>Browse public →</Btn>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 36, width: '100%', maxWidth: 700 }}>
          {[
            ['1', 'Add questions', 'MC, true/false, fill-blank, formulas'],
            ['2', 'Share or keep private', 'control who can see + propose edits'],
            ['3', 'Track progress', 'attempt history + accuracy over time'],
          ].map(([n, t, d]) => (
            <Box key={n} style={{ padding: 14, textAlign: 'left' }}>
              <Box style={{ width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'var(--wf-accent)' }}>
                <H size={14} weight={700} style={{ color: 'var(--wf-accent)' }}>{n}</H>
              </Box>
              <H size={14} weight={600} style={{ marginTop: 10 }}>{t}</H>
              <Cap style={{ marginTop: 4 }}>{d}</Cap>
            </Box>
          ))}
        </div>

        <Annot side="right" top={140} offset={4} w={130}>
          empty ≠ blank.<br/>show value upfront →
        </Annot>
      </div>
    </div>
  </Frame>
);

Object.assign(window, { PreTestModal, TestTaking, ResultsScreen, ChangeRequestScreen, EmptyState });
