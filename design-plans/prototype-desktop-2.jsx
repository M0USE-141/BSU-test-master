// Interactive secondary screens: taking, results, notifications, settings, modals
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars, Heatmap, RichBlock, Click, useRouter } = window;

// ── During-test (desktop) ─────────────────────────────────────────────────
function DesktopTaking() {
  const { state, dispatch, currentQ, QUESTIONS_T2 } = useRouter();
  const total = QUESTIONS_T2.length;
  const selected = state.answers[state.qIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', gap: 16, flexShrink: 0,
      }}>
        <Click onClick={() => dispatch({ type: 'go', view: 'home' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon kind="x" size={18}/>
            <Cap>Anatomy Midterm</Cap>
          </div>
        </Click>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 600 }}>
          <Cap>{state.qIdx + 1} / {total}</Cap>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
            <div style={{ width: `${((state.qIdx + 1) / total) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
          </div>
          <Cap><Icon kind="clock" size={12}/> 4:18</Cap>
        </div>
        <Btn small ghost onClick={() => dispatch({ type: 'flag' })}>
          {state.flagged[state.qIdx] ? '⚑ Flagged' : 'Flag'}
        </Btn>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, padding: '32px var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720 }}>
            <Cap>Question {state.qIdx + 1} of {total} · {currentQ.points} pts</Cap>
            <H size={26} weight={700} style={{ marginTop: 6, lineHeight: 1.3 }}>
              {currentQ.stem.find((b) => b.text)?.text}
            </H>
            <div style={{ marginTop: 14 }}>
              <RichBlock blocks={currentQ.stem.filter((b) => !b.text)}/>
            </div>

            <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: currentQ.type === 'tf' ? '1fr 1fr' : '1fr 1fr', gap: 10 }}>
              {currentQ.options.map((o) => {
                const sel = selected === o.k;
                return (
                  <Click key={o.k} onClick={() => dispatch({ type: 'answer', key: o.k })}>
                    <Box style={{
                      padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
                      borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)',
                      background: sel ? 'var(--wf-accent-soft)' : 'transparent',
                    }}>
                      <Box style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: sel ? 'var(--wf-accent)' : 'var(--wf-ink)', flexShrink: 0 }}>
                        <H size={13} weight={700} style={{ color: sel ? 'var(--wf-accent)' : 'var(--wf-ink)' }}>{o.k}</H>
                      </Box>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <RichBlock blocks={o.blocks} size={14}/>
                      </div>
                    </Box>
                  </Click>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ width: 220, borderLeft: '2px dashed var(--wf-ink-mute)', padding: 'var(--wf-pad)' }}>
          <H size={13} weight={600} style={{ marginBottom: 10 }}>Questions</H>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {Array.from({ length: total }).map((_, i) => {
              const isCurrent = i === state.qIdx;
              const isAnswered = state.answers[i] !== undefined;
              const isFlagged = state.flagged[i];
              return (
                <Click key={i} onClick={() => dispatch({ type: 'gotoQ', idx: i })}>
                  <Box style={{
                    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--wf-hand)', fontSize: 12,
                    background: isCurrent ? 'var(--wf-accent)' : isAnswered ? 'var(--wf-accent-soft)' : 'transparent',
                    color: isCurrent ? 'var(--wf-paper)' : 'var(--wf-ink)',
                    borderColor: isAnswered || isCurrent ? 'var(--wf-accent)' : 'var(--wf-ink-mute)',
                    position: 'relative',
                  }}>
                    {i + 1}
                    {isFlagged && <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 10 }}>⚑</span>}
                  </Box>
                </Click>
              );
            })}
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Cap>● done · {Object.keys(state.answers).length}</Cap>
            <Cap>● current</Cap>
            <Cap>⚑ flagged · {Object.values(state.flagged).filter(Boolean).length}</Cap>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px var(--wf-pad)', borderTop: '2px solid var(--wf-ink)', flexShrink: 0 }}>
        <Btn ghost onClick={() => dispatch({ type: 'prevQ' })}><Icon kind="chevL" size={14}/> Previous</Btn>
        {state.qIdx === total - 1
          ? <Btn primary onClick={() => dispatch({ type: 'finishTest' })}><Icon kind="check" size={14}/> Finish test</Btn>
          : <Btn primary onClick={() => dispatch({ type: 'nextQ' })}>Next <Icon kind="chevR" size={14}/></Btn>
        }
      </div>
    </div>
  );
}

// ── Results screen ───────────────────────────────────────────────────────
function DesktopResults() {
  const { state, dispatch, score, QUESTIONS_T2 } = useRouter();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '14px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'go', view: 'home' })}><Icon kind="chevL"/></Click>
          <H size={18} weight={700}>Results · Anatomy Midterm</H>
          <Cap>just now</Cap>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small ghost>Review answers</Btn>
          <Btn small ghost onClick={() => dispatch({ type: 'restartTest' })}>Try again</Btn>
          <Btn small primary onClick={() => dispatch({ type: 'go', view: 'home' })}>Done</Btn>
        </div>
      </div>

      <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Box double style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 140, height: 140, borderRadius: 999, border: '5px solid var(--wf-accent)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <H size={42} weight={700}>{score.pct}%</H>
            <Cap>{score.correct} / {score.total}</Cap>
          </div>
          <div style={{ flex: 1 }}>
            <Cap>{score.pct >= 70 ? 'nice work' : 'keep going'}</Cap>
            <H size={24} weight={700}>{score.pct >= 70 ? `Beat your last by +${score.pct - 74}%` : `Below your avg. Review weak spots.`}</H>
            <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
              {[['7m 12s', 'total time'], ['72s', 'avg / q'], [Object.values(state.flagged).filter(Boolean).length || 0, 'flagged'], ['+1', 'streak day']].map(([n, l], i) => (
                <div key={i}>
                  <H size={20} weight={700}>{n}</H>
                  <Cap>{l}</Cap>
                </div>
              ))}
            </div>
          </div>
        </Box>

        <Box style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <H size={14} weight={600}>Question by question</H>
            <Cap>tap to review →</Cap>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${QUESTIONS_T2.length}, 1fr)`, gap: 6 }}>
            {QUESTIONS_T2.map((q, i) => {
              const got = state.answers[i];
              const correct = got === q.correct;
              const skipped = got === undefined;
              return (
                <Box key={i} style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontFamily: 'var(--wf-hand)',
                  background: skipped ? 'transparent' : correct ? 'var(--wf-accent-soft)' : 'transparent',
                  borderColor: skipped ? 'var(--wf-ink-mute)' : correct ? 'var(--wf-accent)' : 'var(--wf-ink)',
                  color: skipped ? 'var(--wf-ink-fade)' : correct ? 'var(--wf-accent)' : 'var(--wf-ink)',
                }}>{skipped ? '·' : correct ? '✓' : '✗'}</Box>
              );
            })}
          </div>
        </Box>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Box style={{ padding: 14 }}>
            <H size={14} weight={600} style={{ marginBottom: 8 }}>Where you slipped</H>
            {QUESTIONS_T2.map((q, i) => ({ q, i })).filter(({ q, i }) => state.answers[i] !== q.correct).slice(0, 3).map(({ q, i }) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1.5px dashed var(--wf-ink-mute)' }}>
                <div>
                  <Cap>#{i + 1}</Cap>
                  <H size={13} weight={500}>{q.stem.find((b) => b.text)?.text.slice(0, 40)}…</H>
                </div>
                <Cap>review →</Cap>
              </div>
            ))}
          </Box>
          <Box style={{ padding: 14 }}>
            <H size={14} weight={600} style={{ marginBottom: 8 }}>Trend</H>
            <SparkLine values={[58, 62, 68, 70, 74, 76, score.pct]} h={120}/>
            <Cap style={{ marginTop: 6 }}>last 7 attempts</Cap>
          </Box>
        </div>
      </div>
    </div>
  );
}

