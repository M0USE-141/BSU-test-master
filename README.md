# TestMasterBSU

Веб-приложение для создания, управления и прохождения тестов. Поддерживает импорт из `.docx`, три уровня доступа, запросы на изменение, статистику попыток и мультиязычный интерфейс.

## Возможности

- Импорт тестов из `.docx` (таблицы Word, формулы OMML → MathML, изображения WMF/EMF/PNG). Асинхронный — фронт получает `job_id` и опрашивает статус.
- Три уровня доступа: **private** (только владелец), **shared** (список пользователей), **public** (все).
- **Change requests** — не-владелец предлагает изменения, владелец одобряет или отклоняет.
- Прохождение теста с настройкой порядка/лимитов/фильтров.
- Статистика попыток — точность, процент ответов, время, разбивка по вопросам.
- Профиль с аватаром.
- Mail-сервис (Resend / SMTP / Console) для password reset и нотификаций.
- Интерфейс на трёх языках (ru / en / uz), light/dark тема.

## Технологии

| Слой | Стек |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic |
| База данных | PostgreSQL 16 (production), SQLite (lightweight dev) |
| Object storage | MinIO / S3 (production), `LocalStorageBackend` под `data/storage/` (dev) |
| Auth | JWT (python-jose), bcrypt, server-side сессии |
| Извлечение | python-docx, lxml, Pillow (Win) / Inkscape (Linux) |
| Mail | Resend API → SMTP → Console (через провайдер-абстракцию) |
| Frontend | Ванильный JavaScript (ES-modules), без сборщика |
| UI / иконки | Tailwind CSS v4 (Play CDN), Heroicons v2 (inline SVG-спрайт) |
| Формулы | MathJax 3 (CDN, ленивая загрузка) |
| Графики | Chart.js 4 (CDN, ленивая загрузка) |

## Установка

Python 3.13+ обязателен.

```bash
uv sync
```

## Режимы разработки

Есть два поддерживаемых способа запустить локально.

### 1. Полный стек через Docker (рекомендуется)

Поднимает Postgres + MinIO в фоне, приложение запускается на хосте:

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + minio
cp .env.example .env                              # см. ниже
alembic upgrade head
uvicorn api:app --reload
```

`.env` для этого режима:

```env
DATABASE_URL=postgresql+psycopg2://testmaster:testmaster_dev@localhost:5432/testmaster
STORAGE_BACKEND=s3
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_ASSETS=testmaster-assets
S3_BUCKET_AVATARS=testmaster-avatars
MAIL_PROVIDER=console
SECRET_KEY=any-32-char-string-for-dev
ENV=dev
```

Первый запуск: создать бакеты руками через MinIO console (`http://localhost:9001`, root `minioadmin`/`minioadmin`) или скриптом `scripts/provision_minio_local.sh` если `mc` установлен.

### 2. Лёгкий dev без Docker (SQLite + локальная FS)

Никаких контейнеров — всё в памяти и в `data/`:

```bash
cp .env.example .env  # см. ниже
alembic upgrade head
uvicorn api:app --reload
```

`.env`:

```env
DATABASE_URL=sqlite:///./data/testmaster.db
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=./data/storage
MAIL_PROVIDER=console
SECRET_KEY=any-32-char-string-for-dev
ENV=dev
```

Преимущество — быстрый онбординг новых разработчиков. Ограничения: GIN-индекс по JSONB не создаётся (SQL поиск работает через `CAST ... AS TEXT ILIKE`), production-парность ниже.

## Запуск

```bash
uvicorn api:app --reload
```

Откройте http://localhost:8000/. Swagger: http://localhost:8000/docs.

## Production деплой

См. [`deploy/README.md`](deploy/README.md). Архитектура — single-VPS multi-project: shared-стек (Caddy + Postgres + MinIO) и per-project app-контейнер. Полный design-документ — [`docs/superpowers/specs/2026-05-28-postgres-minio-mail-migration-design.md`](docs/superpowers/specs/2026-05-28-postgres-minio-mail-migration-design.md).

```bash
cd deploy/shared && cp .env.example .env && $EDITOR .env && docker compose up -d
cd ../testmaster && cp .env.example .env && $EDITOR .env && docker compose up -d --build
docker compose exec app alembic upgrade head
```

