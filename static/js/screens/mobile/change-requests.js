/**
 * mobile/change-requests.js — Mobile CR inbox (M5 redesign).
 *
 * Route: `/change-requests/:testId`. Lists every CR on the test with
 * the prototype's status-tag + author-card + inline actions layout.
 * A query param `?cr=<id>` opens that CR's detail; the detail view
 * replaces the list with a back-button topbar.
 */
import {
  listChangeRequests, approveChangeRequest, rejectChangeRequest,
} from '../../api/change-requests.js';
import { getTest, listTests } from '../../api/tests.js';
import { t } from '../../utils/locale.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mCard, mChip, mBtn, mSticky, caps,
} from '../../components/mobile-atoms.js';
import { iconEl } from '../../icons.js';
import { confirm as confirmDialog } from '../../components/confirm-dialog.js';
import { toast } from '../../components/toast.js';

let _renderToken = 0;

function fmtAgo(iso) {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  } catch { return ''; }
}

function statusTag(status) {
  const map = {
    pending:  { label: 'pending',  bg: 'var(--warn-soft)',   fg: '#8a6a17' },
    approved: { label: 'approved', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
    rejected: { label: 'rejected', bg: 'var(--error-soft)',  fg: 'var(--error)' },
  };
  const m = map[status] || map.pending;
  const tag = document.createElement('span');
  Object.assign(tag.style, {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
    fontSize: '10px', fontWeight: '600',
    letterSpacing: '.04em', textTransform: 'uppercase',
    background: m.bg, color: m.fg,
  });
  tag.textContent = m.label;
  return tag;
}

function avatarBubble(initials) {
  const av = document.createElement('div');
  Object.assign(av.style, {
    width: '32px', height: '32px', borderRadius: '50%',
    border: '1.5px solid var(--ink)',
    background: 'var(--accent-soft)', color: 'var(--accent)',
    fontWeight: '600', fontSize: '12px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: '0',
  });
  av.textContent = (initials || '?').slice(0, 2).toUpperCase();
  return av;
}

function emptyHint(text) {
  const e = document.createElement('div');
  Object.assign(e.style, {
    padding: '48px 16px', textAlign: 'center',
    color: 'var(--ink-mute)', fontSize: '13px',
  });
  e.textContent = text;
  return e;
}

function crTitle(cr) {
  // The CR carries a "request_type" + JSON payload. Build a human title.
  const tp = cr.request_type || cr.requestType || '';
  const payload = (() => {
    try { return typeof cr.payload === 'string' ? JSON.parse(cr.payload) : (cr.payload || {}); }
    catch { return {}; }
  })();
  if (tp === 'add_question')   return t('cr.action.add') || 'Добавить вопрос';
  if (tp === 'edit_question')  return `${t('cr.action.edit') || 'Изменить'} Q${cr.question_id ?? payload.id ?? '?'}`;
  if (tp === 'delete_question')return `${t('cr.action.delete') || 'Удалить'} Q${cr.question_id ?? payload.id ?? '?'}`;
  if (tp === 'edit_settings')  return t('cr.action.settings') || 'Изменить настройки';
  return tp || 'Change request';
}

function crAuthor(cr) {
  const u = cr.user || {};
  return {
    name: u.display_name || u.username || '—',
    initials: (u.display_name || u.username || '?').split(/\s+/)
      .map(s => s.charAt(0)).slice(0, 2).join('').toUpperCase() || '?',
  };
}

// ── Detail view ─────────────────────────────────────────────────

function renderDetail(root, cr, testId, testTitle, refreshList) {
  const author = crAuthor(cr);
  const status = (cr.status || 'pending').toLowerCase();

  const body = document.createElement('div');
  body.style.padding = '14px 16px';

  const statusRow = document.createElement('div');
  Object.assign(statusRow.style, {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
  });
  statusRow.appendChild(statusTag(status));
  body.appendChild(statusRow);

  const h = document.createElement('h2');
  Object.assign(h.style, {
    font: "700 18px/1.3 Inter, sans-serif",
    margin: '4px 0 10px',
  });
  h.textContent = crTitle(cr);
  body.appendChild(h);

  const authorRow = document.createElement('div');
  Object.assign(authorRow.style, {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '12px', color: 'var(--ink-fade)', marginBottom: '14px',
  });
  authorRow.appendChild(avatarBubble(author.initials));
  const nameB = document.createElement('b');
  nameB.style.color = 'var(--ink)';
  nameB.textContent = author.name;
  authorRow.appendChild(nameB);
  authorRow.appendChild(document.createTextNode(` · ${fmtAgo(cr.created_at || cr.createdAt)}`));
  body.appendChild(authorRow);

  // Best-effort diff display from CR payload.
  let payload = {};
  try { payload = typeof cr.payload === 'string' ? JSON.parse(cr.payload) : (cr.payload || {}); }
  catch { /* ignore */ }
  const before = payload.before || payload.original;
  const after  = payload.after  || payload.proposed || payload.questionText;
  if (before || after) {
    if (before) {
      body.appendChild(caps(t('cr.before') || 'Было', { marginBottom: '6px' }));
      const beforeBox = document.createElement('div');
      Object.assign(beforeBox.style, {
        background: 'var(--error-soft)',
        border: '1px solid var(--error)',
        borderRadius: '8px', padding: '10px 12px',
        fontSize: '13px', lineHeight: '1.5', marginBottom: '10px',
      });
      beforeBox.textContent = typeof before === 'string' ? before : JSON.stringify(before);
      body.appendChild(beforeBox);
    }
    if (after) {
      body.appendChild(caps(t('cr.after') || 'Стало', { marginBottom: '6px' }));
      const afterBox = document.createElement('div');
      Object.assign(afterBox.style, {
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent)',
        borderRadius: '8px', padding: '10px 12px',
        fontSize: '13px', lineHeight: '1.5', marginBottom: '14px',
      });
      afterBox.textContent = typeof after === 'string' ? after : JSON.stringify(after);
      body.appendChild(afterBox);
    }
  }

  if (payload.comment || cr.comment) {
    const commentBody = document.createElement('div');
    Object.assign(commentBody.style, {
      fontSize: '12px', color: 'var(--ink-fade)', lineHeight: '1.5',
    });
    commentBody.textContent = payload.comment || cr.comment;
    body.appendChild(mCard({ title: t('cr.comment') || 'Комментарий автора' }, commentBody));
  }

  const sticky = status === 'pending' ? mSticky(
    mBtn({
      danger: true, full: true,
      onClick: () => confirmDialog({
        title: t('cr.reject') || 'Отклонить?',
        message: t('cr.reject.hint') || 'Автор получит уведомление.',
        confirmLabel: t('cr.reject') || 'Отклонить',
        onConfirm: async () => {
          try {
            await rejectChangeRequest(testId, cr.id);
            toast(t('cr.rejected_toast') || 'Отклонено', { tone: 'success' });
            navigate(`/change-requests/${testId}`);
            refreshList?.();
          } catch (e) { toast(e.message || 'Ошибка', { tone: 'error' }); }
        },
      }),
    }, iconEl('x', 14), t('cr.reject_btn') || 'Отклонить'),
    mBtn({
      primary: true, full: true,
      onClick: async () => {
        try {
          await approveChangeRequest(testId, cr.id);
          toast(t('cr.approved_toast') || 'Принято', { tone: 'success' });
          navigate(`/change-requests/${testId}`);
          refreshList?.();
        } catch (e) { toast(e.message || 'Ошибка', { tone: 'error' }); }
      },
    }, iconEl('check', 14), t('cr.approve') || 'Принять'),
  ) : null;

  mShell({
    root,
    topbar: topBar({
      title: `CR · ${testTitle}`,
      back: () => navigate(`/change-requests/${testId}`),
    }),
    body, sticky, hideNav: true,
  });
}

