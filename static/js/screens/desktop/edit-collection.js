/**
 * screens/desktop/edit-collection.js — Collection settings page (new in v2.1).
 *
 * Route: #/test/:id/edit
 *
 * Standalone settings form for a collection: title, description, access level.
 * Owner-only; access enforced server-side by access_service.can_edit_test on
 * each mutating endpoint.
 */
import { getTest, updateTest } from '../../api/tests.js';
import { updateTestAccess } from '../../api/access.js';
import { navigate } from '../../router.js';
import { mountAppShell } from '../../components/app-shell.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';
import { iconEl } from '../../icons.js';
import { getState } from '../../state.js';

export default async function render(root, params) {
  params = params || {};
  const main = mountAppShell(root);
  main.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.style.overflowY = 'auto';
  wrap.style.padding = 'var(--sp-5)';
  main.appendChild(wrap);

  const card = document.createElement('div');
  card.style.width = '100%';
  card.style.maxWidth = '760px';
  card.style.margin = '0 auto';
  card.style.background = 'var(--paper)';
  card.style.border = 'var(--border)';
  card.style.borderRadius = 'var(--radius-lg)';
  card.style.boxShadow = 'var(--shadow-md)';
  card.style.padding = 'var(--sp-5)';
  wrap.appendChild(card);

  const skel = document.createElement('div');
  skel.className = 'skeleton';
  skel.style.height = '280px';
  skel.style.borderRadius = 'var(--radius-md)';
  card.appendChild(skel);

  let test;
  try {
    test = await getTest(params.id);
  } catch (e) {
    if (e && e.status === 403) {
      navigate('/error/403?testId=' + encodeURIComponent(params.id));
      return;
    }
    card.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    const t = document.createElement('div');
    t.className = 'empty__title';
    t.textContent = 'Не удалось загрузить тест';
    empty.appendChild(t);
    card.appendChild(empty);
    return;
  }

  const me = getState().user;
  const isOwner = !!(test.is_owner || (me && test.owner_id === me.id));
  if (!isOwner) {
    navigate('/error/403?testId=' + encodeURIComponent(params.id));
    return;
  }

  card.innerHTML = '';
  renderForm(card, test);
}

