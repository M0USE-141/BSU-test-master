/**
 * mobile/collection.js — Mobile collection detail (M3 redesign).
 *
 * Five tabs: Обзор / Вопросы / Статистика / Доступ / Активность.
 * Each tab is a separate render function; data fetched once on mount
 * and shared across them (test payload, attempts list).
 *
 * Sticky CTA bar at the bottom carries "Доступ" + "Начать тест".
 * Bottom nav is hidden to give the tab strip + sticky bar room.
 */
import { getTest } from '../../api/tests.js';
import { listAttempts, getMyQuestionStats } from '../../api/statistics.js';
import { kdBadge } from '../../utils/charts.js';
import { getTestShares, updateTestAccess, addShare } from '../../api/access.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mCard, mChip, mBtn, mSticky, caps,
} from '../../components/mobile-atoms.js';
import { fmtDate } from './_shell.js';
import { toast } from '../../components/toast.js';

let _renderToken = 0;

// ── helpers ─────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  if (m === 0) return `${ss}s`;
  return ss > 0 ? `${m}m ${ss}s` : `${m}m`;
}

function buildSparkline(scores) {
  if (scores.length < 2) return null;
  const W = 280, H = 56, P = 5;
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores);
  const range = max - min || 1;
  const step = (W - P * 2) / (scores.length - 1);
  const pts = scores.map((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const NS = 'http://www.w3.org/2000/svg';
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
  scores.forEach((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    const last = i === scores.length - 1;
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
    padding: '24px 12px', textAlign: 'center',
    color: 'var(--ink-mute)', fontSize: '13px',
  });
  e.textContent = text;
  return e;
}

function scoreBadge(pct) {
  const good = pct >= 80;
  const badge = document.createElement('span');
  Object.assign(badge.style, {
    fontFamily: "'JetBrains Mono', monospace",
    minWidth: '48px', textAlign: 'center',
    padding: '3px 8px', borderRadius: '999px',
    background: good ? 'var(--accent-soft)' : 'var(--ink-soft)',
    color: good ? 'var(--accent)' : 'var(--ink-fade)',
    fontSize: '12px', fontWeight: '700',
    flexShrink: '0',
  });
  badge.textContent = `${pct}%`;
  return badge;
}

// ── Tab renderers ───────────────────────────────────────────────

function renderOverviewTab(test, attempts) {
  const wrap = document.createElement('div');
  wrap.style.padding = '12px 16px 24px';

  const meta = document.createElement('div');
  Object.assign(meta.style, {
    display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px',
  });
  meta.appendChild(mChip({ sm: true }, `${test.questions?.length ?? 0} ${t('test.questions') || 'вопр.'}`));
  meta.appendChild(mChip({ sm: true }, `${attempts.length} ${t('test.attempts') || 'попыток'}`));
  if (test.access_level) meta.appendChild(mChip({ sm: true }, test.access_level));
  wrap.appendChild(meta);

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
    marginBottom: '12px',
  });
  const scores = attempts.map(a => Math.round(a.percentCorrect ?? 0)).filter(n => n > 0);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const totalMs = attempts.reduce((s, a) => s + (a.totalDurationMs || 0), 0);
  const avgMs = attempts.length ? totalMs / attempts.length : 0;
  grid.appendChild(kpiCell(t('stats.avg')  || 'Средний', avg  != null ? `${avg}%`  : '—'));
  grid.appendChild(kpiCell(t('stats.best') || 'Лучший', best != null ? `${best}%` : '—'));
  grid.appendChild(kpiCell(t('stats.avg_time') || 'Время', fmtMs(avgMs)));
  grid.appendChild(kpiCell(t('test.attempts') || 'Попыток', String(attempts.length)));
  wrap.appendChild(grid);

  const descBody = document.createElement('div');
  Object.assign(descBody.style, {
    fontSize: '13px', color: 'var(--ink-fade)', lineHeight: '1.55',
  });
  if (test.description) descBody.textContent = test.description;
  else {
    const i = document.createElement('i');
    i.textContent = t('test.no_description') || 'Описание не задано.';
    descBody.appendChild(i);
  }
  wrap.appendChild(mCard({ title: t('test.description') || 'Описание' }, descBody));

  const recentBody = document.createElement('div');
  if (attempts.length === 0) {
    recentBody.appendChild(emptyHint(t('test.no_attempts') || 'Ещё не было попыток'));
  } else {
    attempts.slice(0, 4).forEach((a, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 0',
        borderTop: i ? '1px solid var(--ink-soft)' : 'none',
        cursor: 'pointer',
      });
      row.addEventListener('click', () => navigate(`/test/${test.id}/results/${a.attemptId || a.id}`));
      row.appendChild(scoreBadge(Math.round(a.percentCorrect ?? 0)));
      const mid = document.createElement('div');
      mid.style.flex = '1';
      const main = document.createElement('div');
      Object.assign(main.style, { fontSize: '13px', fontWeight: '500' });
      main.textContent = fmtDate(a.finishedAt || a.startedAt);
      mid.appendChild(main);
      const sub = document.createElement('div');
      Object.assign(sub.style, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px', color: 'var(--ink-mute)',
      });
      sub.textContent = `${fmtMs(a.totalDurationMs)} · ${a.questionCount || 0} q`;
      mid.appendChild(sub);
      row.appendChild(mid);
      row.appendChild(iconEl('chevR', 14));
      recentBody.appendChild(row);
    });
  }
  wrap.appendChild(mCard({ title: t('test.recent_attempts') || 'Последние попытки' }, recentBody));

  return wrap;
}

