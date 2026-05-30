/**
 * mobile/stats.js — Mobile statistics screen (M5 redesign).
 *
 * Three tabs (Сводка / Слабые / Активность) under a period filter
 * (7d / 30d / All). Pulls real data via the existing statistics API;
 * each section degrades to an empty hint when nothing is available.
 */
import {
  getMyAggregate, getHeatmap, getStreak, getMyTrend, listAttempts,
  getWeakQuestions,
} from '../../api/statistics.js';
import { listTests } from '../../api/tests.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mCard, mChip, mSeg, caps,
} from '../../components/mobile-atoms.js';
import { donut, areaLine, barChart } from '../../utils/charts.js';

let _renderToken = 0;

// ── helpers ─────────────────────────────────────────────────────

function kpiCell(label, value, delta) {
  const cell = document.createElement('div');
  Object.assign(cell.style, {
    border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    background: 'var(--paper)',
    boxShadow: 'var(--shadow-sm)',
  });
  cell.appendChild(caps(label));
  const v = document.createElement('div');
  Object.assign(v.style, {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '22px', fontWeight: '700',
    color: 'var(--ink)', marginTop: '4px',
  });
  v.textContent = value;
  cell.appendChild(v);
  if (delta) {
    const d = document.createElement('div');
    Object.assign(d.style, {
      fontSize: '11px', color: 'var(--accent)', marginTop: '2px',
    });
    d.textContent = delta;
    cell.appendChild(d);
  }
  return cell;
}

function emptyHint(text) {
  const e = document.createElement('div');
  Object.assign(e.style, {
    padding: '32px 12px', textAlign: 'center',
    color: 'var(--ink-mute)', fontSize: '13px',
  });
  e.textContent = text;
  return e;
}

function thinBar(value, max) {
  const cap = Math.max(1, max || 100);
  const pct = Math.max(0, Math.min(100, (value / cap) * 100));
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    width: '100%', height: '4px', borderRadius: '999px',
    background: 'var(--ink-soft)', overflow: 'hidden',
  });
  const fill = document.createElement('div');
  Object.assign(fill.style, {
    height: '100%', width: `${pct}%`,
    background: 'var(--accent)', borderRadius: '999px',
  });
  wrap.appendChild(fill);
  return wrap;
}

function buildSparkline(values, h = 70) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 280, H = h, P = 6;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = (W - P * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(H));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', pts);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--accent)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);
  values.forEach((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    const last = i === values.length - 1;
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('r', last ? '4' : '2.5');
    dot.setAttribute('fill', 'var(--accent)');
    dot.setAttribute('opacity', last ? '1' : '0.5');
    svg.appendChild(dot);
  });
  return svg;
}

function buildHeatmap(data, weeks) {
  const WEEKS = Math.max(1, Number(weeks) || 12);
  const today = new Date();
  const byDate = {};
  if (Array.isArray(data)) {
    for (const d of data) byDate[d.date] = d.count || 0;
  }
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));

  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    display: 'grid',
    gridTemplateColumns: `repeat(${WEEKS}, 1fr)`,
    gap: '3px', padding: '4px 0',
  });
  for (let col = 0; col < WEEKS; col++) {
    const colWrap = document.createElement('div');
    Object.assign(colWrap.style, {
      display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: '3px',
    });
    for (let row = 0; row < 7; row++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + col * 7 + row);
      if (dt > today) {
        colWrap.appendChild(document.createElement('div'));
        continue;
      }
      const key = dt.toISOString().slice(0, 10);
      const n = byDate[key] || 0;
      const intensity = Math.min(1, n / 4);
      const cell = document.createElement('div');
      Object.assign(cell.style, {
        aspectRatio: '1',
        background: n === 0
          ? 'var(--ink-soft)'
          : `color-mix(in srgb, var(--accent) ${Math.round(20 + intensity * 80)}%, var(--ink-soft))`,
        borderRadius: '2px',
      });
      cell.title = `${key}: ${n}`;
      colWrap.appendChild(cell);
    }
    wrap.appendChild(colWrap);
  }
  return wrap;
}