function renderForm(card, test) {
  // Header.
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.gap = 'var(--sp-3)';
  head.style.marginBottom = 'var(--sp-4)';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn btn--ghost btn--small';
  back.textContent = '← Назад';
  back.addEventListener('click', function () {
    navigate('/home?id=' + encodeURIComponent(test.id));
  });
  head.appendChild(back);

  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '22px';
  titleEl.style.letterSpacing = '-0.01em';
  titleEl.style.fontWeight = 'var(--fw-bold)';
  titleEl.style.margin = '0';
  titleEl.textContent = 'Настройки коллекции';
  head.appendChild(titleEl);

  card.appendChild(head);

  // Track dirty state for sticky save bar.
  const state = {
    title: test.title || '',
    description: test.description || '',
    access_level: test.access_level || 'private',
  };
  const original = JSON.parse(JSON.stringify(state));

  // Title field.
  card.appendChild(fieldLabel('Название'));
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'input';
  titleInput.value = state.title;
  titleInput.style.marginBottom = 'var(--sp-4)';
  titleInput.addEventListener('input', function () {
    state.title = titleInput.value;
    refreshSaveBar();
  });
  card.appendChild(titleInput);

  // Description.
  card.appendChild(fieldLabel('Описание'));
  const descInput = document.createElement('textarea');
  descInput.className = 'textarea';
  descInput.value = state.description;
  descInput.rows = 5;
  descInput.style.marginBottom = 'var(--sp-4)';
  descInput.addEventListener('input', function () {
    state.description = descInput.value;
    refreshSaveBar();
  });
  card.appendChild(descInput);

  // Access level.
  card.appendChild(fieldLabel('Доступ'));
  const accessRow = document.createElement('div');
  accessRow.style.display = 'flex';
  accessRow.style.gap = '6px';
  accessRow.style.flexWrap = 'wrap';
  accessRow.style.marginBottom = '4px';
  const accessChips = {};
  [
    ['private', 'Приватный'],
    ['shared',  'Shared'],
    ['public',  'Public'],
  ].forEach(function (entry) {
    const key = entry[0];
    const label = entry[1];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.access_level === key ? ' chip--active' : '');
    chip.dataset.level = key;
    chip.textContent = label;
    chip.addEventListener('click', function () {
      state.access_level = key;
      Object.keys(accessChips).forEach(function (k) {
        accessChips[k].classList.toggle('chip--active', k === key);
      });
      refreshAccessHint();
      refreshSaveBar();
    });
    accessChips[key] = chip;
    accessRow.appendChild(chip);
  });
  card.appendChild(accessRow);

  const accessHint = document.createElement('div');
  accessHint.style.fontSize = 'var(--fs-sm)';
  accessHint.style.color = 'var(--ink-secondary)';
  accessHint.style.marginTop = '6px';
  accessHint.style.marginBottom = 'var(--sp-4)';
  function refreshAccessHint() {
    const map = {
      private: 'Видите только вы. Можно приглашать через «Shared».',
      shared:  'Видят только люди из списка «Поделено с». Запросы доступа сюда тоже идут.',
      public:  'Видят все вошедшие пользователи. Появится в публичном каталоге.',
    };
    accessHint.textContent = map[state.access_level] || '';
  }
  refreshAccessHint();
  card.appendChild(accessHint);

  // Divider.
  const divider = document.createElement('hr');
  divider.className = 'divider';
  divider.style.margin = 'var(--sp-5) 0';
  card.appendChild(divider);

  // Sticky save bar.
  const saveBar = document.createElement('div');
  saveBar.style.position = 'sticky';
  saveBar.style.bottom = '0';
  saveBar.style.background = 'var(--paper)';
  saveBar.style.borderTop = '1px solid var(--ink-soft)';
  saveBar.style.padding = 'var(--sp-3) 0 0';
  saveBar.style.display = 'flex';
  saveBar.style.alignItems = 'center';
  saveBar.style.justifyContent = 'space-between';
  saveBar.style.gap = 'var(--sp-3)';

  const dirtyHint = document.createElement('div');
  dirtyHint.style.fontSize = 'var(--fs-sm)';
  dirtyHint.style.color = 'var(--ink-secondary)';
  saveBar.appendChild(dirtyHint);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--sp-2)';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', function () {
    navigate('/home?id=' + encodeURIComponent(test.id));
  });
  btnRow.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary';
  saveBtn.appendChild(iconEl('check', 14));
  const saveLabel = document.createElement('span');
  saveLabel.textContent = ' Сохранить';
  saveBtn.appendChild(saveLabel);
  saveBtn.addEventListener('click', save);
  btnRow.appendChild(saveBtn);

  saveBar.appendChild(btnRow);
  card.appendChild(saveBar);

  function refreshSaveBar() {
    const dirty = state.title !== original.title
               || state.description !== original.description
               || state.access_level !== original.access_level;
    saveBtn.disabled = !dirty || !state.title.trim();
    dirtyHint.textContent = dirty ? 'Несохранённые изменения' : '';
  }
  refreshSaveBar();

  async function save() {
    if (!state.title.trim()) {
      toast('Название не может быть пустым', { tone: 'error' });
      return;
    }
    saveBtn.disabled = true;
    try {
      // Title/description (skip if unchanged).
      if (state.title !== original.title || state.description !== original.description) {
        await updateTest(test.id, {
          title: state.title.trim(),
          description: state.description,
        });
      }
      // Access level (separate endpoint).
      if (state.access_level !== original.access_level) {
        await updateTestAccess(test.id, state.access_level);
      }
      original.title = state.title;
      original.description = state.description;
      original.access_level = state.access_level;
      refreshSaveBar();
      toast('Настройки сохранены', { tone: 'success' });
    } catch (e) {
      saveBtn.disabled = false;
      toast((e && e.message) || 'Не удалось сохранить', { tone: 'error' });
    }
  }
}

function fieldLabel(text) {
  const el = document.createElement('div');
  el.className = 'caps';
  el.style.marginBottom = '6px';
  el.textContent = text;
  return el;
}
