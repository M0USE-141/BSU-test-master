/**
 * mobile/home.js — Mobile collections list (M3 redesign).
 *
 * Replaces the old streak/KPI dashboard with the collections-as-cards
 * layout from the prototype. The dashboard widgets (streak, accuracy
 * graph, total attempts) move to `mobile/stats.js` in M5.
 *
 * Backend: `listTests` for the cards, `getMyAggregate` for the
 * subtitle's "average X%" hint. Both are best-effort — failures
 * degrade quietly to "— %".
 */
import { listTests } from '../../api/tests.js';
import { getMyAggregate } from '../../api/statistics.js';
import { getState } from '../../state.js';
import { t } from '../../utils/locale.js';
import { iconEl } from '../../icons.js';
import { navigate } from '../../router.js';
import {
  topBar, mShell, mChip,
} from '../../components/mobile-atoms.js';
import {
  isFirstRunDismissed, renderFirstRun, renderFirstRunSoft,
} from './first-run.js';

// In-flight render token — guards against late fetches overwriting a
// newer screen when the user navigates away mid-load.
let _renderToken = 0;

function greetingForHour(h) {
  if (h < 12) return t('greeting.morning_short')   || 'доброе утро';
  if (h < 18) return t('greeting.afternoon_short') || 'добрый день';
  return t('greeting.evening_short') || 'добрый вечер';
}

function firstInitial(s) {
  if (!s) return '?';
  const cp = String(s).trim().codePointAt(0) || 0x3F;
  return String.fromCodePoint(cp).toUpperCase();
}