function renderQuestionsTab(test, kdByQ = {}) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    padding: '12px 16px 24px',
    display: 'flex', flexDirection: 'column', gap: '10px',
  });

  let term = '';
  const search = document.createElement('div');
  Object.assign(search.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 12px', border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-sm)', fontSize: '13px',
  });
  const sIcon = iconEl('search', 13);
  sIcon.style.color = 'var(--ink-mute)';
  search.appendChild(sIcon);
  const sInput = document.createElement('input');
  sInput.type = 'search';
  sInput.placeholder = t('test.search_questions') || 'Поиск по тексту';
  Object.assign(sInput.style, {
    flex: '1', border: 'none', background: 'transparent', outline: 'none',
    color: 'var(--ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px',
  });
  sInput.addEventListener('input', (e) => { term = e.target.value.toLowerCase(); rerender(); });
  search.appendChild(sInput);
  wrap.appendChild(search);

  if (test.is_owner) {
    const add = mBtn({
      full: true,
      onClick: () => navigate(`/test/${test.id}/q/new?new=1`),
      style: {
        borderStyle: 'dashed', borderColor: 'var(--accent)',
        color: 'var(--accent)', background: 'transparent',
      },
    }, iconEl('plus', 14), t('test.add_question') || 'Добавить вопрос');
    wrap.appendChild(add);
  }

  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '8px' });
  wrap.appendChild(list);

  function questionText(q) {
    const blocks = q.question?.blocks || [];
    if (blocks.length) {
      const inlines = blocks[0].inlines || [];
      return inlines.map(i => i.text || '').join('').trim();
    }
    if (typeof q.question === 'string') return q.question;
    return '';
  }

  function rerender() {
    list.replaceChildren();
    const qs = (test.questions || []).filter(q => {
      if (!term) return true;
      return questionText(q).toLowerCase().includes(term);
    });
    if (qs.length === 0) {
      list.appendChild(emptyHint(t('test.empty_filter') || 'Ничего по фильтру'));
      return;
    }
    qs.forEach((q, idx) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        border: '1.5px solid var(--ink)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        background: 'var(--paper)',
        cursor: test.is_owner ? 'pointer' : 'default',
      });
      // Both owners and non-owners can open the question detail; the
      // question editor screen shows preview for non-owners with the
      // "Propose CR" CTA, and edit for owners.
      card.addEventListener('click', () => navigate(`/test/${test.id}/q/${q.id || (idx + 1)}`));
      const head = document.createElement('div');
      Object.assign(head.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '4px',
      });
      const num = document.createElement('span');
      Object.assign(num.style, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px', color: 'var(--ink-mute)', fontWeight: '600',
      });
      num.textContent = `Q${q.id ?? (idx + 1)}`;
      head.appendChild(num);
      const qs = kdByQ[String(q.id ?? (idx + 1))];
      if (qs) {
        const b = document.createElement('span');
        b.innerHTML = kdBadge(qs.k, qs.d, qs.ratio, qs.rank);
        head.appendChild(b);
      }
      if (test.is_owner) {
        const chev = iconEl('chevR', 12);
        chev.style.color = 'var(--ink-mute)';
        head.appendChild(chev);
      }
      card.appendChild(head);
      const body = document.createElement('div');
      Object.assign(body.style, {
        fontSize: '13px', lineHeight: '1.4',
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical',
      });
      body.textContent = questionText(q) || `${t('test.question') || 'Вопрос'} ${q.id ?? idx + 1}`;
      card.appendChild(body);
      list.appendChild(card);
    });
  }
  rerender();
  return wrap;
}

