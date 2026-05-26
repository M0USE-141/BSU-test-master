// Statistics dashboard wireframes — 3 distinct approaches
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame } = window;

// ─── Tiny chart placeholders (svg-based, intentionally crude) ─────────────

const SparkLine = ({ values, w = '100%', h = 60, accent = true }) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 80 - 10;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: w, height: h, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={accent ? 'var(--wf-accent)' : 'var(--wf-ink)'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - ((v - min) / range) * 80 - 10;
        return <circle key={i} cx={x} cy={y} r="1.6" fill="var(--wf-paper)" stroke={accent ? 'var(--wf-accent)' : 'var(--wf-ink)'} strokeWidth="1"/>;
      })}
    </svg>
  );
};

const Bars = ({ values, h = 80, max, accent }) => {
  const m = max ?? Math.max(...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: h }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${(v / m) * 100}%`,
          background: accent ? 'var(--wf-accent)' : 'var(--wf-ink)',
          borderRadius: '3px 3px 0 0',
          minHeight: 3,
        }}/>
      ))}
    </div>
  );
};

// Calendar heatmap (12x7 cells)
const Heatmap = ({ weeks = 14 }) => {
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      // pseudo-random density
      const r = ((w * 7 + d) * 9301 + 49297) % 233280 / 233280;
      const lvl = r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3;
      col.push(lvl);
    }
    cells.push(col);
  }
  const c = ['var(--wf-ink-soft)', 'oklch(0.85 0.06 38)', 'oklch(0.75 0.13 38)', 'var(--wf-accent)'];
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {cells.map((col, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {col.map((lvl, j) => (
            <div key={j} style={{ width: 13, height: 13, background: c[lvl], borderRadius: 2, border: '1px solid var(--wf-ink)' }}/>
          ))}
        </div>
      ))}
    </div>
  );
};

// === Stats V1 — Classic personal-progress dashboard grid ===
const StatsA = () => (
  <Frame>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon kind="chevL"/>
        <H size={18} weight={700}>My statistics</H>
        <Cap>· last 30 days</Cap>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Chip small>All tests</Chip>
        <Chip small>Anatomy ✕</Chip>
        <Btn small ghost><Icon kind="filter" size={14}/> Filter</Btn>
      </div>
    </div>
    <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          ['82%', 'overall accuracy', '+4'],
          ['7', 'day streak', '🔥'],
          ['41', 'tests taken', '+9'],
          ['8m 12s', 'avg time / test', '−12s'],
          ['1,847', 'questions answered', '+312'],
        ].map(([n, l, d], i) => (
          <Box key={i} style={{ padding: 12 }}>
            <Cap>{l}</Cap>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <H size={26} weight={700}>{n}</H>
              <Cap style={{ color: 'var(--wf-accent)' }}>{d}</Cap>
            </div>
          </Box>
        ))}
      </div>

      {/* Two-up: accuracy line, time bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginTop: 12 }}>
        <Box style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <H size={14} weight={600}>Accuracy over time</H>
            <Cap>daily · 30d</Cap>
          </div>
          <SparkLine values={[55, 60, 62, 58, 65, 70, 68, 72, 75, 73, 78, 80, 76, 82, 84, 81, 85, 88, 86, 90]} h={140}/>
        </Box>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 6 }}>Time per question</H>
          <Bars values={[12, 18, 22, 16, 28, 24, 20, 32, 26, 19, 22, 15]} h={140} accent/>
          <Cap style={{ marginTop: 6 }}>seconds · last 12 tests</Cap>
        </Box>
      </div>

      {/* Heatmap + breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginTop: 12 }}>
        <Box style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <H size={14} weight={600}>Activity</H>
            <Cap>14 weeks</Cap>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Heatmap weeks={14}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, alignItems: 'center' }}>
            <Cap>less</Cap>
            {[0, 1, 2, 3].map((l) => (
              <div key={l} style={{ width: 11, height: 11, background: ['var(--wf-ink-soft)', 'oklch(0.85 0.06 38)', 'oklch(0.75 0.13 38)', 'var(--wf-accent)'][l], border: '1px solid var(--wf-ink)' }}/>
            ))}
            <Cap>more</Cap>
          </div>
        </Box>
        <Box style={{ padding: 14 }}>
          <H size={14} weight={600} style={{ marginBottom: 8 }}>Strongest / weakest topics</H>
          {[
            ['Cell biology', 94, true],
            ['Ions & polarity', 88, true],
            ['Anatomy: skeletal', 71, null],
            ['Krebs cycle', 52, false],
            ['MathJax formulas', 41, false],
          ].map(([t, p, ok], i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Cap style={{ color: 'var(--wf-ink)' }}>{t}</Cap>
                <Cap>{p}%</Cap>
              </div>
              <div style={{ marginTop: 3, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
                <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: ok === false ? 'var(--wf-ink)' : 'var(--wf-accent)' }}/>
              </div>
            </div>
          ))}
        </Box>
      </div>

      <Stickie style={{ position: 'absolute', right: 18, bottom: 16, width: 200 }}>
        v1 — classic KPI grid.<br/>Scannable. Familiar.
      </Stickie>
    </div>
  </Frame>
);

// === Stats V2 — Per-test deep dive: question-level diagnosis ===
const StatsB = () => {
  const questions = [
    { i: 1, text: 'Match the organ to its function', pass: 32, attempts: 89, your: 'wrong' },
    { i: 2, text: 'Krebs cycle: which produces ATP?', pass: 38, attempts: 89, your: 'wrong' },
    { i: 3, text: 'Solve: 3x² + 2x − 1 = 0', pass: 41, attempts: 89, your: 'wrong' },
    { i: 4, text: 'Identify labeled structure', pass: 54, attempts: 89, your: 'right' },
    { i: 5, text: 'Cell membrane components', pass: 67, attempts: 89, your: 'right' },
    { i: 6, text: 'Mitosis stage ordering', pass: 73, attempts: 89, your: 'right' },
    { i: 7, text: 'Fill: largest bone is ___', pass: 81, attempts: 89, your: 'right' },
    { i: 8, text: 'True / false: nucleus in all cells', pass: 92, attempts: 89, your: 'right' },
  ];
  return (
    <Frame>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="chevL"/>
          <H size={18} weight={700}>Stats · Anatomy Midterm</H>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip small>My attempts only</Chip>
          <Chip small active>Sort: ↑ pass rate</Chip>
          <Btn small ghost><Icon kind="upload" size={14}/> Export</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: question list w/ pass rate bars */}
        <div style={{ width: 420, borderRight: '2px solid var(--wf-ink)', overflowY: 'auto', position: 'relative' }}>
          <div style={{ padding: '12px var(--wf-pad)', borderBottom: '2px dashed var(--wf-ink-mute)', display: 'flex', justifyContent: 'space-between' }}>
            <Cap>question</Cap>
            <Cap>pass rate</Cap>
          </div>
          {questions.map((q, idx) => {
            const danger = q.pass < 50;
            return (
              <div key={q.i} style={{
                padding: '10px var(--wf-pad)',
                borderBottom: '1.5px dashed var(--wf-ink-mute)',
                background: idx === 0 ? 'var(--wf-accent-soft)' : 'transparent',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Cap style={{ width: 22 }}>#{q.i}</Cap>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.25, color: 'var(--wf-ink)' }}>{q.text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
                        <div style={{ width: `${q.pass}%`, height: '100%', borderRadius: 999, background: danger ? 'var(--wf-ink)' : 'var(--wf-accent)' }}/>
                      </div>
                      <Cap style={{ minWidth: 36, textAlign: 'right' }}>{q.pass}%</Cap>
                      <span style={{ fontSize: 11, color: q.your === 'right' ? 'var(--wf-accent)' : 'var(--wf-ink-fade)' }}>
                        {q.your === 'right' ? '✓' : '✗'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <Annot side="left" top={130} offset={-160} w={150}>sorted ↑ by pass rate<br/>worst questions first</Annot>
        </div>

        {/* Right: details on selected question */}
        <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', position: 'relative' }}>
          <Cap>question #1 · selected</Cap>
          <H size={18} weight={700} style={{ marginTop: 4 }}>Match the organ to its function</H>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
            {[['32%', 'pass rate'], ['89', 'attempts'], ['42s', 'avg time']].map(([n, l], i) => (
              <Box key={i} style={{ padding: 10 }}>
                <H size={20} weight={700}>{n}</H>
                <Cap>{l}</Cap>
              </Box>
            ))}
          </div>

          <Box style={{ padding: 14, marginTop: 12 }}>
            <H size={14} weight={600} style={{ marginBottom: 8 }}>Answer distribution</H>
            {[
              ['A. Pancreas → insulin', 58],
              ['B. Liver → glucagon (✗ wrong)', 24],
              ['C. Kidneys → bile', 12],
              ['D. Stomach → enzymes', 6],
            ].map(([t, p], i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Cap style={{ color: 'var(--wf-ink)' }}>{t}</Cap>
                  <Cap>{p}%</Cap>
                </div>
                <div style={{ marginTop: 3, height: 8, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
                  <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: i === 0 ? 'var(--wf-accent)' : 'var(--wf-ink-mute)' }}/>
                </div>
              </div>
            ))}
          </Box>

          <Box style={{ padding: 14, marginTop: 12 }}>
            <H size={14} weight={600} style={{ marginBottom: 6 }}>Your accuracy on this question (over time)</H>
            <SparkLine values={[0, 0, 0, 0, 1, 0, 1, 1, 0, 1]} h={50} accent={false}/>
            <Cap style={{ marginTop: 4 }}>10 attempts · 4 correct · last: ✗</Cap>
          </Box>

          <Stickie style={{ position: 'absolute', right: 18, top: 16, width: 200 }}>
            v2 — diagnostic.<br/>"why am I failing<br/>this test?"
          </Stickie>
        </div>
      </div>
    </Frame>
  );
};

// === Stats V3 — Teacher / owner view, novel "scorecard" layout ===
const StatsC = () => {
  const learners = [
    ['m.aliyeva', 92, '6m 21s', '1st'],
    ['s.ivanov',  88, '7m 02s', '2nd'],
    ['k.petrov',  85, '6m 58s', '3rd'],
    ['a.zhao',    74, '8m 11s', '4th'],
    ['r.kim',     71, '9m 04s', '5th'],
    ['o.bondar',  62, '10m 22s', '6th'],
    ['l.tashev',  58, '11m 40s', '7th'],
    ['j.lee',     41, '14m 02s', '8th'],
  ];
  // Pass-rate strip per question
  const qStrip = [32, 38, 41, 54, 67, 73, 81, 92, 78, 65, 58, 49, 88, 71, 84, 62, 77, 55];
  return (
    <Frame>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--wf-pad)', borderBottom: '2px solid var(--wf-ink)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon kind="chevL"/>
          <H size={18} weight={700}>Owner view · Anatomy Midterm</H>
          <Chip small accent>owner</Chip>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip small active>This term</Chip>
          <Chip small>All time</Chip>
          <Btn small ghost><Icon kind="upload" size={14}/> Export CSV</Btn>
        </div>
      </div>

      <div style={{ flex: 1, padding: 'var(--wf-pad)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
        {/* Top row: distribution histogram + KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <Box style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <H size={14} weight={600}>Score distribution</H>
              <Cap>89 attempts · 38 learners</Cap>
            </div>
            <div style={{ marginTop: 12 }}>
              <Bars values={[2, 3, 5, 6, 9, 14, 18, 12, 8, 6]} h={120} accent/>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <Cap>0</Cap><Cap>20</Cap><Cap>40</Cap><Cap>60</Cap><Cap>80</Cap><Cap>100%</Cap>
              </div>
            </div>
          </Box>
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
            <Box style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <Cap>median score</Cap>
                <H size={26} weight={700}>71%</H>
              </div>
              <div style={{ flex: 1 }}>
                <SparkLine values={[58, 62, 65, 68, 69, 70, 71]} h={42}/>
                <Cap>vs last term · +4</Cap>
              </div>
            </Box>
            <Box style={{ padding: 12 }}>
              <Cap>completion</Cap>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <H size={26} weight={700}>67%</H>
                <Cap>26 of 38 learners</Cap>
              </div>
              <div style={{ marginTop: 6, height: 8, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
                <div style={{ width: '67%', height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
              </div>
            </Box>
          </div>
        </div>

        {/* Question pass-rate strip (full width, novel) */}
        <Box style={{ padding: 14, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <H size={14} weight={600}>Per-question pass rate</H>
            <Cap>tap a column for details ↓</Cap>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
            {qStrip.map((p, i) => {
              const lvl = p < 50 ? 'var(--wf-ink)' : p < 70 ? 'oklch(0.75 0.13 38)' : 'var(--wf-accent)';
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', height: `${p}%`, background: lvl, borderRadius: '3px 3px 0 0', border: '1px solid var(--wf-ink)' }}/>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {qStrip.map((_, i) => (
              <Cap key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9 }}>{i + 1}</Cap>
            ))}
          </div>
          <Annot side="right" top={6} offset={-2} w={130}>
            spot weak Qs at<br/>a glance →
          </Annot>
        </Box>

        {/* Leaderboard + heatmap */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
          <Box style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <H size={14} weight={600}>Leaderboard</H>
              <Cap>sort: score ↓</Cap>
            </div>
            {learners.map(([who, s, t, r], i) => (
              <div key={who} style={{
                display: 'grid', gridTemplateColumns: '30px 1.4fr .8fr .8fr',
                gap: 10, alignItems: 'center', padding: '6px 0',
                borderTop: i ? '1.5px dashed var(--wf-ink-mute)' : 'none',
              }}>
                <Cap style={{ color: i < 3 ? 'var(--wf-accent)' : 'var(--wf-ink-fade)', fontWeight: 700 }}>{r}</Cap>
                <H size={13} weight={500}>{who}</H>
                <Cap>{t}</Cap>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--wf-ink-soft)' }}>
                    <div style={{ width: `${s}%`, height: '100%', borderRadius: 999, background: 'var(--wf-accent)' }}/>
                  </div>
                  <Cap style={{ minWidth: 30, textAlign: 'right' }}>{s}%</Cap>
                </div>
              </div>
            ))}
          </Box>
          <Box style={{ padding: 14 }}>
            <H size={14} weight={600} style={{ marginBottom: 8 }}>When are they testing?</H>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Heatmap weeks={12}/>
            </div>
            <Cap style={{ marginTop: 10 }}>peak: tue / wed evenings · 18:00–22:00</Cap>
          </Box>
        </div>

        <Stickie style={{ position: 'absolute', right: 18, top: 16, width: 200 }}>
          v3 — owner view.<br/>
          Question strip + leaderboard + when-do-they-attempt.
        </Stickie>
      </div>
    </Frame>
  );
};

Object.assign(window, { StatsA, StatsB, StatsC, SparkLine, Bars, Heatmap });