// ── Notifications ───────────────────────────────────────────────────────────
function DesktopNotifications() {
  const { dispatch, NOTIFICATIONS } = useRouter();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL"/></Click>
          <H size={20} weight={700}>Notifications</H>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small ghost>Mark all read</Btn>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {NOTIFICATIONS.map((n, i) => (
          <Click key={i} onClick={() => dispatch({ type: 'go', view: n.go })}>
            <div style={{
              padding: '14px var(--wf-pad)', display: 'flex', gap: 12, alignItems: 'flex-start',
              borderBottom: '1.5px dashed var(--wf-ink-mute)',
              background: n.unread ? 'var(--wf-accent-soft)' : 'transparent',
              borderLeft: n.unread ? '3px solid var(--wf-accent)' : '3px solid transparent',
            }}>
              <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon kind={n.kind === 'cr' ? 'edit' : n.kind === 'result' ? 'check' : n.kind === 'invite' ? 'user' : n.kind === 'sys' ? 'flame' : 'doc'} size={16}/>
              </Box>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                  <b>{n.who}</b> {n.what} <span style={{ color: 'var(--wf-accent)' }}>{n.target}</span>
                </div>
                <Cap>{n.when} ago</Cap>
              </div>
              <Cap>open →</Cap>
            </div>
          </Click>
        ))}
      </div>
    </div>
  );
}

