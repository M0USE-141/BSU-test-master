# Архитектура TestMasterBSU

## Обзор

Один Python-процесс: FastAPI-приложение обслуживает REST API и одновременно отдаёт ванильный SPA-фронтенд из `static/`. Никакого SSR, никаких шаблонов — `templates/` содержит лишь `.gitkeep`. Все данные в SQLite, файлы тестов и аватары — на диске.

```
Browser ──GET /──────────────────► static/index.html (SPA)
         ──GET /static/js/...───► static/js/*.js (ES-modules)
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
| [`api/app.py`](api/app.py) | Создаёт `FastAPI(lifespan=lifespan)`, CORS из env, 9 роутеров, монтирует `/static`. |
| [`scripts/run_app.py`](scripts/run_app.py) | Launcher для PyInstaller — запускает uvicorn на `127.0.0.1:8000`, открывает браузер. |

## Структура каталогов

```
api/
  app.py               # FastAPI: CORS из env, роутеры, lifespan
  config.py            # все настройки (env-переменные, пути, JWT-параметры)
  database.py          # engine, SessionLocal, DeclarativeBase, get_db(), init_db()
  dependencies/
    auth.py            # get_current_user / get_optional_user (JWT + сессии)
  routes/              # 9 файлов — эндпоинты (см. раздел «Роутеры»)
  services/            # бизнес-логика (8 сервисов)
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
  index.html           # единственная HTML-страница; подключает Tailwind CDN v3
  icons.svg            # Heroicons v2 outline SVG-спрайт (19 символов, hidden)
  js/
    app.js             # entry-point; управляет lazy-load экранов
    api/               # auth.js, profile.js — fetch-обёртки
    screens/           # auth.js (static), management.js, testing.js, statistics.js, profile.js (lazy)
    components/        # modals.js, access-modal.js, change-requests-modal.js, test-stats-modal.js
    utils/             # locale.js, theme.js, file-upload.js
    rendering.js       # renderXxxScreen(), setActiveScreen(), renderBlocks(), ensureChartJs(), ensureMathJax()
    editor.js          # редактор вопросов с инлайн-объектами (lazy через management.js)
    state.js           # dom-кеш, state-объект, localStorage-персист
    i18n.js            # словари ru/en/uz, t(), setLocale()
    telemetry.js       # clientId в localStorage
    api.js             # основной HTTP-клиент
  css/
    base.css           # reset, типографика
    layout.css         # раскладка приложения
    components.css     # UI-компоненты
    editor.css         # модальный редактор
    theme.css          # CSS custom properties: emerald accent (light/dark)

alembic/
  versions/            # 5 миграций (4 схемные + 1 индексы производительности)
  env.py               # конфиг alembic, читает DATABASE_URL из api/config.py
  alembic.ini

scripts/
  cli.py               # CLI-импорт docx → data/tests/<uuid>/
  run_app.py           # PyInstaller launcher
  migrate_test_ownership.py  # data-migration
  attempts_smoke.md    # ручной smoke-чеклист для API попыток

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
- `GET /` → `FileResponse("static/index.html")`.
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
| `AVATARS_DIR` | `data/avatars` |
| `ALLOWED_ORIGINS` | CSV допустимых Origin для CORS (`http://localhost:8000,http://127.0.0.1:8000`) |
| `CLOUDCONVERT_API_KEY` | для конвертации WMF/EMF на Linux |

Поддерживает PyInstaller-сборку через `_resource_path()` (`sys._MEIPASS`).

### `api/database.py`

- SQLAlchemy 2.0, `DeclarativeBase`.
- `check_same_thread=False` только для SQLite.
- `get_db()` — генератор-зависимость FastAPI.
- `init_db()` — `Base.metadata.create_all(bind=engine)`.

### Роутеры

Порядок регистрации в `app.py`: `auth → users → tests → access → change_requests → assets → questions → attempts → statistics`.