function renderStatsTab(test, attempts) {
  const wrap = document.createElement('div');
  wrap.style.padding = '12px 16px 24px';

  const scores = attempts
    .map(a => Math.round(a.percentCorrect ?? 0))
    .filter(n => n > 0);
  const avg  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const totalMs = attempts.reduce((s, a) => s + (a.totalDurationMs || 0), 0);
  const avgMs = attempts.length ? totalMs / attempts.length : 0;

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
    marginBottom: '12px',
  });
  grid.appendChild(kpiCell(t('stats.avg')      || 'Средний', avg  != null ? `${avg}%`  : '—'));
  grid.appendChild(kpiCell(t('test.attempts')  || 'Попыток', String(attempts.length)));
  grid.appendChild(kpiCell(t('stats.avg_time') || 'Время', fmtMs(avgMs)));
  grid.appendChild(kpiCell(t('stats.best')     || 'Лучший', best != null ? `${best}%` : '—'));
  wrap.appendChild(grid);

  if (scores.length >= 2) {
    const trend = scores.slice(0, 10).reverse();
    const spark = buildSparkline(trend);
    if (spark) {
      const trendBody = document.createElement('div');
      trendBody.appendChild(spark);
      wrap.appendChild(mCard({
        title: `${t('stats.trend') || 'Тренд'} · ${trend.length} ${t('test.attempts') || 'попыток'}`,
      }, trendBody));
    }
  }
  if (scores.length === 0) {
    wrap.appendChild(mCard({}, emptyHint(t('test.no_data') || 'Данных пока нет.')));
  }
  return wrap;
}

