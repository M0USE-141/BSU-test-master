/**
 * screens/mobile/tests-list.js — Mobile test collection browser
 * Route: /tests
 *
 * Tabs: My | Shared | Public — filtered client-side from a single listTests() call.
 */
import { listTests } from '../../api/tests.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { buildBottomNav, esc } from './_shell.js';

let _renderToken = 0;

export default async function render(root) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const state = getState();
  const userId = state.user?.id;

  // ── Skeleton ─────────────────────────────────────────────────
  root.innerHTML = `
    <div class="mob">
      <div class="mob-topbar" style="flex-shrink:0;">
        <span class="mob-topbar__title">${t('nav.tests') || 'Tests'}</span>
      </div>
      <div class="mob__content">
        <div class="mob-home">
          <div class="skeleton" style="height:36px;border-radius:var(--radius-pill);margin-bottom:12px;"></div>
          ${[1, 2, 3, 4].map(() =>
            `<div class="skeleton" style="height:56px;border-radius:var(--radius-md);margin-bottom:8px;"></div>`
          ).join('')}
        </div>
      </div>
    </div>`;

  // ── Fetch ─────────────────────────────────────────────────────
  let tests = [];
  try {
    const res = await listTests();
    if (stale()) return;
    tests = res?.tests || res || [];
    if (!Array.isArray(tests)) tests = [];
  } catch { if (stale()) return; }

  if (stale()) return;

  let filter = 'my';

  function filterTests() {
    switch (filter) {
      case 'my':     return tests.filter(c => c.owner_id === userId);
      case 'shared': return tests.filter(c => c.access_level === 'shared' && c.owner_id !== userId);
      case 'public': return tests.filter(c => c.access_level === 'public');
      default:       return tests;
    }
  }

  function buildList() {
    const visible = filterTests();
    if (!visible.length) {
      return `<div class="mob-empty">
        <div class="mob-empty__text">${t('test.empty') || 'No tests here yet'}</div>
      </div>`;
    }
    return visible.map(test => {
      const qc   = test.questionCount ?? test.question_count ?? 0;
      const desc = test.description ? esc(test.description).slice(0, 55) : '';
      return `
        <a class="mob-test-card" href="#/test/${test.id}">
          <div class="mob-test-card__body">
            <div class="mob-test-card__title">${esc(test.title || t('test.untitled') || 'Untitled')}</div>
            <div class="mob-test-card__meta">
              ${qc} ${t('test.questions') || 'q'}${desc ? ` · ${desc}` : ''}
            </div>
          </div>
          ${iconEl('chevR', 14)?.outerHTML || ''}
        </a>`;
    }).join('');
  }

  // ── Build screen ──────────────────────────────────────────────
  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.innerHTML = `
    <div class="mob-topbar" style="flex-shrink:0;">
      <span class="mob-topbar__title">${t('nav.tests') || 'Tests'}</span>
    </div>
    <div class="mob__content">
      <div class="mob-home">

        <div class="mob-segment" id="mob-tl-seg">
          ${['my', 'shared', 'public'].map(f => `
            <div class="mob-segment__item ${filter === f ? 'mob-segment__item--active' : ''}"
                 data-filter="${f}">
              ${f === 'my'     ? (t('common.my')     || 'My')
              : f === 'shared' ? (t('common.shared') || 'Shared')
              :                  (t('common.public') || 'Public')}
            </div>`).join('')}
        </div>

        <div id="mob-tl-list">${buildList()}</div>

      </div>
    </div>`;

  screen.querySelector('#mob-tl-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    screen.querySelectorAll('.mob-segment__item').forEach(el => {
      el.classList.toggle('mob-segment__item--active', el.dataset.filter === filter);
    });
    screen.querySelector('#mob-tl-list').innerHTML = buildList();
  });

  screen.appendChild(buildBottomNav('tests'));
  root.innerHTML = '';
  root.appendChild(screen);
}
