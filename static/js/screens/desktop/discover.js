/**
 * screens/desktop/discover.js — public catalog (Phase 5).
 *
 * Route: #/discover
 *
 * AppShell-wrapped grid of public tests with a sort toggle
 * (Популярные / Новые / Лучшие). Per-test stats (attempts_count,
 * avg_score) come from the `/api/tests?filter=public&with_stats=true`
 * endpoint added this turn — sorting happens server-side.
 *
 * Card click → /test/:id/start so the user lands in the pre-test
 * screen rather than auto-starting an attempt.
 */
import { listTests } from '../../api/tests.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { iconEl } from '../../icons.js';
import { t } from '../../utils/locale.js';

let _renderToken = 0;

export default async function render(root, params) {
  params = params || {};
  const token = ++_renderToken;
  const stale = function () { return _renderToken !== token; };

  const main = mountAppShell(root);
  main.innerHTML = '';

  // ── Header strip ──
  const head = document.createElement('div');
  head.style.padding = 'var(--sp-5) var(--sp-6) 0';
  head.style.borderBottom = '1px solid var(--ink-soft)';
  head.style.flexShrink = '0';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'baseline';
  titleRow.style.gap = 'var(--sp-3)';
  titleRow.style.marginBottom = 'var(--sp-1)';

  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '24px';
  titleEl.style.fontWeight = 'var(--fw-bold)';
  titleEl.style.letterSpacing = '-0.01em';
  titleEl.style.margin = '0';
  titleEl.textContent = t('discover.title') || 'Public-каталог';
  titleRow.appendChild(titleEl);

  const totalCaps = document.createElement('div');
  totalCaps.className = 'caps';
  totalCaps.style.color = 'var(--ink-tertiary)';
  totalCaps.textContent = '';
  titleRow.appendChild(totalCaps);

  head.appendChild(titleRow);

  const subEl = document.createElement('div');
  subEl.style.fontSize = 'var(--fs-sm)';
  subEl.style.color = 'var(--ink-secondary)';
  subEl.style.marginBottom = 'var(--sp-3)';
  subEl.textContent = t('discover.subtitle') || 'Откройте тесты, которыми поделились другие.';
  head.appendChild(subEl);

  // Sort chips (pill-tabs variant from Phase 0).
  const state = { sort: params.sort || 'popular' };
  const sortRow = document.createElement('div');
  sortRow.className = 'tabs tabs--pill';
  sortRow.style.marginBottom = 'var(--sp-4)';

  const sortOptions = [
    { key: 'popular', label: t('discover.sort.popular') || 'Популярные' },
    { key: 'new',     label: t('discover.sort.new')     || 'Новые' },
    { key: 'best',    label: t('discover.sort.best')    || 'Лучшие' },
  ];
  const sortChips = {};
  sortOptions.forEach(function (s) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tabs__item' + (state.sort === s.key ? ' is-active' : '');
    item.dataset.key = s.key;
    item.textContent = s.label;
    item.addEventListener('click', function () {
      if (state.sort === s.key) return;
      state.sort = s.key;
      Object.keys(sortChips).forEach(function (k) {
        sortChips[k].classList.toggle('is-active', k === s.key);
      });
      history.replaceState({}, '', '#/discover?sort=' + s.key);
      loadGrid();
    });
    sortChips[s.key] = item;
    sortRow.appendChild(item);
  });
  head.appendChild(sortRow);
  main.appendChild(head);

  // ── Body (grid) ──
  const body = document.createElement('div');
  body.style.flex = '1';
  body.style.overflowY = 'auto';
  body.style.padding = 'var(--sp-4) var(--sp-6) var(--sp-6)';
  main.appendChild(body);

  async function loadGrid() {
    body.innerHTML = '';
    const skel = document.createElement('div');
    skel.className = 'skeleton';
    skel.style.height = '180px';
    skel.style.borderRadius = 'var(--radius-md)';
    body.appendChild(skel);

    let tests = [];
    try {
      const resp = await listTests({ filter: 'public', sort: state.sort, with_stats: true, limit: 60 });
      tests = (resp && resp.tests) || [];
    } catch (e) {
      body.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'empty';
      const errTitle = document.createElement('div');
      errTitle.className = 'empty__title';
      errTitle.textContent = (e && e.message) || 'Не удалось загрузить каталог';
      err.appendChild(errTitle);
      body.appendChild(err);
      return;
    }
    if (stale()) return;

    body.innerHTML = '';
    totalCaps.textContent = String(tests.length);

    if (tests.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const eTitle = document.createElement('div');
      eTitle.className = 'empty__title';
      eTitle.textContent = t('discover.empty') || 'Пока нет публичных тестов';
      empty.appendChild(eTitle);
      body.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    grid.style.gap = 'var(--sp-3)';

    tests.forEach(function (t) { grid.appendChild(buildCard(t)); });
    body.appendChild(grid);
  }

  loadGrid();
}

