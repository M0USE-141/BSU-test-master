// Shared data + router state for the prototype.
const { Annot, Box, Btn, Line, TextLines, H, Cap, ImgSlot, Chip, Icon, Tabs, Stickie, Frame, SparkLine, Bars, Heatmap, RichBlock } = window;

// ── Data ──────────────────────────────────────────────────────────────────
const COLLECTIONS = [
  { id: 't1', title: 'Algebra · Polynomials',     tag: 'shared', count: 24, attempts: 3,   score: 67 },
  { id: 't2', title: 'Anatomy Midterm',           tag: 'my',     count: 6,  attempts: 11,  score: 72, desc: 'Covers cells, tissues, organs and basic biochem. Recommended after lectures 1-6.' },
  { id: 't3', title: 'JavaScript fundamentals',   tag: 'public', count: 30, attempts: 219, score: 88 },
  { id: 't4', title: 'Phys chem ch.4',            tag: 'my',     count: 18, attempts: 6,   score: null },
  { id: 't5', title: 'CS history quiz',           tag: 'shared', count: 12, attempts: 1,   score: 54 },
  { id: 't6', title: 'English idioms set 2',      tag: 'my',     count: 60, attempts: 2,   score: 71 },
];

const TAGS = { my: '◆ my', shared: '◇ shared', public: '○ public' };

