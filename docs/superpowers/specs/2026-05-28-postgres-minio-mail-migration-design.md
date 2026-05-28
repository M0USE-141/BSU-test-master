# Design: переход на PostgreSQL + MinIO + Mail (Resend)

**Дата:** 2026-05-28
**Статус:** approved (brainstorming)
**Scope:** средний — инфра + миграция payload в БД + ассеты в S3 + mail + закрытие known gaps. Без автотестов и observability.

## Цели

1. **Единый источник правды** — payload вопросов из `data/tests/<uuid>/test.json` переезжает в Postgres; ассеты — в MinIO. Устраняется двойная запись (БД + FS) и race condition при approve CR.
2. **Production-grade деплой** — docker-compose с reverse-proxy (Caddy), per-project subdomain (`<sub>.domain.uz`), shared infrastructure stack.
3. **Mail-сервис** — password reset, нотификации (CR/share). Resend как primary, Postfix как теоретический fallback.
4. **Закрытие known gaps** из ARCH.md — авторизация на `GET /api/tests/{id}/assets` и роутер `questions.py`.

## Не-цели

- Перенос существующих данных (текущие тестовые).
- Масштабирование (один VPS достаточен).
- Автотесты, CI/CD, observability — отдельный roadmap.
- Backup — отложен.
- WebSocket для уведомлений, refresh-токены — отложены.

---

## Архитектура

### Целевая топология (multi-project VPS)

```
┌──────────────────────────────────────────────────────────────────────┐
│  VPS (multi-project)                                                  │
│                                                                       │
│  caddy (auto-TLS) :80 :443                                            │
│    testmaster.domain.uz → testmaster_app:8000                         │
│    s3.domain.uz         → minio:9000                                  │
│    s3-console.domain.uz → minio:9001                                  │
│                                                                       │
│  shared stack (/srv/shared/docker-compose.yml):                       │
│    caddy, postgres:16-alpine, minio                                   │
│    (backup-сервис — отложен)                                          │
│                                                                       │
│  per-project (/srv/testmaster/docker-compose.yml):                    │
│    app (FastAPI + SPA)                                                │
│                                                                       │
│  networks: edge (caddy↔apps), data (apps↔postgres/minio)              │
│  volumes:  pg_data, minio_data, caddy_data, caddy_config              │
└──────────────────────────────────────────────────────────────────────┘
```

### Изоляция проектов

| Уровень | Механизм |
|---|---|
| DNS/proxy | Caddy маршрутизирует по `Host:` |
| Postgres | Одна инстанция, отдельная **database** + **role** на проект |
| MinIO | Одна инстанция, project-prefixed buckets + service-account с bucket-policy «только свои» |
| Docker | Internal networks `edge`/`data`; БД не публикуется наружу |

### Файловая структура на VPS

```
/srv/
  shared/
    docker-compose.yml      # caddy, postgres, minio
    Caddyfile
    init-databases.sh       # одноразовый init Postgres
    .env                    # POSTGRES_ROOT_PASSWORD, MINIO_ROOT_*, ACME_EMAIL, DOMAIN
  testmaster/
    docker-compose.yml      # только app
    .env                    # DATABASE_URL, S3_*, SECRET_KEY, RESEND_API_KEY
```

---

## Схема БД (PostgreSQL 16)

### Изменения относительно текущей SQLite-схемы

| Сущность | Изменение | Зачем |
|---|---|---|
| **(new)** `questions` | Новая таблица — один вопрос = одна строка с JSONB-payload | Единый источник правды; FK от `question_performance`/`flagged_question`; атомарный CR-approve |
| **(new)** `import_jobs` | Очередь async-импорта docx | `BackgroundTasks` для тяжёлой конвертации |
| **(new)** `outgoing_emails` | Аудит и retry mail | Доставка не теряется при сбоях |
| `test_collections` | + `settings_jsonb JSONB`; `test_id` (UUID slug) сохраняется как стабильный публичный идентификатор | Метаданные теста рядом, без файла; URL стабильны |
| `users` | `avatar_path` → `avatar_object_key String?`; убрать `avatar_size`; + `email_verified_at`, `email_notifications`, `email_digest` | Уход от FS; mail-preferences |
| `attempts.settings_json` | Text → **JSONB** | Тип-безопасность, индексируемость |
| `attempt_answers.question_text_json` / `options_json` | Text → **JSONB** | То же |
| `attempt_answers.question_id` | int → FK к `questions.id` ON DELETE SET NULL, snapshot сохраняется | Связь, не блокирующая удаление вопроса |
| `change_requests.payload` | Text → **JSONB** | То же |
| `notifications.payload` | Text → **JSONB** | То же |
| `question_performance.question_id` / `flagged_question.question_id` | становятся FK на `questions.id` | FK-целостность |

