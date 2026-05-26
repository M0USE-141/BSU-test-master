// Interactive mobile prototype
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars, Heatmap, RichBlock, Click, useRouter } = window;

const PhoneTop = () =>
<div style={{
  display: 'flex', justifyContent: 'space-between',
  fontFamily: 'var(--wf-hand)', fontSize: 12,
  padding: '8px 18px 4px', flexShrink: 0
}}>
    <span>9:41</span>
    <span>● ● ● ▮</span>
  </div>;


const MBottomNav = () => {
  const { state, dispatch } = useRouter();
  const items = [
  ['home', 'Home', 'home'],
  ['doc', 'Tests', 'tests'],
  ['chart', 'Stats', 'stats'],
  ['user', 'Me', 'me']];

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      borderTop: '2px solid var(--wf-ink)',
      background: 'var(--wf-paper)',
      padding: '8px 4px 10px', flexShrink: 0
    }}>
      {items.map(([k, l, id]) => {
        const a = state.mobileNav === id;
        return (
          <Click key={id} onClick={() => dispatch({ type: 'mobileNav', tab: id })}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '4px 10px', borderRadius: 8,
              background: a ? 'var(--wf-accent-soft)' : 'transparent',
              color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
              minWidth: 50
            }}>
              <Icon kind={k} size={20} />
              <Cap style={{ color: 'inherit', fontWeight: a ? 700 : 400 }}>{l}</Cap>
            </div>
          </Click>);

      })}
    </div>);

};

