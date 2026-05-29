# CLAUDE.md — TestMasterBSU

**Стек:** FastAPI + SQLAlchemy 2.0 + Alembic + Postgres 16 + S3-storage (MinIO в dev) + Resend/SMTP email + JWT (HttpOnly refresh cookie + in-memory access) + ванильный ES-modules SPA.

## Команды

```bash
uv sync                                              # install deps
docker compose -f docker-compose.dev.yml up -d       # local Postgres + MinIO
bash scripts/provision_minio_local.sh                # init bucket policy + CORS + lifecycle
alembic upgrade head                                 # apply migrations
uvicorn main:app --reload                            # dev server → http://localhost:8000
```

Без docker (light dev):

```bash
STORAGE_BACKEND=local DATABASE_URL=sqlite:///./data/testmaster.db \
  uvicorn main:app --reload
```

LAN-доступ:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`uvicorn main:app` (а не `api:app`) — потому что `main.py` грузит `.env` через `load_dotenv()`.

Тестов pytest нет. Ручной smoke — `scripts/attempts_smoke.md`. Deeper validation skripti — `scripts/test_*.py` и `scripts/live_e2e.py` (dev-only, не коммитятся).

## Структура каталогов

```
api/
  app.py                # FastAPI lifespan + 12 routers + CORS (allow_credentials=True)
  config.py             # ENV-vars (DB, S3, JWT, COOKIE_*, MAIL_*, ALLOWED_ORIGINS, APP_VERSION)
  database.py           # engine, SessionLocal, get_db
  dependencies/
    auth.py             # get_current_user / get_optional_user (Bearer JWT + session JTI)
    storage.py          # get_storage() with @lru_cache
    mail.py             # get_mail_service() with @lru_cache
  routes/               # 12 routers
    auth.py             # login (sets refresh cookie), refresh, logout, forgot-password, reset, change-password
    users.py            # me, profile, avatar (upload/get/delete)
    tests.py            # list (filter=my|shared|public + offset/limit), get, create, update, delete, upload .docx
    assets.py           # GET /api/tests/{id}/assets/{path} (streamed via storage backend)
    questions.py        # add/update/delete a single question (owner-only)
    access.py           # access level (PATCH /access), shares (add/remove), access-requests
    change_requests.py  # CR proposal/approve/reject
    attempts.py         # start/record-answer/finish/abandon/list/get
    statistics.py       # me/aggregate, me/streak, me/trend, heatmap, owner-analytics
    notifications.py    # list, mark-read
    search.py           # GIN search over questions.payload->>'text'
    activity.py         # /activity feed (test_created, attempt_completed, share_added, …)
    import_jobs.py      # GET /api/import-jobs/{id} (audit; sync /upload still does the work)
    dev_storage.py      # HMAC-signed local presigned-URL emulator
    health.py           # GET /api/health → {db, version}
  services/             # business logic
    auth_service.py     # create/verify access + refresh tokens, rotate, session-by-JTI
    access_service.py   # can_view_test, can_edit_test, list_accessible
    test_service.py     # metadata only (payload is in `questions` table now)
    questions_service.py# add/update/delete/list questions; apply_cr_patch; build payload
    attempt_service.py  # start/finish; UPSERT question_performance (dialect-aware)
    change_request_service.py
    notification_service.py
    activity_service.py
    stats_service.py
    password_reset_service.py
    image_service.py    # avatar pipeline (process → store → thumb-64 generation)
    cleanup_service.py  # 5-min cron: outgoing_emails retry, stale import_jobs marker
    import_service.py   # start_import + run_import (sync path used by /upload)
    storage_service.py  # StorageBackend Protocol
    storage_local.py    # FS backend
    storage_s3.py       # MinIO/S3 backend (internal + public endpoints)
    storage_keys.py     # SINGLE SOURCE OF TRUTH for object keys
    mail/
      provider.py       # MailProvider Protocol + MailMessage dataclass
      resend_provider.py
      console_provider.py # → data/mail-debug/*.eml
      smtp_provider.py
      service.py        # send_template(to, locale, template, context); writes outgoing_emails
  models/
    db/                 # SQLAlchemy models
      user.py           # User + Session (with refresh_jti, refresh_expires_at)
      test_collection.py
      question.py       # NEW: payload JSONB + GIN; question_id FK target
      attempt.py        # attempts + attempt_answers (JSONB snapshots)
      change_request.py
      notification.py
      access_share.py / access_request.py
      flagged_question.py / question_performance.py
      import_job.py
      outgoing_email.py
      activity_event.py
      password_reset_token.py
    *.py                # Pydantic request/response schemas
  utils/                # file_utils, validation, time_utils
  templates/mail/       # Jinja2 mail templates {ru,en,uz}/{password_reset,…}.{html,txt}
core/
  word_extract.py       # WordTestExtractor — docx → TestQuestion[], symbol-arg drives correct-marker
  serialization.py      # ContentItem[] → JSON-blocks for SPA
  image_convert.py      # WMF/EMF → PNG (Inkscape Linux / CloudConvert / Pillow Windows)
  models.py             # dataclasses
static/
  index.html            # SPA shell + <script>window.__APP_VERSION__ = "..."</script>
  css/                  # tokens, base, components, layout, screens/*
  js/
    main.js             # entry: theme, i18n, bootRefresh, getMe, initRouter
    router.js           # hash-router; cache-bust via APP_VERSION; redirect/desktopRedirect handlers
    state.js            # central store; getAccessToken/setAccessToken (in-memory only)
    i18n.js             # ru/en/uz
    icons.js            # ~45 inline SVGs
    search-palette.js   # Cmd-K
    api/                # _fetch (with 401 auto-refresh interceptor), auth, users, tests,
                        # access, change-requests, attempts, statistics, questions,
                        # materials, notifications, search, access-requests, activity
    components/
      app-shell.js      # desktop topbar+rail (topbar gear → theme-toggle)
      mobile-atoms.js   # mShell, topBar (back='auto'), mCard, mChip, mBtn, mSticky, mSheet
      question-editor.js# Master-detail; renders blocks via renderContent + attachAssets
      mail-layout.js, search-palette.js, confirm-dialog.js, toast.js, cheatsheet.js, …
    screens/
      auth/             # login, register, forgot, reset (desktop); mobile/auth/ for mobile
      desktop/          # home, taking, results, stats, notifications, change-requests,
                        # import (4-step import + 2-step create + marker), profile (unified
                        # settings), edit-collection, question, activity
      mobile/           # M1-M7 redesign: _shell (deprecated), home, collection, taking,
                        # results, per-question, stats, profile (inline panes), settings
                        # (legacy fallback), import (4+2 wizard), notifications,
                        # change-requests, edit-collection, question, first-run,
                        # errors/{403,404}
      errors/           # shared 403/404
    utils/
      theme.js          # setTheme/getResolvedTheme/setAccent/getAccent
      locale.js         # setLocale/getLocale + t()
      escape.js         # escHtml
      render-blocks.js  # renderContent, typesetMath, attachAssets (blob-URL swap)
      device.js         # isMobile() — matchMedia ≤768px
      client-id.js      # legacy; mostly removed (Phase C dropped anonymous attempts)
      format.js         # date/duration helpers
  locales/              # ru.json, en.json, uz.json
alembic/versions/
  0001_pg_initial.py       # squashed Postgres schema (replaces old SQLite migrations)
  0002_session_refresh.py  # refresh_jti, refresh_expires_at
  0003_attempt_user_required.py
docker-compose.dev.yml     # Postgres + MinIO for dev
deploy/                    # shared/ (Caddy+pg+minio) + testmaster/ (per-project app)
scripts/                   # provision_*, attempts_smoke.md, cli.py
docs/superpowers/specs/    # design docs (postgres-minio-mail migration, temp-storage, i18n cleanup)
```