### `questions`

```python
class Question(Base):
    __tablename__ = "questions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)   # UUID
    test_collection_id: Mapped[int] = mapped_column(
        ForeignKey("test_collections.id", ondelete="CASCADE"), index=True
    )
    order_index: Mapped[int]
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at, updated_at: Mapped[datetime]

    __table_args__ = (
        UniqueConstraint("test_collection_id", "order_index", name="uq_question_order"),
        Index("ix_questions_collection_order", "test_collection_id", "order_index"),
        Index("ix_questions_payload_gin", "payload", postgresql_using="gin"),
    )
```

`payload` содержит ContentItem[] (text/img/formula/code блоки), options[], correct_option_index, explanation, tags.

### `import_jobs`

```python
class ImportJob(Base):
    __tablename__ = "import_jobs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str]                                  # pending|processing|done|failed
    source_filename: Mapped[str] = mapped_column(String(255))
    test_collection_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_collections.id", ondelete="SET NULL"), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at, updated_at: Mapped[datetime]

    __table_args__ = (Index("ix_import_jobs_user_status", "user_id", "status"),)
```

Исходный `.docx` кладётся в `imports/<job_id>/source.docx` в MinIO; lifecycle-rule удалит через 24ч.

### `outgoing_emails`

```python
class OutgoingEmail(Base):
    __tablename__ = "outgoing_emails"
    id: Mapped[str] = mapped_column(primary_key=True)    # UUID
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    event: Mapped[str]                                    # password_reset, share_received, ...
    to_address: Mapped[str]
    status: Mapped[str]                                   # queued|sent|failed|bounced
    provider_message_id: Mapped[str | None]
    error: Mapped[str | None]
    attempt_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime]
    sent_at: Mapped[datetime | None]

    __table_args__ = (Index("ix_outgoing_emails_status_created", "status", "created_at"),)
```

### Alembic — squash в одну ревизию

Поскольку production-данных нет, существующие 10 миграций объединяются в одну `pg_initial` с `down_revision=None`. Старые файлы удаляются.

### Search

`routes/search.py` → SQL по `questions.payload` через GIN-индекс (`ILIKE` по `payload->>'text'` или `tsvector` GENERATED COLUMN в следующей итерации).

---

## Storage layer (MinIO)

### Бакеты на проект

- `testmaster-assets` — картинки/файлы вопросов, исходные docx импортов
- `testmaster-avatars` — аватары пользователей

Версионирование MinIO **выключено**. Lifecycle-rule: префикс `imports/` — expire через 24ч.

### Object keys

Единственное место построения ключей — `api/services/storage_keys.py`:

```
tests/<test_uuid>/questions/<question_uuid>/img-NNN.<ext>
tests/<test_uuid>/settings/cover.jpg
imports/<job_id>/source.docx
users/<user_id>/current.jpg
users/<user_id>/thumb-64.jpg
```

UUID-валидация + whitelist-символов в filename защищают от path-traversal.

### `storage_service` (абстракция)

```python
class StorageBackend(Protocol):
    def put_object(self, key, data, *, content_type, length=None) -> None
    def get_object_stream(self, key) -> BinaryIO
    def delete_object(self, key) -> None
    def delete_prefix(self, prefix) -> int
    def object_exists(self, key) -> bool
    def presigned_get(self, key, *, expires=1h) -> str
    def presigned_put(self, key, *, expires=15m, content_type=None) -> str
    def list_prefix(self, prefix) -> list[str]
```

Реализации:
- `S3StorageBackend` — `minio-py`. Раздельные internal endpoint (`minio:9000` без TLS) и public endpoint (`https://s3.domain.uz` для presigned URL в браузере)
- `LocalStorageBackend` — FS под `data/storage/<bucket>/<key>`; presigned URL = dev-роутер `/api/dev-storage/...?sig=<hmac>`. Для unit-тестов и dev без docker

