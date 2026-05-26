// Desktop wireframes: 2 collection+test variants + editor
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame } = window;

// Shared: collections sidebar pane (left column on email-style layout)
const CollectionsPane = ({ width = 260, activeId = 't2' }) => {
  const filters = [
    { id: 'my', label: 'My', count: 12, active: true },
    { id: 'shared', label: 'Shared', count: 5 },
    { id: 'public', label: 'Public', count: 23 },
  ];
  const tests = [
    { id: 't1', title: 'Algebra · Polynomials', tag: 'shared', meta: '24 q · 3 attempts' },
    { id: 't2', title: 'Anatomy Midterm', tag: 'my', meta: '46 q · 11 attempts', active: true },
    { id: 't3', title: 'JavaScript fundamentals', tag: 'public', meta: '30 q · 219 attempts' },
    { id: 't4', title: 'Phys chem ch.4', tag: 'my', meta: '18 q · 6 attempts' },
    { id: 't5', title: 'CS history quiz', tag: 'shared', meta: '12 q · 1 attempt' },
    { id: 't6', title: 'English idioms set 2', tag: 'my', meta: '60 q · 2 attempts' },
  ];
  return (
    <div style={{ width, borderRight: '2px solid var(--wf-ink)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* search */}
      <div style={{ padding: 'var(--wf-pad)', borderBottom: '2px solid var(--wf-ink-mute)' }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
          <Icon kind="search" size={15} />
          <Cap>search collections…</Cap>
        </Box>
      </div>
      {/* Filter chips */}
      <div style={{ padding: '10px var(--wf-pad)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <Chip key={f.id} active={f.active} small>
            {f.label} <span style={{ opacity: 0.6 }}>{f.count}</span>
          </Chip>
        ))}
      </div>
      {/* Create / import (parallel) */}
      <div style={{ padding: '0 var(--wf-pad) 10px', display: 'flex', gap: 8 }}>
        <Btn small primary style={{ flex: 1 }}><Icon kind="plus" size={14}/> Create</Btn>
        <Btn small style={{ flex: 1 }}><Icon kind="upload" size={14}/> Import .docx</Btn>
      </div>
      <Annot side="left" top={140}>create + import,<br/>parallel ↔</Annot>

      {/* test list */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '2px dashed var(--wf-ink-mute)' }}>
        {tests.map((t) => (
          <div key={t.id} style={{
            padding: '12px var(--wf-pad)',
            borderBottom: '1.5px dashed var(--wf-ink-mute)',
            background: t.id === activeId ? 'var(--wf-accent-soft)' : 'transparent',
            borderLeft: t.id === activeId ? '4px solid var(--wf-accent)' : '4px solid transparent',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <H size={14} weight={t.id === activeId ? 700 : 500} style={{ flex: 1 }}>{t.title}</H>
              <Cap style={{ flexShrink: 0 }}>{t.tag === 'my' ? '◆' : t.tag === 'shared' ? '◇' : '○'}</Cap>
            </div>
            <Cap style={{ marginTop: 3 }}>{t.meta}</Cap>
          </div>
        ))}
      </div>
    </div>
  );
};

// === Desktop V1 — Classic 3-pane email style ===========================
const DesktopEmailA = () => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon kind="globe" /> <Cap>ru / en / uz</Cap>
          <Icon kind="bell" />
          <Box style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="user" size={16}/>
          </Box>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CollectionsPane width={280} activeId="t2" />

        {/* Middle/right: chosen collection w/ tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 'var(--wf-pad)', gap: 16, overflowY: 'auto', position: 'relative' }}>
          {/* Header */}
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
            <Btn ghost><Icon kind="edit" size={16}/></Btn>
          </div>
          <Annot side="top" offset={6} top={0} w={200}>start + settings live<br/>shoulder-to-shoulder</Annot>

          {/* Tabs */}
          <Tabs items={['Test info', 'Statistics', 'Activity']} active="Test info" />

          {/* Tab body — Test info */}
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

          <Box style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <H size={15} weight={600}>Recent attempts</H>
              <Cap>see all →</Cap>
            </div>
            {[
              ['You', '88%', '7m 12s', 'today'],
              ['You', '74%', '9m 03s', 'yesterday'],
              ['s.ivanov', '61%', '11m 40s', '3d'],
              ['m.aliyeva', '92%', '6m 21s', '5d'],
            ].map(([who, score, t, ago], i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr .8fr',
                gap: 12, padding: '8px 0',
                borderTop: i ? '1.5px dashed var(--wf-ink-mute)' : 'none',
              }}>
                <H size={13}>{who}</H>
                <Cap>{score}</Cap>
                <Cap>{t}</Cap>
                <Cap>{ago}</Cap>
              </div>
            ))}
          </Box>

          <Stickie style={{ position: 'absolute', right: 24, bottom: 24, width: 200 }}>
            tabs: <b>Test info</b> / Statistics<br/>
            (per spec). I added "Activity" as a 3rd — easy to drop.
          </Stickie>
        </div>
      </div>
    </Frame>
  );
};

