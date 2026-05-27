# Архитектура TestMasterBSU

## Обзор

Один Python-процесс: FastAPI-приложение обслуживает REST API и одновременно отдаёт ванильный SPA-фронтенд из `static/`. Никакого SSR, никаких шаблонов — `templates/` содержит лишь `.gitkeep`. Все данные в SQLite, файлы тестов и аватары — на диске.

```
Browser ──GET /──────────────────► static/index.html (SPA shell)
         ──GET /static/js/...───► static/js/*.js (ES-modules, cache-busted)
         ──/api/...────────────► FastAPI routes
                                      │
                             SQLAlchemy 2.0
                                      │
                               SQLite (data/testmaster.db)
                            + filesystem (data/tests/, data/avatars/)
```

## Точки входа

| Файл | Назначение |
|---|---|
| [`main.py`](main.py) | `load_dotenv()` + ре-экспорт `app` из `api.app`. Используется gunicorn, Procfile, `alembic/env.py`. |
| [`api/app.py`](api/app.py) | Создаёт `FastAPI(lifespan=lifespan)`, CORS из env, 11 роутеров, монтирует `/static`. |
| [`scripts/run_app.py`](scripts/run_app.py) | Launcher для PyInstaller — запускает uvicorn на `127.0.0.1:8000`, открывает браузер. |

## Структура каталогов

```
api/
  app.py               # FastAPI: CORS из env, роутеры, lifespan
  config.py            # все настройки (env-переменные, пути, JWT-параметры)
  database.py          # engine, SessionLocal, DeclarativeBase, get_db(), init_db()
  dependencies/
    auth.py            # get_current_user / get_optional_user (JWT + сессии)
  routes/              # 11 файлов — эндпоинты (см. раздел «Роутеры»)
  services/            # бизнес-логика (9 сервисов)
  models/              # Pydantic-схемы (запрос/ответ)
    db/                # SQLAlchemy ORM-модели + индексы производительности
  utils/               # paths, file_utils, json_utils, validation, time_utils

core/
  word_extract.py      # WordTestExtractor — docx → TestQuestion[]
  serialization.py     # ContentItem[] → JSON-блоки; serialize_test_payload()
  image_convert.py     # WMF/EMF → PNG (Pillow / CloudConvert)
  models.py            # dataclass: ContentItem, TestQuestion, TestOption, TestSession
  logging_setup.py     # setup_console_logging()
  omml2mml.xsl         # XSLT для OMML → MathML

static/
  index.html           # единственная HTML-страница; подключает шрифты Google Fonts CDN
  css/
    tokens.css         # дизайн-токены (--paper, --ink, --accent, --border, shadows…)
    base.css           # reset, body, focus-visible
    components.css     # btn, card, chip, input, modal, heatmap, ring, skeleton
    layout.css         # desktop grid (sidebar+rail+main), mobile shell
    screens/
      desktop.css      # desktop-specific overrides
      mobile.css       # mobile-specific overrides
      stats.css        # statistics screen styles
      taking.css       # test-taking + results screen styles
  js/
    main.js            # entry: theme init, locale hydration, router bootstrap
    router.js          # hash-based router (#/home, #/test/:id/take); cache-bust _V
    state.js           # central store (events + reducer)
    i18n.js            # ru/en/uz словари + t(), setLocale()
    icons.js           # ~40 inline SVG icons (icon(), iconEl()); window.__iconsFresh delegation
    search-palette.js  # cmd-K / Ctrl-K search overlay
    api/               # fetch-обёртки по одному файлу на роутер:
                       # auth.js, users.js, tests.js, access.js, change-requests.js,
                       # attempts.js, statistics.js, questions.js, assets.js,
                       # notifications.js, search.js
    components/        # переиспользуемые компоненты (Button, Card, Modal, Heatmap, Ring…)
    screens/
      desktop/
        home.js           # главный экран: sidebar + 5-tab rail + topbar
        taking.js         # прохождение теста
        results.js        # результаты + review mode
        stats.js          # статистика (3 вкладки)
        notifications.js  # inbox уведомлений
        change-requests.js# просмотр/одобрение change requests
        settings.js       # настройки аккаунта (7 разделов)
        import.js         # импорт .docx (3-step wizard)
        profile.js        # публичный профиль
      mobile/
        _shell.js         # bottom-nav shell + drawer
        home.js           # mobile home / dashboard
        collection.js     # список тестов коллекции
        taking.js         # прохождение теста (mobile)
        results.js        # результаты (mobile)
        stats.js          # статистика (mobile)
        profile.js        # профиль (mobile)
        tests.js          # каталог тестов
        notifications.js  # уведомления (mobile)
        settings.js       # настройки (mobile)
        import.js         # импорт (mobile)
      auth/
        login.js          # экран входа
        register.js       # экран регистрации
    utils/
      device.js           # isMobile(), onBreakpointChange()
      theme.js            # getTheme(), setTheme(), getResolvedTheme(), applyTheme()
      locale.js           # getLocale(), setLocale(), t() shorthand
      format.js           # formatDate(), formatDuration(), formatPercent()
      render-blocks.js    # renderBlocks() — рендер JSON-блоков (text/img/formula/code)
  locales/
    ru.json, en.json, uz.json
  fonts/               # (опционально self-hosted Inter + JetBrains Mono woff2)
  assets/              # logo, favicon

alembic/
  versions/            # 7 миграций (см. раздел «БД и миграции»)
  env.py               # конфиг alembic, читает DATABASE_URL из api/config.py
  alembic.ini

scripts/
  cli.py               # CLI-импорт docx → data/tests/<uuid>/
  run_app.py           # PyInstaller launcher
  migrate_test_ownership.py  # data-migration
  attempts_smoke.md    # ручной smoke-чеклист для API попыток

design-plans/          # интерактивные React/JSX прототипы (CDN-Babel, read-only ref)
  wireframe-primitives.jsx
  prototype-router.jsx
  prototype-desktop.jsx, prototype-desktop-2.jsx, desktop-combined.jsx, desktop-screens.jsx
  prototype-mobile.jsx, mobile-screens.jsx, mobile-screens-extra.jsx
  stats-screens.jsx
  extra-screens.jsx, extras-2.jsx
  tweaks-panel.jsx, design-canvas.jsx
  Prototype.html, Mobile Prototype.html, Wireframes.html

docs/
  superpowers/specs/   # дизайн-спецификации, утверждённые в ходе работы

data/                  # runtime-данные (в .gitignore)
  testmaster.db
  tests/<uuid>/{test.json, assets/}
  avatars/
```

