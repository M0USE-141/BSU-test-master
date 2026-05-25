# CLAUDE.md — TestMasterBSU

Стек: FastAPI + SQLAlchemy 2.0 / Alembic / SQLite + JWT (python-jose, bcrypt) + ванильный ES-modules SPA.

## Команды

```bash
uv sync                                     # установить зависимости
uvicorn api:app --reload                    # dev-сервер → http://localhost:8000
alembic upgrade head                        # применить миграции БД (обязательно при первом запуске)
python scripts/migrate_test_ownership.py    # назначить владельцев существующим тестам
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
  routes/           # 9 роутеров (auth, users, tests, access, change_requests,
                    #             assets, questions, attempts, statistics)
  services/         # бизнес-логика
  models/           # Pydantic-схемы (запрос/ответ) + models/db/ (SQLAlchemy)
  utils/            # paths, file_utils, json_utils, validation, time_utils
core/
  word_extract.py   # WordTestExtractor — docx → TestQuestion[]
  serialization.py  # ContentItem[] → JSON-блоки для фронта
  image_convert.py  # WMF/EMF → PNG (Pillow на Win, CloudConvert на остальных)
  models.py         # dataclass-ы: ContentItem, TestQuestion, TestOption, TestSession
static/
  index.html        # единственный HTML, отдаётся на GET /
  js/app.js         # entry-point ES-модулей
  js/api/           # fetch-обёртки (auth.js, profile.js)
  js/screens/       # логика экранов (auth, management, testing, profile, statistics)
  js/components/    # модалки (access-modal, change-requests-modal, …)
  js/utils/         # locale.js, theme.js, file-upload.js
  js/               # rendering.js, editor.js, state.js, i18n.js, telemetry.js
  css/              # base, layout, components, editor, theme (CSS-переменные)
alembic/versions/   # 4 миграции: users, profile, access_control, change_requests
scripts/            # run_app.py (launcher), cli.py, migrate_test_ownership.py
data/               # testmaster.db, tests/<uuid>/{test.json,assets/}, avatars/
```

Не трогать: `static/js/app_old.js` (мёртвый), `static/app.js` (0 байт), `templates/` (пустая), `api/models/attempts.py` (legacy Pydantic, не используется роутами).

## Карта роутеров

| Префикс | Файл | Требует auth |
|---|---|---|
| `/api/auth` | `routes/auth.py` | регистрация/логин — нет; `/me` — да |
| `/api/users` | `routes/users.py` | да (кроме `GET /{id}/avatar`) |
| `/api/tests` | `routes/tests.py` | список/просмотр — optional; create/edit/delete — да |
| `/api` (access) | `routes/access.py` | да |
| `/api` (change-req) | `routes/change_requests.py` | да |
| `/api/tests/{id}/assets` | `routes/assets.py` | нет (known gap) |
| `/api/tests/{id}/questions` | `routes/questions.py` | нет (known gap) |
| `/api/attempts` | `routes/attempts.py` | start — optional; остальные — нет |
| `/api` (stats) | `routes/statistics.py` | `/tests/{id}/statistics` — да; остальные — нет |

## Инварианты

- Все новые защищённые эндпоинты: `Depends(get_current_user)` из `api/dependencies/auth.py`.
- Проверки доступа к тесту — только через `access_service.can_view_test` / `can_edit_test`.
- Пути к файлам тестов — только через `api/utils/paths.py` (`test_dir`, `payload_path`, `assets_dir`).
- Пути к ассетам — через `safe_asset_path` из `api/utils/file_utils.py` (защита от path traversal).
- Изменения тестов от не-владельца — только через change requests.
- При изменении схемы БД: создать Alembic-ревизию (`alembic revision --autogenerate`) + обновить SQLAlchemy-модели в `api/models/db/`.

Подробная архитектура — в `ARCH.md`.