// ── Cross-test picker (no :testId in route) ────────────────────

async function renderPicker(root) {
  // Show user's own tests so they can drill into per-test CR inbox.
  let tests = [];
  try {
    const resp = await listTests({ mine: true });
    tests = resp?.tests || resp || [];
  } catch { /* empty list shown */ }

  const body = document.createElement('div');
  body.style.padding = '14px 16px';

  if (!Array.isArray(tests) || tests.length === 0) {
    body.appendChild(emptyHint(
      t('cr.picker.empty') || 'У вас нет своих тестов — change requests появятся когда вы создадите тест.',
    ));
  } else {
    body.appendChild(caps(t('cr.picker.title') || 'Выберите тест'));
    const list = document.createElement('div');
    Object.assign(list.style, { marginTop: '8px' });
    for (const tt of tests) {
      const row = document.createElement('button');
      row.type = 'button';
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 14px', width: '100%',
        border: '1px solid var(--ink-soft)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--paper)',
        marginBottom: '6px', cursor: 'pointer',
        textAlign: 'left', font: 'inherit', color: 'var(--ink)',
      });
      const av = document.createElement('div');
      Object.assign(av.style, {
        width: '36px', height: '36px', borderRadius: '8px',
        background: 'var(--accent-soft)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '15px', fontWeight: '600', flexShrink: '0',
      });
      av.textContent = (tt.title || '?').charAt(0).toUpperCase();
      row.appendChild(av);
      const mid = document.createElement('div');
      Object.assign(mid.style, { flex: '1', minWidth: '0' });
      const name = document.createElement('div');
      Object.assign(name.style, {
        fontSize: '13px', fontWeight: '600',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      name.textContent = tt.title || '—';
      mid.appendChild(name);
      const meta = document.createElement('div');
      Object.assign(meta.style, { fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' });
      const qn = tt.questionCount ?? tt.question_count ?? 0;
      meta.textContent = `${qn} ${t('test.questions') || 'вопр.'}`;
      mid.appendChild(meta);
      row.appendChild(mid);
      const chev = iconEl('chevR', 14);
      chev.style.color = 'var(--ink-mute)';
      row.appendChild(chev);
      row.addEventListener('click', () => navigate(`/change-requests/${tt.id}`));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  mShell({
    root,
    topbar: topBar({
      large: true,
      title: 'Change Requests',
      subtitle: t('cr.picker.subtitle') || 'Выберите тест чтобы открыть запросы',
    }),
    body,
    navActive: 'notif',
  });
}

// ── List view ──────────────────────────────────────────────────

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  const testId = params.testId || params.id;
  const openCrId = params.cr;
  if (!testId) {
    await renderPicker(root);
    return;
  }

  // State.
  let filter = 'pending';
  let crs = [];
  let testTitle = '';

  // Skeleton.
  const skeleton = document.createElement('div');
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton';
    Object.assign(r.style, {
      height: '90px', margin: '0 16px 8px',
      borderRadius: 'var(--radius-md)',
    });
    skeleton.appendChild(r);
  }
  mShell({
    root,
    topbar: topBar({
      large: true,
      title: 'Change Requests',
      subtitle: t('cr.loading') || 'Загружаем…',
    }),
    body: skeleton,
    navActive: 'notif',
  });

  // Fetch list + test for title.
  const [crsRes, testRes] = await Promise.allSettled([
    listChangeRequests(testId),
    getTest(testId),
  ]);
  if (stale()) return;
  if (crsRes.status === 'fulfilled') {
    crs = crsRes.value?.items || crsRes.value?.change_requests
      || crsRes.value || [];
    if (!Array.isArray(crs)) crs = [];
  }
  if (testRes.status === 'fulfilled') {
    testTitle = testRes.value?.title || '';
  }
  if (stale()) return;

  // If a CR id was passed in the query, render detail directly.
  if (openCrId) {
    const sel = crs.find(c => String(c.id) === String(openCrId));
    if (sel) {
      renderDetail(root, sel, testId, testTitle, async () => {
        // refresh callback — re-fetch list when user comes back.
        try {
          const data = await listChangeRequests(testId);
          crs = data?.items || data?.change_requests || data || [];
        } catch { /* keep stale list */ }
      });
      return;
    }
  }

  const pendingCount = crs.filter(c => (c.status || '').toLowerCase() === 'pending').length;

  // Body.
  const body = document.createElement('div');

  const filterRow = document.createElement('div');
  Object.assign(filterRow.style, {
    padding: '8px 16px',
    display: 'flex', gap: '5px',
    overflowX: 'auto',
    borderBottom: '1px solid var(--ink-soft)',
    paddingBottom: '8px',
  });
  body.appendChild(filterRow);

  const list = document.createElement('div');
  body.appendChild(list);

  function countFor(f) {
    if (f === 'all') return crs.length;
    return crs.filter(c => (c.status || '').toLowerCase() === f).length;
  }

  function rebuildFilters() {
    filterRow.replaceChildren();
    const defs = [
      { id: 'pending',  label: t('cr.filter.pending')  || 'Pending' },
      { id: 'approved', label: t('cr.filter.approved') || 'Approved' },
      { id: 'rejected', label: t('cr.filter.rejected') || 'Rejected' },
      { id: 'all',      label: t('cr.filter.all')      || 'Все' },
    ];
    for (const def of defs) {
      filterRow.appendChild(mChip({
        sm: true, active: filter === def.id,
        onClick: () => { filter = def.id; rebuildFilters(); rebuildList(); },
      }, `${def.label} · ${countFor(def.id)}`));
    }
  }

  function rebuildList() {
    list.replaceChildren();
    const filtered = crs.filter(c => filter === 'all' ? true : (c.status || '').toLowerCase() === filter);
    if (filtered.length === 0) {
      list.appendChild(emptyHint(t('cr.empty') || 'Здесь пусто'));
      return;
    }
    for (const cr of filtered) list.appendChild(buildRow(cr));
  }

  function buildRow(cr) {
    const author = crAuthor(cr);
    const status = (cr.status || 'pending').toLowerCase();
    const isUnread = !cr.viewed_at && status === 'pending';
    const row = document.createElement('div');
    Object.assign(row.style, {
      padding: '12px 16px',
      borderBottom: '1px solid var(--ink-soft)',
      background: isUnread ? 'var(--accent-soft)' : 'transparent',
      cursor: 'pointer',
    });
    row.addEventListener('click', () => navigate(`/change-requests/${testId}?cr=${cr.id}`));

    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
    });
    head.appendChild(statusTag(status));
    const when = document.createElement('span');
    Object.assign(when.style, {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px', color: 'var(--ink-mute)',
      marginLeft: 'auto',
    });
    when.textContent = fmtAgo(cr.created_at || cr.createdAt);
    head.appendChild(when);
    row.appendChild(head);

    const main = document.createElement('div');
    Object.assign(main.style, { display: 'flex', gap: '10px', alignItems: 'flex-start' });
    main.appendChild(avatarBubble(author.initials));
    const mid = document.createElement('div');
    Object.assign(mid.style, { flex: '1', minWidth: '0' });
    const title = document.createElement('div');
    Object.assign(title.style, { fontSize: '13px', fontWeight: '600', lineHeight: '1.35' });
    title.textContent = crTitle(cr);
    mid.appendChild(title);
    const meta = document.createElement('div');
    Object.assign(meta.style, { fontSize: '11px', color: 'var(--ink-mute)', marginTop: '2px' });
    meta.textContent = `${author.name} · ${testTitle}`;
    mid.appendChild(meta);
    main.appendChild(mid);
    const chev = iconEl('chevR', 14);
    chev.style.color = 'var(--ink-mute)';
    main.appendChild(chev);
    row.appendChild(main);

    // Quick action buttons inline for pending CRs.
    if (status === 'pending') {
      const actions = document.createElement('div');
      Object.assign(actions.style, { display: 'flex', gap: '6px', marginTop: '10px' });
      const rejectBtn = mBtn({
        danger: true, full: true, sm: true,
        onClick: (e) => {
          e.stopPropagation();
          confirmDialog({
            title: t('cr.reject') || 'Отклонить?',
            message: t('cr.reject.hint') || 'Автор получит уведомление.',
            confirmLabel: t('cr.reject') || 'Отклонить',
            onConfirm: async () => {
              try {
                await rejectChangeRequest(testId, cr.id);
                crs = crs.map(c => c.id === cr.id ? { ...c, status: 'rejected' } : c);
                toast(t('cr.rejected_toast') || 'Отклонено', { tone: 'success' });
                rebuildFilters(); rebuildList();
              } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
            },
          });
        },
      }, iconEl('x', 12));
      const approveBtn = mBtn({
        primary: true, full: true, sm: true,
        onClick: async (e) => {
          e.stopPropagation();
          try {
            await approveChangeRequest(testId, cr.id);
            crs = crs.map(c => c.id === cr.id ? { ...c, status: 'approved' } : c);
            toast(t('cr.approved_toast') || 'Принято', { tone: 'success' });
            rebuildFilters(); rebuildList();
          } catch (er) { toast(er.message || 'Ошибка', { tone: 'error' }); }
        },
      }, iconEl('check', 12), ` ${t('cr.approve') || 'Принять'}`);
      actions.appendChild(rejectBtn);
      actions.appendChild(approveBtn);
      row.appendChild(actions);
    }
    return row;
  }

  rebuildFilters();
  rebuildList();

  mShell({
    root,
    topbar: topBar({
      large: true,
      title: 'Change Requests',
      subtitle: `${pendingCount} ${t('cr.waiting') || 'ждут вас'}`,
    }),
    body,
    navActive: 'notif',
  });
}