## Backend

### `api/app.py`

- `FastAPI(lifespan=lifespan)` с `@asynccontextmanager` lifespan.
- На startup: `init_db()`, `validate_secret_key()`, `schedule_events_cleanup()`.
- На shutdown: `stop_event.set()` + `thread.join(timeout=5)` — graceful shutdown фонового потока.
- CORS middleware: `allow_origins` из env `ALLOWED_ORIGINS` (CSV), методы — `["GET","POST","PATCH","DELETE","OPTIONS"]`, заголовки — `["Authorization","Content-Type"]`.
- `GET /` → `HTMLResponse` с `index.html` + инжект `window.__APP_VERSION__` для cache-bust ES-модулей.
- `app.mount("/static", StaticFiles(...))`.

### `api/config.py`

Все настройки читаются из ENV-переменных с fallback-значениями:

| Переменная | Назначение |
|---|---|
| `TEST_DATA_DIR` | каталог с тестами (`data/tests`) |
| `DB_DIR` | каталог с БД (`data`) |
| `DATABASE_URL` | URL SQLAlchemy |
| `SECRET_KEY` | секрет для JWT (runtime-проверка: ошибка в production, warning в dev) |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
| `SESSION_EXTEND_MINUTES` | `60` (sliding expiration) |
| `ABANDONED_RETENTION_DAYS` | `90` (дней до удаления abandoned-попыток) |
| `AVATARS_DIR` | `data/avatars` |
| `ALLOWED_ORIGINS` | CSV допустимых Origin для CORS (`http://localhost:8000,http://127.0.0.1:8000`) |
| `APP_VERSION` | строка версии для cache-bust (дефолт = timestamp запуска; в prod — git SHA) |
| `CLOUDCONVERT_API_KEY` | для конвертации WMF/EMF на Linux |

Поддерживает PyInstaller-сборку через `_resource_path()` (`sys._MEIPASS`).

### `api/database.py`

- SQLAlchemy 2.0, `DeclarativeBase`.
- `check_same_thread=False` только для SQLite.
- `get_db()` — генератор-зависимость FastAPI.
- `init_db()` — `Base.metadata.create_all(bind=engine)`.