// ── Change-request review ────────────────────────────────────────────────
function DesktopChangeRequests() {
  const { dispatch } = useRouter();
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const reqs = [
    { who: 's.ivanov', q: '#3 · diagram label', when: '2h', old: 'Nucleus', new: 'Nucleolus', note: 'The label points to the nucleolus, not the nucleus.' },
    { who: 'm.aliyeva', q: '#11 · add answer option', when: '5h', old: '3 options', new: 'Add option D: Endoplasmic reticulum', note: 'Missing a plausible distractor.' },
    { who: 'k.petrov', q: '#22 · fix typo in stem', when: '1d', old: 'mitchondria', new: 'mitochondria', note: 'Spelling fix.' },
  ];
  const sel = reqs[selectedIdx];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL"/></Click>
          <H size={18} weight={700}>Change requests</H>
          <Chip small accent>{reqs.length} pending</Chip>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip small active>Pending {reqs.length}</Chip>
          <Chip small>Approved 12</Chip>
          <Chip small>Rejected 4</Chip>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 300, borderRight: '2px solid var(--wf-ink)', overflowY: 'auto' }}>
          {reqs.map((cr, i) => (
            <Click key={i} onClick={() => setSelectedIdx(i)}>
              <div style={{
                padding: '12px var(--wf-pad)',
                borderBottom: '1.5px dashed var(--wf-ink-mute)',
                background: i === selectedIdx ? 'var(--wf-accent-soft)' : 'transparent',
                borderLeft: i === selectedIdx ? '4px solid var(--wf-accent)' : '4px solid transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <H size={13} weight={i === selectedIdx ? 700 : 500}>{cr.who}</H>
                  <Cap>{cr.when}</Cap>
                </div>
                <Cap style={{ marginTop: 3 }}>{cr.q}</Cap>
              </div>
            </Click>
          ))}
        </div>
        <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <Cap>proposed by {sel.who} · {sel.when} ago</Cap>
              <H size={20} weight={700}>Question {sel.q}</H>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn ghost><Icon kind="x" size={14}/> Reject</Btn>
              <Btn primary><Icon kind="check" size={14}/> Approve</Btn>
            </div>
          </div>
          <Cap style={{ marginTop: 14 }}>Reviewer note</Cap>
          <Box style={{ padding: 12, marginTop: 4, background: 'var(--wf-ink-soft)' }}>
            <div style={{ fontSize: 13 }}>{sel.note}</div>
          </Box>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <Box style={{ padding: 14 }}>
              <Cap style={{ color: 'var(--wf-ink-fade)' }}>— current</Cap>
              <H size={15} weight={600} style={{ marginTop: 6, textDecoration: 'line-through', textDecorationColor: 'var(--wf-ink-fade)' }}>{sel.old}</H>
            </Box>
            <Box style={{ padding: 14, borderColor: 'var(--wf-accent)', background: 'var(--wf-accent-soft)' }}>
              <Cap style={{ color: 'var(--wf-accent)' }}>+ proposed</Cap>
              <H size={15} weight={600} style={{ marginTop: 6 }}>{sel.new}</H>
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty state, import, settings (light wrappers around existing components) ──
function DesktopEmpty() {
  const { dispatch } = useRouter();
  return (
    <div style={{ flex: 1, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflowY: 'auto' }}>
      <div style={{ width: 130, height: 130, borderRadius: 999, background: 'var(--wf-accent-soft)', border: '2.5px dashed var(--wf-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon kind="doc" size={56} color="var(--wf-accent)"/>
      </div>
      <H size={28} weight={700} style={{ marginTop: 18 }}>Let's add your first test</H>
      <Cap style={{ fontSize: 14, marginTop: 6, maxWidth: 380, color: 'var(--wf-ink)' }}>
        Build from scratch — or drop a .docx file and we'll import questions, formulas and images.
      </Cap>
      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        <Btn primary onClick={() => dispatch({ type: 'openModal', modal: 'qtype' })}><Icon kind="plus" size={14}/> Create test</Btn>
        <Btn onClick={() => dispatch({ type: 'go', view: 'import' })}><Icon kind="upload" size={14}/> Import .docx</Btn>
      </div>
    </div>
  );
}

function DesktopSettings() {
  const { dispatch } = useRouter();
  const [section, setSection] = React.useState('Account');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL"/></Click>
          <H size={18} weight={700}>Settings</H>
        </div>
        <Btn small primary>Save changes</Btn>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 220, borderRight: '2px dashed var(--wf-ink-mute)', padding: 'var(--wf-pad)' }}>
          {['Account', 'Profile', 'Notifications', 'Language', 'Privacy', 'Appearance'].map((l) => {
            const a = section === l;
            return (
              <Click key={l} onClick={() => setSection(l)}>
                <div style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: a ? 'var(--wf-accent-soft)' : 'transparent',
                  color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
                  fontFamily: 'var(--wf-hand)', fontSize: 14, fontWeight: a ? 700 : 400,
                  marginBottom: 4,
                }}>{l}</div>
              </Click>
            );
          })}
        </div>
        <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto' }}>
          <H size={20} weight={700}>{section}</H>
          <Cap>configure your {section.toLowerCase()}.</Cap>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 16, columnGap: 18 }}>
            <Cap>Display name</Cap>
            <Box style={{ padding: '8px 12px' }}><H size={14}>Aliya M.</H></Box>
            <Cap>Email</Cap>
            <Box style={{ padding: '8px 12px' }}><H size={14}>aliya@uni.edu</H></Box>
            <Cap>Language</Cap>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip small active>English</Chip><Chip small>Русский</Chip><Chip small>O'zbek</Chip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopImport() {
  const { dispatch } = useRouter();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Click onClick={() => dispatch({ type: 'back' })}><Icon kind="chevL"/></Click>
          <H size={18} weight={700}>Import from .docx</H>
        </div>
      </div>
      <div style={{ flex: 1, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box dashed accent style={{ padding: 40, maxWidth: 480, textAlign: 'center' }}>
          <Icon kind="upload" size={48} color="var(--wf-accent)"/>
          <H size={20} weight={700} style={{ marginTop: 12 }}>Drop a .docx file</H>
          <Cap style={{ marginTop: 6 }}>or click to browse · max 10MB</Cap>
          <Btn primary style={{ marginTop: 16 }} onClick={() => dispatch({ type: 'back' })}>Choose file</Btn>
        </Box>
      </div>
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────
function ModalShell({ children, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 24,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '92%' }}>
        {children}
      </div>
    </div>
  );
}