function avatarBtn(initials) {
  const btn = document.createElement('button');
  btn.type = 'button';
  Object.assign(btn.style, {
    width: '32px', height: '32px', borderRadius: '50%',
    border: '1.5px solid var(--ink)',
    background: 'var(--accent-soft)', color: 'var(--accent)',
    fontWeight: '600', fontSize: '12px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  });
  btn.textContent = initials;
  btn.addEventListener('click', () => navigate('/profile'));
  return btn;
}

/**
 * Build a single test card. Click → /test/<id> opens collection view.
 */
function buildTestCard(test) {
  const card = document.createElement('div');
  Object.assign(card.style, {
    border: '1.5px solid var(--ink)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    background: 'var(--paper)',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '12px',
  });
  card.addEventListener('click', () => navigate(`/test/${test.id}`));

  // Avatar — first letter of title in accent box.
  const av = document.createElement('div');
  Object.assign(av.style, {
    width: '42px', height: '42px', borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-soft)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '18px', fontWeight: '600', flexShrink: '0',
  });
  av.textContent = firstInitial(test.title || test.t || '?');
  card.appendChild(av);

  // Middle column — title + meta line.
  const mid = document.createElement('div');
  Object.assign(mid.style, { flex: '1', minWidth: '0' });

  const titleRow = document.createElement('div');
  Object.assign(titleRow.style, {
    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
  });
  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, {
    fontSize: '14px', fontWeight: '600',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    flex: '1',
  });
  titleEl.textContent = test.title || '(no title)';
  titleRow.appendChild(titleEl);

  // Access-level tag — render only for non-private collections.
  const lvl = (test.access_level || '').toLowerCase();
  if (lvl && lvl !== 'private') {
    const tag = document.createElement('span');
    const accent = lvl === 'public' ? 'var(--info)' : 'var(--accent)';
    const soft   = lvl === 'public' ? 'var(--info-soft)' : 'var(--accent-soft)';
    Object.assign(tag.style, {
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
      fontSize: '10px', fontWeight: '600',
      letterSpacing: '.04em', textTransform: 'uppercase',
      background: soft, color: accent, flexShrink: '0',
    });
    tag.textContent = lvl;
    titleRow.appendChild(tag);
  }
  mid.appendChild(titleRow);

  const sub = document.createElement('div');
  Object.assign(sub.style, {
    fontSize: '11px', color: 'var(--ink-mute)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });
  const qc = test.questionCount ?? 0;
  const attemptsCount = test.attempts_count ?? null;
  const parts = [];
  parts.push(`${qc} ${t('test.questions') || 'вопр.'}`);
  if (attemptsCount != null) {
    parts.push(`${attemptsCount} ${t('test.attempts') || 'попыток'}`);
  }
  if (test.owner_username) parts.push(`@${test.owner_username}`);
  sub.textContent = parts.join(' · ');
  mid.appendChild(sub);
  card.appendChild(mid);

  // Right column — avg score badge (if available).
  const avg = test.avg_score;
  if (avg != null) {
    const pct = Math.round(avg);
    const good = pct >= 80;
    const badge = document.createElement('span');
    Object.assign(badge.style, {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '13px', fontWeight: '700',
      padding: '4px 8px', borderRadius: '999px',
      background: good ? 'var(--accent-soft)' : 'var(--ink-soft)',
      color: good ? 'var(--accent)' : 'var(--ink-fade)',
      flexShrink: '0',
    });
    badge.textContent = `${pct}%`;
    card.appendChild(badge);
  }
  return card;
}

/**
 * Build the dashed "Import .docx" CTA at the end of the list.
 */
function buildImportCta() {
  const cta = document.createElement('div');
  Object.assign(cta.style, {
    border: '1.5px dashed var(--accent)',
    borderRadius: 'var(--radius-md)',
    padding: '14px', background: 'var(--accent-soft)',
    color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px',
    fontWeight: '600', fontSize: '13px', cursor: 'pointer',
  });
  cta.appendChild(iconEl('upload', 16));
  const label = document.createElement('span');
  label.textContent = t('home.import_docx') || 'Импорт .docx';
  cta.appendChild(label);
  cta.addEventListener('click', () => navigate('/import'));
  return cta;
}

export default async function render(root, params = {}) {
  _renderToken++;
  const myToken = _renderToken;
  const stale = () => _renderToken !== myToken;

  // ── State ─────────────────────────────────────────────────────────
  // Filters drive backend `filter=my|shared|public` directly. `my` lists
  // every test the user owns regardless of access_level (so a private +
  // shared + public test the owner created all show up here). `shared`
  // = SHARED with the user by someone else; `public` = cross-user public
  // catalog. No 'all' option — chip-selection always represents an
  // intentional slice of the catalog.
  const PAGE_SIZE = 20;
  const initialFilter = ['my', 'shared', 'public'].includes(params.filter)
    ? params.filter : 'my';
  let filter = initialFilter;
  let searchTerm = '';
  let allTests = [];          // accumulated rows for the current filter
  let offset = 0;
  let exhausted = false;
  let loading = false;
  let aggAvg = null;          // user's average % across all tests
  let listEl = null;
  let scrollSentinel = null;
  let scrollObserver = null;

  const stateUser = getState().user;
  const displayName = stateUser?.display_name || stateUser?.username || '';
  const firstName = displayName.split(/\s+/)[0] || (t('user.guest') || 'друг');
  const initials = (displayName || 'У')
    .split(/\s+/).map(s => s.charAt(0)).slice(0, 2).join('').toUpperCase() || 'У';

  // ── Skeleton frame ────────────────────────────────────────────────
  const skeletonBody = document.createElement('div');
  skeletonBody.style.padding = '12px 16px';
  for (let i = 0; i < 4; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    Object.assign(sk.style, {
      height: '70px', borderRadius: 'var(--radius-md)', marginBottom: '8px',
    });
    skeletonBody.appendChild(sk);
  }

  // Minimal topbar — page name only (back button auto-hidden because
  // /home is in the bottom nav).
  const topbar = topBar({ title: t('nav.home') || 'Тесты' });
  mShell({ root, topbar, body: skeletonBody, navActive: 'home' });

  // ── Fetch first page + aggregate ────────────────────────────────
  // Always probe the `my` filter to drive the first-run/empty-state
  // logic, regardless of which filter the user landed on.
  let totalAttempts = 0;
  let ownedCount = 0;
  let firstAttemptDone = false;
  try {
    const reqs = [
      listTests({ filter: 'my', with_stats: true, limit: PAGE_SIZE, offset: 0 }),
      getMyAggregate(),
    ];
    if (initialFilter !== 'my') {
      reqs.push(listTests({
        filter: initialFilter, with_stats: true,
        limit: PAGE_SIZE, offset: 0,
        ...(initialFilter === 'public' ? { sort: 'popular' } : {}),
      }));
    }
    const results = await Promise.allSettled(reqs);
    const myRes = results[0]; const aggRes = results[1]; const filterRes = results[2];
    if (stale()) return;
    if (myRes.status === 'fulfilled') {
      const items = myRes.value?.tests || myRes.value || [];
      ownedCount = myRes.value?.total ?? items.length;
      if (initialFilter === 'my') {
        allTests = items;
        offset = items.length;
        exhausted = items.length < PAGE_SIZE
          || (myRes.value?.total != null && offset >= myRes.value.total);
      }
    }
    if (filterRes && filterRes.status === 'fulfilled') {
      const items = filterRes.value?.tests || filterRes.value || [];
      allTests = items;
      offset = items.length;
      exhausted = items.length < PAGE_SIZE
        || (filterRes.value?.total != null && offset >= filterRes.value.total);
    }
    if (aggRes.status === 'fulfilled') {
      if (aggRes.value?.avgPercentCorrect != null) {
        aggAvg = Math.round(aggRes.value.avgPercentCorrect);
      }
      totalAttempts = aggRes.value?.attemptCount
        ?? aggRes.value?.attempt_count ?? 0;
      firstAttemptDone = totalAttempts > 0;
    }
  } catch { /* deliberate — empty list rendered below */ }
  if (stale()) return;

  // ── First-run guard ──────────────────────────────────────────────
  // Brand-new user (zero own tests AND zero attempts AND hasn't
  // dismissed onboarding) → show full onboarding. Otherwise fall
  // through and let the user browse the public catalog from /home
  // (lazy-loaded when they tap the Public chip, default for users
  // with no own tests).
  if (!isFirstRunDismissed()) {
    if (ownedCount === 0 && totalAttempts === 0) {
      renderFirstRun(root);
      return;
    }
    if (ownedCount > 0 && !firstAttemptDone) {
      renderFirstRunSoft(root, allTests[0]);
      return;
    }
  }
  // If user has no own tests but has interacted with public ones,
  // and no explicit ?filter= was passed, default the home chip to
  // Public so they see content immediately.
  if (ownedCount === 0 && initialFilter === 'my') {
    filter = 'public';
    allTests = [];
    offset = 0;
    exhausted = false;
  }

  // ── Render content ───────────────────────────────────────────────
  const bodyEl = document.createElement('div');
  bodyEl.style.padding = '10px 16px 16px';

  // Search box.
  const searchRow = document.createElement('div');
  Object.assign(searchRow.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 12px',
    border: '1.5px solid var(--ink)', borderRadius: 'var(--radius-sm)',
    fontSize: '13px', marginBottom: '10px',
  });
  const searchIcon = iconEl('search', 13);
  searchIcon.style.color = 'var(--ink-mute)';
  searchRow.appendChild(searchIcon);
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = t('home.search_collections') || 'Поиск коллекций';
  Object.assign(searchInput.style, {
    flex: '1', border: 'none', background: 'transparent', outline: 'none',
    color: 'var(--ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px',
  });
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    rerenderList();
  });
  searchRow.appendChild(searchInput);
  bodyEl.appendChild(searchRow);

  // Filter chips row — backend-driven. No 'all' option.
  const chipsRow = document.createElement('div');
  Object.assign(chipsRow.style, {
    display: 'flex', gap: '6px',
    overflowX: 'auto', marginBottom: '14px', paddingBottom: '4px',
  });
  const filterDefs = [
    { id: 'my',     label: t('home.filter.mine')   || 'Свои' },
    { id: 'shared', label: t('home.filter.shared') || 'Shared' },
    { id: 'public', label: t('home.filter.public') || 'Public' },
  ];

  function renderChips() {
    chipsRow.replaceChildren();
    for (const f of filterDefs) {
      const chip = mChip({
        sm: true, active: filter === f.id,
        onClick: async () => {
          if (filter === f.id) return;
          filter = f.id;
          allTests = [];
          offset = 0;
          exhausted = false;
          renderChips();
          rerenderList();
          await loadMore();
        },
      }, f.label);
      chipsRow.appendChild(chip);
    }
  }
  renderChips();
  bodyEl.appendChild(chipsRow);

  // List of cards + import CTA at end.
  listEl = document.createElement('div');
  Object.assign(listEl.style, { display: 'flex', flexDirection: 'column', gap: '8px' });
  bodyEl.appendChild(listEl);

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    try {
      const resp = await listTests({
        filter, with_stats: true,
        limit: PAGE_SIZE, offset,
        ...(filter === 'public' ? { sort: 'popular' } : {}),
      });
      if (stale()) return;
      const items = resp?.tests || resp || [];
      allTests.push(...items);
      offset += items.length;
      if (items.length < PAGE_SIZE
          || (resp?.total != null && offset >= resp.total)) {
        exhausted = true;
      }
    } catch { exhausted = true; }
    finally {
      loading = false;
      rerenderList();
    }
  }

  function rerenderList() {
    listEl.replaceChildren();
    // Search is client-side over already-fetched rows. For exhaustive
    // search across all tests, use the global Cmd-K palette.
    const filtered = searchTerm
      ? allTests.filter((tst) =>
          (tst.title || '').toLowerCase().includes(searchTerm))
      : allTests;
    if (filtered.length === 0 && !loading && exhausted) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        padding: '48px 12px', textAlign: 'center',
        color: 'var(--ink-mute)', fontSize: '13px',
      });
      empty.textContent = searchTerm
        ? (t('home.empty_filter') || 'Ничего по поиску')
        : (filter === 'my'
            ? (t('home.no_tests') || 'Пока нет своих коллекций — импортируйте .docx')
            : filter === 'shared'
              ? (t('home.no_shared') || 'Никто пока не поделился с вами')
              : (t('home.no_public') || 'Публичных тестов нет'));
      listEl.appendChild(empty);
    } else {
      for (const tst of filtered) listEl.appendChild(buildTestCard(tst));
    }
    if (loading) {
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      Object.assign(sk.style, { height: '70px', borderRadius: 'var(--radius-md)' });
      listEl.appendChild(sk);
    }
    // Sentinel for IntersectionObserver (only re-create when needed).
    if (!exhausted) {
      scrollSentinel = document.createElement('div');
      scrollSentinel.style.height = '1px';
      listEl.appendChild(scrollSentinel);
      if (scrollObserver) scrollObserver.disconnect();
      scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) loadMore();
      }, { rootMargin: '200px' });
      scrollObserver.observe(scrollSentinel);
    } else if (scrollObserver) {
      scrollObserver.disconnect();
    }
    // No inline Import CTA — the bottom-nav already has an "Импорт" tab,
    // so the dashed button at the end of the list was redundant.
  }
  rerenderList();
  // Trigger second-page prefetch immediately if first page filled the
  // viewport's worth of cards (sentinel will fire on scroll anyway).
  if (!exhausted) loadMore();

  // Update the topbar subtitle with actual numbers.
  const subtitleEl = topbar.querySelector('div + div, h1 + div');
  if (subtitleEl) {
    const n = allTests.length;
    const avgStr = aggAvg != null
      ? ` · ${t('home.avg_short') || 'средний'} ${aggAvg}%`
      : '';
    subtitleEl.textContent = `${n} ${t('home.collections') || 'коллекций'}${avgStr}`;
  }

  // Mount the final body.
  mShell({ root, topbar, body: bodyEl, navActive: 'home' });
}