### Роутеры

Порядок регистрации в `app.py`: `auth → users → tests → access → change_requests → assets → questions → attempts → statistics → notifications → search`.

#### `/api/auth` — [`routes/auth.py`](api/routes/auth.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | нет | регистрация |
| POST | `/api/auth/login` | нет | вход, возвращает JWT |
| POST | `/api/auth/logout` | нет (ручная проверка) | инвалидация сессии |
| GET | `/api/auth/me` | required | текущий пользователь |
| POST | `/api/auth/refresh` | нет (ручная проверка) | новый JWT, старая сессия инвалидируется |
| POST | `/api/auth/change-password` | required | смена пароля (текущий + новый) |

#### `/api/users` — [`routes/users.py`](api/routes/users.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/users/me/profile` | required | профиль (включает theme/language/accent) |
| PATCH | `/api/users/me/profile` | required | обновить display_name, theme, language, accent |
| POST | `/api/users/me/avatar` | required | загрузить аватар |
| DELETE | `/api/users/me/avatar` | required | удалить аватар |
| GET | `/api/users/{user_id}/avatar` | нет | публичный аватар |
| GET | `/api/users/{user_id}` | нет | публичная карточка (id, username, display_name, avatar_url) |

#### `/api/tests` — [`routes/tests.py`](api/routes/tests.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/tests` | optional | список (bulk-запрос TestCollection, без N+1) |
| POST | `/api/tests` | required | создать пустую коллекцию (поддерживает `title`, `description`, `access_level`) |
| GET | `/api/tests/{id}` | optional | данные теста |
| PATCH | `/api/tests/{id}` | required (owner) | переименовать / обновить описание |
| DELETE | `/api/tests/{id}` | required (owner) | удалить |
| POST | `/api/tests/upload` | required | загрузить `.docx` |

#### `/api` (access) — [`routes/access.py`](api/routes/access.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/tests/{id}/access` | required | текущий уровень доступа |
| PATCH | `/api/tests/{id}/access` | required (owner) | изменить уровень |
| GET | `/api/tests/{id}/shares` | required (owner) | список shared-пользователей |
| POST | `/api/tests/{id}/shares` | required (owner) | добавить пользователя |
| DELETE | `/api/tests/{id}/shares/{user_id}` | required (owner) | удалить пользователя |

#### `/api` (change-requests) — [`routes/change_requests.py`](api/routes/change_requests.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/tests/{id}/change-requests/can-propose` | required | можно ли предлагать |
| POST | `/api/tests/{id}/change-requests` | required (не-owner) | создать запрос |
| GET | `/api/tests/{id}/change-requests` | required (owner) | список запросов |
| GET | `/api/tests/{id}/change-requests/stats` | required (owner) | статистика запросов |
| POST | `/api/tests/{id}/change-requests/{req_id}/approve` | required (owner) | одобрить |
| POST | `/api/tests/{id}/change-requests/{req_id}/reject` | required (owner) | отклонить |

#### `/api/tests/{id}/assets` — [`routes/assets.py`](api/routes/assets.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/tests/{id}/assets/{path:path}` | optional (`can_view_test`) | скачать ассет |
| POST | `/api/tests/{id}/assets` | required (`can_edit_test`) | загрузить ассет |

#### `/api/tests/{id}/questions` — [`routes/questions.py`](api/routes/questions.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| POST | `/api/tests/{id}/questions` | required (`can_edit_test`) | добавить вопрос |
| PATCH | `/api/tests/{id}/questions/{q_id}` | required (`can_edit_test`) | редактировать вопрос |
| DELETE | `/api/tests/{id}/questions/{q_id}` | required (`can_edit_test`) | удалить вопрос |

#### `/api/attempts` — [`routes/attempts.py`](api/routes/attempts.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| POST | `/api/attempts/start` | optional | начать попытку |
| POST | `/api/attempts/{id}/answer` | нет | записать ответ |
| POST | `/api/attempts/{id}/finish` | нет | завершить |
| POST | `/api/attempts/{id}/abandon` | нет | отменить |
| GET | `/api/attempts/{id}` | нет | данные попытки |