// ── Main render ─────────────────────────────────────────────────

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  // ── State ────────────────────────────────────────────────────
  let period = '30';     // '7' | '30' | 'all'
  let tab = 'summary';   // 'summary' | 'weak' | 'heatmap'

  // ── Skeleton ─────────────────────────────────────────────────
  const skeleton = document.createElement('div');
  skeleton.style.padding = '12px 16px';
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    Object.assign(s.style, {
      height: '60px', borderRadius: 'var(--radius-md)', marginBottom: '8px',
    });
    skeleton.appendChild(s);
  }
  mShell({
    root,
    topbar: topBar({
      large: true,
      title: t('stats.title') || 'Статистика',
      subtitle: t('stats.loading') || 'Загружаем…',
    }),
    body: skeleton,
    navActive: 'stats',
  });

  // ── Fetch ────────────────────────────────────────────────────
  const periodDays = period === '7' ? 7 : period === '30' ? 30 : 365;
  const [aggRes, streakRes, trendRes, heatRes, testsRes, attemptsRes] = await Promise.allSettled([
    getMyAggregate(),
    getStreak(),
    getMyTrend(periodDays),
    getHeatmap(period === 'all' ? 52 : period === '30' ? 12 : 4),
    listTests({ with_stats: true }),
    listAttempts({ status: 'completed', limit: 30 }),
  ]);
  if (stale()) return;

  const agg     = aggRes.status     === 'fulfilled' ? aggRes.value     : null;
  const streak  = streakRes.status  === 'fulfilled' ? (streakRes.value?.streak ?? 0) : 0;
  const trend   = trendRes.status   === 'fulfilled' ? (trendRes.value?.points || trendRes.value?.values || trendRes.value || []) : [];
  const heatmap = heatRes.status    === 'fulfilled' ? (heatRes.value?.days || heatRes.value || []) : [];
  const tests   = testsRes.status   === 'fulfilled' ? (testsRes.value?.tests || testsRes.value || []) : [];
  const recentAttempts = attemptsRes.status === 'fulfilled'
    ? (Array.isArray(attemptsRes.value) ? attemptsRes.value
       : (attemptsRes.value?.attempts || attemptsRes.value?.items || []))
    : [];

  const totalAttempts = agg?.attemptCount ?? agg?.attempt_count ?? 0;
  const avgPct = Math.round(agg?.avgPercentCorrect ?? agg?.avg_percent_correct ?? 0);
  // Total time (ms → hours, one decimal).
  const totalMs = Number(agg?.totalDurationMs ?? agg?.total_duration_ms ?? 0);
  const totalHours = totalMs > 0 ? (totalMs / 3.6e6).toFixed(1) + 'ч' : '—';

  // Extract numeric series for the sparkline. Trend payload may be a
  // list of objects {date, avg_score} or raw numbers — handle both.
  const trendValues = Array.isArray(trend)
    ? trend.map(p => {
      if (typeof p === 'number') return p;
      return Math.round(p.avg_score ?? p.avgScore ?? p.score ?? 0);
    }).filter(n => Number.isFinite(n))
    : [];

  // ── Build body ───────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '10px 16px 24px';

  // Period segmented control.
  const periodSeg = mSeg({
    sm: true, value: period,
    onChange: (v) => { period = v; refresh(); },
    items: [
      { key: '7',   label: t('stats.period.7')   || '7 дн' },
      { key: '30',  label: t('stats.period.30')  || '30 дн' },
      { key: 'all', label: t('stats.period.all') || 'Всё' },
    ],
  });
  body.appendChild(periodSeg);

  // Tabs row.
  const tabsRow = document.createElement('div');
  Object.assign(tabsRow.style, {
    display: 'flex', gap: '5px', overflowX: 'auto',
    margin: '12px 0', paddingBottom: '2px',
  });
  body.appendChild(tabsRow);

  const tabBody = document.createElement('div');
  body.appendChild(tabBody);

  function renderTabs() {
    tabsRow.replaceChildren();
    const tabs = [
      { id: 'summary', label: t('stats.tab.summary') || 'Сводка' },
      { id: 'weak',    label: t('stats.tab.weak')    || 'Слабые темы' },
      { id: 'heatmap', label: t('stats.tab.heatmap') || 'Активность' },
    ];
    for (const tt of tabs) {
      tabsRow.appendChild(mChip({
        sm: true, active: tab === tt.id,
        onClick: () => { tab = tt.id; renderTabs(); renderTab(); },
      }, tt.label));
    }
  }

  function renderTab() {
    tabBody.replaceChildren();
    if (tab === 'summary') tabBody.appendChild(buildSummary());
    else if (tab === 'weak') tabBody.appendChild(buildWeak());
    else if (tab === 'heatmap') tabBody.appendChild(buildHeatmapTab());
  }

  function buildSummary() {
    const wrap = document.createElement('div');
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
      marginBottom: '12px',
    });

    // Avg score — donut (%).
    const avgDonutCell = document.createElement('div');
    Object.assign(avgDonutCell.style, {
      border: '1.5px solid var(--ink)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      background: 'var(--paper)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    avgDonutCell.innerHTML = donut(avgPct > 0 ? avgPct : 0, 100, {
      unit: '%', label: t('stats.avg_score') || 'Средний балл',
    });
    grid.appendChild(avgDonutCell);

    // Attempts count — plain.
    grid.appendChild(kpiCell(t('stats.attempts') || 'Попыток', String(totalAttempts)));

    // Streak — plain (day count, not a %).
    grid.appendChild(kpiCell(t('stats.streak') || 'Streak',
      streak > 0 ? `${streak} ${t('stats.days') || 'дн'}` : '—'));

    // Time — plain.
    grid.appendChild(kpiCell(t('stats.time') || 'Время', totalHours));

    wrap.appendChild(grid);

    // Trend — area line chart (replaces hand-rolled sparkline).
    const trendPts = Array.isArray(trend)
      ? trend.map(function (p) {
        if (typeof p === 'number') return { y: p };
        return { y: Math.round(p.avg_score ?? p.avgScore ?? p.score ?? 0), label: p.date };
      }).filter(function (p) { return Number.isFinite(p.y); })
      : [];
    if (trendPts.length >= 2) {
      const trendBody = document.createElement('div');
      trendBody.innerHTML = areaLine(trendPts, { height: 72 });
      wrap.appendChild(mCard({ title: t('stats.trend') || 'Тренд' }, trendBody));
    }

    // Score-distribution histogram — reuse recentAttempts (already fetched, limit 30).
    if (recentAttempts.length > 0) {
      const buckets = Array.from({ length: 10 }, function (_, i) {
        return { label: String(i * 10), value: 0 };
      });
      for (const a of recentAttempts) {
        const idx = Math.min(9, Math.max(0, Math.floor((a.percentCorrect || 0) / 10)));
        buckets[idx].value++;
      }
      const histBody = document.createElement('div');
      histBody.innerHTML = barChart(buckets, { height: 120 });
      wrap.appendChild(mCard({
        title: t('stats.score_dist') || 'Распределение результатов',
      }, histBody));
    }

    const withAvg = tests.filter(t => t.avg_score != null);
    if (withAvg.length > 0) {
      const body = document.createElement('div');
      withAvg.forEach((t, i) => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 0',
          borderTop: i ? '1px solid var(--ink-soft)' : 'none',
          cursor: 'pointer',
        });
        row.addEventListener('click', () => navigate(`/test/${t.id}`));
        const mid = document.createElement('div');
        mid.style.flex = '1'; mid.style.minWidth = '0';
        const title = document.createElement('div');
        Object.assign(title.style, {
          fontSize: '13px', fontWeight: '500',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        title.textContent = t.title || '—';
        mid.appendChild(title);
        const bar = document.createElement('div');
        Object.assign(bar.style, { marginTop: '4px', width: '80%' });
        bar.appendChild(thinBar(t.avg_score, 100));
        mid.appendChild(bar);
        row.appendChild(mid);
        const pct = document.createElement('span');
        Object.assign(pct.style, {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '13px', fontWeight: '600',
          color: t.avg_score >= 80 ? 'var(--accent)' : 'var(--ink-fade)',
        });
        pct.textContent = `${Math.round(t.avg_score)}%`;
        row.appendChild(pct);
        body.appendChild(row);
      });
      wrap.appendChild(mCard({ title: t('stats.by_test') || 'По тестам' }, body));
    }

    // Last attempts list (parity with desktop "Последние попытки").
    if (recentAttempts.length > 0) {
      const aBody = document.createElement('div');
      // Build a fast title lookup from the test list.
      const titleById = {};
      tests.forEach(tt => { titleById[tt.id] = tt.title; });
      recentAttempts.slice(0, 10).forEach((a, i) => {
        const aid = a.attemptId || a.id;
        const tid = a.testId;
        const score = Math.round(a.percentCorrect ?? 0);
        const dt = a.finishedAt || a.startedAt;
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 0',
          borderTop: i ? '1px solid var(--ink-soft)' : 'none',
          cursor: tid && aid ? 'pointer' : 'default',
        });
        if (tid && aid) {
          row.addEventListener('click', () => navigate(`/test/${tid}/results/${aid}`));
        }
        const when = document.createElement('div');
        Object.assign(when.style, {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px', color: 'var(--ink-mute)',
          width: '54px', flexShrink: '0',
        });
        when.textContent = dt
          ? new Date(dt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
          : '—';
        row.appendChild(when);
        const mid = document.createElement('div');
        Object.assign(mid.style, {
          flex: '1', minWidth: '0', fontSize: '12px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        mid.textContent = titleById[tid] || a.testTitle || tid || '—';
        row.appendChild(mid);
        const pill = document.createElement('span');
        const tone = score >= 80 ? 'var(--accent)' : score >= 60 ? '#8a6a17' : 'var(--error)';
        const toneSoft = score >= 80 ? 'var(--accent-soft)' : score >= 60 ? 'var(--warn-soft)' : 'var(--error-soft)';
        Object.assign(pill.style, {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px', fontWeight: '600',
          padding: '2px 8px', borderRadius: 'var(--radius-pill)',
          background: toneSoft, color: tone,
          flexShrink: '0',
        });
        pill.textContent = `${score}%`;
        row.appendChild(pill);
        aBody.appendChild(row);
      });
      wrap.appendChild(mCard({ title: t('stats.recent_attempts') || 'Последние попытки' }, aBody));
    }
    return wrap;
  }

  let _weakCache = null;
  async function loadWeakAcrossTests() {
    if (_weakCache) return _weakCache;
    // Bounded to first 6 tests with attempts to keep this cheap.
    const candidates = tests
      .filter(t => (t.attemptCount ?? t.attempt_count ?? 0) > 0)
      .slice(0, 6);
    const results = await Promise.all(candidates.map(async (test) => {
      try {
        const resp = await getWeakQuestions(test.id);
        return { test, weak: (resp && resp.questions) || [] };
      } catch { return { test, weak: [] }; }
    }));
    _weakCache = results.filter(x => x.weak.length > 0);
    return _weakCache;
  }

  async function buildWeakAsync(into) {
    into.replaceChildren();
    const entries = await loadWeakAcrossTests();
    if (entries.length === 0) {
      into.appendChild(mCard(
        { title: t('stats.weak.title') || 'Слабые темы' },
        emptyHint(t('stats.weak.empty')
          || 'Слабых вопросов не выявлено — отличный результат!'),
      ));
      return;
    }
    for (const entry of entries) {
      const body = document.createElement('div');
      entry.weak.slice(0, 5).forEach((wq, i) => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 0',
          borderTop: i ? '1px solid var(--ink-soft)' : 'none',
        });
        const mid = document.createElement('div');
        mid.style.flex = '1'; mid.style.minWidth = '0';
        const txt = document.createElement('div');
        Object.assign(txt.style, {
          fontSize: '12px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        });
        txt.textContent = (wq.text || wq.title || `#${wq.id}`).slice(0, 80);
        mid.appendChild(txt);
        const meta = document.createElement('div');
        Object.assign(meta.style, { fontSize: '10px', color: 'var(--ink-mute)' });
        const acc = Math.round(wq.accuracy ?? wq.accuracy_pct ?? 0);
        meta.textContent = `${acc}% · ${wq.attempts ?? wq.attempt_count ?? 0} попыт.`;
        mid.appendChild(meta);
        row.appendChild(mid);
        body.appendChild(row);
      });
      const card = mCard({
        title: entry.test.title || '—',
        action: (() => {
          const btn = document.createElement('button');
          btn.type = 'button';
          Object.assign(btn.style, {
            padding: '4px 10px', fontSize: '11px',
            border: '1.5px solid var(--accent)',
            background: 'var(--accent)', color: '#fff',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          });
          btn.textContent = t('stats.train') || 'Тренировка';
          btn.addEventListener('click', () => {
            navigate(`/test/${entry.test.id}/start?source=weak`);
          });
          return btn;
        })(),
      }, body);
      into.appendChild(card);
    }
  }

  function buildWeak() {
    const wrap = document.createElement('div');
    // Loading placeholder; real data lazy-loaded.
    const slot = document.createElement('div');
    slot.appendChild(emptyHint(t('stats.loading') || 'Загружаем…'));
    wrap.appendChild(slot);
    buildWeakAsync(slot).catch(() => {
      slot.replaceChildren(emptyHint(t('stats.weak.empty') || 'Нет данных'));
    });

    // Also show the proxy "tests with avg < 70%" below (visual context).
    const weak = tests.filter(t => t.avg_score != null && t.avg_score < 70)
      .sort((a, b) => (a.avg_score || 0) - (b.avg_score || 0));
    if (weak.length === 0) {
      wrap.appendChild(mCard({ title: t('stats.weak.title') || 'Слабые темы' },
        emptyHint(t('stats.weak.empty') || 'Слабых тем не найдено — отличный результат!')));
      return wrap;
    }
    const body = document.createElement('div');
    weak.forEach((t, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 0',
        borderTop: i ? '1px solid var(--ink-soft)' : 'none',
      });
      // Small ring as visual hook.
      const NS = 'http://www.w3.org/2000/svg';
      const ring = document.createElementNS(NS, 'svg');
      ring.setAttribute('width', '42'); ring.setAttribute('height', '42');
      ring.setAttribute('viewBox', '0 0 42 42');
      const bg = document.createElementNS(NS, 'circle');
      bg.setAttribute('cx', '21'); bg.setAttribute('cy', '21'); bg.setAttribute('r', '15');
      bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'var(--ink-soft)'); bg.setAttribute('stroke-width', '4');
      ring.appendChild(bg);
      const c = 2 * Math.PI * 15;
      const fg = document.createElementNS(NS, 'circle');
      fg.setAttribute('cx', '21'); fg.setAttribute('cy', '21'); fg.setAttribute('r', '15');
      fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', 'var(--error)'); fg.setAttribute('stroke-width', '4');
      fg.setAttribute('stroke-dasharray', String(c));
      fg.setAttribute('stroke-dashoffset', String(c * (1 - t.avg_score / 100)));
      fg.setAttribute('stroke-linecap', 'round');
      fg.setAttribute('transform', 'rotate(-90 21 21)');
      ring.appendChild(fg);
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', '21'); txt.setAttribute('y', '24');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '10'); txt.setAttribute('font-weight', '700');
      txt.setAttribute('fill', 'var(--error)');
      txt.textContent = `${Math.round(t.avg_score)}`;
      ring.appendChild(txt);
      row.appendChild(ring);
      const mid = document.createElement('div');
      mid.style.flex = '1'; mid.style.minWidth = '0';
      const name = document.createElement('div');
      Object.assign(name.style, { fontSize: '13px', fontWeight: '600' });
      name.textContent = t.title || '—';
      mid.appendChild(name);
      const meta = document.createElement('div');
      Object.assign(meta.style, { fontSize: '11px', color: 'var(--ink-mute)' });
      meta.textContent = `${t.questionCount ?? 0} ${t('test.questions') || 'вопр.'}`;
      mid.appendChild(meta);
      row.appendChild(mid);
      const btn = document.createElement('button');
      btn.type = 'button';
      Object.assign(btn.style, {
        padding: '5px 10px', fontSize: '12px', fontWeight: '500',
        border: '1.5px solid var(--accent)',
        background: 'var(--accent)', color: '#fff',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      });
      btn.textContent = t('stats.train') || 'Тренировка';
      btn.addEventListener('click', () => navigate(`/test/${t.id}/start`));
      row.appendChild(btn);
      body.appendChild(row);
    });
    wrap.appendChild(mCard({ title: t('stats.weak.title') || 'Темы с точностью < 70%' }, body));
    return wrap;
  }

  function buildHeatmapTab() {
    const wrap = document.createElement('div');
    if (!Array.isArray(heatmap) || heatmap.length === 0) {
      wrap.appendChild(mCard({ title: t('stats.heatmap.title') || 'Активность' },
        emptyHint(t('stats.heatmap.empty') || 'Активности пока нет')));
      return wrap;
    }
    const weeks = period === 'all' ? 52 : period === '30' ? 12 : 4;
    const body = document.createElement('div');
    body.style.overflow = 'auto';
    body.appendChild(buildHeatmap(heatmap, weeks));
    wrap.appendChild(mCard({
      title: `${t('stats.heatmap.title') || 'Активность'} · ${weeks} ${t('stats.weeks') || 'нед.'}`,
    }, body));
    return wrap;
  }

  function refresh() {
    renderTabs(); renderTab();
  }
  refresh();

  // Update topbar subtitle with real numbers and final body.
  const finalTopbar = topBar({
    large: true,
    title: t('stats.title') || 'Статистика',
    subtitle: `${totalAttempts} ${t('stats.attempts_word') || 'попыток'} · ${tests.length} ${t('stats.tests_word') || 'тестов'}`,
  });
  mShell({ root, topbar: finalTopbar, body, navActive: 'stats' });
}
