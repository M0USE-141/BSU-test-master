# CLAUDE.md — TestMasterBSU

Стек: FastAPI + SQLAlchemy 2.0 / Alembic / SQLite + JWT (python-jose, bcrypt) + ванильный ES-modules SPA.

## Команды

```bash
uv sync                                     # установить зависимости
uvicorn api:app --reload                    # dev-сервер → http://localhost:8000
alembic upgrade head                                                   # применить миграции БД (обязательно при первом запуске)
python scripts/migrate_test_ownership.py --owner-username alice        # назначить владельцев существующим тестам
python scripts/cli.py file.docx            # CLI-импорт теста из docx (без привязки к пользователю)
```

Тестов (pytest) нет. Ручной smoke-чеклист: `scripts/attempts_smoke.md`.

## Структура каталогов

```
api/
  app.py            # FastAPI: роутеры, CORS, startup
  config.py         # все ENV-переменные и пути
  database.py       # SQLAlchemy engine, SessionLocal, get_db(), init_db()
  dependencies/     # auth.py — get_current_user / get_optional_user
  routes/           # 11 роутеров (auth, users, tests, access, change_requests,
                    #             assets, questions, attempts, statistics,
                    #             notifications, search)
  services/         # бизнес-логика (9 сервисов, включая notification_service)
  models/           # Pydantic-схемы (запрос/ответ) + models/db/ (SQLAlchemy)
  utils/            # paths, file_utils, json_utils, validation, time_utils
core/
  word_extract.py   # WordTestExtractor — docx → TestQuestion[]
  serialization.py  # ContentItem[] → JSON-блоки для фронта
  image_convert.py  # WMF/EMF → PNG (Pillow на Win, CloudConvert на остальных)
  models.py         # dataclass-ы: ContentItem, TestQuestion, TestOption, TestSession
static/
  index.html        # единственный HTML, отдаётся на GET /
  css/
    tokens.css      # дизайн-токены (цвета, тени, радиусы, отступы)
    base.css        # reset, body, focus-visible
    components.css  # btn, card, chip, input, modal, heatmap, ring…
    layout.css      # desktop grid, mobile bottom-nav shell
    screens/        # desktop.css, mobile.css, stats.css, taking.css
  js/
    main.js         # entry-point: тема, локаль, router bootstrap
    router.js       # hash-router + cache-bust (window.__APP_VERSION__ от сервера) + window.__iconsFresh preload
    state.js        # central store
    i18n.js         # t(), setLocale(), 3 локали
    icons.js        # ~40 inline SVG (icon(), iconEl()), window.__iconsFresh delegation
    search-palette.js  # cmd-K / Ctrl-K overlay
    api/            # fetch-обёртки: auth, users, tests, access, change-requests,
                    #   attempts, statistics, questions, assets, notifications, search
    screens/
      desktop/      # home, taking, results, stats, notifications,
                    # change-requests, settings, import, profile
      mobile/       # _shell, home, collection, taking, results, stats,
                    # profile, tests, notifications, settings, import
      auth/         # login, register
    utils/          # device.js, theme.js, locale.js, format.js, render-blocks.js,
                    #             escape.js (escHtml), client-id.js (getClientId)
    components/     # переиспользуемые компоненты (Modal, Heatmap, Ring…)
  locales/          # ru.json, en.json, uz.json
  fonts/            # (опционально) self-hosted Inter + JetBrains Mono woff2
design-plans/       # React/JSX прототипы на CDN-Babel (read-only, не компилируются)
alembic/versions/   # 7 миграций
scripts/            # run_app.py, cli.py, migrate_test_ownership.py
data/               # testmaster.db, tests/<uuid>/{test.json,assets/}, avatars/
```

Не трогать: `api/models/attempts.py` (legacy Pydantic, не используется роутами).

## Карта роутеров

| Префикс | Файл | Требует auth |
|---|---|---|
| `/api/auth` | `routes/auth.py` | регистрация/логин — нет; `/me`, `/change-password` — да |
| `/api/users` | `routes/users.py` | да (кроме `GET /{id}/avatar`, `GET /{id}`) |
| `/api/tests` | `routes/tests.py` | список/просмотр — optional; create/edit/delete — да |
| `/api` (access) | `routes/access.py` | да |
| `/api` (change-req) | `routes/change_requests.py` | да |
| `/api/tests/{id}/assets` | `routes/assets.py` | нет (known gap) |
| `/api/tests/{id}/questions` | `routes/questions.py` | нет (known gap) |
| `/api/attempts` | `routes/attempts.py` | start — optional; остальные — нет |
| `/api` (stats) | `routes/statistics.py` | `/stats/me/trend` — да; остальные — нет |
| `/api/notifications` | `routes/notifications.py` | да |
| `/api/search` | `routes/search.py` | optional |

## Инварианты

- Все новые защищённые эндпоинты: `Depends(get_current_user)` из `api/dependencies/auth.py`.
- Проверки доступа к тесту — только через `access_service.can_view_test` / `can_edit_test`.
- Пути к файлам тестов — только через `api/utils/paths.py` (`test_dir`, `payload_path`, `assets_dir`).
- Пути к ассетам — через `safe_asset_path` из `api/utils/file_utils.py` (защита от path traversal).
- Изменения тестов от не-владельца — только через change requests.
- При изменении схемы БД: создать Alembic-ревизию (`alembic revision --autogenerate`) + обновить SQLAlchemy-модели в `api/models/db/`.
- Уведомления создаются **только** через `notification_service.create_notification()` — не напрямую в БД.

## Frontend-инварианты

- Hash-based routing: `#/home`, `#/test/:id/take`, `#/stats` и т.д.
- Каждый экранный модуль — `export default async function render(root, params)`.
- Все overlay/модалки — класс `.modal-backdrop` (не `.modal-overlay`).
- Иконки — `icon(kind, size)` / `iconEl(kind, size)` из `../../icons.js`, не emoji.
- Темизация — только `setTheme()` из `utils/theme.js`, `data-theme` на `<html>`.
- Локализация — только `t('key')` из `utils/locale.js`, ключи в `locales/*.json`.
- Новые экраны добавляются в `ROUTES` в `router.js`.

Подробная архитектура — в `ARCH.md`.