#### `/api` (statistics) — [`routes/statistics.py`](api/routes/statistics.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/stats/attempts` | нет (clientId query) | список попыток клиента |
| GET | `/api/stats/attempts/{id}` | нет (clientId query) | детали попытки |
| GET | `/api/stats/aggregate` | нет | агрегированная статистика |
| GET | `/api/stats/me/trend` | required | тренд по дням `{date, avg_score, attempts_count}[]` |
| GET | `/api/tests/{id}/statistics` | required (owner) | статистика теста |

#### `/api/notifications` — [`routes/notifications.py`](api/routes/notifications.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/notifications` | required | список уведомлений (фильтр `?unread=true`, `?kind=...`) |
| POST | `/api/notifications/{id}/read` | required | пометить прочитанным |
| POST | `/api/notifications/read-all` | required | пометить все прочитанными |

Уведомления создаются автоматически: при создании/одобрении/отклонении change-request и при добавлении share.

Модель: `id, user_id, kind (cr_received|cr_approved|cr_rejected|share_received), payload (JSON), read_at, created_at`.

#### `/api/search` — [`routes/search.py`](api/routes/search.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/search` | optional | full-text поиск по `tests.title` + `questions.text` (`?q=...`) |

### Сервисы

| Сервис | Файл | Назначение |
|---|---|---|
| `auth_service` | [`services/auth_service.py`](api/services/auth_service.py) | bcrypt-хеширование, JWT create/verify, CRUD сессий по `jti` |
| `access_service` | [`services/access_service.py`](api/services/access_service.py) | RBAC: `can_view_test`, `can_edit_test`, CRUD TestCollection/TestShare |
| `change_request_service` | [`services/change_request_service.py`](api/services/change_request_service.py) | полный lifecycle CR; триггеры создания уведомлений |
| `notification_service` | [`services/notification_service.py`](api/services/notification_service.py) | CRUD уведомлений; `create_notification()`, `mark_read()`, `mark_all_read()` |
| `test_service` | [`services/test_service.py`](api/services/test_service.py) | `load_test_payload`, `save_test_payload`, `find_question` |
| `attempt_service` | [`services/attempt_service.py`](api/services/attempt_service.py) | lifecycle попытки: start/answer/skip/finish/abandon |
| `stats_service` | [`services/stats_service.py`](api/services/stats_service.py) | server-side агрегация через `func.sum/count/avg`; trend; per-question breakdown |
| `cleanup_service` | [`services/cleanup_service.py`](api/services/cleanup_service.py) | фоновый поток с `threading.Event` — graceful shutdown; удаление abandoned-попыток (каждые 24ч) |
| `image_service` | [`services/image_service.py`](api/services/image_service.py) | валидация/сохранение/ресайз аватаров через Pillow |

### Модели БД и индексы

Регистрируются в `api/models/db/__init__.py` (импортируются при `init_db()`).

```
users ─────────┬──► sessions          (user_id FK, cascade delete)
               ├──► test_collections  (owner_id FK, cascade delete)
               ├──► change_requests   (user_id FK, SET NULL on delete)
               └──► notifications     (user_id FK, cascade delete)

test_collections ──► test_shares      (test_collection_id FK, cascade delete)
                 └──► change_requests (test_collection_id FK, cascade delete)

attempts ──────────► attempt_answers  (attempt_id FK, cascade delete)
```

| Таблица | Ключевые поля |
|---|---|
| `users` | `id`, `username` (unique), `email` (unique), `hashed_password`, `display_name`, `avatar_path`, `is_active`, `theme` (light/dark/system), `language` (ru/en/uz), `accent` (green/blue/coral/yellow/mono) |
| `sessions` | `token_jti` (unique), `expires_at`, `is_active`, `last_activity` |
| `test_collections` | `test_id` (filesystem uuid), `owner_id`, `access_level` (private/shared/public) |
| `test_shares` | `(test_collection_id, user_id)` unique |
| `change_requests` | `type`, `status` (pending/approved/rejected), `payload` (JSON Text) |
| `notifications` | `user_id`, `kind`, `payload` (JSON), `read_at` (nullable), `created_at` |
| `attempts` | PK = `String(64)` UUID, `settings_json`, `percent_correct`, `is_completed` |
| `attempt_answers` | `(attempt_id, question_id)` unique; snapshot вопроса |

**Индексы производительности** (миграция `f911293af21c`):

| Индекс | Назначение |
|---|---|
| `ix_attempts_test_status_started` | листинг/фильтрация попыток по тесту и статусу |
| `ix_attempts_status_started` | cleanup-сервис (поиск abandoned) |
| `ix_test_collections_access_owner` | листинг тестов с фильтрами |
| `ix_test_shares_collection_user` | проверка доступа |
| `ix_sessions_active_expires` | проверка активных сессий |
| `ix_change_requests_collection_created` | листинг change-requests |