#### `/api/auth` — [`routes/auth.py`](api/routes/auth.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | нет | регистрация |
| POST | `/api/auth/login` | нет | вход, возвращает JWT |
| POST | `/api/auth/logout` | нет (ручная проверка) | инвалидация сессии |
| GET | `/api/auth/me` | required | текущий пользователь |
| POST | `/api/auth/refresh` | нет (ручная проверка) | новый JWT, старая сессия инвалидируется |

#### `/api/users` — [`routes/users.py`](api/routes/users.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/users/me/profile` | required | профиль |
| PATCH | `/api/users/me/profile` | required | обновить display_name |
| POST | `/api/users/me/avatar` | required | загрузить аватар |
| DELETE | `/api/users/me/avatar` | required | удалить аватар |
| GET | `/api/users/{user_id}/avatar` | нет | публичный аватар |

#### `/api/tests` — [`routes/tests.py`](api/routes/tests.py)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/api/tests` | optional | список (bulk-запрос TestCollection, без N+1) |
| POST | `/api/tests` | required | создать пустую коллекцию |
| GET | `/api/tests/{id}` | optional | данные теста |
| PATCH | `/api/tests/{id}` | required (owner) | переименовать |
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
| GET | `/api/tests/{id}/statistics` | required (owner) | статистика теста |

### Сервисы

| Сервис | Файл | Назначение |
|---|---|---|
| `auth_service` | [`services/auth_service.py`](api/services/auth_service.py) | bcrypt-хеширование, JWT create/verify, CRUD сессий по `jti` |
| `access_service` | [`services/access_service.py`](api/services/access_service.py) | RBAC: `can_view_test`, `can_edit_test`, CRUD TestCollection/TestShare |
| `change_request_service` | [`services/change_request_service.py`](api/services/change_request_service.py) | полный lifecycle CR; оптимизированный подсчёт через прямые WHERE-запросы |
| `test_service` | [`services/test_service.py`](api/services/test_service.py) | `load_test_payload`, `save_test_payload`, `find_question` |
| `attempt_service` | [`services/attempt_service.py`](api/services/attempt_service.py) | lifecycle попытки: start/answer/skip/finish/abandon |
| `stats_service` | [`services/stats_service.py`](api/services/stats_service.py) | server-side агрегация через `func.sum/count/avg`; per-question breakdown |
| `cleanup_service` | [`services/cleanup_service.py`](api/services/cleanup_service.py) | фоновый поток с `threading.Event` — graceful shutdown; удаление abandoned-попыток (каждые 24ч) |
| `image_service` | [`services/image_service.py`](api/services/image_service.py) | валидация/сохранение/ресайз аватаров через Pillow |

### Модели БД и индексы

Регистрируются в `api/models/db/__init__.py` (импортируются при `init_db()`).

```
users ─────────┬──► sessions          (user_id FK, cascade delete)
               ├──► test_collections  (owner_id FK, cascade delete)
               └──► change_requests   (user_id FK, SET NULL on delete)

test_collections ──► test_shares      (test_collection_id FK, cascade delete)
                 └──► change_requests (test_collection_id FK, cascade delete)

attempts ──────────► attempt_answers  (attempt_id FK, cascade delete)
```

| Таблица | Ключевые поля |
|---|---|
| `users` | `id`, `username` (unique), `email` (unique), `hashed_password`, `display_name`, `avatar_path`, `is_active` |
| `sessions` | `token_jti` (unique), `expires_at`, `is_active`, `last_activity` |
| `test_collections` | `test_id` (filesystem uuid), `owner_id`, `access_level` (private/shared/public) |
| `test_shares` | `(test_collection_id, user_id)` unique |
| `change_requests` | `type`, `status` (pending/approved/rejected), `payload` (JSON Text) |
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

Не-владелец может предлагать: добавить, редактировать или удалить вопрос, изменить настройки. Payload хранится как JSON. При одобрении `_apply_*` хелперы читают `test.json`, применяют изменение, записывают обратно.

### БД и миграции