function renderAccessTab(test) {
  const wrap = document.createElement('div');
  wrap.style.padding = '12px 16px 24px';

  const lvlCardBody = document.createElement('div');
  const chipsRow = document.createElement('div');
  Object.assign(chipsRow.style, {
    display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px',
  });
  const hintEl = document.createElement('div');
  Object.assign(hintEl.style, {
    fontSize: '11px', color: 'var(--ink-fade)', lineHeight: '1.5',
  });
  const levels = [
    { id: 'private', label: t('access.private') || 'Приватный',
      hint: t('access.hint.private') || 'Доступ только у вас.' },
    { id: 'shared',  label: t('access.shared')  || 'Shared',
      hint: t('access.hint.shared')  || 'Вы и пользователи из списка.' },
    { id: 'public',  label: t('access.public')  || 'Public',
      hint: t('access.hint.public')  || 'Любой со ссылкой.' },
  ];
  let currentLevel = (test.access_level || 'private').toLowerCase();

  function renderChips() {
    chipsRow.replaceChildren();
    for (const lvl of levels) {
      chipsRow.appendChild(mChip({
        active: currentLevel === lvl.id,
        onClick: test.is_owner ? async () => {
          try {
            await updateTestAccess(test.id, lvl.id);
            currentLevel = lvl.id;
            const hint = levels.find(l => l.id === currentLevel)?.hint || '';
            hintEl.textContent = hint;
            toast(`${t('access.changed_to') || 'Уровень:'} ${lvl.label}`, { tone: 'success' });
            renderChips();
          } catch (e) { toast(e.message || 'Ошибка', { tone: 'error' }); }
        } : null,
      }, lvl.label));
    }
  }
  renderChips();
  hintEl.textContent = levels.find(l => l.id === currentLevel)?.hint || '';
  lvlCardBody.appendChild(chipsRow);
  lvlCardBody.appendChild(hintEl);
  wrap.appendChild(mCard({ title: t('access.level') || 'Уровень доступа' }, lvlCardBody));

  // Owner-only invite block.
  if (test.is_owner) {
    const inviteBody = document.createElement('div');
    Object.assign(inviteBody.style, { display: 'flex', gap: '6px', alignItems: 'stretch' });
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '@username';
    Object.assign(input.style, {
      flex: '1', border: '1.5px solid var(--ink)', borderRadius: 'var(--radius-sm)',
      padding: '8px 10px', fontSize: '12px', outline: 'none',
      background: 'var(--paper)', color: 'var(--ink)',
      fontFamily: 'Inter, sans-serif',
    });
    inviteBody.appendChild(input);
    inviteBody.appendChild(mBtn({
      primary: true, sm: true,
      onClick: async () => {
        const u = input.value.trim().replace(/^@/, '');
        if (!u) return toast(t('access.username_required') || 'Введите username', { tone: 'error' });
        try {
          await addShare(test.id, u);
          toast(t('access.invited') || 'Приглашение отправлено', { tone: 'success' });
          input.value = '';
          reloadPeople();
        } catch (e) { toast(e.message || 'Ошибка', { tone: 'error' }); }
      },
    }, t('access.invite') || 'Пригласить'));
    wrap.appendChild(mCard({ title: t('access.add') || 'Пригласить' }, inviteBody));
  }

  const peopleSlot = document.createElement('div');
  peopleSlot.appendChild(emptyHint(t('access.loading') || 'Загружаем список…'));
  wrap.appendChild(mCard({ title: t('access.people') || 'Люди с доступом' }, peopleSlot));

  async function reloadPeople() {
    try {
      const data = await getTestShares(test.id);
      const shares = data?.shares || data || [];
      peopleSlot.replaceChildren();
      if (!Array.isArray(shares) || shares.length === 0) {
        peopleSlot.appendChild(emptyHint(t('access.empty') || 'Пока нет участников'));
        return;
      }
      shares.forEach((s, i) => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 0',
          borderTop: i ? '1px solid var(--ink-soft)' : 'none',
        });
        const av = document.createElement('div');
        Object.assign(av.style, {
          width: '32px', height: '32px', borderRadius: '50%',
          border: '1.5px solid var(--ink)',
          background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: '600', fontSize: '12px', flexShrink: '0',
        });
        av.textContent = (s.username || '?').slice(0, 2).toUpperCase();
        row.appendChild(av);
        const mid = document.createElement('div');
        Object.assign(mid.style, { flex: '1', minWidth: '0' });
        const name = document.createElement('div');
        Object.assign(name.style, { fontSize: '13px', fontWeight: '600' });
        name.textContent = s.display_name || s.username || '—';
        mid.appendChild(name);
        const subEl = document.createElement('div');
        Object.assign(subEl.style, { fontSize: '11px', color: 'var(--ink-mute)' });
        subEl.textContent = s.username ? `@${s.username}` : '';
        mid.appendChild(subEl);
        row.appendChild(mid);
        peopleSlot.appendChild(row);
      });
    } catch {
      peopleSlot.replaceChildren();
      peopleSlot.appendChild(emptyHint(t('access.load_failed') || 'Не удалось загрузить'));
    }
  }
  reloadPeople();

  return wrap;
}