## Структура данных

```
PostgreSQL (production) / SQLite (dev):
  users, sessions, test_collections, test_shares, questions (JSONB),
  attempts, attempt_answers, change_requests, notifications,
  flagged_questions, question_performance, access_requests,
  activity_events, password_reset_tokens, import_jobs, outgoing_emails

MinIO / S3 (production) или data/storage (dev):
  testmaster-assets/tests/<test_uuid>/materials/<short_id><ext>
  testmaster-assets/imports/<job_id>/source.docx       (TTL 24h)
  testmaster-avatars/users/<user_id>/<filename>
```

## API

Swagger доступен на `/docs`. Краткая карта:

| Группа | Базовый путь | Назначение |
|---|---|---|
| auth | `/api/auth` | регистрация, вход, выход, password reset |
| users | `/api/users` | профиль, аватар |
| tests | `/api/tests` | CRUD коллекций тестов, async-импорт `.docx` (POST /upload → 202 + jobId) |
| import-jobs | `/api/import-jobs` | статус async-импорта, мои задания |
| access | `/api/tests/{id}/access` | управление уровнем доступа и shared-списком |
| change-requests | `/api/tests/{id}/change-requests` | предложение и рецензирование |
| attempts | `/api/attempts` | начало, ответы, завершение попытки |
| statistics | `/api/stats`, `/api/tests/{id}/statistics` | статистика попыток |
| assets | `/api/tests/{id}/assets` | материалы теста (storage-backed) |
| questions | `/api/tests/{id}/questions` | прямое редактирование вопросов |
| notifications | `/api/notifications` | inbox уведомлений |
| search | `/api/search` | full-text поиск по title + вопросам |
| health | `/api/health` | liveness/readiness |
| dev-storage | `/api/dev-storage/{key}` | LocalStorageBackend emulation (dev only) |

## Конвертация WMF/EMF

- **Windows** — через Pillow (использует GDI).
- **Linux/Docker** — через Inkscape в production-образе (см. `Dockerfile`). Fallback на CloudConvert если `CLOUDCONVERT_API_KEY` задан.

## Mail

Провайдер выбирается через `MAIL_PROVIDER`:

| Провайдер | Когда |
|---|---|
| `resend` | Production primary (HTTP API, free tier 3000/мес) |
| `smtp` | Fallback / self-hosted Postfix |
| `console` | Dev / тесты — пишет `.eml` в `data/mail-debug/` |

Все письма проходят через таблицу `outgoing_emails` (audit + retry). Фоновый поток в `cleanup_service` пытается переотправить `failed` письма через 5/30/120 мин (макс 3 попытки в течение суток).

## Verification / smoke tests

```bash
uv run python scripts/test_storage_local.py        # Phase 1
uv run python scripts/test_storage_s3.py           # Phase 3 (требует docker compose -f docker-compose.dev.yml up -d)
uv run python scripts/test_assets_storage_e2e.py   # Phase 2
uv run python scripts/test_phase4_questions_db.py  # Phase 4 (требует Postgres)
uv run python scripts/test_phase5_async_import.py  # Phase 5
uv run python scripts/test_phase6_mail.py          # Phase 6
uv run python scripts/verify_docx_pipeline.py <folder-with-docx>  # извлечение из реальных .docx
```

## Известные ограничения

- `SECRET_KEY` по умолчанию небезопасен — обязательно задайте его в `.env` перед production. В `ENV=production` сервер не запустится с дефолтным ключом.
- `ALLOWED_ORIGINS` по умолчанию разрешает только `localhost`.
- Tailwind Play CDN добавляет предупреждение в консоли; для production рекомендуется Tailwind CLI.
- Формат `.doc` не поддерживается — только `.docx`.
- Автотестов pytest нет; есть smoke-скрипты в `scripts/test_*.py`. Ручной чек-лист — [`scripts/attempts_smoke.md`](scripts/attempts_smoke.md).
- Backup пока не реализован — отложен до появления реальных пользователей; см. roadmap в [`ARCH.md`](ARCH.md).

Подробная архитектура — в [`ARCH.md`](ARCH.md).