// ── Mobile Home (merged A+B style) ────────────────────────────────────────
function MobileHome() {
  const { dispatch, COLLECTIONS } = useRouter();
  const [filter, setFilter] = React.useState('My');
  return (
    <>
      <div style={{ flex: 1, padding: '4px 16px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Cap>good evening,</Cap>
            <H size={22} weight={700}>Aliya</H>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Click onClick={() => dispatch({ type: 'go', view: 'search' })}>
              <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon kind="search" size={16} />
              </Box>
            </Click>
            <Click onClick={() => dispatch({ type: 'go', view: 'notifications' })}>
              <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Icon kind="bell" size={16} />
                <span style={{ position: 'absolute', top: 4, right: 6, width: 7, height: 7, borderRadius: 999, background: 'var(--wf-accent)' }} />
              </Box>
            </Click>
            <Click onClick={() => dispatch({ type: 'toggleMenu' })}>
              <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon kind="menu" size={16} />
              </Box>
            </Click>
          </div>
        </div>

        <Box style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Box style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--wf-accent-soft)', borderColor: 'var(--wf-accent)' }}>
            <Icon kind="flame" size={18} color="var(--wf-accent)" />
          </Box>
          <div style={{ flex: 1 }}>
            <H size={14} weight={700}>7-day streak</H>
            <Cap>3 tests today · 88% avg</Cap>
          </div>
          <Icon kind="chevR" size={16} />
        </Box>

        {/* Hero "up next" */}
        <Box double style={{ padding: 14, position: 'relative' }}>
          <Cap>up next</Cap>
          <H size={20} weight={700} style={{ marginTop: 4 }}>Anatomy Midterm</H>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Chip small>6 q</Chip>
            <Chip small>~9 min</Chip>
            <Chip small accent>resume</Chip>
          </div>
          <div style={{ position: 'absolute', right: 14, top: 14, width: 56, height: 56, border: '4px solid var(--wf-ink-mute)', borderRightColor: 'var(--wf-accent)', borderTopColor: 'var(--wf-accent)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <H size={12} weight={700}>72%</H>
          </div>
          <Btn primary fullWidth style={{ marginTop: 14 }} onClick={() => {dispatch({ type: 'set', patch: { collection: 't2' } });dispatch({ type: 'openModal', modal: 'pretest' });}}>
            <Icon kind="play" size={14} /> Start
          </Btn>
        </Box>

        {/* Pill segment */}
        <Box style={{ display: 'flex', padding: 3, borderRadius: 999 }}>
          {['My', 'Shared', 'Public'].map((t) => {
            const a = filter === t;
            return (
              <Click key={t} style={{ flex: 1 }} onClick={() => setFilter(t)}>
                <div style={{
                  textAlign: 'center', padding: '6px 0',
                  borderRadius: 999, fontFamily: 'var(--wf-hand)', fontSize: 13,
                  background: a ? 'var(--wf-accent)' : 'transparent',
                  color: a ? 'var(--wf-paper)' : 'var(--wf-ink)',
                  fontWeight: a ? 700 : 400
                }}>{t}</div>
              </Click>);

          })}
        </Box>

        <H size={14} weight={600} style={{ marginTop: 4 }}>All collections</H>
        {COLLECTIONS.filter((c) => filter === 'My' && c.tag === 'my' || filter === 'Shared' && c.tag === 'shared' || filter === 'Public' && c.tag === 'public').map((c, i) =>
        <Click key={c.id} onClick={() => {dispatch({ type: 'set', patch: { collection: c.id, view: 'collection' } });}}>
            <Box style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10, transform: `rotate(${i % 2 ? -0.3 : 0.3}deg)` }}>
              <Box style={{ width: 38, height: 38, borderRadius: 6, background: 'var(--wf-ink-soft)', borderColor: 'var(--wf-ink-mute)' }} />
              <div style={{ flex: 1 }}>
                <H size={13} weight={600}>{c.title}</H>
                <Cap>{c.count} q · {c.attempts} attempts</Cap>
              </div>
              <H size={13} weight={700} style={{ color: 'var(--wf-accent)' }}>{c.score ? `${c.score}%` : '—'}</H>
            </Box>
          </Click>
        )}
      </div>
      <MBottomNav />
    </>);

}

// ── Mobile Collection Detail ──────────────────────────────────────────────
function MobileCollection() {
  const { activeColl, dispatch } = useRouter();
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ padding: '6px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Click onClick={() => dispatch({ type: 'go', view: 'home' })}><Icon kind="chevL" size={20} /></Click>
          <Click onClick={() => dispatch({ type: 'openModal', modal: 'share' })}><Icon kind="user" size={18} /></Click>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <Cap>collection</Cap>
          <H size={24} weight={700}>{activeColl.title}</H>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip small accent>◆ {activeColl.tag}</Chip>
            <Chip small>{activeColl.count} q</Chip>
            <Chip small>{activeColl.attempts} attempts</Chip>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Btn primary style={{ flex: 1 }} onClick={() => dispatch({ type: 'openModal', modal: 'pretest' })}>
              <Icon kind="play" size={14} /> Start test
            </Btn>
            <Btn ghost onClick={() => dispatch({ type: 'openModal', modal: 'pretest' })}><Icon kind="cog" size={14} /></Btn>
          </div>
        </div>

        {/* mini icon rail as horizontal scroller */}
        <div style={{ padding: '0 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {[['doc', 'Info', true], ['chart', 'Stats'], ['edit', 'Edit'], ['clock', 'Activity'], ['user', 'Access']].map(([k, l, a]) =>
          <Click key={l}>
              <Box style={{
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6,
              background: a ? 'var(--wf-accent-soft)' : 'transparent',
              borderColor: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
              color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
              whiteSpace: 'nowrap'
            }}>
                <Icon kind={k} size={14} color={a ? 'var(--wf-accent)' : 'var(--wf-ink)'} />
                <Cap style={{ color: 'inherit', fontWeight: a ? 700 : 400 }}>{l}</Cap>
              </Box>
            </Click>
          )}
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Box style={{ padding: 12 }}>
            <H size={14} weight={600} style={{ marginBottom: 6 }}>Description</H>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {activeColl.desc || 'A practice test covering the main concepts from this collection.'}
            </div>
          </Box>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[[activeColl.count, 'questions'], [activeColl.attempts, 'attempts'], [activeColl.score ? `${activeColl.score}%` : '—', 'your avg'], ['9 min', 'avg time']].map(([n, l], i) =>
            <Box key={i} style={{ padding: 10 }}>
                <H size={20} weight={700}>{n}</H>
                <Cap>{l}</Cap>
              </Box>
            )}
          </div>

          <Box style={{ padding: 12 }}>
            <H size={13} weight={600} style={{ marginBottom: 8 }}>Recent attempts</H>
            {[['You', '88%', 'today'], ['You', '74%', '1d'], ['s.ivanov', '61%', '3d']].map(([w, s, a], i) =>
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1.5px dashed var(--wf-ink-mute)' : 'none' }}>
                <H size={13} weight={500}>{w}</H>
                <Cap>{s} · {a}</Cap>
              </div>
            )}
          </Box>
        </div>
      </div>
      <MBottomNav />
    </>);

}

