# TestMasterBSU

Веб-приложение для создания, управления и прохождения тестов. Поддерживает импорт из `.docx`, три уровня доступа, запросы на изменение, статистику попыток и мультиязычный интерфейс.

## Возможности

- Импорт тестов из `.docx` (таблицы Word, формулы OMML → MathML, изображения WMF/EMF/PNG).
- Три уровня доступа: **private** (только владелец), **shared** (список пользователей), **public** (все).
- **Change requests** — не-владелец предлагает изменения, владелец одобряет или отклоняет.
- Прохождение теста с настройкой порядка/лимитов/фильтров.
- Статистика попыток — точность, процент ответов, время, разбивка по вопросам.
- Профиль с аватаром.
- Интерфейс на трёх языках (ru / en / uz), light/dark тема.

## Технологии

| Слой | Стек |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, SQLite |
| Auth | JWT (python-jose), bcrypt, server-side сессии |
| Извлечение | python-docx, lxml, Pillow, CloudConvert API |
| Frontend | Ванильный JavaScript (ES-modules), без сборщика |
| UI / иконки | Tailwind CSS v4 (Play CDN), Heroicons v2 (inline SVG-спрайт) |
| Формулы | MathJax 3 (CDN, загружается лениво при первом вопросе с формулой) |
| Графики | Chart.js 4 (CDN, загружается лениво при открытии экрана статистики) |

> **Примечание для продакшна:** Tailwind Play CDN предназначен для разработки и прототипирования. Для продакшн-деплоя рекомендуется перейти на Tailwind CLI standalone — собрать `tailwind.css` из `static/index.html`. Текущая настройка приемлема т.к. в проекте уже используется CDN для MathJax и Chart.js.

## Установка

Python 3.13+ обязателен.

```bash
# рекомендуется uv
uv sync

# или pip
pip install .
```

Зависимости описаны в [`pyproject.toml`](pyproject.toml).

### Переменные окружения

Создайте файл `.env` в корне проекта (загружается через `load_dotenv()` в [`main.py`](main.py)):

| Переменная | По умолчанию | Описание |
|---|---|---|
| `SECRET_KEY` | небезопасная строка | **Обязательно переопределить в продакшне** |
| `ALLOWED_ORIGINS` | `http://localhost:8000,http://127.0.0.1:8000` | Разрешённые CORS-источники (CSV). В продакшне — полный URL вашего домена |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Срок жизни JWT |
| `SESSION_EXTEND_MINUTES` | `60` | Скользящее продление сессии |
| `TEST_DATA_DIR` | `data/tests` | Каталог с тестами |
| `DB_DIR` | `data` | Каталог с базой данных |
| `DATABASE_URL` | `sqlite:///data/testmaster.db` | URL SQLAlchemy |
| `AVATARS_DIR` | `data/avatars` | Каталог с аватарами |
| `CLOUDCONVERT_API_KEY` | — | Для конвертации WMF/EMF на Linux |

## Запуск

### Dev-сервер

```bash
uvicorn api:app --reload
```

Откройте http://localhost:8000/. Swagger: http://localhost:8000/docs.

### Первая настройка базы данных

```bash
alembic upgrade head
```

Если в `data/tests/` есть тесты, созданные до появления авторизации (без привязки к пользователю), назначьте им владельца:

```bash
python scripts/migrate_test_ownership.py
```

### Docker

```bash
docker compose up --build
```

Данные сохраняются в `./data` через том. Конфигурация в [`docker-compose.yml`](docker-compose.yml).

### Продакшн (Procfile / gunicorn)

```bash
gunicorn -k uvicorn.workers.UvicornWorker main:app
```

### Standalone (PyInstaller)

```bash
pyinstaller pyinstaller.spec
```

Бинарник в `dist/bsu-test-master` (на Windows — `.exe`). Данные рядом с бинарником, или через `TEST_DATA_DIR`.

## CLI

Импортировать тест из `.docx` без запуска сервера:

```bash
python scripts/cli.py path/to/test.docx --output data/tests --symbol "*"
```

`--symbol` — символ-маркер правильного ответа в таблице Word (по умолчанию `*`).

> **Внимание:** CLI не создаёт запись `TestCollection` в БД, поэтому тест становится публичным для всех по backwards-compat правилу. Для нормальной привязки к владельцу загружайте тест через веб-интерфейс или `POST /api/tests/upload`.

## Структура данных

```
data/
  testmaster.db          # SQLite: пользователи, сессии, тест-коллекции, попытки
  tests/
    <uuid>/
      test.json          # JSON-блоки с вопросами
      assets/            # изображения, извлечённые из docx
  avatars/               # аватары пользователей
```

## API

Полная документация доступна в Swagger (`/docs`) после запуска сервера. Краткая карта:

| Группа | Базовый путь | Назначение |
|---|---|---|
| auth | `/api/auth` | регистрация, вход, выход, обновление токена |
| users | `/api/users` | профиль, аватар |
| tests | `/api/tests` | CRUD коллекций тестов, загрузка `.docx` |
| access | `/api/tests/{id}/access` | управление уровнем доступа и списком shared-пользователей |
| change-requests | `/api/tests/{id}/change-requests` | предложение и рецензирование изменений |
| attempts | `/api/attempts` | начало, ответы, завершение попытки |
| statistics | `/api/stats` / `/api/tests/{id}/statistics` | статистика попыток |
| assets | `/api/tests/{id}/assets` | статические ресурсы теста |
| questions | `/api/tests/{id}/questions` | прямое редактирование вопросов (только владелец) |

Подробная архитектура — в [`ARCH.md`](ARCH.md).

## Конвертация WMF/EMF

- **Windows** — через Pillow напрямую ([`core/image_convert.py`](core/image_convert.py)).
- **Linux/macOS** — через CloudConvert API; требует `CLOUDCONVERT_API_KEY`. Если ключ не задан, конвертация пропускается и формат остаётся оригинальным.

## Известные ограничения

- `SECRET_KEY` по умолчанию небезопасен — обязательно задайте его в `.env` перед продакшн-деплоем. В production-режиме (`ENV=production`) сервер не запустится с дефолтным ключом.
- `ALLOWED_ORIGINS` по умолчанию разрешает только `localhost` — для продакшна укажите реальный домен.
- Tailwind Play CDN добавляет предупреждение в консоли; для продакшна рекомендуется Tailwind CLI (см. примечание в разделе «Технологии»).
- Формат `.doc` не поддерживается — только `.docx`.
- Автотестов (pytest) нет. Ручной smoke-чеклист: [`scripts/attempts_smoke.md`](scripts/attempts_smoke.md).
- Миграция Alembic объявлена как зависимость, но схема также создаётся через `Base.metadata.create_all()` при запуске — при первом деплое запускайте `alembic upgrade head` вручную.