function PreTestModalI() {
  const { dispatch } = useRouter();
  const [qCount, setQCount] = React.useState(6);
  const [order, setOrder] = React.useState('Random');
  return (
    <ModalShell onClose={() => dispatch({ type: 'closeModal' })}>
      <Box double style={{ width: 560, padding: 22, background: 'var(--wf-paper)', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Cap>before you start</Cap>
            <H size={22} weight={700}>Anatomy Midterm · 6 questions</H>
          </div>
          <Click onClick={() => dispatch({ type: 'closeModal' })}><Icon kind="x" size={20}/></Click>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Cap>Question count</Cap>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {[3, 4, 5, 6].map((n) => (
                <Click key={n} onClick={() => setQCount(n)}>
                  <Chip small active={qCount === n}>{n}</Chip>
                </Click>
              ))}
            </div>
          </div>
          <div>
            <Cap>Order</Cap>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {['Random', 'Sequential', 'Weakest first'].map((o) => (
                <Click key={o} onClick={() => setOrder(o)}>
                  <Chip small active={order === o}>{o}</Chip>
                </Click>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <Btn ghost style={{ flex: 1 }} onClick={() => dispatch({ type: 'closeModal' })}>Cancel</Btn>
          <Btn primary style={{ flex: 2 }} onClick={() => dispatch({ type: 'startTest' })}>
            <Icon kind="play" size={16}/> Start {qCount} questions
          </Btn>
        </div>
      </Box>
    </ModalShell>
  );
}

function QTypeModal() {
  const { dispatch } = useRouter();
  return (
    <ModalShell onClose={() => dispatch({ type: 'closeModal' })}>
      <Box double style={{ width: 640, padding: 22, background: 'var(--wf-paper)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <Cap>add a question</Cap>
            <H size={22} weight={700}>What kind?</H>
          </div>
          <Click onClick={() => dispatch({ type: 'closeModal' })}><Icon kind="x" size={20}/></Click>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { k: 'doc',   t: 'Multiple choice', d: '2–6 options', hot: true },
            { k: 'check', t: 'True / false',    d: 'fast bool' },
            { k: 'edit',  t: 'Fill in blank',    d: 'exact match' },
            { k: 'cog',   t: 'Formula',          d: 'MathML / LaTeX', hot: true },
            { k: 'doc',   t: 'Match pairs',      d: 'left↔right' },
            { k: 'doc',   t: 'Ordering',         d: 'sort items' },
          ].map((o, i) => (
            <Click key={i} onClick={() => dispatch({ type: 'closeModal' })}>
              <Box style={{
                padding: 14, cursor: 'pointer',
                borderColor: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink)',
                background: i === 0 ? 'var(--wf-accent-soft)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Icon kind={o.k} size={16}/>
                  {o.hot && <Chip small accent>popular</Chip>}
                </div>
                <H size={14} weight={600} style={{ marginTop: 10 }}>{o.t}</H>
                <Cap style={{ marginTop: 4 }}>{o.d}</Cap>
              </Box>
            </Click>
          ))}
        </div>
      </Box>
    </ModalShell>
  );
}

function SearchModal() {
  const { dispatch } = useRouter();
  const [q, setQ] = React.useState('krebs');
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '60px 20px',
      zIndex: 50,
    }} onClick={() => dispatch({ type: 'closeModal' })}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '92%', maxWidth: 680 }}>
        <Box double style={{ background: 'var(--wf-paper)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '2px solid var(--wf-ink)' }}>
            <Icon kind="search" size={18}/>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--wf-hand)', fontSize: 18, color: 'var(--wf-ink)' }}/>
            <Cap>esc</Cap>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1.5px dashed var(--wf-ink-mute)' }}><Cap>tests · 2</Cap></div>
            {[
              { kind: 'doc', t: 'Anatomy Midterm', m: 'mentioned in 4 questions', go: () => { dispatch({ type: 'closeModal' }); dispatch({ type: 'set', patch: { collection: 't2', view: 'home' } }); } },
              { kind: 'doc', t: 'Biochem chapter 3', m: 'mentioned in 11 questions' },
            ].map((r, i) => (
              <Click key={i} onClick={r.go || (() => dispatch({ type: 'closeModal' }))}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1.5px dashed var(--wf-ink-mute)', background: i === 0 ? 'var(--wf-accent-soft)' : 'transparent' }}>
                  <Icon kind={r.kind} size={16}/>
                  <div style={{ flex: 1 }}>
                    <H size={13} weight={600}>{r.t}</H>
                    <Cap>{r.m}</Cap>
                  </div>
                  <Cap>↵ open</Cap>
                </div>
              </Click>
            ))}
            <div style={{ padding: '10px 14px', borderBottom: '1.5px dashed var(--wf-ink-mute)' }}><Cap>commands</Cap></div>
            {[
              ['Create test', () => { dispatch({ type: 'closeModal' }); dispatch({ type: 'openModal', modal: 'qtype' }); }],
              ['Import .docx', () => { dispatch({ type: 'closeModal' }); dispatch({ type: 'go', view: 'import' }); }],
              ['Open notifications', () => { dispatch({ type: 'closeModal' }); dispatch({ type: 'go', view: 'notifications' }); }],
            ].map(([c, fn], i) => (
              <Click key={i} onClick={fn}>
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1.5px dashed var(--wf-ink-mute)' }}>
                  <Icon kind="plus" size={14}/>
                  <H size={13} weight={500} style={{ flex: 1 }}>{c}</H>
                  <Cap>↵</Cap>
                </div>
              </Click>
            ))}
          </div>
        </Box>
      </div>
    </div>
  );
}

function ShareModalI() {
  const { dispatch } = useRouter();
  return (
    <ModalShell onClose={() => dispatch({ type: 'closeModal' })}>
      <Box double style={{ width: 560, padding: 22, background: 'var(--wf-paper)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <Cap>share</Cap>
            <H size={22} weight={700}>Anatomy Midterm</H>
          </div>
          <Click onClick={() => dispatch({ type: 'closeModal' })}><Icon kind="x" size={20}/></Click>
        </div>
        <Cap style={{ marginTop: 18 }}>Visibility</Cap>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Chip small accent>◆ Private</Chip>
          <Chip small active>◇ Shared</Chip>
          <Chip small>○ Public</Chip>
        </div>
        <Cap style={{ marginTop: 16 }}>Invite by email</Cap>
        <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
          <Box style={{ flex: 1, padding: '8px 12px' }}><Cap>email or username</Cap></Box>
          <Btn primary small>Invite</Btn>
        </div>
        <Cap style={{ marginTop: 16 }}>Link</Cap>
        <Box style={{ marginTop: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cap style={{ flex: 1, fontFamily: 'var(--wf-mono)', fontSize: 11 }}>testmaster.app/t/anat-midterm-a8f3</Cap>
          <Btn small ghost>Copy</Btn>
        </Box>
        <Btn primary fullWidth style={{ marginTop: 18 }} onClick={() => dispatch({ type: 'closeModal' })}>Done</Btn>
      </Box>
    </ModalShell>
  );
}

Object.assign(window, {
  DesktopTaking, DesktopResults, DesktopNotifications, DesktopChangeRequests,
  DesktopEmpty, DesktopSettings, DesktopImport,
  ModalShell, PreTestModalI, QTypeModal, SearchModal, ShareModalI,
});
