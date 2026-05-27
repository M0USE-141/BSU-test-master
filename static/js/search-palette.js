/**
 * search-palette.js — Global cmd-K search palette
 * Injects a floating overlay into document.body.
 * Open: cmd+K / ctrl+K or call openSearchPalette()
 * Close: Escape, clicking backdrop, or selecting a result
 */
import { listTests } from './api/tests.js';
import { navigate } from './router.js';
import { t } from './utils/locale.js';
import { iconEl } from './icons.js';
import { escHtml as esc } from './utils/escape.js';

let _overlay = null;
let _tests = [];
let _query = '';
let _activeIdx = 0;

// ── Commands ─────────────────────────────────────────────────

function getCommands() {
  return [
    { icon: 'plus',   label: t('test.create')      || 'Create test',     action: () => navigate('/home') },
    { icon: 'upload', label: t('test.import')      || 'Import .docx',    action: () => navigate('/import') },
    { icon: 'globe',  label: t('discover.title')   || 'Public catalog',  action: () => navigate('/discover') },
    { icon: 'chart',  label: t('nav.stats')        || 'Statistics',      action: () => navigate('/stats') },
    { icon: 'cog',    label: t('nav.settings')     || 'Settings',        action: () => navigate('/settings') },
    { icon: 'bell',   label: t('nav.notifications')|| 'Notifications',   action: () => navigate('/notifications') },
  ];
}

// ── Filtered results ──────────────────────────────────────────

function getResults(q) {
  const qLow = q.toLowerCase().trim();
  if (!qLow) return { tests: [], commands: getCommands() };

  const tests = _tests
    .filter(t => t.title?.toLowerCase().includes(qLow))
    .slice(0, 6);
  const commands = getCommands()
    .filter(c => c.label.toLowerCase().includes(qLow));

  return { tests, commands };
}

// ── Render palette ────────────────────────────────────────────

function _render() {
  if (!_overlay) return;

  const palette = _overlay.querySelector('.search-palette');
  if (!palette) return;

  const list = palette.querySelector('.search-palette__list');
  if (!list) return;

  const { tests, commands } = getResults(_query);
  const allItems = [
    ...tests.map(t => ({ type: 'test', data: t })),
    ...commands.map(c => ({ type: 'cmd', data: c })),
  ];

  if (_activeIdx >= allItems.length) _activeIdx = 0;

  let html = '';

  if (!_query.trim()) {
    // Default: show commands
    html += `<div class="search-palette__section">Commands</div>`;
    getCommands().forEach((cmd, i) => {
      html += `
        <div class="search-palette__item ${i === _activeIdx ? 'search-palette__item--active' : ''}"
             data-idx="${i}" data-type="cmd" data-action="${i}">
          <div class="search-palette__item-icon">${iconEl(cmd.icon, 14)?.outerHTML || ''}</div>
          <div class="search-palette__item-body">
            <div class="search-palette__item-title">${esc(cmd.label)}</div>
          </div>
          <span class="search-palette__item-hint">↵</span>
        </div>`;
    });
    if (!allItems.length && _query) {
      html = `<div class="search-palette__empty">${esc(t('common.no_results') || 'No results')}</div>`;
    }
  } else {
    let idx = 0;

    if (tests.length) {
      html += `<div class="search-palette__section">Tests · ${tests.length}</div>`;
      tests.forEach(test => {
        const qCount = test.questionCount ?? test.question_count ?? '';
        html += `
          <div class="search-palette__item ${idx === _activeIdx ? 'search-palette__item--active' : ''}"
               data-idx="${idx}" data-type="test" data-id="${esc(test.id)}">
            <div class="search-palette__item-icon">${iconEl('doc', 14)?.outerHTML || ''}</div>
            <div class="search-palette__item-body">
              <div class="search-palette__item-title">${esc(test.title)}</div>
              ${qCount ? `<div class="search-palette__item-sub">${esc(String(qCount))} ${t('common.questions') || 'questions'}</div>` : ''}
            </div>
            <span class="search-palette__item-hint">↵ open</span>
          </div>`;
        idx++;
      });
    }

    if (commands.length) {
      html += `<div class="search-palette__section">Commands</div>`;
      commands.forEach(cmd => {
        html += `
          <div class="search-palette__item ${idx === _activeIdx ? 'search-palette__item--active' : ''}"
               data-idx="${idx}" data-type="cmd" data-action-label="${esc(cmd.label)}">
            <div class="search-palette__item-icon">${iconEl(cmd.icon, 14)?.outerHTML || ''}</div>
            <div class="search-palette__item-body">
              <div class="search-palette__item-title">${esc(cmd.label)}</div>
            </div>
            <span class="search-palette__item-hint">↵</span>
          </div>`;
        idx++;
      });
    }

    if (!tests.length && !commands.length) {
      html = `<div class="search-palette__empty">${esc(t('common.no_results') || 'No results for "')}${esc(_query)}"</div>`;
    }
  }

  list.innerHTML = html;

  // Bind click handlers
  list.querySelectorAll('.search-palette__item').forEach(item => {
    item.addEventListener('click', () => _selectItem(item));
    item.addEventListener('mouseenter', () => {
      _activeIdx = parseInt(item.dataset.idx || '0', 10);
      _render();
    });
  });
}

