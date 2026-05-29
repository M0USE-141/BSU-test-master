/**
 * mobile/edit-collection.js — Mobile collection editor (M6).
 *
 * Standalone full-screen form for owners to rename, re-describe, and
 * change the access level of a collection. Includes a "danger zone"
 * with an Archive placeholder and a real Delete action (typed-confirm
 * dialog → `deleteTest`).
 *
 * Backend wiring:
 *   - `getTest(id)` to load current title/description/access_level
 *   - `updateTest(id, {title, description})` for the save action
 *   - `updateTestAccess(id, level)` for the access change
 *   - `deleteTest(id)` for the delete action
 *
 * Mounted at `/test/:id/edit` (router selects this on mobile breakpoints).
 */
import { getTest, updateTest, deleteTest } from '../../api/tests.js';
import { updateTestAccess } from '../../api/access.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import { iconEl } from '../../icons.js';
import {
  topBar, mShell, mCard, mChip, mBtn, mSticky, mField, mRow,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';

let _renderToken = 0;

function firstInitial(s) {
  const ch = String(s || '?').trim().codePointAt(0) || 0x3F;
  return String.fromCodePoint(ch).toUpperCase();
}

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.id;
  if (!testId) { navigate('/home'); return; }

  // Skeleton.
  const skel = document.createElement('div');
  skel.style.padding = '14px 16px';
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton';
    Object.assign(r.style, { height: '80px', marginBottom: '8px', borderRadius: 'var(--radius-md)' });
    skel.appendChild(r);
  }
  mShell({
    root,
    topbar: topBar({
      title: t('edit.title') || 'Настройки коллекции',
      back: true, backHref: `#/test/${testId}`,
    }),
    body: skel, hideNav: true,
  });

  // Load.
  let test = null;
  try { test = await getTest(testId); }
  catch { navigate('/error/404'); return; }
  if (stale()) return;
  if (!test) { navigate('/error/404'); return; }
  if (!test.is_owner) {
    toast(t('edit.not_owner') || 'Только владелец может редактировать', { tone: 'error' });
    navigate(`/test/${testId}`);
    return;
  }

  // Local form state.
  let titleVal = test.title || '';
  let descVal  = test.description || '';
  let levelVal = (test.access_level || 'private').toLowerCase();
  const originalQCount = (test.questions || []).length;

  // ── Body ────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.padding = '14px 16px 24px';

  // Card 1: name + description.
  const nameDescBody = document.createElement('div');
  const titleField = mField({
    label: t('edit.field.title') || 'Название',
    value: titleVal,
    onInput: (v) => { titleVal = v; iconLetter.textContent = firstInitial(titleVal); },
  });
  nameDescBody.appendChild(titleField);
  const descField = mField({
    label: t('edit.field.description') || 'Описание',
    value: descVal,
    multiline: true,
    placeholder: t('edit.field.description.placeholder') || 'Краткое описание',
    hint: t('edit.field.description.hint') || 'Видно на карточке коллекции',
    onInput: (v) => { descVal = v; },
  });
  nameDescBody.appendChild(descField);
  body.appendChild(mCard({ title: t('edit.section.basics') || 'Название и описание' }, nameDescBody));

  // Card 2: access level chips.
  const accessBody = document.createElement('div');
  const accessRow = document.createElement('div');
  Object.assign(accessRow.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
  accessBody.appendChild(accessRow);
  function paintAccessRow() {
    accessRow.replaceChildren();
    const opts = [
      { id: 'private', label: t('access.private') || 'Приватный', icon: 'lock' },
      { id: 'shared',  label: t('access.shared')  || 'Shared',    icon: 'user' },
      { id: 'public',  label: t('access.public')  || 'Public',    icon: 'globe' },
    ];
    for (const o of opts) {
      const chip = mChip({
        active: levelVal === o.id,
        onClick: () => {
          if (levelVal === o.id) return;
          const prev = levelVal;
          levelVal = o.id;
          paintAccessRow();
          // Save inline — access is the only field with a dedicated API.
          updateTestAccess(testId, o.id).catch((er) => {
            levelVal = prev;
            paintAccessRow();
            toast(er.message || 'Ошибка', { tone: 'error' });
          });
        },
      }, iconEl(o.icon, 12), ' ' + o.label);
      accessRow.appendChild(chip);
    }
  }
  paintAccessRow();
  body.appendChild(mCard({ title: t('access.level') || 'Доступ' }, accessBody));

  // Card 3: icon (read-only placeholder — first letter of title).
  const iconBody = document.createElement('div');
  Object.assign(iconBody.style, { display: 'flex', alignItems: 'center', gap: '12px' });
  const iconLetter = document.createElement('div');
  Object.assign(iconLetter.style, {
    width: '56px', height: '56px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--accent-soft)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: '600', flexShrink: '0',
  });
  iconLetter.textContent = firstInitial(titleVal);
  iconBody.appendChild(iconLetter);
  const iconMeta = document.createElement('div');
  iconMeta.style.flex = '1';
  iconMeta.appendChild(mBtn({
    sm: true,
    onClick: () => toast(t('edit.icon.placeholder') || 'Загрузка иконки пока недоступна', { tone: 'info' }),
  }, iconEl('upload', 12), ' ' + (t('edit.icon.upload') || 'Загрузить')));
  const iconHint = document.createElement('div');
  Object.assign(iconHint.style, { fontSize: '10px', color: 'var(--ink-mute)', marginTop: '6px' });
  iconHint.textContent = t('edit.icon.hint') || 'Без — первая буква названия';
  iconMeta.appendChild(iconHint);
  iconBody.appendChild(iconMeta);
  body.appendChild(mCard({ title: t('edit.section.icon') || 'Иконка' }, iconBody));

  // Card 4: danger zone.
  const dangerBody = document.createElement('div');
  dangerBody.appendChild(mRow({
    icon: iconEl('doc', 14),
    title: t('edit.archive') || 'Архивировать',
    sub: t('edit.archive.hint') || 'Скрыть из списка',
    onClick: () => toast(t('edit.archive.placeholder') || 'Архивирование пока недоступно', { tone: 'info' }),
  }));
  dangerBody.appendChild(mRow({
    icon: iconEl('trash', 14),
    title: t('edit.delete') || 'Удалить коллекцию',
    sub: `${originalQCount} ${t('test.questions') || 'вопросов'}`,
    danger: true,
    onClick: () => confirmDialog({
      title: `${t('edit.delete.title') || 'Удалить'} «${titleVal || test.title}»?`,
      message: t('edit.delete.hint') || 'Действие необратимо. Введите название для подтверждения.',
      confirmLabel: t('edit.delete') || 'Удалить',
      danger: true,
      confirmText: titleVal || test.title,
      onConfirm: async () => {
        try {
          await deleteTest(testId);
          toast(t('edit.deleted_toast') || 'Удалено', { tone: 'success' });
          navigate('/home');
        } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
      },
    }),
  }));
  body.appendChild(mCard({ title: t('edit.section.danger') || 'Опасная зона', danger: true }, dangerBody));

  // Sticky CTA: Cancel + Save (save updates title/description; access is saved inline above).
  const sticky = mSticky(
    mBtn({
      full: true,
      onClick: () => navigate(`/test/${testId}`),
    }, t('common.cancel') || 'Отмена'),
    mBtn({
      primary: true, full: true,
      onClick: async () => {
        const newTitle = (titleVal || '').trim();
        if (!newTitle) {
          toast(t('edit.title_required') || 'Введите название', { tone: 'error' });
          return;
        }
        try {
          await updateTest(testId, {
            title: newTitle,
            description: (descVal || '').trim(),
          });
          toast(t('common.saved') || 'Сохранено', { tone: 'success' });
          navigate(`/test/${testId}`);
        } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
      },
    }, t('common.save') || 'Сохранить'),
  );

  mShell({
    root,
    topbar: topBar({
      title: t('edit.title') || 'Настройки коллекции',
      back: true, backHref: `#/test/${testId}`,
    }),
    body, sticky, hideNav: true,
  });
}