// ── Mobile During-Test ────────────────────────────────────────────────────
function MobileTakingI() {
  const { state, dispatch, currentQ, QUESTIONS_T2 } = useRouter();
  const total = QUESTIONS_T2.length;
  const selected = state.answers[state.qIdx];
  return (
    <>
      <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Click onClick={() => dispatch({ type: 'go', view: 'home' })}><Icon kind="x" size={20} /></Click>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
          <div style={{ width: `${(state.qIdx + 1) / total * 100}%`, height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }} />
        </div>
        <Cap>{state.qIdx + 1}/{total}</Cap>
        <Cap><Icon kind="clock" size={12} /> 4:18</Cap>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Cap>{currentQ.points} pt · {currentQ.type}</Cap>
        <H size={19} weight={700} style={{ lineHeight: 1.3 }}>
          {currentQ.stem.find((b) => b.text)?.text}
        </H>
        <RichBlock blocks={currentQ.stem.filter((b) => !b.text)} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {currentQ.options.map((o) => {
            const sel = selected === o.k;
            return (
              <Click key={o.k} onClick={() => dispatch({ type: 'answer', key: o.k })}>
                <Box style={{
                  padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start',
                  borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)',
                  background: sel ? 'var(--wf-accent-soft)' : 'transparent'
                }}>
                  <Box style={{ width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)', flexShrink: 0 }}>
                    <H size={12} weight={700} style={{ color: sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>{o.k}</H>
                  </Box>
                  <div style={{ flex: 1 }}>
                    <RichBlock blocks={o.blocks} size={13} />
                  </div>
                </Box>
              </Click>);

          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '2px solid var(--wf-ink)', flexShrink: 0 }}>
        <Btn ghost style={{ flex: 1 }} onClick={() => dispatch({ type: 'prevQ' })}><Icon kind="chevL" size={14} /> Prev</Btn>
        {state.qIdx === total - 1 ?
        <Btn primary style={{ flex: 2 }} onClick={() => dispatch({ type: 'finishTest' })}><Icon kind="check" size={14} /> Finish</Btn> :
        <Btn primary style={{ flex: 2 }} onClick={() => dispatch({ type: 'nextQ' })}>Next <Icon kind="chevR" size={14} /></Btn>
        }
      </div>
    </>);

}

// ── Mobile Results ────────────────────────────────────────────────────────
function MobileResultsI() {
  const { score, dispatch, state, QUESTIONS_T2 } = useRouter();
  return (
    <>
      <div style={{ flex: 1, padding: '8px 16px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <Click style={{ alignSelf: 'flex-end' }} onClick={() => dispatch({ type: 'go', view: 'home' })}><Icon kind="x" size={20} /></Click>
        <Cap>{score.pct >= 70 ? 'nice work' : 'keep going'}</Cap>
        <div style={{
          width: 140, height: 140, borderRadius: 999,
          border: '5px solid var(--wf-accent)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <H size={40} weight={700}>{score.pct}%</H>
          <Cap>{score.correct} / {score.total}</Cap>
        </div>
        <H size={18} weight={700}>{score.pct >= 74 ? `+${score.pct - 74}% vs last` : `${score.pct - 74}% vs last`}</H>

        <Box style={{ padding: 12, width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
            {[['7:12', 'total'], ['72s', 'avg'], ['+1', 'streak']].map(([n, l], i) =>
            <div key={i}>
                <H size={18} weight={700}>{n}</H>
                <Cap>{l}</Cap>
              </div>
            )}
          </div>
        </Box>

        <Box style={{ padding: 12, width: '100%' }}>
          <H size={13} weight={600} style={{ marginBottom: 8 }}>Question by question</H>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${QUESTIONS_T2.length}, 1fr)`, gap: 4 }}>
            {QUESTIONS_T2.map((q, i) => {
              const got = state.answers[i];
              const correct = got === q.correct;
              return (
                <Box key={i} style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontFamily: 'var(--wf-hand)',
                  background: got === undefined ? 'transparent' : correct ? 'var(--wf-accent-soft)' : 'transparent',
                  borderColor: got === undefined ? 'var(--wf-ink-mute)' : correct ? 'var(--wf-accent)' : 'var(--wf-ink)'
                }}>{got === undefined ? '·' : correct ? '✓' : '✗'}</Box>);

            })}
          </div>
        </Box>

        <div style={{ display: 'flex', gap: 8, width: '100%', padding: '8px 0 20px' }}>
          <Btn ghost style={{ flex: 1 }} onClick={() => dispatch({ type: 'go', view: 'home' })}>Done</Btn>
          <Btn primary style={{ flex: 1 }} onClick={() => dispatch({ type: 'restartTest' })}>Try again</Btn>
        </div>
      </div>
    </>);

}

// ── Mobile Stats ──────────────────────────────────────────────────────────
function MobileStatsI() {
  const { dispatch } = useRouter();
  return (
    <>
      <div style={{ padding: '4px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Click onClick={() => dispatch({ type: 'mobileNav', tab: 'home' })}><Icon kind="chevL" size={20} /></Click>
        <H size={17} weight={700}>My statistics</H>
        <Icon kind="filter" size={18} />
      </div>
      <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          <Chip small active>30d</Chip><Chip small>90d</Chip><Chip small>All</Chip>
        </div>
        <Box double style={{ padding: 14 }}>
          <Cap>overall accuracy</Cap>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <H size={36} weight={700}>82%</H>
            <Cap style={{ color: 'var(--wf-accent)' }}>+4 vs prev</Cap>
          </div>
          <SparkLine values={[55, 60, 62, 58, 65, 70, 72, 75, 78, 82]} h={50} />
        </Box>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['7', 'streak'], ['41', 'tests'], ['8:12', 'avg time'], ['1,847', 'questions']].map(([n, l]) =>
          <Box key={l} style={{ padding: 10 }}><H size={20} weight={700}>{n}</H><Cap>{l}</Cap></Box>
          )}
        </div>
        <Box style={{ padding: 12 }}>
          <H size={13} weight={600}>Activity</H>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
            <Heatmap weeks={9} />
          </div>
        </Box>
        <Box style={{ padding: 12 }}>
          <H size={13} weight={600} style={{ marginBottom: 6 }}>Weak topics</H>
          {[['Krebs cycle', 52], ['Formulas', 41]].map(([t, p], i) =>
          <div key={i} style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Cap style={{ color: 'var(--wf-ink)' }}>{t}</Cap><Cap>{p}%</Cap>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--wf-ink-soft)', marginTop: 3 }}>
                <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: 'var(--wf-ink)' }} />
              </div>
            </div>
          )}
        </Box>
      </div>
      <MBottomNav />
    </>);

}

// ── Mobile Profile ────────────────────────────────────────────────────────
function MobileProfileI() {
  const { dispatch } = useRouter();
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Box style={{ width: 80, height: 80, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="user" size={40} />
          </Box>
          <H size={20} weight={700}>Aliya M.</H>
          <Cap>aliya@uni.edu · joined Mar 2026</Cap>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Chip small accent>🔥 7 day streak</Chip>
            <Chip small>level 12</Chip>
          </div>
        </div>
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['41', 'tests taken'], ['12', 'tests made'], ['82%', 'accuracy']].map(([n, l], i) =>
          <Box key={i} style={{ padding: 10, textAlign: 'center' }}>
              <H size={18} weight={700}>{n}</H>
              <Cap>{l}</Cap>
            </Box>
          )}
        </div>
        <div style={{ padding: '0 16px' }}>
          <Cap>account</Cap>
          {[
          ['cog', 'Settings', 'settings'],
          ['globe', 'Language · English', 'settings'],
          ['bell', 'Notifications', 'notifications'],
          ['doc', 'My tests', 'home'],
          ['chart', 'Statistics', 'stats']].
          map(([k, l, target]) =>
          <Click key={l} onClick={() => target === 'stats' ? dispatch({ type: 'mobileNav', tab: 'stats' }) : dispatch({ type: 'go', view: target })}>
              <Box style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                <Icon kind={k} size={16} />
                <H size={13} weight={500} style={{ flex: 1 }}>{l}</H>
                <Icon kind="chevR" size={14} />
              </Box>
            </Click>
          )}
        </div>
      </div>
      <MBottomNav />
    </>);

}

// ── Mobile Tests list (alt home) ──────────────────────────────────────────
function MobileTestsList() {
  const { COLLECTIONS, dispatch } = useRouter();
  const [filter, setFilter] = React.useState('All');
  const list = COLLECTIONS.filter((c) => {
    if (filter === 'All') return true;
    return filter.toLowerCase() === c.tag;
  });
  return (
    <>
      <div style={{ padding: '4px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <H size={20} weight={700}>Tests</H>
        <div style={{ display: 'flex', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'go', view: 'search' })}><Icon kind="search" size={18} /></Click>
          <Click onClick={() => dispatch({ type: 'openModal', modal: 'qtype' })}><Icon kind="plus" size={20} /></Click>
        </div>
      </div>
      <div style={{ flex: 1, padding: '8px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Box style={{ display: 'flex', padding: 3, borderRadius: 999 }}>
          {['All', 'My', 'Shared', 'Public'].map((t) => {
            const a = filter === t;
            return (
              <Click key={t} style={{ flex: 1 }} onClick={() => setFilter(t)}>
                <div style={{
                  textAlign: 'center', padding: '6px 0', borderRadius: 999,
                  fontFamily: 'var(--wf-hand)', fontSize: 12,
                  background: a ? 'var(--wf-accent)' : 'transparent',
                  color: a ? 'var(--wf-paper)' : 'var(--wf-ink)',
                  fontWeight: a ? 700 : 400
                }}>{t}</div>
              </Click>);

          })}
        </Box>
        {list.map((c) =>
        <Click key={c.id} onClick={() => dispatch({ type: 'set', patch: { collection: c.id, view: 'collection' } })}>
            <Box style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Box style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--wf-ink-soft)' }} />
              <div style={{ flex: 1 }}>
                <H size={13} weight={600}>{c.title}</H>
                <Cap>{c.count} q · {c.tag} · {c.attempts} attempts</Cap>
              </div>
              <Icon kind="chevR" size={14} />
            </Box>
          </Click>
        )}
      </div>
      <MBottomNav />
    </>);

}

// ── Mobile Drawer ─────────────────────────────────────────────────────────
function MobileDrawerI() {
  const { dispatch } = useRouter();
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex' }}>
      <div onClick={() => dispatch({ type: 'toggleMenu' })} style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ width: '78%', background: 'var(--wf-paper)', borderLeft: '2px solid var(--wf-ink)', display: 'flex', flexDirection: 'column', padding: '20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <H size={20} weight={700}>Menu</H>
          <Click onClick={() => dispatch({ type: 'toggleMenu' })}><Icon kind="x" size={20} /></Click>
        </div>
        <Box style={{ marginTop: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Box style={{ width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="user" size={18} />
          </Box>
          <div style={{ flex: 1 }}>
            <H size={14} weight={600}>Aliya M.</H>
            <Cap>aliya@uni.edu</Cap>
          </div>
        </Box>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
          ['home', 'Home', () => dispatch({ type: 'mobileNav', tab: 'home' })],
          ['doc', 'My tests', () => dispatch({ type: 'mobileNav', tab: 'tests' })],
          ['chart', 'Statistics', () => dispatch({ type: 'mobileNav', tab: 'stats' })],
          ['bell', 'Notifications', () => {dispatch({ type: 'toggleMenu' });dispatch({ type: 'go', view: 'notifications' });}, '3'],
          ['edit', 'Change requests', () => {dispatch({ type: 'toggleMenu' });dispatch({ type: 'go', view: 'change-requests' });}, '2'],
          ['cog', 'Settings', () => {dispatch({ type: 'toggleMenu' });dispatch({ type: 'go', view: 'settings' });}]].
          map(([k, l, fn, badge]) =>
          <Click key={l} onClick={fn}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 6 }}>
                <Icon kind={k} size={18} />
                <H size={14} weight={500} style={{ flex: 1 }}>{l}</H>
                {badge && <Chip small accent>{badge}</Chip>}
              </div>
            </Click>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <Btn ghost fullWidth>Sign out</Btn>
      </div>
    </div>);

}

// ── Mobile Notifications ───────────────────────────────────────────────────
function MobileNotifications() {
  const { dispatch, NOTIFICATIONS } = useRouter();
  return (
    <>
      <div style={{ padding: '4px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--wf-ink)', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL" size={20} /></Click>
          <H size={18} weight={700}>Notifications</H>
        </div>
        <Btn small ghost>Mark all read</Btn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {NOTIFICATIONS.map((n, i) =>
        <Click key={i} onClick={() => dispatch({ type: 'go', view: n.go === 'change-requests' ? 'change-requests' : 'home' })}>
            <div style={{
            padding: '12px 16px', display: 'flex', gap: 10,
            borderBottom: '1.5px dashed var(--wf-ink-mute)',
            background: n.unread ? 'var(--wf-accent-soft)' : 'transparent',
            borderLeft: n.unread ? '3px solid var(--wf-accent)' : '3px solid transparent'
          }}>
              <Box style={{ width: 34, height: 34, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon kind={n.kind === 'cr' ? 'edit' : 'doc'} size={14} />
              </Box>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <b>{n.who}</b> {n.what} <span style={{ color: 'var(--wf-accent)' }}>{n.target}</span>
                </div>
                <Cap>{n.when}</Cap>
              </div>
            </div>
          </Click>
        )}
      </div>
    </>);

}

// ── Mobile Settings ───────────────────────────────────────────────────────
function MobileSettings() {
  const { dispatch } = useRouter();
  const [section, setSection] = React.useState('Profile');
  const sections = ['Profile', 'Notifications', 'Language', 'Privacy', 'Appearance'];
  return (
    <>
      <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px solid var(--wf-ink)' }}>
        <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL" size={20} /></Click>
        <H size={18} weight={700} style={{ flex: 1 }}>Settings</H>
        <Btn small primary>Save</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '2px dashed var(--wf-ink-mute)' }}>
        {sections.map((s) =>
        <Click key={s} onClick={() => setSection(s)}>
            <Chip small active={section === s}>{s}</Chip>
          </Click>
        )}
      </div>
      <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {section === 'Profile' &&
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Box style={{ width: 64, height: 64, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon kind="user" size={28} />
              </Box>
              <Btn small ghost>Change avatar</Btn>
            </div>
            <div>
              <Cap>Display name</Cap>
              <Box style={{ padding: '8px 12px', marginTop: 4 }}><H size={14}>Aliya M.</H></Box>
            </div>
            <div>
              <Cap>Email</Cap>
              <Box style={{ padding: '8px 12px', marginTop: 4 }}><H size={14}>aliya@uni.edu</H></Box>
            </div>
            <div>
              <Cap>Username</Cap>
              <Box style={{ padding: '8px 12px', marginTop: 4 }}><H size={14}>@aliya</H></Box>
            </div>
            <div>
              <Cap>Password</Cap>
              <Btn small style={{ marginTop: 4, alignSelf: 'flex-start' }}>Change password</Btn>
            </div>
          </>
        }
        {section === 'Language' &&
        <>
            <Cap>Interface language</Cap>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['English', 'Русский', 'O\'zbek'].map((l, i) =>
            <Box key={l} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderColor: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink)', background: i === 0 ? 'var(--wf-accent-soft)' : 'transparent' }}>
                  <Box style={{ width: 18, height: 18, borderRadius: 999, borderColor: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i === 0 && <Box style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--wf-accent)', border: 'none' }} />}
                  </Box>
                  <H size={14} weight={500}>{l}</H>
                </Box>
            )}
            </div>
          </>
        }
        {section === 'Notifications' &&
        <>
            {[
          ['Change requests on my tests', true],
          ['Comments on my questions', true],
          ['Weekly digest', false],
          ['Streak reminders', true],
          ['Invites', true]].
          map(([l, on]) =>
          <Box key={l} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <H size={13} weight={500} style={{ flex: 1 }}>{l}</H>
                <Box style={{ width: 38, height: 22, borderRadius: 999, background: on ? 'var(--wf-accent)' : 'var(--wf-ink-mute)', position: 'relative', border: 'none' }}>
                  <Box style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--wf-paper)', position: 'absolute', top: 3, left: on ? 20 : 3, border: 'none' }} />
                </Box>
              </Box>
          )}
          </>
        }
        {section === 'Privacy' &&
        <>
            <Cap>Default visibility for new tests</Cap>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip small accent>◆ Private</Chip>
              <Chip small>◇ Shared</Chip>
              <Chip small>○ Public</Chip>
            </div>
            <Cap style={{ marginTop: 14 }}>Allow change-requests by default</Cap>
            <Box style={{ width: 38, height: 22, borderRadius: 999, background: 'var(--wf-accent)', position: 'relative', border: 'none' }}>
              <Box style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--wf-paper)', position: 'absolute', top: 3, left: 20, border: 'none' }} />
            </Box>
          </>
        }
        {section === 'Appearance' &&
        <>
            <Cap>Theme</Cap>
            <div style={{ display: 'flex', gap: 6 }}><Chip small active>Light</Chip><Chip small>Dark</Chip><Chip small>System</Chip></div>
            <Cap style={{ marginTop: 10 }}>Text size</Cap>
            <div style={{ display: 'flex', gap: 6 }}><Chip small>S</Chip><Chip small active>M</Chip><Chip small>L</Chip><Chip small>XL</Chip></div>
          </>
        }
      </div>
    </>);

}

// ── Mobile Change-Requests ────────────────────────────────────────────────
function MobileChangeRequests() {
  const { dispatch } = useRouter();
  const reqs = [
  { who: 's.ivanov', q: '#3 · diagram label', when: '2h', old: 'Nucleus', newv: 'Nucleolus' },
  { who: 'm.aliyeva', q: '#11 · add answer', when: '5h', old: '3 options', newv: '+ Endoplasmic reticulum' },
  { who: 'k.petrov', q: '#22 · fix typo', when: '1d', old: 'mitchondria', newv: 'mitochondria' }];

  return (
    <>
      <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px solid var(--wf-ink)' }}>
        <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL" size={20} /></Click>
        <H size={18} weight={700} style={{ flex: 1 }}>Change requests</H>
        <Chip small accent>{reqs.length}</Chip>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '2px dashed var(--wf-ink-mute)' }}>
        <Chip small active>Pending {reqs.length}</Chip>
        <Chip small>Approved 12</Chip>
        <Chip small>Rejected 4</Chip>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reqs.map((cr, i) =>
        <Box key={i} style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <H size={13} weight={600}>{cr.who}</H>
                <Cap>{cr.q} · {cr.when}</Cap>
              </div>
              <Chip small accent>edit</Chip>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Box style={{ padding: 8 }}>
                <Cap>— current</Cap>
                <div style={{ fontSize: 12, textDecoration: 'line-through', color: 'var(--wf-ink-fade)', marginTop: 2 }}>{cr.old}</div>
              </Box>
              <Box style={{ padding: 8, borderColor: 'var(--wf-accent)', background: 'var(--wf-accent-soft)' }}>
                <Cap style={{ color: 'var(--wf-accent)' }}>+ proposed</Cap>
                <div style={{ fontSize: 12, marginTop: 2 }}>{cr.newv}</div>
              </Box>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Btn small ghost style={{ flex: 1 }}><Icon kind="x" size={12} /> Reject</Btn>
              <Btn small primary style={{ flex: 1 }}><Icon kind="check" size={12} /> Approve</Btn>
            </div>
          </Box>
        )}
      </div>
    </>);

}

Object.assign(window, {
  PhoneTop, MBottomNav,
  MobileHome, MobileCollection, MobileTakingI, MobileResultsI,
  MobileStatsI, MobileProfileI, MobileTestsList, MobileDrawerI, MobileNotifications,
  MobileSettings, MobileChangeRequests
});