function _selectItem(item) {
  if (!item) return;
  const type = item.dataset.type;
  if (type === 'test') {
    navigate(`/collection/${item.dataset.id}`);
  } else if (type === 'cmd') {
    // Find command by label
    const label = item.dataset.actionLabel || item.querySelector('.search-palette__item-title')?.textContent?.trim();
    const cmd = getCommands().find(c => c.label === label);
    if (cmd) cmd.action();
  }
  close();
}

function _selectActive() {
  const item = _overlay?.querySelector(`.search-palette__item[data-idx="${_activeIdx}"]`);
  if (item) _selectItem(item);
}

// ── Public API ────────────────────────────────────────────────

export function openSearchPalette() {
  if (_overlay) { close(); return; }

  // Pre-load tests in background
  listTests().then(data => {
    _tests = Array.isArray(data) ? data : (data?.tests || data?.items || []);
    _render();
  }).catch(() => {});

  // Build overlay
  _overlay = document.createElement('div');
  _overlay.className = 'search-palette-overlay';
  _overlay.innerHTML = `
    <div class="search-palette">
      <div class="search-palette__input-row">
        ${iconEl('search', 18)?.outerHTML || ''}
        <input class="search-palette__input"
               type="text"
               placeholder="${esc(t('nav.search') || 'Search tests, questions…')}"
               autocomplete="off" spellcheck="false"
               value="${esc(_query)}">
        <span class="search-palette__hint">Esc</span>
      </div>
      <div class="search-palette__list"></div>
    </div>`;

  // Close on backdrop click
  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) close();
  });

  // Input handler
  const input = _overlay.querySelector('.search-palette__input');
  input?.addEventListener('input', e => {
    _query = e.target.value;
    _activeIdx = 0;
    _render();
  });

  // Keyboard nav inside palette
  input?.addEventListener('keydown', e => {
    const { tests, commands } = getResults(_query);
    const total = !_query.trim()
      ? getCommands().length
      : tests.length + commands.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = (_activeIdx + 1) % Math.max(total, 1);
      _render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = (_activeIdx - 1 + Math.max(total, 1)) % Math.max(total, 1);
      _render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      _selectActive();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  document.body.appendChild(_overlay);
  requestAnimationFrame(() => input?.focus());
  _render();
}

export function close() {
  _overlay?.remove();
  _overlay = null;
  _query = '';
  _activeIdx = 0;
}

// ── Global keyboard shortcut ──────────────────────────────────

export function initSearchPalette() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearchPalette();
    }
  });
}