// === Desktop V2 — Hero header, vertical tab rail =======================
const DesktopEmailB = () => {
  return (
    <Frame>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0,
      }}>
        <H size={20} weight={700}>TestMaster</H>
        <Box style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon kind="search" size={14}/>
          <Cap>jump to test, question, person…</Cap>
        </Box>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="bell"/><Icon kind="cog"/><Icon kind="user"/>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CollectionsPane width={260} activeId="t2" />

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Vertical tab rail */}
          <div style={{
            width: 76, borderRight: '2px dashed var(--wf-ink-mute)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '18px 0', flexShrink: 0,
          }}>
            {[
              ['doc', 'Info', true],
              ['chart', 'Stats', false],
              ['edit', 'Edit', false],
              ['clock', 'Activity', false],
              ['cog', 'Access', false],
            ].map(([k, l, a]) => (
              <div key={l} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 4px', width: 60, borderRadius: 6,
                background: a ? 'var(--wf-accent-soft)' : 'transparent',
                color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
                border: a ? '2px solid var(--wf-accent)' : '2px solid transparent',
              }}>
                <Icon kind={k} size={20}/>
                <Cap style={{ color: 'inherit' }}>{l}</Cap>
              </div>
            ))}
          </div>

          {/* Right side */}
          <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
            {/* Hero card */}
            <Box double style={{ padding: 18, marginBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <ImgSlot w={120} h={120} label="cover" style={{ flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <Cap>private collection · 46 q</Cap>
                  <H size={30} weight={700} style={{ marginTop: 4 }}>Anatomy Midterm</H>
                  <TextLines rows={2} widths={['85%', '60%']} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <Btn primary><Icon kind="play" size={16}/> Start test</Btn>
                    <Btn><Icon kind="cog" size={16}/> Settings</Btn>
                    <Btn ghost><Icon kind="edit" size={16}/> Edit</Btn>
                    <Btn ghost><Icon kind="chart" size={16}/> Stats</Btn>
                  </div>
                </div>
                {/* Score ring */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Box style={{ width: 90, height: 90, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <H size={26} weight={700}>72%</H>
                  </Box>
                  <Cap>your avg</Cap>
                </div>
              </div>
              <Annot side="right" top={4} offset={4}>vertical rail<br/>= more tabs<br/>without crowding ↓</Annot>
            </Box>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Box style={{ padding: 14 }}>
                <H size={14} weight={600} style={{ marginBottom: 8 }}>Question mix</H>
                {/* mini stacked bar */}
                <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--wf-ink)' }}>
                  <div style={{ flex: 22, background: 'var(--wf-accent)' }}/>
                  <div style={{ flex: 14, background: 'var(--wf-ink)' }}/>
                  <div style={{ flex: 6, background: 'var(--wf-ink-mute)' }}/>
                  <div style={{ flex: 4, background: 'var(--wf-paper)' }}/>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <Cap>■ multiple choice 22</Cap>
                  <Cap>■ true/false 14</Cap>
                  <Cap>■ fill-blank 6</Cap>
                  <Cap>□ formula 4</Cap>
                </div>
              </Box>
              <Box style={{ padding: 14 }}>
                <H size={14} weight={600} style={{ marginBottom: 8 }}>Recent feedback</H>
                <TextLines rows={4} />
                <Cap style={{ marginTop: 8 }}>3 change-requests waiting →</Cap>
              </Box>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// === Editor — 3 sections ===============================================
const EditorScreen = () => {
  const questions = [
    { i: 1, text: 'Which of the following is NOT a function of…', active: false },
    { i: 2, text: 'The mitochondria primarily produces ___ via', active: false },
    { i: 3, text: 'Identify the labeled structure in the diagram:', active: true, img: true },
    { i: 4, text: 'True or False: All cells contain a nucleus.', active: false },
    { i: 5, text: 'Match the organ to its primary function.', active: false },
    { i: 6, text: 'Formula: solve for x where 3x² + 2x − 1 = 0', active: false, formula: true },
    { i: 7, text: 'Fill the blank: The largest bone in the human…', active: false },
    { i: 8, text: 'List in order: stages of mitosis.', active: false },
  ];
  return (
    <Frame>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="chevL" /> <Cap>back</Cap>
          <H size={16} weight={600} style={{ marginLeft: 12 }}>Edit · Anatomy Midterm</H>
          <Chip small>unsaved · 2 changes</Chip>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small ghost>Preview</Btn>
          <Btn small ghost>Discard</Btn>
          <Btn small primary><Icon kind="check" size={14}/> Save</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* L: collections shrunk down */}
        <CollectionsPane width={220} activeId="t2" />

        {/* M: questions list */}
        <div style={{
          width: 280, borderRight: '2px solid var(--wf-ink)',
          display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative',
        }}>
          <div style={{ padding: '10px var(--wf-pad)', borderBottom: '2px dashed var(--wf-ink-mute)' }}>
            <Cap>Questions · 8</Cap>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px var(--wf-pad)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* First card = create */}
            <Box dashed accent style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--wf-accent)', cursor: 'pointer' }}>
              <Icon kind="plus" size={16} color="var(--wf-accent)"/>
              <H size={14} weight={600} style={{ color: 'var(--wf-accent)' }}>Add question</H>
            </Box>
            {questions.map((q) => (
              <Box key={q.i} style={{
                padding: 10,
                background: q.active ? 'var(--wf-accent-soft)' : 'transparent',
                borderColor: q.active ? 'var(--wf-accent)' : 'var(--wf-ink)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Cap>#{q.i} {q.formula && '· ƒx'} {q.img && '· img'}</Cap>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Icon kind="trash" size={13} color="var(--wf-ink-fade)"/>
                  </div>
                </div>
                <div style={{
                  marginTop: 4, fontSize: 13,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', lineHeight: 1.25,
                }}>{q.text}</div>
              </Box>
            ))}
          </div>
          <Annot side="top" offset={-2} top={6} w={210}>first card = create.<br/>others: clipped + delete</Annot>
        </div>

        {/* R: editor detail */}
        <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
          <Cap>Question #3 · everything editable</Cap>
          <H size={22} weight={700} style={{ marginTop: 4, borderBottom: '1.5px dashed var(--wf-ink-mute)', paddingBottom: 6 }}>
            Identify the labeled structure in the diagram:
          </H>

          <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
            <ImgSlot w={260} h={180} label="diagram.png · drop or upload"/>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Cap>Type</Cap>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip active>Multiple choice</Chip>
                <Chip>True / False</Chip>
                <Chip>Fill-blank</Chip>
                <Chip>Formula</Chip>
                <Chip>Match</Chip>
              </div>
              <Cap style={{ marginTop: 6 }}>Points · Time limit · Tags</Cap>
              <div style={{ display: 'flex', gap: 8 }}>
                <Box style={{ padding: '6px 12px' }}><H size={14}>2 pts</H></Box>
                <Box style={{ padding: '6px 12px' }}><H size={14}>60 s</H></Box>
                <Box style={{ padding: '6px 12px' }}><H size={14}>+ tag</H></Box>
              </div>
            </div>
          </div>

          <H size={16} weight={600} style={{ marginTop: 22 }}>Answers</H>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['A', 'Mitochondrion', false],
              ['B', 'Nucleus', true],
              ['C', 'Ribosome', false],
              ['D', 'Golgi apparatus', false],
            ].map(([k, v, ok]) => (
              <Box key={k} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderColor: ok ? 'var(--wf-accent)' : 'var(--wf-ink)',
                background: ok ? 'var(--wf-accent-soft)' : 'transparent',
              }}>
                <Box style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: ok ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>
                  {ok && <Icon kind="check" size={14} color="var(--wf-accent)"/>}
                </Box>
                <H size={14} weight={500} style={{ flex: 1 }}>{v}</H>
                <Cap>option {k}</Cap>
                <Icon kind="trash" size={14} color="var(--wf-ink-fade)"/>
              </Box>
            ))}
            <Btn small ghost accent><Icon kind="plus" size={14} color="var(--wf-accent)"/> Add answer</Btn>
          </div>

          <H size={16} weight={600} style={{ marginTop: 22 }}>Explanation (optional)</H>
          <Box style={{ marginTop: 8, padding: 12, minHeight: 60 }}>
            <Cap>shows after the test taker answers. supports formulas + images.</Cap>
          </Box>

          <Stickie style={{ position: 'absolute', right: 24, top: 24, width: 220 }}>
            "click any element to edit"<br/>
            — title, image, type chips, points, answers, explanation. All in place.
          </Stickie>
        </div>
      </div>
    </Frame>
  );
};

Object.assign(window, { CollectionsPane, DesktopEmailA, DesktopEmailB, EditorScreen });
