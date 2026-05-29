# Архитектура TestMasterBSU

## Обзор

Один Python-процесс — FastAPI приложение, которое:

- Отдаёт ванильный SPA-фронтенд из `static/` (один HTML, ES-модули, hash-router).
- Обслуживает REST API под `/api/*`.
- Работает поверх Postgres 16 (Alembic-миграции) + S3-совместимого object-storage (MinIO в dev, любой S3 в prod) + опционального mail-провайдера (Resend / Console / SMTP-fallback).

```
Browser ──GET /──────────────────► static/index.html (SPA shell + APP_VERSION)
         ──GET /static/js/...?v=── static/js/*.js (ES-modules, cache-busted by APP_VERSION)
         ──/api/...────────────► FastAPI routes
                                      │
                             SQLAlchemy 2.0 ORM
                                      │
                            ┌────────┴───────────┐
                            ▼                    ▼
                     Postgres 16          StorageBackend
                  (Alembic-migrations)  (local FS | MinIO/S3)
                                              │
                                              ▼
                                       presigned GET / streaming
```

## Точки входа

| Файл | Назначение |
|---|---|
| [`main.py`](main.py) | `load_dotenv()` + ре-экспорт `app` из `api.app`. Используется uvicorn, gunicorn, Procfile, `alembic/env.py`. |
| [`api/app.py`](api/app.py) | `FastAPI(lifespan=lifespan)`, CORS (`allow_credentials=True`), 12 роутеров, монтирует `/static`, добавляет cleanup-thread. |
| [`scripts/run_app.py`](scripts/run_app.py) | Standalone launcher для PyInstaller. |
| [`Dockerfile`](Dockerfile) | Multi-stage (base/deps/runtime); base ставит `inkscape libpq5 fonts-dejavu fonts-liberation curl`. |

## Persistence

### Postgres 16

Schema создаётся через Alembic. Все таблицы в одной squashed-миграции `alembic/versions/0001_pg_initial.py` плюс инкременты:

- `0002_session_refresh.py` — `refresh_jti`, `refresh_expires_at` для refresh-token сессий.
- `0003_attempt_user_required.py` — `attempts.user_id NOT NULL`, удалён `client_id`.

Таблицы:

- `users` — auth + профиль (display_name, email, avatar_object_key, theme/accent/language, email_notifications, email_verified_at, email_digest).
- `sessions` — JTI-индекс активных JWT (access + refresh per row).
- `test_collections` — метаданные теста + JSONB `settings_jsonb`.
- `questions` — `payload` JSONB (block-формат) + GIN-индекс. Single row per question, не файл.
- `attempts` + `attempt_answers` — попытки (JSONB snapshots).
- `change_requests` — модерация правок не-владельцев.
- `notifications` — inbox.
- `flagged_questions`, `question_performance` — статистика.
- `access_shares`, `access_requests` — список приглашений + запросы доступа.
- `import_jobs` — асинхронный docx-импорт (pending → processing → done|failed).
- `outgoing_emails` — журнал отправленных писем (status, attempt_count для retry).
- `activity_events` — feed для `/activity` (test_created, attempt_completed, share_added, cr_*).
- `password_reset_tokens` — одноразовые токены для forgot-flow.

### Object storage

Бэкенды реализуют один и тот же `StorageBackend` Protocol (`api/services/storage_service.py`):

- `LocalStorageBackend` (`api/services/storage_local.py`) — FS под `data/storage/<bucket>/<key>`. Дев-only.
- `S3StorageBackend` (`api/services/storage_s3.py`) — MinIO/S3 через `minio-py`. Два клиента: internal (`S3_ENDPOINT` для backend↔storage) и public (`S3_PUBLIC_ENDPOINT` для presigned URLs).

Ключи строятся через `api/services/storage_keys.py` — **единственный источник правды** для путей в S3. Валидирует UUID и whitelist'ит символы в filename. Логические бакеты `assets` и `avatars` транслируются в реальные имена через конфиг.

Канонические ключи:

```
assets/tests/<test_id>/materials/<short><ext>            # картинки/MathML вопросов
assets/tests/<test_id>/questions/<question_id>/<file>    # привязанные к вопросу (Phase 4+ модель)
assets/tests/<test_id>/settings/<file>                   # cover-image и т.п.
assets/imports/<job_id>/source.docx                      # исходный файл импорта (TTL 24h)
assets/imports/<job_id>/extracted/<file>                 # промежуточные артефакты (TTL 24h)
avatars/users/<user_id>/current.jpg                      # current variant
avatars/users/<user_id>/thumb-64.jpg                     # 64px thumbnail
```

## Auth

JWT с HttpOnly refresh-cookie:

- **Access token** (15 мин) — выдаётся в теле `POST /api/auth/login` и `/refresh`. Хранится **в памяти** (`state.js::getAccessToken/setAccessToken`), не в localStorage (защита от XSS).
- **Refresh token** (7 дней) — HttpOnly + Secure (prod) + SameSite=Lax cookie, путь `/api/auth`. Браузер автоматически шлёт его на `/api/auth/refresh`.
- **Auto-refresh interceptor** в `static/js/api/_fetch.js`: при 401 один раз пробует `POST /api/auth/refresh`, при успехе ретраит исходный запрос. Один in-flight refresh на все параллельные запросы.
- **Rotation**: каждый refresh выдаёт новый refresh-JTI; старая сессия (`Session.refresh_jti`) помечается `is_active=False`.

`get_current_user` (`api/dependencies/auth.py`) валидирует Bearer-токен через `verify_token` + проверку активной сессии по JTI.

## Routers

12 файлов под `api/routes/`:

| Префикс | Файл | Auth |
|---|---|---|
| `/api/auth` | `auth.py` | login/register/forgot-public — нет; `/me`, `/refresh`, `/logout`, `/change-password` — да (или cookie) |
| `/api/users` | `users.py` | да (кроме `GET /{id}/avatar` — public, `GET /{id}` — public) |
| `/api/tests` | `tests.py` | list/get — optional + access-check; create/edit/delete — да |
| `/api/tests/{id}/assets` | `assets.py` | optional + `can_view_test` (private/shared 403'ят анонимов) |
| `/api/tests/{id}/questions` | `questions.py` | да (Phase 4 — `Depends(get_current_user)` явно) |
| `/api` (access, shares) | `access.py` | да |
| `/api` (change-req) | `change_requests.py` | да |
| `/api/attempts` | `attempts.py` | да (user-only — `client_id` удалён в Phase C) |
| `/api` (stats) | `statistics.py` | `/stats/me/*` — да; `/test/{id}/owner-analytics` — owner-only |
| `/api/notifications` | `notifications.py` | да |
| `/api/search` | `search.py` | optional |
| `/api/health` | `health.py` | нет (deploy-probe; возвращает `{db, version}`) |
| `/api/import-jobs` | `import_jobs.py` | да (см. async-import) |
| `/api/dev-storage` | `dev_storage.py` | HMAC-signed (dev-only локальная замена presigned URL) |

## Async docx-импорт

`POST /api/tests/upload` сейчас **синхронный**: создаёт `TestCollection` + `Question` rows + материалы за один запрос, возвращает `{metadata, payload, logs, jobId}`. Параллельно фиксирует `ImportJob` row для аудита.

Async-роадмап (частично готов, см. `docs/superpowers/specs/2026-05-29-temp-storage-imports-design.md`):

1. `/upload` → 202 + `{job_id}`.
2. Воркер парсит → пишет материалы в `imports/<job_id>/extracted/` (TTL 24h MinIO lifecycle).
3. `GET /api/import-jobs/<id>` — polling status + logs.
4. `POST /api/import-jobs/<id>/confirm` — создаёт `TestCollection`, переносит материалы → `tests/<id>/materials/`, флипает `is_temporary=False`.
5. `POST /api/import-jobs/<id>/cancel` — `delete_prefix(import_prefix(job_id))`.

Сейчас:
- В UI (wizard Step 3) есть кнопка «Отменить и удалить» — вызывает `DELETE /api/tests/<id>` для только что созданного теста.
- Конвертация WMF/EMF → PNG: `core/image_convert.py` — Inkscape-first / CloudConvert-fallback на Linux; Pillow на Windows.

## Mail

`MailService` (`api/services/mail/`) с провайдер-абстракцией:

- `ResendProvider` — HTTP клиент к Resend API.
- `ConsoleProvider` — пишет в `data/mail-debug/*.eml` (dev).
- `SMTPProvider` — `smtplib` (заглушка-fallback).

Шаблоны `api/templates/mail/{ru,en,uz}/{password_reset,change_request_received,share_received,…}.{html,txt}` через Jinja2.

Письма пишутся в `outgoing_emails` (status, attempt_count). Retry в `cleanup_service` (каждые 5 мин выбирает `failed AND attempt_count<3 AND created_at < 1d`).

## Frontend

Hash-роутер (`#/home`, `#/test/:id`, `#/profile?section=appearance`). Каждый экранный модуль — `export default async function render(root, params)`.

### Entry + bootstrap

`static/js/main.js`:

1. Init theme (FOUC-safe).
2. `await initI18n()` (грузит активную локаль).
3. Legacy cleanup: удаляет `localStorage.access_token` если остался от старых билдов.
4. `await bootRefresh()` — silent refresh access-токена через cookie.
5. Если успех — `getMe()` + `getMyProfile()` → hydrate state с serverside prefs.
6. `initRouter(...)`.
7. Global hotkeys (`?`, `g h`, `g s`, …).

### Router (`router.js`)

- Cache-bust: каждый dynamic-import получает `?v=${window.__APP_VERSION__}` (server подставляет в `index.html`).
- `redirect` поля на route entries — безусловный редирект.
- `desktopRedirect` — редирект только при `!isMobile()`. Используется для `/settings → /profile?section=appearance` (desktop) с сохранением dedicated mobile/settings.js.
- `matchPattern` — простой `/foo/:id`-style matcher.

Известные алиасы:
- `/discover` → `/home?filter=public` (redirect)
- `/settings` → `/profile?section=appearance` (desktop only)

### Mobile shell (`components/mobile-atoms.js`)

- `mShell({root, topbar, body, sticky, navActive, hideNav})` — wrapper с фикс. topbar + body + sticky-footer + bottom-nav.
- `topBar({title, back='auto', backHref, right, search})` — minimal single-line topbar.
  - `back='auto'` → chevron автоматом если current route не в bottom-nav (home/stats/import/notifications/profile).
- `mCard`, `mChip`, `mBtn`, `mSticky`, `mSheet` — атомарные строительные блоки.

### Rich-content rendering (`utils/render-blocks.js`)

- `renderContent(content, assetsBaseUrl)` — `{blocks:[{type:'paragraph', inlines:[…]}]}` → HTML.
- `typesetMath(el)` — wrapper над MathJax (если загружен).
- `attachAssets(el)` — **ключевой fix для auth'd `<img>`**: ищет `img.rb-image` под `el`, грузит каждый через `fetch()` с Bearer-токеном из `getAccessToken()`, конвертирует в blob → ставит как src. Идемпотентный (`blob:` уже скипает). Без этого `<img>` тег попадает в 403 на private/shared тестах, потому что не умеет передавать Authorization-header.

### Settings унифицированы в `/profile`

**Desktop** (`screens/desktop/profile.js`):
- Sidebar — список секций: Профиль (Личные данные/Безопасность/Доступ) | Внешний вид (Тема/Акцент/Язык в одной панели) | Уведомления | Данные (Экспорт + Очистить кэш) | О приложении (Версия) | Сеанс (Сессии/Выйти) | Опасная зона (Удалить).
- Detail pane — sub-screen для выбранной секции.
- Принимает `?section=` параметр (для backward-compat `?sub=`).

**Mobile** (`screens/mobile/profile.js`):
- Главный экран — list of rows + avatar header + 3-cell stat strip.
- Tap на row → `_renderPane(root, paneKey, profile)` подменяет screen с topbar back-кнопкой. Никакого `navigate('/settings')` — всё в `/profile`.
- Сохранён mobile-specific `screens/mobile/settings.js` для backward-compat — `/settings` на мобайле всё ещё открывается (используется как fallback внутри панели).

**Desktop topbar** — gear-button заменён на theme-toggle (sun/moon). Один клик → `setTheme(...)` + `updateProfile({theme})`.

### Import / Create wizard

**Desktop** (`screens/desktop/import.js`):
- Mode-toggle сверху на Step 1: `Импорт .docx` / `Пустая коллекция`.
- **Import (4 шага)**: File+form → Live progress → Full preview → Done.
  - Step 1: drag-drop + title + description + **«Маркер правильного ответа»** input (maxlength=32) + access.
  - Step 2: live `xhr.upload.progress` → бар + %, потом фаза извлечения с секундомером (тикает 100ms).
  - Step 3: full preview — каждый вопрос с опциями, `attachAssets` для blob-URLs, `typesetMath` для формул, collapsible parser logs. Опции рендерятся в **один столбец** (`flex-direction:column`) — длинные формулы помещаются.
  - Step 4: success card.
- **Create (2 шага)**: Form → Success.
  - Step 1: title (req) + description + access → `createTest` + опциональный `updateTestAccess`.
  - Step 2: success card → «Открыть тест» ведёт на `/test/:id/edit`.
- Cancel on Step 3 → confirm → `deleteTest(testId)` → reset.

**Mobile** (`screens/mobile/import.js`) — то же самое, тот же mode-toggle, те же шаги.

### Home — backend-driven filter + lazy load

Sidebar/list работают по **filter=my|shared|public** на backend'е (`/api/tests?filter=...&offset=...&limit=...`). Нет `all` чипа.

- `my` фильтр на backend'е возвращает все is_owner тесты независимо от access_level (SHARED/PUBLIC тоже).
- IntersectionObserver на сентинел → подгрузка следующей страницы.
- Empty-state для нового юзера: defaults к `filter=public` если `ownedCount==0`, не делает редирект на удалённый `/discover`.

### Прочие fixes

- `/discover` — route удалён, redirect → `/home?filter=public` для back-compat.
- `mobile/collection.js` различает 403 vs 404: `status === 403 → /error/403?testId=` (для request-access flow).
- Question editor empty state: даже когда `questions.length === 0`, sidebar монтируется → видна кнопка `+ Добавить вопрос`.
- Question editor option layout: один столбец (была grid 2col).
- Mobile `/taking`: explicit grid-icon button рядом с counter `1/10` (раньше был только tap на счётчик — undiscoverable).
- Mobile `/home` topbar: только title `Тесты`, без greeting и avatar-кружка (Профиль есть в bottom-nav).
- Mobile `/home`: убрана inline `Импорт .docx` dashed CTA (bottom-nav уже имеет Импорт tab).

## Deploy

Production-стек (`deploy/`):

- `deploy/shared/` — общий compose: Caddy (auto-TLS) + Postgres-16 + MinIO + minio-init. Volumes сохраняются (`pg_data`, `minio_data`, `caddy_data`).
- `deploy/testmaster/` — per-project compose: один сервис `app`, depends_on healthy postgres/minio, networks external `edge`+`data`.
- `Caddyfile`: `testmaster.{$DOMAIN}` → app:8000, `s3.{$DOMAIN}` → minio:9000.
- `scripts/provision_project.sh` — идемпотентный bootstrap: psql `CREATE DATABASE/ROLE`, `mc mb bucket`, service-account, bucket-policy, CORS, lifecycle (TTL `imports/`).

## Dev-стек

- `docker-compose.dev.yml` — Postgres-16 + MinIO (с healthchecks).
- `scripts/provision_minio_local.sh` — `mc mb` + CORS + lifecycle `imports/` TTL=24h.
- `MAIL_PROVIDER=console` пишет письма в `data/mail-debug/*.eml`.
- `STORAGE_BACKEND=local` + `DATABASE_URL=sqlite://` поднимаются одной командой без docker.

## Инварианты

### Backend

- Все защищённые эндпоинты: `Depends(get_current_user)` из `api/dependencies/auth.py`.
- Проверки доступа к тесту — только через `access_service.can_view_test` / `can_edit_test`.
- Storage-ключи — **только** через `api/services/storage_keys.py`. Прямые `f"…"` запрещены.
- Изменения тестов от не-владельца — только через `change_request_service`.
- Уведомления — только через `notification_service.create_notification()`.
- Письма — только через `mail.send_template(...)`. Прямые `smtplib`-вызовы запрещены.
- Schema changes → Alembic revision + SQLAlchemy update.
- Question payload — JSONB в `questions.payload`, не файл. `test_service.load_test_payload` удалён.

### Frontend

- Hash-routing only (`#/...`).
- Каждый экран — `export default async function render(root, params)`.
- Overlay/модалки — класс `.modal-backdrop`.
- Иконки — `icon(kind, size)` / `iconEl(kind, size)` из `icons.js`. Не emoji.
- Темизация — `setTheme()` из `utils/theme.js` (атрибут `data-theme` на `<html>`).
- Локализация — `t('key')` из `utils/locale.js`.
- Access token — в памяти через `state.js::getAccessToken/setAccessToken`. **Никакого `localStorage.access_token`**.
- Любой `<img>` для test-asset → автоматически через `attachAssets()` после `renderContent` (auth'd blob-URL fetch).

## Known gaps / TODO

- **Temp-storage flow** для импорта (отдельный spec): материалы пишутся в финальную папку синхронно. Если юзер закрывает вкладку на Step 3 — orphan-тест остаётся (mitigation: «Отменить и удалить» button + future async-pipeline).
- **Backend rejects mode=create** wizard в /upload — wizard вызывает создание через отдельный `createTest`. Это нормально для текущей архитектуры.
- **rId5/rId6 материалы**: docx relationship IDs до сих пор используются как имена объектов. Spec предлагает заменить на 8-char hex IDs.
- **WebSocket/SSE** для live import logs — пока нет, polling/`onUploadProgress` достаточно.
- Mobile **activity screen** отсутствует — `/activity` рендерит desktop-вариант, layout не идеален.

## Где смотреть детали

- `docs/superpowers/specs/2026-05-28-postgres-minio-mail-migration-design.md` — оригинальный design для миграции (большая часть реализована).
- `docs/superpowers/specs/2026-05-29-temp-storage-imports-design.md` — план temp-storage для импорта (роадмап).
- `docs/superpowers/specs/2026-05-28-spa-i18n-cleanup-design.md` — план для очистки локалей (не закрыт).