DI через `Depends(get_storage)`.

### IAM-политика

Один service-account на проект, bucket-policy ограничивает действия `s3:GetObject|PutObject|DeleteObject|ListBucket` только над `testmaster-*`.

### Доступ из браузера

- **Чтение ассета**: app возвращает `307 Redirect` на presigned GET URL (TTL 1ч). Auth-проверка `can_view_test` — при выдаче URL.
- **Загрузка ассета**: `POST /api/tests/{id}/assets` возвращает `{upload_url, object_key, expires_in: 900}`; клиент делает `PUT` напрямую в `s3.domain.uz`. Затем `POST /api/tests/{id}/assets/confirm` валидирует существование объекта и связывает с вопросом. Auth — `can_edit_test`.

CORS на бакете `testmaster-assets` разрешает `https://testmaster.domain.uz` для GET/PUT.

### Замена старых утилит

- `api/utils/paths.py::test_dir/payload_path/assets_dir` → удаляются
- `api/utils/file_utils.py::safe_asset_path` → удаляется
- Все вызовы переписываются на `storage_service` + `storage_keys`

---

## Async docx-импорт

`POST /api/tests/upload`:
1. Создать `ImportJob(status=pending)` + загрузить docx в MinIO `imports/<job_id>/source.docx`
2. Вернуть `202 Accepted` + `{job_id}`
3. `BackgroundTasks` гоняет `WordTestExtractor` + конвертацию метафайлов → создаёт `TestCollection` + N `Question` → пишет ассеты в MinIO → `status=done`
4. Уведомление через `notification_service` при завершении
5. Фронт polling-ит `GET /api/import-jobs/{id}` (или ждёт нотификацию)

**Recovery после рестарта**: при старте `app` cleanup-сервис переводит `processing`-задания старше 10 мин в `failed("interrupted")`.

### Конвертация WMF/EMF в Linux-контейнере

Pillow на Linux WMF/EMF не рендерит. Решение:

- **Inkscape** в Dockerfile (`apt install inkscape`, +~250 МБ)
- `core/image_convert.py::_convert_with_inkscape()` — `subprocess.run(["inkscape", ..., "--export-type=png"], timeout=30)`
- Fallback: CloudConvert при наличии `CLOUDCONVERT_API_KEY`
- На Windows остаётся Pillow (как сейчас)

---

## Mail-сервис

### Провайдеры

- **Primary**: `ResendProvider` через `resend` SDK или `httpx` → Resend HTTP API. Free tier 3000 писем/мес.
- **Fallback**: `SmtpProvider` (sync `smtplib`) против Postfix-контейнера в shared-стеке. **Postfix не разворачиваем заранее** — поднимается при исчерпании Resend free tier. Требует PTR + SPF + DKIM + DMARC настройки на стороне DNS, плюс warmup репутации IP.
- **Dev**: `ConsoleMailProvider` — пишет в `data/mail-debug/*.eml`

Выбор через `MAIL_PROVIDER=resend|smtp|console`.

### Архитектура

```python
class MailMessage:  to, subject, text_body, html_body, from_address, reply_to, tags
class MailProvider(Protocol):  def send(message) -> str  # provider_message_id

class MailService:
    def send_template(self, *, to, locale, template, context, tags) -> str:
        # render Jinja2 .txt + .html → создать OutgoingEmail(queued)
        # вернуть id; реальная отправка — через BackgroundTasks
```

Все письма проходят через `outgoing_emails` (создание → `queued` → `sent`/`failed`). Retry — фоновый thread (тот же `cleanup_service`): забирает `status=failed AND attempt_count<3 AND created_at>now()-1d`, переотправляет с экспоненциальным backoff (5/30/120 мин).

### Шаблоны

```
api/templates/mail/
  base.{html,txt}
  ru/{password_reset, change_request_received, share_received, welcome, change_request_resolved}.{html,txt}
  en/...
  uz/...
```

Локаль — из `user.language`, fallback `ru`. Jinja2 `Environment(autoescape=select_autoescape(["html"]))`.

### События

| Событие | Trigger | Шаблон | Приоритет |
|---|---|---|---|
| Password reset | `POST /api/auth/password-reset/request` | `password_reset` | High |
| Welcome / verify | `POST /api/auth/register` (опц., см. open question) | `welcome` | Medium |
| CR получен (для owner) | `change_request_service.create` | `change_request_received` | Medium |
| Share получен | `access_service.add_share` | `share_received` | Low |
| CR approved/rejected | `change_request_service.approve/reject` | `change_request_resolved` | Low |