| Порядок | Ревизия | Содержание |
|---|---|---|
| 1 | `1a0e23fe226f` | Таблицы `users`, `sessions` |
| 2 | `e7309514da6f` | Поля профиля (`display_name`, `avatar_path`, `avatar_size`) |
| 3 | `6d6221c278d9` | `test_collections`, `test_shares` |
| 4 | `a8b5c3d7e9f1` | `change_requests` |
| 5 | `f911293af21c` | Индексы производительности (9 индексов) |

Схема также создаётся через `Base.metadata.create_all()` при старте. При наличии существующей БД: `alembic upgrade head`.

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

Modern-minimal стиль (Linear/Vercel):
- **Шрифт**: system-ui, `-apple-system`, Segoe UI, Roboto — системные шрифты, нет Google Fonts.
- **Акцент**: emerald-600 (`#059669` light, `#34d399` dark) — корпоративный цвет БГУ.
- **Иконки**: Heroicons v2 outline — `static/icons.svg` SVG-спрайт, используется через `<svg><use href="/static/icons.svg#name"/></svg>`.
- **Tailwind CSS v3**: Play CDN (`cdn.tailwindcss.com`) без сборщика. `preflight: false` — не конфликтует с существующим CSS. `darkMode: ['selector', '[data-theme="dark"]']`. Для production рекомендуется Tailwind CLI.
- **Тема**: переключается JS через `data-theme="dark"` на `:root`. Состояние в `localStorage`.

### Структура JS (граф загрузки)

```
app.js (static)
  ├─ rendering.js (static) ← ensureChartJs(), ensureMathJax() — lazy CDN inject
  ├─ state.js (static)
  ├─ i18n.js (static)
  ├─ telemetry.js (static)
  ├─ api.js (static)
  ├─ screens/auth.js (static) ← критический путь
  └─ [post-auth, Promise.all dynamic import]:
       ├─ screens/management.js → components/modals.js → editor.js (1036 строк)
       ├─ screens/testing.js
       ├─ screens/statistics.js
       └─ screens/profile.js
```

**Lazy-загрузка**:
- Экраны management/testing/statistics/profile и их зависимости (включая editor.js) не грузятся до авторизации.
- `Chart.js` (cdn.jsdelivr.net) внедряется динамически при первом открытии статистики.
- `MathJax 3` (cdn.jsdelivr.net) внедряется динамически при первом рендере формулы.

### Экраны

В `index.html` пять секций `<section class="app-screen">`. Активна одна — остальные скрыты через `.is-hidden`. URL всегда `/`, истории браузера нет.

| Экран | ID | Назначение |
|---|---|---|
| Auth | `screen-auth` | Вход / регистрация (таб-свитчер) |
| Management | `screen-management` | Список тестов (пилл-табы, Heroicons-бэйджи доступа) |
| Testing | `screen-testing` | Прохождение теста (настройки / вопросы / результаты) |
| Profile | `screen-profile` | Профиль, аватар |
| Statistics | `screen-stats` | История попыток, фильтры, Chart.js |

### CSS

5 файлов, подключаются в порядке:
1. `base.css` — reset; `.is-hidden { display: none !important }`.
2. `layout.css` — раскладка экранов и панелей.
3. `components.css` — UI-компоненты (кнопки, карточки, таблицы).
4. `editor.css` — редактор вопросов.
5. `theme.css` — CSS custom properties: `--primary`, `--bg`, `--card`, `--text`, `--success`, `--danger`, `--warning`, `--neutral`. Emerald accent (light/dark).

Tailwind utility-классы добавляются поверх через Play CDN (runtime). Inline `<style>` в `index.html` содержит переопределения для фиксированного заголовка, dark-mode иконок, и экранов.

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
| Нет автотестов (pytest) | Высокая |
| `ABANDONED_RETENTION_DAYS = 90` захардкожено в `cleanup_service.py` | Низкая |
| Tailwind Play CDN — для production рекомендуется Tailwind CLI или standalone | Низкая |
| MathJax и Chart.js грузятся с CDN без SRI-хешей | Низкая |
| `api/models/attempts.py` — Pydantic-модели не используются роутами | Низкая |