function buildCard(test) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card card--hover';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.alignItems = 'flex-start';
  card.style.gap = '6px';
  card.style.padding = 'var(--sp-4)';
  card.style.textAlign = 'left';
  card.style.cursor = 'pointer';
  card.style.font = 'inherit';

  // Top meta row.
  const meta = document.createElement('div');
  meta.style.display = 'flex';
  meta.style.alignItems = 'center';
  meta.style.gap = '8px';
  meta.style.width = '100%';
  meta.style.marginBottom = '2px';

  const pubChip = document.createElement('span');
  pubChip.className = 'tag tag--info';
  pubChip.textContent = 'PUBLIC';
  meta.appendChild(pubChip);

  if (test.owner_username) {
    const owner = document.createElement('span');
    owner.style.fontSize = 'var(--fs-xs)';
    owner.style.color = 'var(--ink-tertiary)';
    owner.textContent = (t.bind ? '' : '') + '@' + test.owner_username;
    meta.appendChild(owner);
  }

  card.appendChild(meta);

  // Title.
  const title = document.createElement('div');
  title.style.fontSize = 'var(--fs-md)';
  title.style.fontWeight = 'var(--fw-semibold)';
  title.style.lineHeight = '1.3';
  title.style.marginTop = '4px';
  title.textContent = test.title || test.id;
  card.appendChild(title);

  // Stats line.
  const stats = document.createElement('div');
  stats.style.display = 'flex';
  stats.style.gap = '14px';
  stats.style.fontSize = 'var(--fs-sm)';
  stats.style.color = 'var(--ink-secondary)';
  stats.style.marginTop = '6px';

  const qCount = test.questionCount || test.question_count || (test.questions && test.questions.length) || 0;
  const qSpan = document.createElement('span');
  qSpan.textContent = qCount + ' вопросов';
  stats.appendChild(qSpan);

  const aCount = test.attempts_count || 0;
  if (aCount > 0) {
    const aSpan = document.createElement('span');
    aSpan.textContent = aCount + ' попыток';
    stats.appendChild(aSpan);
  }

  if (typeof test.avg_score === 'number') {
    const score = Math.round(test.avg_score);
    const sSpan = document.createElement('span');
    const tone = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--error)';
    const toneSoft = score >= 80 ? 'var(--success-soft)' : score >= 60 ? 'var(--warning-soft)' : 'var(--error-soft)';
    sSpan.className = 'mono';
    sSpan.style.background = toneSoft;
    sSpan.style.color = tone;
    sSpan.style.padding = '1px 6px';
    sSpan.style.borderRadius = '999px';
    sSpan.textContent = 'avg ' + score + '%';
    stats.appendChild(sSpan);
  }

  card.appendChild(stats);

  card.addEventListener('click', function () {
    navigate('/test/' + encodeURIComponent(test.id) + '/start');
  });
  return card;
}
