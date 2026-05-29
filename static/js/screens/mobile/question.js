/**
 * mobile/question.js — Mobile question detail / editor (M6).
 *
 * Two modes: preview (default) and edit. Owners see "Edit" + delete;
 * non-owners see "Propose CR" (creates an `edit_question` change-request
 * via `createChangeRequest`). Add-mode is reached via `?new=1`.
 *
 * Backend:
 *   - `getTest(testId)` for the full question payload (text + options)
 *   - `updateQuestion(testId, qid, {question, options})` — owner save
 *   - `addQuestion(testId, blank)` — owner add (via ?new=1)
 *   - `deleteQuestion(testId, qid)` — owner delete
 *   - `createChangeRequest(testId, {type: 'edit_question', ...})` — non-owner
 *
 * Payload shape matches `static/js/components/question-editor.js`:
 *   question = { blocks: [{ type:'paragraph', inlines:[{type:'text', text}] }] }
 *   options  = [{ content: { blocks: [...] }, isCorrect: bool }, …]
 */
import { getTest } from '../../api/tests.js';
import {
  addQuestion, updateQuestion, deleteQuestion,
} from '../../api/questions.js';
import { createChangeRequest } from '../../api/change-requests.js';
import { listMaterials, uploadMaterial, deleteMaterial } from '../../api/materials.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import { iconEl } from '../../icons.js';
import {
  topBar, mShell, mCard, mBtn, mSticky, mField, caps,
} from '../../components/mobile-atoms.js';
import { toast } from '../../components/toast.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';

let _renderToken = 0;

// ── payload helpers ─────────────────────────────────────────────

function textFromBlocks(blocksOrString) {
  if (!blocksOrString) return '';
  if (typeof blocksOrString === 'string') return blocksOrString;
  const blocks = blocksOrString.blocks
    || (Array.isArray(blocksOrString) ? blocksOrString : []);
  return blocks
    .map(b => (b.inlines || []).map(i => i.text || '').join(''))
    .join('\n')
    .trim();
}

function blocksFromText(text) {
  // Split on newlines into paragraphs to preserve user layout.
  const lines = String(text || '').split(/\r?\n/);
  return {
    blocks: lines.map(line => ({
      type: 'paragraph',
      inlines: [{ type: 'text', text: line }],
    })),
  };
}

function optionText(opt) {
  if (!opt) return '';
  if (typeof opt === 'string') return opt;
  if (opt.text) return opt.text;
  return textFromBlocks(opt.content);
}

function correctIndex(q) {
  if (Number.isInteger(q.correctOptionIndex)) return q.correctOptionIndex;
  const opts = q.options || q.opts || [];
  return opts.findIndex(o => o && (o.isCorrect === true));
}

// ── Tag helper ─────────────────────────────────────────────────

function smallTag(text) {
  const tag = document.createElement('span');
  Object.assign(tag.style, {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
    fontSize: '10px', fontWeight: '600',
    letterSpacing: '.04em', textTransform: 'uppercase',
    background: 'var(--accent-soft)', color: 'var(--accent)',
  });
  tag.textContent = text;
  return tag;
}

