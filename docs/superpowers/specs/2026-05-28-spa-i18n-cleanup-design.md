# Design: полная локализация SPA (i18n cleanup)

**Дата:** 2026-05-28
**Статус:** approved (отдельный эпик после postgres+minio migration)
**Scope:** средний — обход всех экранов, замена hardcoded строк на `t()`, расширение `ru/en/uz.json`.

## Context

В ходе live-проверки сервера после миграции на PostgreSQL+MinIO обнаружилось, что значительная часть UI отображается на русском независимо от выбранной локали. Технический долг копился органически: новые экраны добавлялись с hardcoded русским текстом в `textContent`/`innerHTML`/`alert`/`aria-label`/`placeholder`, а оборонительный паттерн `t('foo') || 'Резерв'` маскировал отсутствие ключей в локалях (`?? key` в `i18n.js` возвращал сам ключ как truthy строку, и `||` не срабатывал).

Архитектурная часть уже исправлена в Phase 8 миграции:
- `static/js/i18n.js::t()` теперь возвращает пустую строку при отсутствии ключа (вместо самого ключа), благодаря чему `t() || 'fallback'` корректно показывает дефолт
- `scripts/audit_i18n.py` существует и поддерживает `--write` для автогенерации недостающих ключей из inline-fallback'ов
- 5 keys которые отсутствовали во всех 3 локалях (`common.done`, `results.no_mistakes`, `results.only_mistakes`, `test.untitled`) пропатчены

Этот эпик добивает оставшийся долг — обходит все экраны и компоненты, заменяет ~150 hardcoded строк на `t()` с осмысленными ключами, и расширяет три JSON-локали полными переводами.

## Цели

1. **Каждая видимая UI строка** проходит через `t(key)` — нет hardcoded `textContent = 'Профиль'` или `alert('Ошибка')`.
2. **Покрытие 100%** ключей в `ru.json` / `en.json` / `uz.json`. Перевод узбекского и английского от носителей или (минимум) от LLM с финальной вычиткой.
3. **Проверяемость**: `scripts/audit_i18n.py` → 0 missing-everywhere keys, 0 hardcoded строк в продакшн-коде (через дополнительный сканер).

## Не-цели

- Pluralization (`{n, plural, ...}` ICU MessageFormat) — отдельный эпик R10 из ARCH.md. Пока продолжаем использовать прямые подстановки `{{count}}`.
- RTL поддержка (узбекский латиницей — не RTL).
- Локализация ошибок API на бэке — сейчас они на русском. Это отдельная задача.
- Изменения дизайна / копирайт — переводим существующий текст «как есть».

---

## Архитектура

### Без изменений

- `i18n.js` интерфейс (`t`, `setLocale`, `getLocale`) — уже корректный после Phase 8 fix
- Три файла локалей `static/locales/{ru,en,uz}.json` — плоская структура `key.path: "value"`
- Auto-detect через `localStorage.locale → navigator.language → 'ru'`
- Reload требуется при смене локали (приемлемо для SPA с redirect через `setLocale`)

### Новые соглашения по naming

Иерархия ключей — `<screen>.<area>.<item>`:

```
home.empty.title              "Начнём с импорта вашего первого теста"
home.empty.desc               "Перетащите файл .docx…"
home.empty.card.docx.title    "Перетащить .docx"
home.tests.title              "Мои тесты"
home.tests.filter.all         "Все"
home.tests.filter.mine        "Свои"
home.collection.heading       "Коллекция"
home.collection.kpi.average   "Средний"
home.collection.kpi.best      "Лучший"
home.collection.kpi.time      "Время"
home.collection.kpi.attempts  "Попыток"
```

Общие переиспользуемые — `common.<action>`:

```
common.save        "Сохранить"
common.cancel      "Отмена"
common.delete      "Удалить"
common.confirm     "Подтвердить"
common.done        "Готово"
common.back        "Назад"
common.next        "Далее"
common.empty       "Пусто"
common.invite      "Пригласить"
common.accept      "Принять"
common.reject      "Отклонить"
```

Слова с грамматикой (число) — оставляем шаблоны с `{{count}}`, без plural-rules. Принимаем что на русском "1 вопрос/2 вопроса/5 вопросов" будет суррогатно "1 вопросов" — это ARCH.md R10, отдельно.

### Структура работы

7 фаз по экранам, каждая включает:
1. Сканирование экрана `audit_i18n.py` + ручной grep по hardcoded кириллице
2. Извлечение строк → новые ключи в RU
3. Перевод на EN и UZ
4. Замена в JS на `t('key')` (или `t('key', {vars})`)
5. Smoke: `audit_i18n.py` → 0 missing для этого экрана; ручной обзор в трёх локалях через playwright

---

## Фазы

Последовательно, по экранам в порядке убывания visibility:

### Phase i1 — `home.js` (desktop) + `home.js` (mobile)
Самый видимый экран. Touchpoints (по аудиту):
- `home.empty.*` (firstrun onboarding): ~10 ключей
- `home.tests.*` (список): ~15 ключей
- `home.collection.*` (детали коллекции): ~25 ключей
- `home.attempts.*` (последние попытки): ~5 ключей

Объём: ~55 ключей × 3 локали = 165 значений.

### Phase i2 — `profile.js`, `settings.js`
Профиль + настройки. ~30 ключей × 3 локали = 90 значений.

### Phase i3 — `change-requests.js`, `notifications.js`, `discover.js`
CR/Уведомления/Discover. ~40 ключей × 3 локали = 120 значений.

### Phase i4 — `stats.js`, `taking.js`, `results.js`, `pre-test.js`
Прохождение и статистика. ~50 ключей × 3 локали = 150 значений.

### Phase i5 — `import.js`, `edit-collection.js`, `per-question.js`
Импорт и редактирование. ~25 ключей × 3 локали = 75 значений.

### Phase i6 — Mobile дубликаты
Mobile-файлы переиспользуют те же ключи где возможно; добавляются только специфичные для mobile (~10 ключей).

### Phase i7 — Финальный аудит и автоматизированная проверка
- Добавить статический сканер `scripts/scan_hardcoded_strings.py` — ищет cyrillic в `textContent =`, `innerHTML =`, `alert(`, `confirm(`, `placeholder =`, `aria-label =`, `title =` в `static/js/**/*.js` (исключая комментарии, mock-data, дефолтные fallback в `t() || '...'`)
- Скрипт падает с non-zero exit при находках — можно встроить в CI
- Запустить `audit_i18n.py` против всех экранов: ожидаем 0 missing-everywhere keys

---

## Подход к переводам

**EN**: я (или LLM) перевожу с RU. Затем носитель / тестировщик вычитывает.

**UZ**: критично — узбекский язык не самый частый в LLM-датасетах. Варианты:
1. Носитель языка вычитывает после первичного LLM-перевода (рекомендуется)
2. На время оставляем UZ = RU как fallback (текущее поведение через `_fallback`)
3. Используем существующие UZ-переводы из docx-импорта пользователя как референс терминологии

Решение по UZ — открытый вопрос для реализации.

### Скрипт-помощник

Phase i7 включает `scripts/translate_missing.py` (опционально):
- Берёт RU → отправляет в Anthropic API → пишет в EN и UZ.json
- Помечает машинно-сгенерированные ключи специальным меткой (`_meta.machine_translated: true`)
- Это **необязательная** автоматизация; ручной перевод предпочтительнее.

---

## Тестирование

После каждой фазы:
1. `uv run python scripts/audit_i18n.py` — 0 missing для затронутого экрана
2. Playwright обход:
   ```
   localStorage.setItem('locale', 'en'); location.reload();
   ```
   проверить что в `document.getElementById('app').innerText` нет кириллицы вне user-content
3. То же для `'uz'`

E2E в Phase i7:
- Skript `scripts/verify_i18n_coverage.py` запускает SPA через Playwright в трёх локалях, делает скриншоты ключевых экранов, складывает в `.playwright-mcp/i18n-{ru,en,uz}/`. Регрессии видны на ревью PR.

---

## Risks

| Риск | Митигация |
|---|---|
| UZ перевод низкого качества из LLM | Маркер `_meta.machine_translated`; ручная вычитка носителем перед prod-деплоем |
| Хардкод копится в новых экранах | Pre-commit hook + CI step с `scripts/scan_hardcoded_strings.py` |
| Plural-формы выглядят суррогатно («1 вопросов») | ARCH.md R10 — отдельный эпик. На время принимаем |
| Несоответствие терминологии RU/EN/UZ | Глоссарий в `docs/i18n-glossary.md` — основные термины (тест, попытка, коллекция, доступ, владелец) |

## Open questions

1. UZ перевод — носитель доступен? Или принимаем LLM с пометкой?
2. Plural-rules сейчас или R10? → сейчас принимаем суррогатно (`{{count}} вопросов`).
3. Email-шаблоны (`api/templates/mail/`) уже локализованы в Phase 6 — проверить терминологию совпадает с SPA-глоссарием.
4. Backend error messages — отдельный эпик после этого?

## Estimate

~6-8 часов чистой работы при последовательном выполнении (без учёта качественного UZ-перевода носителем).

## Trigger conditions

Эпик можно начинать когда:
- Postgres+MinIO миграция мёрджена и стабильна
- Появилась первая жалоба от не-русскоязычного пользователя ИЛИ перед публичным релизом ИЛИ перед презентацией на EN/UZ

Без trigger'а — низкий приоритет: оборонительный паттерн `t() || 'дефолт'` фактически показывает дефолт благодаря Phase 8 fix `i18n.js`, так что русскоязычные пользователи получают приемлемый UX.
