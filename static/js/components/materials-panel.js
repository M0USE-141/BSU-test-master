/**
 * components/materials-panel.js — modal listing every image / formula
 * attached to a test. Each item shows a rendered preview, the 7-char
 * short ID, and "Скопировать ID" / "Вставить" actions.
 *
 * Usage:
 *   import { openMaterialsPanel } from './materials-panel.js';
 *   openMaterialsPanel({
 *     testId,
 *     canEdit,            // disables Upload buttons for non-owners
 *     onInsert: (token) => …  // called with [[img:id]] or [[mathml:id]]
 *   });
 */
import { listMaterials, uploadMaterial, deleteMaterial } from '../api/materials.js';
import { toast } from './toast.js';
import { confirm as confirmDialog } from './confirm-dialog.js';
import { iconEl } from '../icons.js';
import { renderContent, typesetMath, hasFormulas } from '../utils/render-blocks.js';

/**
 * @param {Object} opts
 * @param {string}  opts.testId
 * @param {boolean} [opts.canEdit]
 * @param {(token: string) => void} [opts.onInsert]
 * @param {(item: any) => void}     [opts.onUpload]
 */
export function openMaterialsPanel(opts) {
  const testId = opts.testId;
  const canEdit = !!opts.canEdit;
  const onInsert = opts.onInsert || function () {};
  const onUpload = opts.onUpload || function () {};
  const onDelete = opts.onDelete || function () {};
  // Optional reference counter: caller can pass a function that returns
  // how many questions reference a given material ID. Used to confirm
  // deletions and to surface a "в использовании" badge on each card.
  const refCount = typeof opts.refCount === 'function' ? opts.refCount : function () { return 0; };
  const assetsBase = `/api/tests/${testId}/assets`;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) close();
  });

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '780px';
  modal.style.width = '92vw';
  modal.style.maxHeight = '85vh';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  backdrop.appendChild(modal);

  // Header.
  const head = document.createElement('div');
  head.className = 'modal__head';
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  head.style.padding = '14px 18px';
  head.style.borderBottom = '1px solid var(--ink-soft)';
  const headLeft = document.createElement('div');
  const title = document.createElement('div');
  title.style.fontWeight = 'var(--fw-semibold)';
  title.style.fontSize = '15px';
  title.textContent = '📚 Материалы теста';
  headLeft.appendChild(title);
  const hint = document.createElement('div');
  hint.style.fontSize = '12px';
  hint.style.color = 'var(--ink-tertiary)';
  hint.style.marginTop = '2px';
  hint.textContent = 'Изображения и MathML формулы. Используйте короткий ID в [[img:…]] или [[mathml:…]]';
  headLeft.appendChild(hint);
  head.appendChild(headLeft);

  const headRight = document.createElement('div');
  headRight.style.display = 'flex';
  headRight.style.gap = '6px';

  if (canEdit) {
    headRight.appendChild(uploadButton('Загрузить картинку', 'upload', 'image/*', async function (file) {
      await doUpload(file);
    }));
    headRight.appendChild(uploadButton('Загрузить MathML', 'upload', '.mml,.xml,.mathml,application/xml,text/xml', async function (file) {
      await doUpload(file);
    }));
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost btn--icon';
  closeBtn.appendChild(iconEl('x', 16));
  closeBtn.addEventListener('click', close);
  headRight.appendChild(closeBtn);
  head.appendChild(headRight);
  modal.appendChild(head);

  // Body.
  const body = document.createElement('div');
  body.style.flex = '1';
  body.style.overflowY = 'auto';
  body.style.padding = '14px 18px';
  modal.appendChild(body);

  // Filter chips (Все / Картинки / Формулы).
  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '6px';
  filterRow.style.marginBottom = '12px';
  let activeFilter = 'all';
  const filterChips = {};
  ['all', 'image', 'formula'].forEach(function (key) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip--small' + (key === 'all' ? ' chip--active' : '');
    chip.textContent = key === 'all' ? 'все' : key === 'image' ? 'картинки' : 'формулы';
    chip.addEventListener('click', function () {
      activeFilter = key;
      Object.keys(filterChips).forEach(function (k) {
        filterChips[k].classList.toggle('chip--active', k === key);
      });
      renderList();
    });
    filterChips[key] = chip;
    filterRow.appendChild(chip);
  });
  body.appendChild(filterRow);

  // Grid container.
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
  grid.style.gap = '10px';
  body.appendChild(grid);

  document.body.appendChild(backdrop);

  let materials = [];
  load();

  function close() {
    backdrop.remove();
  }

  async function load() {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--ink-tertiary);">Загрузка…</div>';
    try {
      const resp = await listMaterials(testId);
      materials = (resp && resp.items) || [];
    } catch (e) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--error);">Не удалось загрузить материалы</div>';
      return;
    }
    renderList();
  }

  function renderList() {
    grid.innerHTML = '';
    const items = activeFilter === 'all'
      ? materials
      : materials.filter(function (m) { return m.kind === activeFilter; });

    // Update chip counts.
    filterChips.all.textContent = 'все · ' + materials.length;
    filterChips.image.textContent = 'картинки · ' + materials.filter(function (m) { return m.kind === 'image'; }).length;
    filterChips.formula.textContent = 'формулы · ' + materials.filter(function (m) { return m.kind === 'formula'; }).length;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.gridColumn = '1 / -1';
      empty.style.padding = '32px';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--ink-tertiary)';
      empty.textContent = canEdit
        ? 'Пусто. Загрузите картинку или MathML кнопками сверху.'
        : 'Владелец ещё не добавил материалы.';
      grid.appendChild(empty);
      return;
    }

    items.forEach(function (m) {
      grid.appendChild(buildCard(m));
    });
  }

  function buildCard(m) {
    const card = document.createElement('div');
    card.style.border = '1px solid var(--ink-soft)';
    card.style.borderRadius = '8px';
    card.style.padding = '10px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.background = 'var(--paper)';

    // Preview.
    const preview = document.createElement('div');
    preview.style.height = '100px';
    preview.style.display = 'flex';
    preview.style.alignItems = 'center';
    preview.style.justifyContent = 'center';
    preview.style.background = 'var(--ink-soft)';
    preview.style.borderRadius = '6px';
    preview.style.overflow = 'hidden';

    if (m.kind === 'image') {
      const img = document.createElement('img');
      img.src = assetsBase + '/' + m.src;
      img.alt = m.name || m.id;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      preview.appendChild(img);
    } else if (m.kind === 'formula') {
      const blocks = { blocks: [{ type: 'paragraph', inlines: [{ type: 'formula', mathml: m.mathml || '' }] }] };
      const html = renderContent(blocks, assetsBase);
      preview.innerHTML = html || '<i style="color:var(--ink-tertiary);">пусто</i>';
      if (hasFormulas(html)) typesetMath(preview);
    }
    card.appendChild(preview);

    // Meta row.
    const uses = refCount(m.id);
    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.justifyContent = 'space-between';
    meta.style.alignItems = 'center';
    meta.style.gap = '6px';
    meta.style.fontSize = '11px';
    const idEl = document.createElement('code');
    idEl.className = 'mono';
    idEl.style.padding = '2px 6px';
    idEl.style.background = 'var(--ink-soft)';
    idEl.style.borderRadius = '3px';
    idEl.style.fontSize = '11px';
    idEl.textContent = m.id;
    meta.appendChild(idEl);
    if (uses > 0) {
      const usesTag = document.createElement('span');
      usesTag.className = 'tag tag--success';
      usesTag.style.fontSize = '10px';
      usesTag.textContent = 'исп. в ' + uses;
      meta.appendChild(usesTag);
    }
    const kindLbl = document.createElement('span');
    kindLbl.style.color = 'var(--ink-tertiary)';
    kindLbl.style.marginLeft = 'auto';
    kindLbl.textContent = m.kind === 'image' ? 'image' : 'formula';
    meta.appendChild(kindLbl);
    card.appendChild(meta);

    // Action row.
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '4px';

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'btn btn--primary btn--small';
    insertBtn.style.flex = '1';
    insertBtn.textContent = 'Вставить';
    insertBtn.addEventListener('click', function () {
      const token = (m.kind === 'image' ? '[[img:' : '[[mathml:') + m.id + ']]';
      onInsert(token);
      toast('Вставлено: ' + token, { tone: 'success' });
      close();
    });
    actions.appendChild(insertBtn);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn--ghost btn--small';
    copyBtn.title = 'Скопировать ID';
    copyBtn.textContent = '⧉';
    copyBtn.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(m.id);
        toast('ID скопирован: ' + m.id, { tone: 'success' });
      } catch (_) {
        toast('Не удалось скопировать', { tone: 'error' });
      }
    });
    actions.appendChild(copyBtn);

    if (canEdit) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn--small btn--danger';
      delBtn.title = 'Удалить материал';
      delBtn.appendChild(iconEl('trash', 12));
      delBtn.addEventListener('click', async function () {
        const usesNow = refCount(m.id);
        const message = usesNow > 0
          ? `Этот материал используется в ${usesNow} вопрос(ах). Они продолжат существовать, но ссылка станет битой — вы увидите предупреждение в редакторе. Удалить?`
          : 'Файл будет удалён безвозвратно.';
        const ok = await confirmDialog({
          title: 'Удалить ' + m.id + '?',
          message: message,
          danger: true,
          confirmLabel: 'Удалить',
        });
        if (!ok) return;
        try {
          await deleteMaterial(testId, m.id);
          toast('Материал удалён', { tone: 'success' });
          onDelete(m);
          load();
        } catch (e) {
          toast((e && e.message) || 'Не удалось удалить', { tone: 'error' });
        }
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);
    return card;
  }

  async function doUpload(file) {
    if (!file) return;
    try {
      const res = await uploadMaterial(testId, file);
      toast('Загружено: ' + res.id, { tone: 'success' });
      onUpload(res);
      load();
    } catch (e) {
      toast((e && e.message) || 'Не удалось загрузить', { tone: 'error' });
    }
  }
}

function uploadButton(label, icon, accept, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn--ghost btn--small';
  b.appendChild(iconEl(icon, 12));
  const sp = document.createElement('span');
  sp.textContent = ' ' + label;
  b.appendChild(sp);
  b.addEventListener('click', function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = function () {
      if (input.files && input.files[0]) onPick(input.files[0]);
    };
    input.click();
  });
  return b;
}
