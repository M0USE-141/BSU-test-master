# Temp-storage flow для импорта/создания тестов

> Status: **design only** — частично реализовано (Cancel-кнопка в wizard'е), полная backend-перестройка отложена.

## Context

Сейчас `POST /api/tests/upload` выполняется **синхронно**:

1. Читает docx-байты.
2. Сразу создаёт `TestCollection` + `Question` rows.
3. Извлекает материалы (картинки/формулы) в `assets/tests/<test_id>/materials/<rIdN.png>` — имена приходят из Word relationships (`rId5`, `rId6`, …).
4. Возвращает `{metadata, payload, logs}`.

Wizard показывает Step 3 preview. Если юзер кликает «Назад» (теперь «Отменить и удалить») — тест уже создан и засорил БД + storage. Если юзер закрыл вкладку или отвалилась сеть — тест остаётся orphan-ом навсегда.

Также имена `rId5.png` непредсказуемы для каждого нового импорта — они приходят из docx и могут конфликтовать при переимпорте.

## Цель

- Извлечение материалов идёт в **temp-область**, не в финальную.
- Материалы получают **короткие предсказуемые ID** (8-char hex) с самого начала.
- В БД есть таблица `materials` с флагом `is_temporary`.
- **TTL 24h** на временные материалы (lifecycle rule в MinIO + cleanup-job для БД).
- **Confirm** → перенос temp → final, `is_temporary=False`.
- **Cancel** → удаление temp.
- Применимо и к импорту .docx, и к загрузке материалов при создании пустой коллекции (если они тоже должны проходить через temp-стадию — обсудимо).

## Design

### 1. Storage keys

В `api/services/storage_keys.py`:

```python
def temp_material_key(job_id: str, short_id: str, ext: str) -> str:
    """Temp material under import job — TTL'd by bucket lifecycle."""
    _validate_uuid(job_id, name="job_id")
    # short_id: 8-char [0-9a-f]; ext: ".png" / ".svg" / etc.
    return f"{BUCKET_ASSETS}/imports/{job_id}/materials/{short_id}{ext}"

def temp_materials_prefix(job_id: str) -> str:
    _validate_uuid(job_id, name="job_id")
    return f"{BUCKET_ASSETS}/imports/{job_id}/materials/"
```

`assets/imports/<job_id>/` уже подпадает под bucket-lifecycle TTL=24h
(см. `scripts/provision_minio_local.sh`), так что cleanup MinIO даёт бесплатно.

### 2. БД: таблица `materials`

```sql
CREATE TABLE materials (
    short_id      VARCHAR(8) PRIMARY KEY,           -- "a1b2c3d4"
    filename      VARCHAR(100) NOT NULL,            -- "a1b2c3d4.png"
    test_id       VARCHAR(32) REFERENCES test_collections(test_id) ON DELETE CASCADE,
    import_job_id VARCHAR(32) REFERENCES import_jobs(id)            ON DELETE CASCADE,
    is_temporary  BOOLEAN NOT NULL DEFAULT TRUE,
    mime_type     VARCHAR(60),
    size_bytes    INTEGER,
    created_at    TIMESTAMPTZ DEFAULT now(),
    -- Exactly one of test_id / import_job_id is NOT NULL.
    CHECK ((test_id IS NULL) <> (import_job_id IS NULL))
);
CREATE INDEX ix_materials_temp_created ON materials(is_temporary, created_at);
CREATE INDEX ix_materials_test         ON materials(test_id) WHERE test_id IS NOT NULL;
```

Поведение:

- `is_temporary=true` → запись принадлежит import_job, объект в `imports/<job_id>/materials/`.
- `is_temporary=false` → запись принадлежит test, объект в `tests/<test_id>/materials/`.
- При confirm: `UPDATE materials SET test_id=?, import_job_id=NULL, is_temporary=false WHERE import_job_id=?`.

### 3. Короткие ID при извлечении

В `core/word_extract.py`:

```python
import secrets

def _new_short_id() -> str:
    return secrets.token_hex(4)  # 8 hex chars
```

Каждый извлечённый медиа-ресурс получает `short_id = _new_short_id()`. Из Word relationship (`rId5`) теперь не строим имя — relationship_id используется только для дедупликации в рамках одного docx (если две картинки ссылаются на одну relationship, для них тот же short_id).

### 4. Backend flow

**Upload (async).** `POST /api/tests/upload` → 202 + `{job_id}`:

1. Сохраняет docx в `imports/<job_id>/source.docx`.
2. Создаёт `ImportJob(status=pending)`.
3. Запускает `BackgroundTasks.add_task(import_service.run_import, job_id)`.
4. Воркер: парсит docx → пишет материалы в `imports/<job_id>/materials/<short>.png` + `materials` rows с `is_temporary=True` → формирует payload (question.blocks ссылаются на short_id) → `ImportJob.status=preview_ready`, `ImportJob.preview_payload=<json>`.

**Polling.** `GET /api/import-jobs/<job_id>` возвращает `{status, logs[], preview_payload?}`.

Wizard polls (либо WebSocket/SSE если решим внедрить позже) → когда `status=preview_ready`, переходит к Step 3.

**Confirm.** `POST /api/import-jobs/<job_id>/confirm`:

1. Создаёт `TestCollection` (с title/desc/access из job или из тела запроса — клиент может прислать override).
2. Создаёт `Question` rows из `preview_payload`.
3. Move materials:
   ```python
   for m in db.query(Material).filter_by(import_job_id=job_id, is_temporary=True):
       new_key = storage_keys.material_key(test_id, m.filename)
       storage.copy_object(old_key, new_key)
       storage.delete_object(old_key)
       m.is_temporary = False
       m.test_id = test_id
       m.import_job_id = None
   ```
4. `ImportJob.status=done`, `ImportJob.test_collection_id=<test_id>`.
5. Возвращает `{testId, qCount}`.

**Cancel.** `POST /api/import-jobs/<job_id>/cancel`:

1. `storage.delete_prefix(temp_materials_prefix(job_id))`.
2. `DELETE FROM materials WHERE import_job_id=?`.
3. `ImportJob.status=cancelled`.

### 5. Cleanup job

В `api/services/cleanup_service.py` (он уже есть):

```python
# Каждые 30 мин:
old_jobs = db.query(ImportJob).filter(
    ImportJob.status.in_(['pending', 'processing', 'preview_ready']),
    ImportJob.updated_at < now() - interval('24h'),
).all()
for job in old_jobs:
    storage.delete_prefix(temp_materials_prefix(job.id))
    db.query(Material).filter_by(import_job_id=job.id).delete()
    job.status = 'expired'
```

MinIO bucket-lifecycle (TTL 24h на `imports/`) — резервная страховка.

### 6. Frontend wizard изменения

- Step 2 (progress): polling `/api/import-jobs/<job_id>`, отображение `logs[]` live.
- Step 3 (preview): из `preview_payload`. Кнопки:
   - «Отменить и удалить» → `POST .../cancel` → возврат в Step 1.
   - «Подтвердить» → `POST .../confirm` → Step 4 с реальным `testId`.

### 7. Migration plan

| Этап | Действие | Риск |
|---|---|---|
| 1 | Alembic: добавить таблицу `materials` + `import_jobs.preview_payload` (JSONB) + `import_jobs.status` extended | low |
| 2 | Backend: `materials` writes + storage_keys (temp_material_key) — но `/upload` пока всё ещё sync | low |
| 3 | Backend: `/upload` → async + `/confirm` + `/cancel` endpoints | medium |
| 4 | Frontend: wizard polls + confirm/cancel buttons | medium |
| 5 | Cleanup job в `cleanup_service` | low |
| 6 | Удалить старый sync-path в `/upload` | low |

Каждый этап коммитим отдельно, обкатываем в dev.

## What's currently done in this branch

- Frontend wizard Step 3 has «Отменить и удалить» кнопка → `deleteTest(test_id)` (используется существующий DELETE-эндпоинт, который cascade'ит storage cleanup). Это не temp-storage в полной мере, но даёт пользователю **немедленный** способ откатить ошибочный импорт.
- Дизайн зафиксирован в этом spec'е. Полная реализация — отдельный multi-PR roadmap (этапы 1-6 выше).

## Open questions

1. **rId5/rId6 → короткие ID.** Хорошо бы сделать сразу (этап 2). Пока обратная совместимость не критична — все существующие тесты можно перезалить.
2. **Создание пустой коллекции через wizard.** Проходит ли через temp-стадию? Сейчас — нет (`createTest` создаёт сразу финальную коллекцию). Если пользователь захочет добавить материалы перед confirm — придётся включить temp-flow и для create-режима.
3. **WebSocket/SSE для live-логов** vs polling. Polling проще, но даёт лаг 1-2s. Для extraction'а 10-30s — приемлемо.
4. **Атомарность confirm.** Перенос материалов многих объектов в storage — не атомарен. Что если упадём на середине? Минимум: marker «in_progress» на job + retry на следующем confirm. Идеальнее: storage с move-семантикой (S3 copy + delete pattern).