// ── Main render ────────────────────────────────────────────────

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.id;
  const qid    = params.qid;
  const isNew  = String(params.new || '').toLowerCase() === '1';
  if (!testId) { navigate('/home'); return; }

  // Skeleton.
  const skel = document.createElement('div');
  skel.style.padding = '14px 16px';
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton';
    Object.assign(r.style, { height: '70px', marginBottom: '8px', borderRadius: 'var(--radius-md)' });
    skel.appendChild(r);
  }
  mShell({
    root,
    topbar: topBar({
      title: '…', back: true, backHref: `#/test/${testId}`,
    }),
    body: skel, hideNav: true,
  });

  // Load.
  let test = null;
  try { test = await getTest(testId); }
  catch { navigate('/error/404'); return; }
  if (stale()) return;
  if (!test) { navigate('/error/404'); return; }

  const questions = test.questions || [];
  let qIndex = -1;
  let q = null;

  if (isNew) {
    // Start the user in edit-mode with a blank question; on save we
    // POST via addQuestion and stop staying in 'new' state.
    q = {
      id: null,
      question: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: '' }] }] },
      options: [
        { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: '' }] }] }, isCorrect: true },
        { content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: '' }] }] }, isCorrect: false },
      ],
      topic: '',
    };
    qIndex = questions.length;
  } else {
    qIndex = questions.findIndex(x => String(x.id) === String(qid));
    if (qIndex < 0) { navigate(`/test/${testId}`); return; }
    q = questions[qIndex];
  }

  const isOwner = !!test.is_owner;
  // Edit-mode is the default for the "new" path. Existing question
  // starts in preview; non-owners can only switch to "propose CR".
  let mode = isNew ? 'edit' : 'preview';
  // Draft holds the in-flight edits — text and option objects with
  // `{text, isCorrect}` so the input bindings are flat.
  let draft = null;
  function newDraftFrom(question) {
    const opts = (question.options || question.opts || []);
    return {
      questionText: textFromBlocks(question.question),
      options: opts.map((o, i) => ({
        text: optionText(o),
        isCorrect: o.isCorrect === true || i === correctIndex(question),
      })),
      topic: question.topic || '',
    };
  }

  function startEdit() {
    draft = newDraftFrom(q);
    mode = 'edit';
    paint();
  }
  function cancelEdit() {
    draft = null;
    if (isNew) {
      navigate(`/test/${testId}`);
      return;
    }
    mode = 'preview';
    paint();
  }
  async function saveOwner() {
    if (!draft) return;
    const payload = {
      question: blocksFromText(draft.questionText),
      options: draft.options.map(o => ({
        content: blocksFromText(o.text),
        isCorrect: !!o.isCorrect,
      })),
    };
    if (draft.topic) payload.topic = draft.topic;
    try {
      if (isNew) {
        await addQuestion(testId, payload);
        toast(t('q.added') || 'Вопрос добавлен', { tone: 'success' });
      } else {
        await updateQuestion(testId, q.id, payload);
        toast(t('q.saved') || 'Вопрос сохранён', { tone: 'success' });
      }
      navigate(`/test/${testId}`);
    } catch (e) { toast(e?.message || 'Ошибка', { tone: 'error' }); }
  }
  async function proposeCR() {
    if (!draft) {
      // Non-owner editing for the first time — initialize draft.
      draft = newDraftFrom(q);
      mode = 'edit';
      paint();
      return;
    }
    const payload = {
      question: blocksFromText(draft.questionText),
      options: draft.options.map(o => ({
        content: blocksFromText(o.text),
        isCorrect: !!o.isCorrect,
      })),
    };
    try {
      await createChangeRequest(testId, {
        type: 'edit_question',
        question_id: q.id,
        payload,
      });
      toast(t('q.cr_sent') || 'Предложение отправлено владельцу', { tone: 'success' });
      navigate(`/test/${testId}`);
    } catch (e) { toast(e?.message || 'Ошибка', { tone: 'error' }); }
  }
  async function doDelete() {
    if (!isOwner || isNew) return;
    confirmDialog({
      title: `${t('q.delete.title') || 'Удалить'} Q${qIndex + 1}?`,
      message: t('q.delete.hint') || 'Действие безвозвратно.',
      confirmLabel: t('common.delete') || 'Удалить',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteQuestion(testId, q.id);
          toast(t('q.deleted') || 'Удалено', { tone: 'success' });
          navigate(`/test/${testId}`);
        } catch (e) { toast(e?.message || 'Ошибка', { tone: 'error' }); }
      },
    });
  }

  // ── Renderers ──────────────────────────────────────────────────

  function renderPreview() {
    const wrap = document.createElement('div');
    wrap.style.padding = '16px 16px';

    wrap.appendChild(caps(t('q.preview.heading') || 'Так увидит пользователь',
      { marginBottom: '6px' }));
    const h = document.createElement('h2');
    Object.assign(h.style, {
      font: "600 18px/1.45 Inter, sans-serif",
      letterSpacing: '-.005em',
      margin: '6px 0 16px',
    });
    h.textContent = textFromBlocks(q.question) || '—';
    wrap.appendChild(h);

    const opts = q.options || q.opts || [];
    const correct = correctIndex(q);
    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' });
    opts.forEach((opt, i) => {
      const isOk = i === correct;
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', gap: '10px', alignItems: 'flex-start',
        padding: '10px 12px',
        border: '1.5px solid',
        borderColor: isOk ? 'var(--accent)' : 'var(--ink)',
        background: isOk ? 'var(--accent-soft)' : 'var(--paper)',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
      });
      const letter = document.createElement('span');
      Object.assign(letter.style, {
        width: '22px', height: '22px', borderRadius: '999px',
        border: isOk ? 'none' : '1.5px solid var(--ink)',
        background: isOk ? 'var(--accent)' : 'var(--paper)',
        color: isOk ? '#fff' : 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: '700', flexShrink: '0',
      });
      letter.textContent = String.fromCharCode(65 + i);
      row.appendChild(letter);
      const txt = document.createElement('span');
      Object.assign(txt.style, { flex: '1', fontWeight: '500' });
      txt.textContent = optionText(opt) || '';
      row.appendChild(txt);
      if (isOk) row.appendChild(smallTag('✓'));
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // Metadata card.
    const meta = document.createElement('div');
    const items = [
      [t('q.meta.topic')   || 'Тема', q.topic || '—'],
      [t('q.meta.position')|| 'В тесте', `Q${qIndex + 1} ${t('results.of') || 'из'} ${questions.length}`],
      [t('q.meta.type')    || 'Тип', t('q.meta.single') || 'один правильный'],
    ];
    items.forEach((it, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 0', fontSize: '12px', color: 'var(--ink-fade)',
        borderTop: i ? '1px solid var(--ink-soft)' : 'none',
      });
      const k = document.createElement('span');
      k.textContent = it[0];
      const v = document.createElement('span');
      Object.assign(v.style, { color: 'var(--ink)', fontWeight: '500' });
      v.textContent = it[1];
      row.append(k, v);
      meta.appendChild(row);
    });
    wrap.appendChild(mCard({ title: t('q.metadata') || 'Метаданные' }, meta));

    return wrap;
  }

  // Track which text input was focused last so the materials picker
  // knows where to insert the [[img:…]] / [[mathml:…]] token.
  let _lastFocus = { kind: 'question', index: -1, el: null };

  function trackFocus(input, kind, index) {
    input.addEventListener('focus', () => {
      _lastFocus = { kind, index, el: input };
    });
  }

  function insertToken(token) {
    const target = _lastFocus.el;
    if (target) {
      const start = target.selectionStart ?? target.value.length;
      const end   = target.selectionEnd ?? target.value.length;
      const newVal = target.value.slice(0, start) + token + target.value.slice(end);
      target.value = newVal;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      const caret = start + token.length;
      try { target.setSelectionRange(caret, caret); } catch { /* unsupported */ }
      target.focus();
    } else {
      // No focused field — append to question text.
      draft.questionText = (draft.questionText || '') + (draft.questionText ? ' ' : '') + token;
      paint();
    }
  }

  function renderEdit() {
    const wrap = document.createElement('div');
    wrap.style.padding = '16px 16px';

    // Question text.
    const qField = mField({
      label: t('q.field.text') || 'Текст вопроса',
      value: draft.questionText,
      multiline: true,
      onInput: (v) => { draft.questionText = v; },
    });
    // mField wraps the input in a div; find the actual <textarea>/<input>
    // to track focus on it.
    const qInput = qField.querySelector('textarea, input');
    if (qInput) {
      trackFocus(qInput, 'question', -1);
      // Make sure it's the default focus target until the user picks
      // an option input.
      if (!_lastFocus.el) _lastFocus = { kind: 'question', index: -1, el: qInput };
    }
    wrap.appendChild(qField);

    // Options.
    wrap.appendChild(caps(
      t('q.options.label') || 'Варианты ответа · отметьте правильный',
      { margin: '4px 0 8px' },
    ));

    const optList = document.createElement('div');
    wrap.appendChild(optList);

    function paintOpts() {
      optList.replaceChildren();
      draft.options.forEach((opt, i) => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px',
        });
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'mq-correct';
        radio.checked = !!opt.isCorrect;
        radio.style.accentColor = 'var(--accent)';
        radio.addEventListener('change', () => {
          draft.options = draft.options.map((o, j) => ({ ...o, isCorrect: j === i }));
          paintOpts();
        });
        row.appendChild(radio);
        const letter = document.createElement('span');
        Object.assign(letter.style, {
          width: '18px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px', fontWeight: '700',
          color: 'var(--ink-mute)', textAlign: 'center', flexShrink: '0',
        });
        letter.textContent = String.fromCharCode(65 + i);
        row.appendChild(letter);
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = opt.text || '';
        Object.assign(inp.style, {
          flex: '1', border: '1.5px solid',
          borderColor: opt.isCorrect ? 'var(--accent)' : 'var(--ink)',
          borderRadius: '6px', padding: '7px 10px', fontSize: '13px',
          outline: 'none',
          background: opt.isCorrect ? 'var(--accent-soft)' : 'var(--paper)',
          color: 'var(--ink)', fontFamily: 'Inter, sans-serif',
        });
        inp.addEventListener('input', (e) => { draft.options[i].text = e.target.value; });
        trackFocus(inp, 'option', i);
        row.appendChild(inp);
        // Delete button (allowed when ≥3 options exist).
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        Object.assign(delBtn.style, {
          padding: '4px', color: 'var(--ink-mute)',
          background: 'none', border: 'none', cursor: 'pointer',
          opacity: draft.options.length > 2 ? '1' : '0.3',
        });
        delBtn.disabled = draft.options.length <= 2;
        delBtn.appendChild(iconEl('trash', 14));
        delBtn.addEventListener('click', () => {
          if (draft.options.length <= 2) return;
          const wasCorrect = !!draft.options[i].isCorrect;
          draft.options = draft.options.filter((_, j) => j !== i);
          if (wasCorrect) draft.options[0].isCorrect = true;
          paintOpts();
        });
        row.appendChild(delBtn);
        optList.appendChild(row);
      });
    }
    paintOpts();

    const addBtn = mBtn({
      sm: true,
      onClick: () => {
        if (draft.options.length >= 8) return;
        draft.options.push({ text: '', isCorrect: false });
        paintOpts();
      },
      style: {
        marginTop: '4px',
        borderStyle: 'dashed',
        color: 'var(--accent)', borderColor: 'var(--accent)',
      },
    }, iconEl('plus', 12), ' ' + (t('q.add_option') || 'Вариант'));
    wrap.appendChild(addBtn);

    // Topic field.
    wrap.appendChild(mField({
      label: t('q.field.topic') || 'Тема',
      value: draft.topic,
      onInput: (v) => { draft.topic = v; },
    }));

    // Materials section (images / MathML). Owners only — non-owners
    // would propose CRs which can't reference newly uploaded assets
    // they don't own.
    if (isOwner) {
      const matBody = document.createElement('div');
      const hint = document.createElement('div');
      Object.assign(hint.style, {
        fontSize: '11px', color: 'var(--ink-mute)',
        marginBottom: '8px', lineHeight: '1.5',
      });
      hint.textContent = t('q.materials.hint')
        || 'Загрузите картинку или MathML-формулу — будет вставлена как [[img:id]] / [[mathml:id]] в позицию курсора.';
      matBody.appendChild(hint);

      // Hidden file input.
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,.mml,.xml,application/mathml+xml';
      fileInput.style.display = 'none';
      matBody.appendChild(fileInput);

      // Upload row.
      const uploadRow = document.createElement('div');
      Object.assign(uploadRow.style, {
        display: 'flex', gap: '6px', marginBottom: '10px',
      });
      const uploadBtn = mBtn({
        sm: true,
        onClick: () => fileInput.click(),
        style: {
          borderStyle: 'dashed',
          color: 'var(--accent)', borderColor: 'var(--accent)',
          flex: '1',
        },
      }, iconEl('upload', 12), ' ' + (t('q.materials.upload') || 'Загрузить'));
      uploadRow.appendChild(uploadBtn);
      matBody.appendChild(uploadRow);

      const listBox = document.createElement('div');
      Object.assign(listBox.style, {
        display: 'flex', flexDirection: 'column', gap: '4px',
      });
      matBody.appendChild(listBox);

      const assetsBase = `/api/tests/${testId}/assets`;
      let cached = [];

      function renderList() {
        listBox.replaceChildren();
        if (cached.length === 0) {
          const empty = document.createElement('div');
          Object.assign(empty.style, {
            fontSize: '11px', color: 'var(--ink-mute)',
            textAlign: 'center', padding: '6px 0',
          });
          empty.textContent = t('q.materials.empty') || 'Материалов нет';
          listBox.appendChild(empty);
          return;
        }
        for (const m of cached) {
          const row = document.createElement('div');
          Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ink-soft)',
            background: 'var(--paper)',
          });
          // Thumb / kind icon.
          if (m.kind === 'image') {
            const img = document.createElement('img');
            img.src = `${assetsBase}/${m.src}`;
            Object.assign(img.style, {
              width: '32px', height: '32px',
              objectFit: 'cover', borderRadius: '4px',
              flexShrink: '0',
            });
            img.alt = '';
            row.appendChild(img);
          } else {
            const ic = document.createElement('div');
            Object.assign(ic.style, {
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--ink-soft)', borderRadius: '4px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px', fontWeight: '700',
              color: 'var(--ink-fade)', flexShrink: '0',
            });
            ic.textContent = 'fx';
            row.appendChild(ic);
          }
          // ID + name.
          const mid = document.createElement('div');
          Object.assign(mid.style, { flex: '1', minWidth: '0' });
          const id = document.createElement('div');
          Object.assign(id.style, {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px', fontWeight: '600',
          });
          id.textContent = m.id;
          mid.appendChild(id);
          const name = document.createElement('div');
          Object.assign(name.style, {
            fontSize: '10px', color: 'var(--ink-mute)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          });
          name.textContent = m.name || '';
          mid.appendChild(name);
          row.appendChild(mid);
          // Insert button.
          const ins = mBtn({
            sm: true,
            onClick: () => {
              const token = (m.kind === 'image' ? '[[img:' : '[[mathml:') + m.id + ']]';
              insertToken(token);
              toast(t('q.materials.inserted') || 'Вставлено', { tone: 'success' });
            },
          }, t('q.materials.insert') || 'Вставить');
          row.appendChild(ins);
          // Delete button.
          const del = document.createElement('button');
          del.type = 'button';
          Object.assign(del.style, {
            padding: '4px', color: 'var(--ink-mute)',
            background: 'none', border: 'none', cursor: 'pointer',
            flexShrink: '0',
          });
          del.appendChild(iconEl('trash', 12));
          del.addEventListener('click', () => {
            confirmDialog({
              title: `${t('q.materials.delete') || 'Удалить материал'}?`,
              message: t('q.materials.delete.hint')
                || 'Ссылки [[img:…]] в вопросах перестанут работать.',
              confirmLabel: t('common.delete') || 'Удалить',
              danger: true,
              onConfirm: async () => {
                try {
                  await deleteMaterial(testId, m.id);
                  cached = cached.filter(x => x.id !== m.id);
                  renderList();
                  toast(t('q.materials.deleted') || 'Удалено', { tone: 'success' });
                } catch (e) { toast(e?.message || 'Ошибка', { tone: 'error' }); }
              },
            });
          });
          row.appendChild(del);
          listBox.appendChild(row);
        }
      }
      renderList();

      // Lazy-fetch the materials list once.
      listMaterials(testId).then((resp) => {
        cached = (resp && resp.items) || [];
        renderList();
      }).catch(() => { /* empty stays */ });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        uploadBtn.disabled = true;
        try {
          const m = await uploadMaterial(testId, file);
          cached.push(m);
          renderList();
          // Auto-insert at caret on upload — common case.
          const token = (m.kind === 'image' ? '[[img:' : '[[mathml:') + m.id + ']]';
          insertToken(token);
          toast(t('q.materials.uploaded') || 'Загружено', { tone: 'success' });
        } catch (e) {
          toast(e?.message || 'Не удалось загрузить', { tone: 'error' });
        } finally {
          uploadBtn.disabled = false;
          fileInput.value = '';
        }
      });

      wrap.appendChild(mCard({ title: t('q.materials.title') || 'Материалы' }, matBody));
    }

    return wrap;
  }

  function paint() {
    const body = mode === 'edit' ? renderEdit() : renderPreview();

    // Topbar right slot — trash icon on preview for owners.
    let right = null;
    if (mode === 'preview' && isOwner && !isNew) {
      const btn = document.createElement('button');
      btn.type = 'button';
      Object.assign(btn.style, {
        padding: '6px', color: 'var(--error)',
        background: 'none', border: 'none', cursor: 'pointer',
      });
      btn.addEventListener('click', doDelete);
      btn.appendChild(iconEl('trash', 16));
      right = btn;
    }

    // Sticky CTA.
    let sticky;
    if (mode === 'preview') {
      if (isOwner) {
        sticky = mSticky(
          mBtn({
            full: true,
            onClick: proposeCR, // owners can also use CR if they want; mostly skipped
          }, t('q.propose_cr') || 'Предложить CR'),
          mBtn({
            primary: true, full: true,
            onClick: startEdit,
          }, '✎ ' + (t('common.edit') || 'Редактировать')),
        );
      } else {
        sticky = mSticky(
          mBtn({
            primary: true, full: true,
            onClick: proposeCR,
          }, t('q.propose_cr') || 'Предложить CR'),
        );
      }
    } else {
      sticky = mSticky(
        mBtn({ full: true, onClick: cancelEdit }, t('common.cancel') || 'Отмена'),
        mBtn({
          primary: true, full: true,
          onClick: isOwner ? saveOwner : proposeCR,
        }, isOwner
          ? (t('common.save') || 'Сохранить')
          : (t('q.propose') || 'Предложить')),
      );
    }

    const titleText = isNew
      ? (t('q.new') || 'Новый вопрос')
      : `Q${qIndex + 1} · ${q.topic || ''}`.trim().replace(/·\s*$/, '');

    mShell({
      root,
      topbar: topBar({
        title: titleText,
        back: true,
        backHref: `#/test/${testId}`,
        right,
      }),
      body, sticky, hideNav: true,
    });
  }

  paint();
}
