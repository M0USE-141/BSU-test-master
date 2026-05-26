// Interactive desktop prototype — all wired up
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars, Heatmap, RichBlock, Click, useRouter } = window;

// ── Collections sidebar (clickable) ───────────────────────────────────────
function CollectionsSidebar() {
  const { state, dispatch, COLLECTIONS, TAGS } = useRouter();
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const counts = { my: 0, shared: 0, public: 0 };
  COLLECTIONS.forEach((c) => { counts[c.tag]++; });

  const list = COLLECTIONS.filter((c) => {
    if (filter !== 'all' && c.tag !== filter) return false;
    if (query && !c.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ width: 270, borderRight: '2px solid var(--wf-ink)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: 'var(--wf-pad)', borderBottom: '2px solid var(--wf-ink-mute)' }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
          <Icon kind="search" size={14}/>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="search collections…"
            style={{ border: 'none', background: 'transparent', flex: 1, outline: 'none', fontFamily: 'var(--wf-hand)', fontSize: 14, color: 'var(--wf-ink)' }}/>
        </Box>
      </div>

      <div style={{ padding: '10px var(--wf-pad)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['all',   `All ${COLLECTIONS.length}`],
          ['my',    `My ${counts.my}`],
          ['shared',`Shared ${counts.shared}`],
          ['public',`Public ${counts.public}`],
        ].map(([id, l]) => (
          <Click key={id} onClick={() => setFilter(id)}>
            <Chip active={filter === id} small>{l}</Chip>
          </Click>
        ))}
      </div>

      <div style={{ padding: '0 var(--wf-pad) 10px', display: 'flex', gap: 8 }}>
        <Btn small primary style={{ flex: 1 }} onClick={() => dispatch({ type: 'openModal', modal: 'qtype' })}>
          <Icon kind="plus" size={14}/> Create
        </Btn>
        <Btn small style={{ flex: 1 }} onClick={() => dispatch({ type: 'go', view: 'import' })}>
          <Icon kind="upload" size={14}/> Import
        </Btn>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', borderTop: '2px dashed var(--wf-ink-mute)' }}>
        {list.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Cap>no matches</Cap>
          </div>
        )}
        {list.map((c) => {
          const active = c.id === state.collection;
          return (
            <Click key={c.id} onClick={() => { dispatch({ type: 'selectColl', id: c.id }); dispatch({ type: 'set', patch: { view: 'home', railTab: 'info' } }); }}>
              <div style={{
                padding: '12px var(--wf-pad)',
                borderBottom: '1.5px dashed var(--wf-ink-mute)',
                background: active ? 'var(--wf-accent-soft)' : 'transparent',
                borderLeft: active ? '4px solid var(--wf-accent)' : '4px solid transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <H size={14} weight={active ? 700 : 500} style={{ flex: 1 }}>{c.title}</H>
                  <Cap style={{ flexShrink: 0 }}>{TAGS[c.tag].split(' ')[0]}</Cap>
                </div>
                <Cap style={{ marginTop: 3 }}>{c.count} q · {c.attempts} attempts</Cap>
              </div>
            </Click>
          );
        })}
      </div>
    </div>
  );
}

// ── Vertical icon rail (replaces tabs) ────────────────────────────────────
function VerticalRail() {
  const { state, dispatch } = useRouter();
  const tabs = [
    ['doc',   'Info',     'info'],
    ['chart', 'Stats',    'stats'],
    ['edit',  'Edit',     'edit'],
    ['clock', 'Activity', 'activity'],
    ['user',  'Access',   'access'],
  ];
  return (
    <div style={{
      width: 76, borderRight: '2px dashed var(--wf-ink-mute)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 10, padding: '14px 0', flexShrink: 0,
    }}>
      {tabs.map(([k, l, tab]) => {
        const active = tab === state.railTab;
        return (
          <Click key={tab} onClick={() => dispatch({ type: 'rail', tab })}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 4px', width: 60, borderRadius: 6,
              background: active ? 'var(--wf-accent-soft)' : 'transparent',
              color: active ? 'var(--wf-accent)' : 'var(--wf-ink)',
              border: active ? '2px solid var(--wf-accent)' : '2px solid transparent',
            }}>
              <Icon kind={k} size={20}/>
              <Cap style={{ color: 'inherit', fontSize: 11, fontWeight: active ? 700 : 400 }}>{l}</Cap>
            </div>
          </Click>
        );
      })}
    </div>
  );
}

// ── Right pane content per railTab ────────────────────────────────────────
function RailInfo() {
  const { activeColl, dispatch } = useRouter();
  if (!activeColl) return null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
        <div style={{ flex: 1 }}>
          <Cap>collection</Cap>
          <H size={28} weight={700} style={{ marginTop: 2 }}>{activeColl.title}</H>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip small accent>◆ {activeColl.tag}</Chip>
            <Chip small>{activeColl.count} questions</Chip>
            <Chip small>{activeColl.attempts} attempts</Chip>
            <Chip small>last edit · 2d</Chip>
          </div>
        </div>
        <Btn primary onClick={() => dispatch({ type: 'openModal', modal: 'pretest' })}>
          <Icon kind="play" size={16}/> Start test
        </Btn>
        <Btn onClick={() => dispatch({ type: 'openModal', modal: 'pretest' })}>
          <Icon kind="cog" size={16}/> Pre-test settings
        </Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 18 }}>
        <Box style={{ padding: 16 }}>
          <H size={15} weight={600} style={{ marginBottom: 8 }}>Description</H>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--wf-ink)' }}>
            {activeColl.desc || 'A practice test covering the main concepts from this collection. Mix of multiple-choice, true/false and formula questions. Recommended after lectures 1–6.'}
          </div>
        </Box>
        <Box style={{ padding: 16 }}>
          <H size={15} weight={600} style={{ marginBottom: 10 }}>At a glance</H>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              [activeColl.count, 'questions'],
              [activeColl.attempts, 'attempts'],
              [activeColl.score ? `${activeColl.score}%` : '—', 'your avg'],
              ['9 min', 'avg time'],
            ].map(([n, l], i) => (
              <Box key={i} style={{ padding: '10px 12px' }}>
                <H size={22} weight={700}>{n}</H>
                <Cap>{l}</Cap>
              </Box>
            ))}
          </div>
        </Box>
      </div>

      <Box style={{ padding: 16, marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <H size={15} weight={600}>Sample question · mixed content</H>
          <Cap>text + image + formula in one</Cap>
        </div>
        <RichBlock blocks={[
          { text: 'Given the diagram below, identify the labeled organelle and write the matching equation for ATP yield:' },
          { img: 'cell-diagram.png', h: 90, w: '40%' },
          { formula: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + 36 ATP' },
        ]}/>
      </Box>

      <Box style={{ padding: 16, marginTop: 18 }}>
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
    </>
  );
}

function RailStats() {
  return (
    <>
      <H size={26} weight={700}>Statistics</H>
      <Cap>your progress · this collection</Cap>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        {[['82%', 'accuracy'], ['7', 'streak 🔥'], ['11', 'attempts'], ['8:12', 'avg time']].map(([n, l], i) => (
          <Box key={i} style={{ padding: 12 }}>
            <H size={26} weight={700}>{n}</H>
            <Cap>{l}</Cap>
          </Box>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginTop: 12 }}>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 6 }}>Accuracy over time</H>
          <SparkLine values={[55, 60, 62, 58, 65, 70, 72, 75, 78, 80, 82, 82]} h={140}/>
        </Box>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 8 }}>Weak / strong topics</H>
          {[['Cell biology', 94, true], ['Skeletal', 71, null], ['Krebs cycle', 52, false], ['Formulas', 41, false]].map(([t, p, ok], i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Cap style={{ color: 'var(--wf-ink)' }}>{t}</Cap><Cap>{p}%</Cap>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)', marginTop: 3 }}>
                <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: ok === false ? 'var(--wf-ink)' : 'var(--wf-accent)' }}/>
              </div>
            </div>
          ))}
        </Box>
      </div>

      <Box style={{ padding: 14, marginTop: 12 }}>
        <H size={14} weight={600} style={{ marginBottom: 10 }}>Activity</H>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Heatmap weeks={16}/>
        </div>
      </Box>
    </>
  );
}