### Авторизация

JWT-токен передаётся в заголовке `Authorization: Bearer <token>`.

Поток на каждом защищённом запросе (`api/dependencies/auth.py`):
1. `HTTPBearer(auto_error=False)` извлекает токен.
2. `verify_token(token)` — проверка подписи и срока жизни.
3. `get_active_session(db, jti)` — поиск записи `Session` в БД по `jti`-клейму.
4. `extend_session(db, session)` — скользящее продление срока.
5. Загрузка `User` по `sub`-клейму.

Refresh: `POST /api/auth/refresh` выдаёт новый токен и инвалидирует старую сессию.

### Access Control

Три уровня: `private` / `shared` / `public` в таблице `test_collections`.

- **private** → только владелец.
- **shared** → владелец + пользователи в `test_shares`.
- **public** → все (включая неавторизованных).

### Change Requests

Не-владелец может предлагать: добавить, редактировать или удалить вопрос, изменить настройки. Payload хранится как JSON. При одобрении `_apply_*` хелперы читают `test.json`, применяют изменение, записывают обратно. При создании/одобрении/отклонении CR автоматически создаются уведомления через `notification_service`.

### БД и миграции

| Порядок | Ревизия | Содержание |
|---|---|---|
| 1 | `1a0e23fe226f` | Таблицы `users`, `sessions` |
| 2 | `e7309514da6f` | Поля профиля (`display_name`, `avatar_path`, `avatar_size`) |
| 3 | `6d6221c278d9` | `test_collections`, `test_shares` |
| 4 | `a8b5c3d7e9f1` | `change_requests` |
| 5 | `25d2b9dc70be` | Поле `correct_option_index` в `attempt_answers` (server-side правильность) |
| 6 | `f911293af21c` | Индексы производительности (9 индексов) |
| 7 | `b2c4d6e8f0a2` | `notifications`, user prefs (`theme`, `language`, `accent`) |

**Важно:** `alembic upgrade head` обязателен при первом запуске и после каждого обновления кода. `Base.metadata.create_all()` создаёт только недостающие таблицы и не применяет ALTER-миграции (новые колонки, индексы).

## Core

| Файл | Назначение |
|---|---|
| [`word_extract.py`](core/word_extract.py) | `WordTestExtractor` — парсит `.docx`; WMF/EMF → PNG; OMML → MathML через XSLT. |
| [`serialization.py`](core/serialization.py) | `content_items_to_blocks()` → JSON-блоки; `serialize_test_payload()` → финальный JSON. |
| [`image_convert.py`](core/image_convert.py) | `convert_metafile_to_png()` — Pillow на Windows, CloudConvert на Linux. |
| [`models.py`](core/models.py) | Dataclass-ы пайплайна: `ContentItem`, `TestOption`, `TestQuestion`, `TestSession`. |
| [`logging_setup.py`](core/logging_setup.py) | `setup_console_logging(level=DEBUG)` — idempotent. |

## Frontend

### Дизайн-система

Paper/ink стиль (учебная атмосфера, не утомляет при долгих сессиях):

- **Шрифт**: Inter (400/500/600/700) + JetBrains Mono для формул/кода — Google Fonts CDN.
- **Цветовые токены**: CSS-переменные в `static/css/tokens.css`. Два режима (`[data-theme="dark"]`). Пять акцентных палитр (`--accent` переключается через JS).
- **Иконки**: ~40 inline SVG, нарисованных вручную (`stroke-width:1.8`, `stroke-linecap:round`), экспортируются как `icon(kind, size, color)` и `iconEl(kind, size)`. Модуль `icons.js` использует `window.__iconsFresh`-делегирование для обхода ES-module cache.
- **Тема**: `setTheme('light'|'dark'|'system')` из `utils/theme.js`. Состояние — `localStorage` + поле `theme` в профиле пользователя.

### Ключевые дизайн-токены

| Токен | Значение (light) |
|---|---|
| `--paper` | `#f9f6ef` |
| `--ink` | `#1c1a18` |
| `--accent` | `#4f9b6a` (green, по умолчанию) |
| `--border` | `1.5px solid var(--ink)` |
| `--radius-sm/md/lg` | `8px / 10px / 16px` |
| `--shadow-sm/md/lg` | мягкие Gaussian-тени |