Не трогать: `api/models/attempts.py` (legacy Pydantic, не используется роутами).

## Карта роутеров

| Префикс | Файл | Auth |
|---|---|---|
| `/api/auth` | `auth.py` | login/register/forgot — нет; `/me`, `/refresh`, `/logout`, `/change-password` — Bearer (или cookie для `/refresh`) |
| `/api/users` | `users.py` | да (кроме `GET /{id}/avatar` — public, `GET /{id}` — public) |
| `/api/tests` | `tests.py` | list/get — optional + access-check; create/edit/delete/upload — да |
| `/api/tests/{id}/assets` | `assets.py` | optional + `can_view_test` (private/shared 403'ят анонимов) |
| `/api/tests/{id}/questions` | `questions.py` | да (явно `Depends(get_current_user)`) |
| `/api` (access, shares) | `access.py` | да |
| `/api` (change-req) | `change_requests.py` | да |
| `/api/attempts` | `attempts.py` | да |
| `/api` (stats) | `statistics.py` | `/me/*` — да; `/test/{id}/owner-analytics` — owner |
| `/api/notifications` | `notifications.py` | да |
| `/api/search` | `search.py` | optional |
| `/api/health` | `health.py` | нет (deploy-probe) |
| `/api/import-jobs` | `import_jobs.py` | да |
| `/api/activity` | `activity.py` | да |
| `/api/dev-storage` | `dev_storage.py` | HMAC-signed |

## Инварианты

### Backend

- Все защищённые эндпоинты: `Depends(get_current_user)` из `api/dependencies/auth.py`.
- Проверки доступа к тесту — только через `access_service.can_view_test` / `can_edit_test`.
- Storage-ключи — **только** через `api/services/storage_keys.py` (`asset_key`, `material_key`, `avatar_key`, `import_source_key`, `import_artifact_key`, …). Прямые `f"…"` запрещены — bypass'ят валидацию UUID/filename.
- Изменения тестов от не-владельца — только через `change_request_service`.
- При изменении схемы БД: создать Alembic-ревизию + обновить SQLAlchemy-модели в `api/models/db/`.
- Уведомления создаются **только** через `notification_service.create_notification()` — не напрямую в БД.
- Письма — только через `mail.send_template(...)`. Прямые `smtplib` запрещены.
- Question payload — `questions.payload` JSONB-колонка, не `test.json` файл (Phase 4 cutover). `test_service.load_test_payload` удалён.
- Async-сервисы (import_service, cleanup_service, retry) — используют свои Session, не главную из request scope.

### Frontend

- Hash-routing only: `#/home`, `#/test/:id/take`, `#/profile?section=appearance`.
- Каждый экранный модуль — `export default async function render(root, params)`.
- Overlay/модалки — класс `.modal-backdrop`.
- Иконки — `icon(kind, size)` / `iconEl(kind, size)` из `icons.js`. Не emoji.
- Темизация — `setTheme()` из `utils/theme.js` (атрибут `data-theme` на `<html>`).
- Локализация — `t('key')` из `utils/locale.js`, ключи в `locales/*.json`.
- Access token хранится **в памяти** через `state.js::getAccessToken/setAccessToken`. **Никакого `localStorage.access_token`**.
- Любой `<img>` для test-asset (`img.rb-image`) → после `renderContent(...)` обязательно `attachAssets(rootEl)` для blob-URL swap (auth'd fetch). См. `utils/render-blocks.js`.
- Новые экраны добавляются в `ROUTES` в `router.js`. Mobile-route или desktop-route выбирается через `isMobile()` (matchMedia ≤768px).
- `desktopRedirect` поле на ROUTES entry — редирект только для desktop; mobile keeps the screen (используется для `/settings`).

Подробная архитектура — в [`ARCH.md`](ARCH.md). Design specs — в [`docs/superpowers/specs/`](docs/superpowers/specs/).