function RailEdit() {
  const { dispatch, QUESTIONS_T2 } = useRouter();
  const [selected, setSelected] = React.useState(0);
  const q = QUESTIONS_T2[selected];
  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 0, height: '100%' }}>
      <div style={{ width: 280, borderRight: '2px solid var(--wf-ink)', display: 'flex', flexDirection: 'column', flexShrink: 0, marginRight: -16, marginTop: -16, marginBottom: -16, paddingTop: 16, paddingBottom: 16 }}>
        <div style={{ padding: '0 12px 10px', borderBottom: '2px dashed var(--wf-ink-mute)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <H size={18} weight={700}>Questions · {QUESTIONS_T2.length}</H>
            <Btn small ghost>Save</Btn>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'openModal', modal: 'qtype' })}>
            <Box dashed accent style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--wf-accent)' }}>
              <Icon kind="plus" size={16} color="var(--wf-accent)"/>
              <H size={14} weight={600} style={{ color: 'var(--wf-accent)' }}>Add question</H>
            </Box>
          </Click>
          {QUESTIONS_T2.map((qq, i) => {
            const active = i === selected;
            const preview = qq.stem.find((b) => b.text)?.text || '—';
            return (
              <Click key={i} onClick={() => setSelected(i)}>
                <Box style={{
                  padding: 10,
                  background: active ? 'var(--wf-accent-soft)' : 'transparent',
                  borderColor: active ? 'var(--wf-accent)' : 'var(--wf-ink)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Cap>#{i + 1} · {qq.type}</Cap>
                    <Icon kind="trash" size={13} color="var(--wf-ink-fade)"/>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{preview}</div>
                </Box>
              </Click>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <Cap>Question #{selected + 1} · everything editable</Cap>
        <H size={22} weight={700} style={{ marginTop: 4, borderBottom: '1.5px dashed var(--wf-ink-mute)', paddingBottom: 6 }}>
          {q.stem.find((b) => b.text)?.text || 'Untitled question'}
        </H>
        <div style={{ marginTop: 10 }}>
          <Cap>content (mixable)</Cap>
          <Box style={{ padding: 12, marginTop: 4 }}>
            <RichBlock blocks={q.stem}/>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Btn small ghost><Icon kind="plus" size={12}/> Text</Btn>
              <Btn small ghost><Icon kind="plus" size={12}/> Image</Btn>
              <Btn small ghost><Icon kind="plus" size={12}/> Formula</Btn>
            </div>
          </Box>
        </div>
        <Cap style={{ marginTop: 14 }}>Type</Cap>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {['Multiple choice', 'True / False', 'Fill-blank', 'Formula', 'Match'].map((t) => (
            <Chip key={t} small active={(t === 'Multiple choice' && q.type === 'multi') || (t === 'True / False' && q.type === 'tf')}>{t}</Chip>
          ))}
        </div>
        <H size={16} weight={600} style={{ marginTop: 18 }}>Answers</H>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((o) => {
            const correct = o.k === q.correct;
            return (
              <Box key={o.k} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderColor: correct ? 'var(--wf-accent)' : 'var(--wf-ink)',
                background: correct ? 'var(--wf-accent-soft)' : 'transparent',
              }}>
                <Box style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: correct ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>
                  {correct && <Icon kind="check" size={14} color="var(--wf-accent)"/>}
                </Box>
                <div style={{ flex: 1 }}><RichBlock blocks={o.blocks} size={13}/></div>
                <Cap>option {o.k}</Cap>
                <Icon kind="trash" size={14} color="var(--wf-ink-fade)"/>
              </Box>
            );
          })}
          <Btn small ghost accent><Icon kind="plus" size={14} color="var(--wf-accent)"/> Add answer</Btn>
        </div>
      </div>
    </div>
  );
}

function RailActivity() {
  return (
    <>
      <H size={26} weight={700}>Activity</H>
      <Cap>events on this collection</Cap>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['s.ivanov', 'proposed an edit to Q#3', '2h ago'],
          ['you', 'completed an attempt · 88%', 'today 14:02'],
          ['m.aliyeva', 'completed an attempt · 92%', '5d ago'],
          ['you', 'added question #46', '6d ago'],
          ['k.petrov', 'commented on Q#11', '1w ago'],
          ['you', 'changed visibility to private', '2w ago'],
        ].map(([who, what, when], i) => (
          <Box key={i} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Box style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon kind="user" size={14}/>
            </Box>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}><b>{who}</b> {what}</div>
              <Cap>{when}</Cap>
            </div>
          </Box>
        ))}
      </div>
    </>
  );
}