// Sample questions for t2 (Anatomy) — mixed content
const QUESTIONS_T2 = [
  {
    points: 2, type: 'multi',
    stem: [
      { text: 'Which structure is responsible for ATP production in eukaryotic cells?' },
      { img: 'cell-diagram.png', h: 120, w: '60%' },
    ],
    options: [
      { k: 'A', blocks: [{ text: 'Mitochondrion' }, { formula: '36 ATP / glucose' }] },
      { k: 'B', blocks: [{ text: 'Nucleus' }] },
      { k: 'C', blocks: [{ text: 'Ribosome · protein synthesis' }] },
      { k: 'D', blocks: [{ text: 'Golgi apparatus' }] },
    ],
    correct: 'A',
  },
  {
    points: 1, type: 'tf',
    stem: [{ text: 'All cells in the human body contain a nucleus.' }],
    options: [
      { k: 'T', blocks: [{ text: 'True' }] },
      { k: 'F', blocks: [{ text: 'False' }] },
    ],
    correct: 'F',
  },
  {
    points: 3, type: 'multi',
    stem: [
      { text: 'Given the equation for cellular respiration, what value goes in the box?' },
      { formula: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ☐ ATP' },
    ],
    options: [
      { k: 'A', blocks: [{ text: '2' }] },
      { k: 'B', blocks: [{ text: '12' }] },
      { k: 'C', blocks: [{ text: '36' }] },
      { k: 'D', blocks: [{ text: '120' }] },
    ],
    correct: 'C',
  },
  {
    points: 2, type: 'multi',
    stem: [
      { text: 'Solve for x and select the correct pair of roots:' },
      { formula: '3x² + 2x − 1 = 0' },
    ],
    options: [
      { k: 'A', blocks: [{ formula: 'x = 1/3, x = −1' }] },
      { k: 'B', blocks: [{ formula: 'x = 1, x = −1/3' }] },
      { k: 'C', blocks: [{ formula: 'x = 3, x = −1' }] },
      { k: 'D', blocks: [{ text: 'No real roots' }] },
    ],
    correct: 'A',
  },
  {
    points: 1, type: 'multi',
    stem: [{ text: 'Identify the labeled structure in the diagram:' }, { img: 'organelle.png', h: 100, w: '50%' }],
    options: [
      { k: 'A', blocks: [{ text: 'Endoplasmic reticulum' }] },
      { k: 'B', blocks: [{ text: 'Nucleolus' }] },
      { k: 'C', blocks: [{ text: 'Mitochondrion' }] },
      { k: 'D', blocks: [{ text: 'Lysosome' }] },
    ],
    correct: 'B',
  },
  {
    points: 1, type: 'tf',
    stem: [{ text: 'Krebs cycle generates more ATP than glycolysis directly.' }],
    options: [
      { k: 'T', blocks: [{ text: 'True' }] },
      { k: 'F', blocks: [{ text: 'False' }] },
    ],
    correct: 'T',
  },
];

const NOTIFICATIONS = [
  { who: 's.ivanov',  what: 'proposed an edit to', target: 'Anatomy · Q#3',     when: '2h', unread: true,  kind: 'cr',      go: 'change-requests' },
  { who: 'm.aliyeva', what: 'completed',           target: 'JS fundamentals · 92%', when: '4h', unread: true, kind: 'result',  go: 'stats' },
  { who: 'k.petrov',  what: 'invited you to',      target: 'Phys chem ch.5',    when: '7h', unread: true,  kind: 'invite',  go: 'home' },
  { who: 'system',    what: 'your streak hit',     target: '7 days 🔥',         when: '1d', unread: false, kind: 'sys',     go: 'stats' },
  { who: 'o.bondar',  what: 'commented on',        target: 'Q#11 — fix typo?',  when: '2d', unread: false, kind: 'comment', go: 'editor' },
];

// ── Router context ────────────────────────────────────────────────────────
const RouterCtx = React.createContext(null);
const useRouter = () => React.useContext(RouterCtx);

function makeInitialState() {
  return {
    device: 'desktop',           // 'desktop' | 'mobile'
    view: 'home',                // home | taking | results | editor | stats | notifications | settings | share | import | change-requests | empty | profile
    modal: null,                 // null | 'pretest' | 'qtype' | 'search'
    collection: 't2',            // active collection id
    railTab: 'info',             // info | stats | edit | activity | access
    qIdx: 0,                     // current question index
    answers: {},                 // { qIdx: optionKey }
    flagged: {},                 // { qIdx: true }
    mobileNav: 'home',           // home | tests | stats | me
    mobileMenuOpen: false,
    history: [],                 // back stack
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'set':           return { ...state, ...action.patch };
    case 'go':            return { ...state, view: action.view, modal: null, history: [...state.history, state.view] };
    case 'back':          {
      const h = state.history;
      if (!h.length) return state;
      return { ...state, view: h[h.length - 1], history: h.slice(0, -1) };
    }
    case 'openModal':     return { ...state, modal: action.modal };
    case 'closeModal':    return { ...state, modal: null };
    case 'selectColl':    return { ...state, collection: action.id, qIdx: 0, answers: {}, flagged: {} };
    case 'rail':          return { ...state, railTab: action.tab };
    case 'answer':        return { ...state, answers: { ...state.answers, [state.qIdx]: action.key } };
    case 'nextQ':         {
      const total = QUESTIONS_T2.length;
      if (state.qIdx + 1 >= total) {
        return { ...state, view: 'results', history: [...state.history, state.view] };
      }
      return { ...state, qIdx: state.qIdx + 1 };
    }
    case 'prevQ':         return { ...state, qIdx: Math.max(0, state.qIdx - 1) };
    case 'gotoQ':         return { ...state, qIdx: action.idx };
    case 'flag':          return { ...state, flagged: { ...state.flagged, [state.qIdx]: !state.flagged[state.qIdx] } };
    case 'startTest':     return { ...state, view: 'taking', modal: null, qIdx: 0, answers: {}, flagged: {}, history: [...state.history, state.view] };
    case 'finishTest':    return { ...state, view: 'results', history: [...state.history, state.view] };
    case 'restartTest':   return { ...state, view: 'taking', qIdx: 0, answers: {}, flagged: {} };
    case 'mobileNav':     return { ...state, mobileNav: action.tab, view: 'home', mobileMenuOpen: false };
    case 'toggleMenu':    return { ...state, mobileMenuOpen: !state.mobileMenuOpen };
    case 'setDevice':     return { ...state, device: action.device };
    default:              return state;
  }
}

function RouterProvider({ children, device }) {
  const [state, dispatch] = React.useReducer(reducer, undefined, makeInitialState);
  // Sync device tweak
  React.useEffect(() => {
    dispatch({ type: 'setDevice', device });
  }, [device]);

  // Derived helpers
  const activeColl = COLLECTIONS.find((c) => c.id === state.collection);
  const currentQ = QUESTIONS_T2[state.qIdx];
  const score = React.useMemo(() => {
    let correct = 0;
    QUESTIONS_T2.forEach((q, i) => { if (state.answers[i] === q.correct) correct++; });
    return { correct, total: QUESTIONS_T2.length, pct: Math.round((correct / QUESTIONS_T2.length) * 100) };
  }, [state.answers]);

  const value = { state, dispatch, activeColl, currentQ, score, COLLECTIONS, QUESTIONS_T2, NOTIFICATIONS, TAGS };
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

// ── Reusable interactive bits ─────────────────────────────────────────────

// Sketchy hoverable click target
const Click = ({ children, onClick, style, title }) => (
  <div onClick={onClick} title={title} style={{ cursor: 'pointer', ...style }}>{children}</div>
);

// Toast / hint (auto-dismiss not implemented — just visible state)
const Toast = ({ children, show }) => show ? (
  <div style={{
    position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--wf-ink)', color: 'var(--wf-paper)',
    padding: '8px 14px', borderRadius: 999,
    fontFamily: 'var(--wf-hand)', fontSize: 14, zIndex: 100,
  }}>{children}</div>
) : null;

Object.assign(window, { RouterCtx, RouterProvider, useRouter, COLLECTIONS, QUESTIONS_T2, NOTIFICATIONS, TAGS, Click, Toast });
