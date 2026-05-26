// More desktop extras: share modal, notifications, import .docx, search, question-type picker, account/settings.
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine } = window;

// === Share & permissions modal ========================================
const ShareModal = () => (
  <Frame style={{ background: 'var(--wf-ink-soft)', padding: 28, alignItems: 'center', justifyContent: 'center' }}>
    <Box double style={{ width: '92%', maxWidth: 560, padding: 22, background: 'var(--wf-paper)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Cap>share</Cap>
          <H size={22} weight={700}>Anatomy Midterm</H>
        </div>
        <Icon kind="x" size={20}/>
      </div>

      <Cap style={{ marginTop: 18 }}>Visibility</Cap>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Chip small accent>◆ Private</Chip>
        <Chip small active>◇ Shared (link)</Chip>
        <Chip small>○ Public</Chip>
      </div>

      <Cap style={{ marginTop: 16 }}>Invite people</Cap>
      <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
        <Box style={{ flex: 1, padding: '8px 12px' }}><Cap>email or username</Cap></Box>
        <Btn primary small>Invite</Btn>
      </div>

      <Cap style={{ marginTop: 16 }}>People with access · 3</Cap>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          ['you', 'aliya@uni.edu', 'Owner'],
          ['s.ivanov', 'sergey@uni.edu', 'Edit'],
          ['m.aliyeva', 'maria@uni.edu', 'View + propose'],
        ].map(([n, e, role], i) => (
          <Box key={i} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Box style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--wf-ink-soft)' }}/>
            <div style={{ flex: 1 }}>
              <H size={13} weight={600}>{n}</H>
              <Cap>{e}</Cap>
            </div>
            <Chip small accent={i === 0}>{role}</Chip>
          </Box>
        ))}
      </div>

      <Cap style={{ marginTop: 16 }}>Link · anyone with link</Cap>
      <Box style={{ marginTop: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Cap style={{ flex: 1, fontFamily: 'var(--wf-mono)', fontSize: 11 }}>testmaster.app/t/anat-midterm-a8f3</Cap>
        <Btn small ghost>Copy</Btn>
      </Box>

      <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box style={{ width: 18, height: 18, borderColor: 'var(--wf-accent)', background: 'var(--wf-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon kind="check" size={12} color="var(--wf-accent)"/>
          </Box>
          <Cap style={{ color: 'var(--wf-ink)' }}>Allow edit proposals (change requests)</Cap>
        </div>
      </div>

      <Annot side="right" top={2} offset={6} w={130}>3 visibility levels +<br/>change requests →</Annot>
    </Box>
  </Frame>
);

// === Notifications panel =============================================
const NotificationsPanel = () => (
  <Frame>
    <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <H size={20} weight={700}>Notifications</H>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small ghost>Mark all read</Btn>
        <Icon kind="cog" size={18}/>
      </div>
    </div>
    <div style={{ padding: '0 var(--wf-pad)', display: 'flex', gap: 6, borderBottom: '2px dashed var(--wf-ink-mute)', flexShrink: 0 }}>
      {['All', 'Mentions', 'Change requests', 'Results'].map((t, i) => (
        <div key={t} style={{
          padding: '10px 4px',
          borderBottom: i === 0 ? '3px solid var(--wf-accent)' : '3px solid transparent',
          color: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink)',
          marginBottom: -2, fontWeight: i === 0 ? 700 : 400,
          fontFamily: 'var(--wf-hand)', fontSize: 14,
        }}>{t}</div>
      ))}
    </div>
    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
      {[
        { who: 's.ivanov', what: 'proposed an edit to', target: 'Anatomy · Q#3', when: '2h', unread: true, kind: 'cr' },
        { who: 'm.aliyeva', what: 'completed', target: 'JS fundamentals · 92%', when: '4h', unread: true, kind: 'result' },
        { who: 'k.petrov', what: 'invited you to', target: 'Phys chem ch.5', when: '7h', unread: true, kind: 'invite' },
        { who: 'system', what: 'your streak hit', target: '7 days 🔥', when: '1d', unread: false, kind: 'sys' },
        { who: 'o.bondar', what: 'commented on', target: 'Q#11 — fix typo?', when: '2d', unread: false, kind: 'comment' },
        { who: 'system', what: 'weekly digest ready', target: '41 attempts · +4% accuracy', when: '3d', unread: false, kind: 'digest' },
      ].map((n, i) => (
        <div key={i} style={{
          padding: '14px var(--wf-pad)', display: 'flex', gap: 12, alignItems: 'flex-start',
          borderBottom: '1.5px dashed var(--wf-ink-mute)',
          background: n.unread ? 'var(--wf-accent-soft)' : 'transparent',
          borderLeft: n.unread ? '3px solid var(--wf-accent)' : '3px solid transparent',
        }}>
          <Box style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon kind={n.kind === 'cr' ? 'edit' : n.kind === 'result' ? 'check' : n.kind === 'invite' ? 'user' : n.kind === 'sys' ? 'flame' : n.kind === 'comment' ? 'doc' : 'chart'} size={16}/>
          </Box>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>
              <b>{n.who}</b> {n.what} <span style={{ color: 'var(--wf-accent)' }}>{n.target}</span>
            </div>
            <Cap>{n.when} ago</Cap>
          </div>
          {n.kind === 'cr' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small ghost>Reject</Btn>
              <Btn small primary>Review</Btn>
            </div>
          )}
        </div>
      ))}
      <Annot side="left" top={50} offset={-110} w={100}>
        inline actions<br/>on each row →
      </Annot>
    </div>
  </Frame>
);

// === Import .docx flow ================================================
const ImportFlow = () => (
  <Frame>
    <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon kind="chevL"/>
        <H size={18} weight={700}>Import from .docx</H>
      </div>
      <Cap>step 2 of 3 · review & map</Cap>
    </div>

    <div style={{ padding: '14px var(--wf-pad) 0', display: 'flex', gap: 8, flexShrink: 0 }}>
      {['Upload', 'Review & map', 'Confirm'].map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Box style={{
            width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i < 2 ? 'var(--wf-accent)' : 'transparent',
            borderColor: i < 2 ? 'var(--wf-accent)' : 'var(--wf-ink)',
          }}>
            <H size={11} weight={700} style={{ color: i < 2 ? 'var(--wf-paper)' : 'var(--wf-ink)' }}>{i + 1}</H>
          </Box>
          <Cap style={{ color: i === 1 ? 'var(--wf-accent)' : 'var(--wf-ink)', fontWeight: i === 1 ? 700 : 400 }}>{s}</Cap>
          {i < 2 && <Cap>›</Cap>}
        </div>
      ))}
    </div>

    <div style={{ flex: 1, display: 'flex', minHeight: 0, marginTop: 12 }}>
      {/* Left: raw docx preview */}
      <div style={{ flex: 1, padding: 'var(--wf-pad)', borderRight: '2px dashed var(--wf-ink-mute)' }}>
        <Cap>preview · anatomy-midterm.docx</Cap>
        <Box style={{ marginTop: 8, padding: 16, height: '85%', overflow: 'auto', background: '#fff', fontFamily: 'var(--wf-mono)', fontSize: 11, lineHeight: 1.6 }}>
          <div><b>1.</b> Which structure produces ATP?</div>
          <div style={{ marginLeft: 16 }}>A) Mitochondrion *</div>
          <div style={{ marginLeft: 16 }}>B) Nucleus</div>
          <div style={{ marginLeft: 16 }}>C) Ribosome</div>
          <div style={{ marginTop: 10 }}><b>2.</b> True/False: All cells have a nucleus.</div>
          <div style={{ marginLeft: 16 }}>Answer: False</div>
          <div style={{ marginTop: 10 }}><b>3.</b> Solve for x: 3x² + 2x − 1 = 0</div>
          <div style={{ marginLeft: 16 }}>Answer: x = 1/3, −1</div>
          <div style={{ marginTop: 10 }}><b>4.</b> [image: cell-diagram.png] Identify the labeled structure</div>
        </Box>
      </div>

      {/* Right: parsed result */}
      <div style={{ width: 480, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Cap>parsed · 24 questions found</Cap>
          <Chip small accent>3 need attention</Chip>
        </div>

        {[
          { ok: true, n: 1, t: 'Which structure produces ATP?', type: 'Multi · 3 options · A correct' },
          { ok: true, n: 2, t: 'All cells have a nucleus.', type: 'True/False · False' },
          { ok: false, n: 3, t: 'Solve for x: 3x² + 2x − 1 = 0', type: 'Formula? · pick type ↓' },
          { ok: false, n: 4, t: 'Identify the labeled structure', type: 'Image missing · upload ↓' },
        ].map((q) => (
          <Box key={q.n} style={{
            padding: 12, marginTop: 8,
            borderColor: q.ok ? 'var(--wf-ink)' : 'var(--wf-accent)',
            background: q.ok ? 'transparent' : 'var(--wf-accent-soft)',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {q.ok
                ? <Icon kind="check" size={16} color="var(--wf-accent)"/>
                : <Icon kind="x" size={16} color="var(--wf-accent)"/>}
              <H size={13} weight={600} style={{ flex: 1 }}>#{q.n} · {q.t}</H>
              <Icon kind="edit" size={14}/>
            </div>
            <Cap style={{ marginTop: 4 }}>{q.type}</Cap>
          </Box>
        ))}
        <Cap style={{ marginTop: 8 }}>… 20 more without issues</Cap>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, position: 'sticky', bottom: 0, background: 'var(--wf-paper)', padding: '10px 0' }}>
          <Btn ghost style={{ flex: 1 }}>Back</Btn>
          <Btn primary style={{ flex: 2 }}>Continue · 24 q →</Btn>
        </div>

        <Annot side="left" top={6} offset={-100} w={90}>
          flag issues<br/>before commit
        </Annot>
      </div>
    </div>
  </Frame>
);

// === Question-type picker (overlay sheet) ============================
const QuestionTypePicker = () => (
  <Frame style={{ background: 'var(--wf-ink-soft)', padding: 28, alignItems: 'center', justifyContent: 'center' }}>
    <Box double style={{ width: '92%', maxWidth: 640, padding: 22, background: 'var(--wf-paper)', position: 'relative' }}>
      <Cap>add a question</Cap>
      <H size={22} weight={700}>What kind?</H>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { k: 'doc', t: 'Multiple choice', d: '2–6 options, single or multi correct', hot: true },
          { k: 'check', t: 'True / false', d: 'fast, single bool answer' },
          { k: 'edit', t: 'Fill in blank', d: 'text, exact or any-of match' },
          { k: 'cog', t: 'Formula', d: 'MathML / LaTeX answer', hot: true },
          { k: 'doc', t: 'Match pairs', d: 'left↔right items' },
          { k: 'doc', t: 'Ordering', d: 'put items in correct order' },
        ].map((o, i) => (
          <Box key={i} style={{
            padding: 14, cursor: 'pointer',
            borderColor: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink)',
            background: i === 0 ? 'var(--wf-accent-soft)' : 'transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon kind={o.k} size={16}/>
              </Box>
              {o.hot && <Chip small accent>popular</Chip>}
            </div>
            <H size={14} weight={600} style={{ marginTop: 10 }}>{o.t}</H>
            <Cap style={{ marginTop: 4 }}>{o.d}</Cap>
          </Box>
        ))}
      </div>

      <Box style={{ marginTop: 14, padding: 12, borderColor: 'var(--wf-ink-mute)', borderStyle: 'dashed' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="upload" size={18}/>
          <div style={{ flex: 1 }}>
            <H size={13} weight={600}>Or import from .docx</H>
            <Cap>questions, answers, images, formulas — all in one go</Cap>
          </div>
          <Btn small>Import</Btn>
        </div>
      </Box>
    </Box>
  </Frame>
);

// === Search results / command palette ================================
const SearchResults = () => (
  <Frame style={{ background: 'rgba(0,0,0,0.30)', padding: '40px var(--wf-pad)', alignItems: 'center' }}>
    <Box double style={{ width: '92%', maxWidth: 720, background: 'var(--wf-paper)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '2px solid var(--wf-ink)' }}>
        <Icon kind="search" size={18}/>
        <H size={18} weight={500} style={{ flex: 1 }}>krebs cycle</H>
        <Cap>⌘K</Cap>
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1.5px dashed var(--wf-ink-mute)' }}>
          <Cap>tests · 2</Cap>
        </div>
        {[
          { kind: 'doc', t: 'Anatomy Midterm', m: 'mentioned in 4 questions' },
          { kind: 'doc', t: 'Biochem chapter 3', m: 'mentioned in 11 questions' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1.5px dashed var(--wf-ink-mute)', background: i === 0 ? 'var(--wf-accent-soft)' : 'transparent' }}>
            <Icon kind={r.kind} size={16}/>
            <div style={{ flex: 1 }}>
              <H size={13} weight={600}>{r.t}</H>
              <Cap>{r.m}</Cap>
            </div>
            <Cap>↵ open</Cap>
          </div>
        ))}
        <div style={{ padding: '10px 14px', borderBottom: '1.5px dashed var(--wf-ink-mute)' }}>
          <Cap>questions · 5</Cap>
        </div>
        {[
          { t: 'Which step of the Krebs cycle produces ATP?', tag: 'Anatomy #4' },
          { t: 'How many CO₂ molecules per Krebs cycle?', tag: 'Biochem #11' },
          { t: 'Acetyl-CoA enters the Krebs cycle as…', tag: 'Biochem #17' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1.5px dashed var(--wf-ink-mute)' }}>
            <Cap style={{ width: 16 }}>?</Cap>
            <div style={{ flex: 1 }}>
              <H size={13} weight={500}>{r.t}</H>
              <Cap>{r.tag}</Cap>
            </div>
          </div>
        ))}
        <div style={{ padding: '10px 14px', borderBottom: '1.5px dashed var(--wf-ink-mute)' }}>
          <Cap>commands</Cap>
        </div>
        {['Create new test', 'Import .docx', 'Open statistics'].map((c, i) => (
          <div key={i} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < 2 ? '1.5px dashed var(--wf-ink-mute)' : 'none' }}>
            <Icon kind="plus" size={14}/>
            <H size={13} weight={500} style={{ flex: 1 }}>{c}</H>
            <Cap>⌘N</Cap>
          </div>
        ))}
      </div>
      <Annot side="right" top={2} offset={6} w={130}>command palette<br/>+ test/question search →</Annot>
    </Box>
  </Frame>
);

// === Settings ==========================================================
const SettingsScreen = () => (
  <Frame>
    <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon kind="chevL"/>
        <H size={18} weight={700}>Settings</H>
      </div>
      <Btn small primary>Save changes</Btn>
    </div>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ width: 220, borderRight: '2px dashed var(--wf-ink-mute)', padding: 'var(--wf-pad)' }}>
        {[
          ['Account', true],
          ['Profile', false],
          ['Notifications', false],
          ['Language', false],
          ['Privacy', false],
          ['Appearance', false],
          ['Connected apps', false],
        ].map(([l, a]) => (
          <div key={l} style={{
            padding: '8px 10px', borderRadius: 6,
            background: a ? 'var(--wf-accent-soft)' : 'transparent',
            color: a ? 'var(--wf-accent)' : 'var(--wf-ink)',
            fontFamily: 'var(--wf-hand)', fontSize: 14, fontWeight: a ? 700 : 400,
            marginBottom: 4,
          }}>{l}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto' }}>
        <H size={20} weight={700}>Account</H>
        <Cap>basic account info — visible to people you invite to tests.</Cap>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 16, columnGap: 18 }}>
          <Cap>Avatar</Cap>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Box style={{ width: 60, height: 60, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon kind="user" size={28}/>
            </Box>
            <Btn small ghost>Upload</Btn>
            <Btn small ghost>Remove</Btn>
          </div>
          <Cap>Display name</Cap>
          <Box style={{ padding: '8px 12px' }}><H size={14}>Aliya M.</H></Box>
          <Cap>Email</Cap>
          <Box style={{ padding: '8px 12px' }}><H size={14}>aliya@uni.edu</H></Box>
          <Cap>Username</Cap>
          <Box style={{ padding: '8px 12px' }}><H size={14}>@aliya</H></Box>
          <Cap>Password</Cap>
          <div><Btn small>Change password</Btn></div>
          <Cap>Two-factor auth</Cap>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Box style={{ width: 38, height: 22, borderRadius: 999, background: 'var(--wf-accent)', position: 'relative' }}>
              <Box style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--wf-paper)', position: 'absolute', top: 1, right: 2 }}/>
            </Box>
            <Cap>enabled · via authenticator app</Cap>
          </div>
        </div>
      </div>
    </div>
  </Frame>
);

Object.assign(window, { ShareModal, NotificationsPanel, ImportFlow, QuestionTypePicker, SearchResults, SettingsScreen });