function RailAccess() {
  const { dispatch } = useRouter();
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <H size={26} weight={700}>Access & sharing</H>
          <Cap>who can see · who can edit · change-request flow</Cap>
        </div>
        <Btn primary onClick={() => dispatch({ type: 'openModal', modal: 'share' })}><Icon kind="user" size={14}/> Invite</Btn>
      </div>

      <Cap style={{ marginTop: 18 }}>Visibility</Cap>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Chip small accent>◆ Private</Chip>
        <Chip small>◇ Shared (link)</Chip>
        <Chip small>○ Public</Chip>
      </div>

      <H size={15} weight={600} style={{ marginTop: 18 }}>People with access · 3</H>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          ['you', 'aliya@uni.edu', 'Owner', true],
          ['s.ivanov', 'sergey@uni.edu', 'Edit', false],
          ['m.aliyeva', 'maria@uni.edu', 'View + propose', false],
        ].map(([n, e, role, isOwner]) => (
          <Box key={n} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Box style={{ width: 32, height: 32, borderRadius: 999 }}/>
            <div style={{ flex: 1 }}><H size={13} weight={600}>{n}</H><Cap>{e}</Cap></div>
            <Chip small accent={isOwner}>{role}</Chip>
          </Box>
        ))}
      </div>

      <Click onClick={() => dispatch({ type: 'go', view: 'change-requests' })}>
        <Box double style={{ padding: 14, marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon kind="edit"/>
          <div style={{ flex: 1 }}>
            <H size={14} weight={600}>Change requests · 3 pending</H>
            <Cap>review proposed edits from collaborators →</Cap>
          </div>
          <Chip small accent>3</Chip>
        </Box>
      </Click>
    </>
  );
}