### Rate-limiting

- ≤3 password-reset/час на email — проверка `outgoing_emails`
- ≤10 уведомлений/сутки на user_id+event
- Anti-enumeration: `POST /password-reset/request` всегда `200 OK`

### Отправка

```python
@router.post("/password-reset/request")
def request_reset(payload, bg: BackgroundTasks,
                  mail: MailService = Depends(get_mail_service),
                  db: Session = Depends(get_db)):
    user = users_repo.find_by_email(db, payload.email)
    if user:
        token = create_password_reset_token(db, user.id)
        bg.add_task(mail.send_template,
                    to=user.email, locale=user.language, template="password_reset",
                    context={"subject": ..., "reset_url": ..., "ttl_minutes": 30},
                    tags=["password_reset"])
    return {"ok": True}
```

### User-preferences (новые поля в `users`)

```python
email_verified_at: Mapped[datetime | None]
email_notifications: Mapped[bool] = mapped_column(default=True)
email_digest: Mapped[bool] = mapped_column(default=False)
```

Управляются через `settings.js` → `PATCH /api/users/me/profile`. Digest на старте не реализуем — только флаг.

---

## Закрытие known gaps

- `GET /api/tests/{id}/assets/{path}` — добавить `Depends(get_optional_user)` + проверку `access_service.can_view_test`
- `routes/questions.py` (POST/PATCH/DELETE уже требуют `can_edit_test`) — добавить `Depends(get_current_user)` явно
- Любые места, где сейчас читается `data/tests/<id>/test.json` — переписать на `questions_service.get_test_questions(test_id)` (читает из БД)

---

## Docker Compose

### `/srv/shared/docker-compose.yml`

Сервисы: `caddy`, `postgres`, `minio`. Networks: `edge`, `data` (`external: true` для per-project compose). Volumes: `pg_data`, `minio_data`, `caddy_data`, `caddy_config`. Каждый сервис с `healthcheck` и `restart: unless-stopped`.

`init-databases.sh` (one-shot в `docker-entrypoint-initdb.d/`) создаёт databases/roles при первом старте Postgres. Provisioning последующих проектов — через `scripts/provision_project.sh` против работающей БД.

### `/srv/testmaster/docker-compose.yml`

Единственный сервис `app`:
- `build: .` (новый thin Dockerfile)
- `networks: [edge, data]` (external)
- env: `DATABASE_URL`, `S3_*`, `SECRET_KEY`, `RESEND_API_KEY`, `ALLOWED_ORIGINS=https://testmaster.${DOMAIN}`, `APP_VERSION`
- `depends_on: { postgres: healthy, minio: healthy }`
- Никаких published ports (через caddy), никаких volumes

### Dockerfile (multi-stage)

```
FROM python:3.13-slim AS base
RUN apt install --no-install-recommends curl libpq5 inkscape \
    fonts-dejavu fonts-liberation

FROM base AS deps
RUN apt install build-essential libpq-dev
COPY pyproject.toml uv.lock
RUN pip install uv && uv sync --frozen --no-dev

FROM base AS runtime
COPY --from=deps /app/.venv /app/.venv
COPY . ./
USER appuser
HEALTHCHECK curl -f http://localhost:8000/api/health
CMD uvicorn api:app --host 0.0.0.0 --port 8000
```

Размер образа ~500 МБ (Inkscape +зависимости).

### Caddyfile

```
testmaster.{$DOMAIN}    { reverse_proxy testmaster_app:8000  encode gzip }
s3.{$DOMAIN}            { reverse_proxy minio:9000  request_body { max_size 100MB } }
s3-console.{$DOMAIN}    { reverse_proxy minio:9001 }
```

### `GET /api/health`

Новый лёгкий endpoint: проверка `SELECT 1` к Postgres (timeout 1с), без проверки MinIO (избегаем каскадного fail). Возвращает `{db: ok|fail, version: APP_VERSION}`.

### Deploy

```bash
git pull && docker compose build
docker compose up -d --no-deps app
docker compose exec app alembic upgrade head
```

Простой простоя ~5 сек при рестарте — приемлемо.

---

## Запуск (без миграции данных)

