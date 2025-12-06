# Instagram Viral Content Detector

Автоматическая система обнаружения вирусного контента из Instagram аккаунтов с мгновенными уведомлениями в Telegram.

---

## Обзор

Система анализирует 1000+ Instagram аккаунтов каждый час, определяет вирусные рилсы и карусели по прогрессивным критериям, и отправляет уведомления в Telegram чат.

---

## Архитектура

### Два проекта:

| Проект | Функция | Deployment |
|--------|---------|------------|
| **Project A** - Telegram Bot | Добавление аккаунтов в мониторинг | Autoscale |
| **Project B** - Analyzer (этот) | Анализ и отправка виральных | Scheduled/Autoscale |

### Связь между проектами:

```
Telegram Bot (Project A)
        ↓
    Добавляет username
        ↓
   [Google Sheets]
        ↓
    Читает аккаунты
        ↓
Analyzer (Project B)
        ↓
   Скрапит → Анализирует → Telegram
```

---

## Технологии

| Компонент | Технология |
|-----------|------------|
| Backend | Node.js + TypeScript |
| Framework | Mastra (AI agent framework) |
| Scraper | Apify Instagram Profile Scraper |
| База данных | PostgreSQL (Neon) |
| Хранилище аккаунтов | Google Sheets |
| Уведомления | Telegram Bot API |
| Scheduler | node-cron (0 * * * *) |

---

## Логика работы

### Шаг 1: Получение списка аккаунтов
- Читает Google Sheets (колонка A)
- Сортирует по приоритету (никогда не проверенные → давно проверенные)

### Шаг 2: Скрапинг каждого аккаунта
- Вызывает Apify API
- Получает 100 последних постов
- Извлекает: username, подписчики, посты (тип, просмотры, лайки, комментарии, дата)

### Шаг 3: Анализ виральности
- Проверяет каждый пост (возраст до 60 дней)
- Применяет прогрессивные критерии (см. ниже)

### Шаг 4: Отправка в Telegram
- Виральный контент → сразу в Telegram
- Проверка дубликатов через PostgreSQL

---

## Критерии виральности (v10 Progressive)

### Рилсы и Видео (по просмотрам)

| Подписчики | Множитель | Минимум | Пример |
|------------|-----------|---------|--------|
| <10K | X20 | 100K | 5K → 100K просмотров |
| 10K-50K | X20 | 100K | 30K → 600K просмотров |
| 50K-100K | X10 | — | 80K → 800K просмотров |
| 100K-200K | X8 | — | 150K → 1.2M просмотров |
| 200K-500K | X4 | — | 300K → 1.2M просмотров |
| 500K+ | X2 | 2M | 1M → 2M просмотров |

### Карусели (по engagement = лайки + комментарии)

| Подписчики | Множитель | Минимум | Пример |
|------------|-----------|---------|--------|
| <10K | X0.5 | 5K | 5K → 2.5K engagement |
| 10K-50K | X0.2 | 5K | 30K → 6K engagement |
| 50K-100K | X0.1 | 5K | 80K → 8K engagement |
| 100K-500K | X0.05 | 5K | 300K → 15K engagement |
| 500K+ | X0.03 | 5K | 500K → 15K engagement |

---

## Telegram каналы

| Канал | ID | Функция |
|-------|-----|---------|
| Добавление аккаунтов | -1002403344920 (Thread 7787) | Пользователи отправляют ссылки |
| Виральные рилсы | -1003149740303 | Система отправляет находки |

---

## База данных

### Таблицы:

**sent_viral_reels** - Предотвращение дубликатов
```sql
id SERIAL PRIMARY KEY
reel_url VARCHAR UNIQUE
username VARCHAR
sent_at TIMESTAMP
```

**account_check_history** - История проверок аккаунтов
```sql
id SERIAL PRIMARY KEY
username VARCHAR UNIQUE
last_checked_at TIMESTAMP
viral_reels_found INTEGER
```

---

## Расписание

- **Cron:** `0 * * * *` (каждый час в :00 минут UTC)
- **Ручной запуск:** `npx tsx run-now.ts`

---

## Secrets (переменные окружения)

| Переменная | Описание |
|------------|----------|
| APIFY_API_KEY | API ключ Apify |
| TELEGRAM_BOT_TOKEN | Токен Telegram бота |
| TELEGRAM_CHAT_ID | ID чата для виральных |
| DATABASE_URL | PostgreSQL connection string |
| GOOGLE_SHEETS_SPREADSHEET_ID | ID Google таблицы |

---

## Файловая структура

```
src/
├── mastra/
│   ├── index.ts              # Главный файл Mastra + cron scheduler
│   ├── tools/
│   │   ├── readGoogleSheetsTool.ts      # Чтение аккаунтов
│   │   ├── scrapeInstagramTool.ts       # Apify скрапер
│   │   ├── analyzeViralReelsTool.ts     # Анализ виральности
│   │   ├── sendSingleViralReelTool.ts   # Отправка в Telegram
│   │   ├── getAccountPrioritiesTool.ts  # Приоритизация
│   │   └── updateAccountCheckTool.ts    # Обновление истории
│   ├── workflows/
│   │   └── instagramAnalysisWorkflow.ts # Основной workflow
│   └── storage/
│       └── schema.ts                     # Drizzle схема БД
├── run-now.ts                # Ручной запуск анализа
└── scripts/
    └── build.sh              # Build script для deployment
```

---

## Стоимость

| Сервис | Стоимость |
|--------|-----------|
| Apify | ~$0.087 за аккаунт |
| 1000 аккаунтов/час | ~$87/час = ~$2,000/день |

---

## Известные ограничения

1. Instagram может блокировать IP Apify
2. Google Sheets лимит: 100 запросов/100 секунд
3. Карусели не имеют viewCount в Instagram API
4. Deployment на Cloud Run требует быстрый старт (<30 сек)

---

## Быстрые команды

```bash
# Ручной запуск анализа
npx tsx run-now.ts

# Запуск dev сервера
npx mastra dev

# Пересборка для deployment
bash scripts/build.sh
```