// ── Top app bar ───────────────────────────────────────────────────────────
function TopBar() {
  const { state, dispatch } = useRouter();
  const unread = 3;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)',
      gap: 16, flexShrink: 0,
    }}>
      <Click onClick={() => dispatch({ type: 'set', patch: { view: 'home', railTab: 'info' } })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <H size={22} weight={700}>TestMaster</H>
          <Cap>· dashboard</Cap>
        </div>
      </Click>
      <Click style={{ flex: 1, maxWidth: 380 }} onClick={() => dispatch({ type: 'openModal', modal: 'search' })}>
        <Box style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon kind="search" size={14}/>
          <Cap>jump to test, question, person… <span style={{ marginLeft: 6, opacity: 0.6 }}>⌘K</span></Cap>
        </Box>
      </Click>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Click onClick={() => dispatch({ type: 'go', view: 'notifications' })}>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Icon kind="bell" size={16}/>
            {unread > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 6, minWidth: 14, height: 14, borderRadius: 999, background: 'var(--wf-accent)', color: 'var(--wf-paper)', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--wf-hand)', padding: '0 3px' }}>{unread}</span>
            )}
          </Box>
        </Click>
        <Click onClick={() => dispatch({ type: 'go', view: 'settings' })}>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="cog" size={16}/>
          </Box>
        </Click>
        <Click onClick={() => dispatch({ type: 'go', view: 'settings' })}>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="user" size={16}/>
          </Box>
        </Click>
      </div>
    </div>
  );
}

// ── Home view (A+B combined w/o tabs) ─────────────────────────────────────
function DesktopHome() {
  const { state } = useRouter();
  const body = {
    info: <RailInfo/>,
    stats: <RailStats/>,
    edit: <RailEdit/>,
    activity: <RailActivity/>,
    access: <RailAccess/>,
  }[state.railTab];

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <CollectionsSidebar/>
      <VerticalRail/>
      <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {body}
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, DesktopHome, CollectionsSidebar, VerticalRail });