### Роутинг (hash-based)

`router.js` реализует hash-router без серверного fallback:

- `#/home` → `screens/desktop/home.js` или `screens/mobile/home.js`
- `#/test/:id/take` → `taking.js`
- `#/test/:id/results` → `results.js`
- `#/stats` → `stats.js`
- `#/notifications` → `notifications.js`
- `#/settings` → `settings.js`
- `#/import` → `import.js`
- `#/auth/login`, `#/auth/register` → auth screens

Mobile vs desktop — отдельные шаблоны, переключение по `isMobile()` (`matchMedia`). Один URL → разный рендер.

Каждый модуль экрана загружается с cache-bust параметром `?v=${_V}` (где `_V = window.__APP_VERSION__`, а значение инжектируется сервером при `GET /`). В production устанавливается через `APP_VERSION` env (git SHA деплоя); в dev — timestamp запуска сервера. Общие зависимости (`icons.js`, `router.js` и др.) догружаются через `window.__iconsFresh`-паттерн.

### Структура JS (граф загрузки)

```
index.html
  └─ main.js (static)
       ├─ router.js  ← регистрирует hash-routes, cache-bust _V
       │    └─ import('./screens/…/home.js?v=_V')  — lazy per route
       ├─ state.js
       ├─ i18n.js    ← t(), setLocale(), 3 локали
       └─ utils/theme.js
```

Каждый экранный модуль self-contained: содержит собственный рендер, локальный стейт, подписки на события.

### Экраны

Каждый экран: функция `export default async function render(root, params)`, заменяет содержимое `#app`.

| Экран | Desktop | Mobile |
|---|---|---|
| Главная | `home.js` — sidebar + 5-tab rail + topbar с поиском | `home.js` — dashboard / streak / last attempts |
| Прохождение | `taking.js` — вопрос + таймер + pad + flag | `taking.js` |
| Результаты | `results.js` — SVG score ring + Q-grid + review | `results.js` |
| Статистика | `stats.js` — heatmap + sparkline + 3 вкладки | `stats.js` |
| Уведомления | `notifications.js` — inbox с табами | `notifications.js` |
| Change requests | `change-requests.js` — 2-pane diff | — |
| Настройки | `settings.js` — 7 разделов | `settings.js` |
| Импорт | `import.js` — 3-step wizard | `import.js` |
| Профиль | `profile.js` | `profile.js` |
| Авторизация | `auth/login.js`, `auth/register.js` | (те же) |

### CSS

Файлы подключаются в `index.html` в порядке:
1. `tokens.css` — дизайн-токены.
2. `base.css` — reset, body, focus-visible.
3. `components.css` — btn, card, chip, input, modal, heatmap, ring, skeleton, notif-tab.
4. `layout.css` — desktop grid (sidebar+rail+main), mobile bottom-nav shell.
5. `screens/desktop.css`, `mobile.css`, `stats.css`, `taking.css` — screen-specific.

## Запуск и деплой

| Режим | Команда |
|---|---|
| Dev | `uvicorn api:app --reload` |
| Prod (gunicorn) | `gunicorn -k uvicorn.workers.UvicornWorker main:app` |
| Docker | `docker compose up --build` |
| Standalone | `pyinstaller pyinstaller.spec` |

**Обязательные ENV на production**:
- `SECRET_KEY` — случайная строка ≥32 символа (иначе RuntimeError при старте).
- `ALLOWED_ORIGINS` — список разрешённых Origin через запятую.

## Known Gaps / Технический долг

| Проблема | Серьёзность |
|---|---|
| Нет автотестов (pytest) — только ручной smoke-чеклист | Высокая |
| `api/models/attempts.py` — Pydantic-модели не используются роутами (legacy) | Низкая |
| MathJax 3 грузится с CDN без SRI-хешей | Низкая |
| `/api/tests/{id}/assets` — GET открыт без auth (доступ к ассетам публичных тестов) | Низкая (known gap) |
| `/api/tests/{id}/questions` — GET отдаёт вопросы без auth (публичный контент) | Низкая (known gap) |
| Тесты хранятся как JSON-файлы на диске — два источника правды с БД | Архитектурный долг |
| `nul` файл в Windows при некоторых операциях — добавлен в `.gitignore` | Ничтожная |