function renderActivityTab(test, attempts) {
  const wrap = document.createElement('div');
  wrap.style.padding = '12px 16px 24px';

  const body = document.createElement('div');
  if (attempts.length === 0) {
    body.appendChild(emptyHint(t('test.no_attempts') || 'Попыток нет'));
  } else {
    attempts.forEach((a, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 0',
        borderTop: i ? '1px solid var(--ink-soft)' : 'none',
        cursor: 'pointer',
      });
      row.addEventListener('click', () => navigate(`/test/${test.id}/results/${a.attemptId || a.id}`));
      row.appendChild(scoreBadge(Math.round(a.percentCorrect ?? 0)));
      const mid = document.createElement('div');
      mid.style.flex = '1';
      const main = document.createElement('div');
      Object.assign(main.style, { fontSize: '13px', fontWeight: '500' });
      main.textContent = `${t('test.attempt') || 'попытка'} #${i + 1} · ${fmtDate(a.finishedAt || a.startedAt)}`;
      mid.appendChild(main);
      const subEl = document.createElement('div');
      Object.assign(subEl.style, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px', color: 'var(--ink-mute)',
      });
      subEl.textContent = `${fmtMs(a.totalDurationMs)} · ${a.questionCount || 0} q`;
      mid.appendChild(subEl);
      row.appendChild(mid);
      row.appendChild(iconEl('chevR', 14));
      body.appendChild(row);
    });
  }
  wrap.appendChild(mCard({ title: `${t('test.all_attempts') || 'Все попытки'} · ${attempts.length}` }, body));
  return wrap;
}

// ── Tab strip ───────────────────────────────────────────────────

function buildTabStrip(activeId, onSelect) {
  const strip = document.createElement('div');
  Object.assign(strip.style, {
    display: 'flex', gap: '4px',
    padding: '10px 14px',
    overflowX: 'auto',
    borderBottom: '1px solid var(--ink-soft)',
    position: 'sticky', top: '0',
    background: 'var(--paper)', zIndex: '5',
  });
  const tabs = [
    { id: 'overview',  label: t('test.tab.overview')  || 'Обзор' },
    { id: 'questions', label: t('test.tab.questions') || 'Вопросы' },
    { id: 'stats',     label: t('test.tab.stats')     || 'Статистика' },
    { id: 'access',    label: t('test.tab.access')    || 'Доступ' },
    { id: 'activity',  label: t('test.tab.activity')  || 'Активность' },
  ];
  for (const tab of tabs) {
    const isActive = tab.id === activeId;
    const btn = document.createElement('button');
    btn.type = 'button';
    Object.assign(btn.style, {
      padding: '6px 14px',
      border: '1.5px solid',
      borderColor: isActive ? 'var(--accent)' : 'var(--ink-soft)',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: isActive ? '600' : '500',
      background: isActive ? 'var(--accent-soft)' : 'var(--paper)',
      color: isActive ? 'var(--accent)' : 'var(--ink-fade)',
      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: '0',
      fontFamily: 'Inter, sans-serif',
    });
    btn.textContent = tab.label;
    btn.addEventListener('click', () => onSelect(tab.id));
    strip.appendChild(btn);
  }
  return strip;
}