1. `cd /srv/shared && docker compose up -d`
2. `scripts/provision_project.sh testmaster` — создаёт БД/роль/бакеты/service-account/CORS/lifecycle
3. `cd /srv/testmaster && docker compose up -d`
4. `docker compose exec app alembic upgrade head` (применит squashed `pg_initial`)
5. `scripts/cli.py create-user --username admin --admin`
6. Smoke по `scripts/attempts_smoke.md` (6 текущих сценариев) + новые:
   - 7. `mc ls minio/testmaster-assets/tests/<uuid>/` — ассеты на месте
   - 8. `psql -c 'SELECT count(*) FROM questions'` — вопросы в БД
   - 9. Сетевая изоляция БД
   - 10. Импорт docx с EMF — присутствует PNG в MinIO

### Удаляется

- `data/testmaster.db`, `data/tests/`, `data/avatars/` (`.gitkeep` оставить)
- Старые миграции `alembic/versions/*` — squash в `pg_initial`
- `api/utils/paths.py`, `safe_asset_path`
- `scripts/migrate_test_ownership.py`

### Dev-режим

Поддерживается через `STORAGE_BACKEND=local` + `DATABASE_URL=sqlite://`. Удобен для онбординга без docker.

---

## Конфигурация (`.env` per project)

```bash
DOMAIN=domain.uz
DATABASE_URL=postgresql://testmaster_user:<pw>@postgres:5432/testmaster
SECRET_KEY=<random 32>
ALLOWED_ORIGINS=https://testmaster.domain.uz
APP_VERSION=<git sha>

STORAGE_BACKEND=s3
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=https://s3.domain.uz
S3_ACCESS_KEY=testmaster_app
S3_SECRET_KEY=<random 32>
S3_BUCKET_ASSETS=testmaster-assets
S3_BUCKET_AVATARS=testmaster-avatars
S3_REGION=us-east-1

MAIL_PROVIDER=resend
MAIL_FROM=noreply@domain.uz
MAIL_REPLY_TO=
RESEND_API_KEY=re_...

ACCESS_TOKEN_EXPIRE_MINUTES=60
ABANDONED_RETENTION_DAYS=90
# CLOUDCONVERT_API_KEY=  (опц. fallback для Inkscape)
```

---

## Риски

| Риск | Митигация |
|---|---|
| Presigned URL не открывается (CORS / wrong endpoint) | Раздельные `S3_ENDPOINT`/`S3_PUBLIC_ENDPOINT`; явный `mc anonymous set-cors` в provision; smoke-test |
| Inkscape не справляется с экзотическим EMF | CloudConvert fallback при наличии ключа; placeholder + warning |
| Pydantic schema drift с JSONB-payload | `QuestionPayload` валидируется в `questions_service` перед write |
| Утечка S3-ключей одного проекта | bucket-policy ограничивает scope |
| Caddy auto-TLS LE rate-limit | staging-CA в dev; не пересоздавать `caddy_data` без нужды |
| MinIO лежит → presigned URL выдан, но не работает | `presigned_get` — offline-signing, сервер не падает; клиент получит ошибку загрузки картинки, UI продолжит работать |
| Inkscape subprocess зависает | `timeout=30` |
| BackgroundTasks теряются при рестарте | Recovery в startup — `processing > 10m → failed("interrupted")` |
| Забыли применить миграцию | Явный шаг в deploy-loop |
| Resend free tier исчерпан | Переключение `MAIL_PROVIDER=smtp` → Postfix-контейнер (требует DNS-настройки заранее) |
| Self-hosted Postfix → письма в спам | PTR, SPF, DKIM, DMARC; warmup; чистый IP. Готово быть к низкой deliverability в начале. |
| Один VPS = SPOF | Принимаем для educational |

---

## Open questions

1. **CloudConvert** — оставить как fallback или удалить? → оставить с warning if no key.
2. **Email verification при регистрации** — сейчас или вторая итерация? → решить при имплементации; default — без verification (только `email_verified_at IS NULL` для статуса).
3. **`outgoing_emails` в `pg_initial` или отдельной миграцией?** → в `pg_initial`, проще.
4. **Digest-режим email** — отложить до жалоб.

---

## Следующий шаг

После approve этой спеки — invoke `superpowers:writing-plans` для детального implementation-плана (по этапам, с проверочными точками).