// ── Main render ─────────────────────────────────────────────────

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.id;
  if (!testId) { navigate('/home'); return; }

  // Skeleton.
  const skeleton = document.createElement('div');
  skeleton.style.padding = '12px 16px';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    Object.assign(s.style, {
      height: '70px', borderRadius: 'var(--radius-md)', marginBottom: '8px',
    });
    skeleton.appendChild(s);
  }
  mShell({
    root,
    topbar: topBar({ title: '…', back: true, backHref: '#/home' }),
    body: skeleton,
    hideNav: true,
  });

  let test = null;
  let attempts = [];
  let getTestErr = null;
  try {
    const [tRes, aRes] = await Promise.allSettled([
      getTest(testId),
      listAttempts({ status: 'completed', limit: 50, testId }),
    ]);
    if (stale()) return;
    if (tRes.status === 'fulfilled') test = tRes.value;
    else getTestErr = tRes.reason;
    if (aRes.status === 'fulfilled') {
      attempts = aRes.value?.attempts || aRes.value || [];
      attempts = attempts.filter(a => !a.testId || a.testId === testId);
    }
  } catch { /* fall through */ }
  if (stale()) return;
  if (!test) {
    const status = getTestErr?.status || getTestErr?.response?.status;
    if (status === 403) { navigate(`/error/403?testId=${encodeURIComponent(testId)}`); return; }
    navigate('/error/404'); return;
  }

  let activeTab = (params.tab && ['overview','questions','stats','access','activity'].includes(params.tab))
    ? params.tab : 'overview';

  // Fetch K/D stats once for the questions tab.
  let kdByQ = {};
  try {
    const ks = await getMyQuestionStats(testId);
    for (const s of (ks.questions || [])) kdByQ[String(s.questionId)] = s;
  } catch (_) { kdByQ = {}; }

  // Assemble body — strip stays at top, tab body underneath.
  const bodyEl = document.createElement('div');
  let strip = buildTabStrip(activeTab, switchTo);
  bodyEl.appendChild(strip);
  const tabBody = document.createElement('div');
  bodyEl.appendChild(tabBody);

  function renderActive() {
    tabBody.replaceChildren();
    if (activeTab === 'overview')       tabBody.appendChild(renderOverviewTab(test, attempts));
    else if (activeTab === 'questions') tabBody.appendChild(renderQuestionsTab(test, kdByQ));
    else if (activeTab === 'stats')     tabBody.appendChild(renderStatsTab(test, attempts));
    else if (activeTab === 'access')    tabBody.appendChild(renderAccessTab(test));
    else if (activeTab === 'activity')  tabBody.appendChild(renderActivityTab(test, attempts));
  }
  function switchTo(id) {
    activeTab = id;
    const newStrip = buildTabStrip(activeTab, switchTo);
    strip.replaceWith(newStrip);
    strip = newStrip;
    renderActive();
    bodyEl.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  renderActive();

  // Topbar right slot — settings cog (owner only).
  const right = document.createElement('div');
  Object.assign(right.style, { display: 'flex', gap: '4px' });
  if (test.is_owner) {
    const cog = document.createElement('button');
    cog.type = 'button';
    cog.setAttribute('aria-label', t('common.settings') || 'Настройки');
    Object.assign(cog.style, {
      padding: '6px', color: 'var(--ink-fade)',
      background: 'none', border: 'none', cursor: 'pointer',
    });
    cog.appendChild(iconEl('cog', 18));
    cog.addEventListener('click', () => navigate(`/test/${testId}/edit`));
    right.appendChild(cog);
  }
  const topbarEl = topBar({
    title: test.title || '—',
    back: true, backHref: '#/home',
    right,
  });

  // Sticky CTA bar — Доступ + Начать тест.
  const sticky = mSticky(
    mBtn({
      full: true,
      onClick: () => switchTo('access'),
    }, iconEl('share', 14), t('access.label') || 'Доступ'),
    mBtn({
      primary: true, full: true,
      onClick: () => navigate(`/test/${testId}/start`),
    }, iconEl('play', 14), t('test.start') || 'Начать тест'),
  );

  mShell({ root, topbar: topbarEl, body: bodyEl, sticky, hideNav: true });
}
