# PROJECT B: Instagram Analyzer (Scheduled Deployment)

## 📋 ОБЗОР

Этот проект выполняет **hourly** анализ Instagram аккаунтов на Scheduled Deployment.
- **Запускается:** Автоматически каждый час в :00 minutes UTC
- **Читает:** Аккаунты из Google Sheets (добавленные через Project A - Telegram Bot)
- **Анализирует:** Instagram viral reels/carousels используя progressive criteria v10
- **Отправляет:** Уведомления в Telegram chat -1003149740303 о найденных viral постах

---

## 🚀 ПОШАГОВАЯ ИНСТРУКЦИЯ

### ШАГ 1: Создать новый Replit проект

1. Откройте [https://replit.com](https://replit.com)
2. Нажмите **"Create Repl"**
3. Выберите template: **"Agents & Automations"**
4. Выберите trigger: **"Timed Automation"**
5. Введите имя проекта: **"InstaViralAnalyzer"** (или любое другое)
6. Нажмите **"Create Repl"**

---

### ШАГ 2: Скопировать файлы из текущего проекта

Вам нужно скопировать следующие файлы/папки из **текущего проекта** в новый:

#### 📁 Обязательные файлы:

```
src/mastra/
├── workflows/
│   └── instagramAnalysisWorkflow.ts  ← СКОПИРОВАТЬ
├── tools/
│   ├── readGoogleSheetsTool.ts       ← СКОПИРОВАТЬ
│   ├── scrapeInstagramTool.ts        ← СКОПИРОВАТЬ  
│   ├── analyzeViralReelsTool.ts      ← СКОПИРОВАТЬ
│   ├── sendTelegramMessageTool.ts    ← СКОПИРОВАТЬ
│   └── sendSingleViralReelTool.ts    ← СКОПИРОВАТЬ
├── storage/
│   └── schema.ts                      ← СКОПИРОВАТЬ (для viral_reels таблицы)
└── storage.ts                         ← СКОПИРОВАТЬ
```

#### 📁 Дополнительные файлы:

```
package.json    ← СКОПИРОВАТЬ dependencies (Apify, telegraf, etc)
.env           ← НАСТРОИТЬ secrets (см. ШАГ 3)
```

---

### ШАГ 3: Настроить Environment Secrets

В новом проекте откройте **Secrets** (иконка замка в левой панели) и добавьте:

#### **ОБЯЗАТЕЛЬНЫЕ СЕКРЕТЫ:**

```bash
# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk

# Telegram
TELEGRAM_BOT_TOKEN=<ваш бот токен>
TELEGRAM_CHAT_ID=-1003149740303           # куда отправлять viral посты
TELEGRAM_THREAD_ID=<thread id если нужен>  # опционально

# Apify
APIFY_API_KEY=<ваш Apify API key>

# PostgreSQL (скопируются автоматически)
DATABASE_URL=<будет создан автоматически>
PGHOST=<будет создан автоматически>
PGPORT=<будет создан автоматически>
PGUSER=<будет создан автоматически>
PGPASSWORD=<будет создан автоматически>
PGDATABASE=<будет создан автоматически>
```

**ВАЖНО:** Google Sheets integration нужно будет настроить заново в новом проекте!

---

### ШАГ 4: Создать src/mastra/index.ts

Создайте файл `src/mastra/index.ts` со следующим содержимым:

```typescript
import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { executeInstagramAnalysis } from "./workflows/instagramAnalysisWorkflow";
import { readGoogleSheetsTool } from "./tools/readGoogleSheetsTool";
import { scrapeInstagramTool } from "./tools/scrapeInstagramTool";
import { analyzeViralReelsTool } from "./tools/analyzeViralReelsTool";
import { sendTelegramMessageTool } from "./tools/sendTelegramMessageTool";
import { sendSingleViralReelTool } from "./tools/sendSingleViralReelTool";

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  agents: {},
  workflows: {},
  mcpServers: {
    allTools: new MCPServer({
      name: "allTools",
      version: "1.0.0",
      tools: {
        readGoogleSheetsTool,
        scrapeInstagramTool,
        analyzeViralReelsTool,
        sendTelegramMessageTool,
        sendSingleViralReelTool,
      },
    }),
  },
  bundler: {
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

// Основная функция для Scheduled Deployment
// Она будет вызываться каждый час по расписанию
export async function runHourlyAnalysis() {
  const logger = mastra.getLogger();
  
  logger?.info("🚀 [Scheduled] Starting hourly Instagram analysis");
  logger?.info("⏰ [Scheduled] Current time", {
    utc: new Date().toISOString(),
  });

  try {
    const result = await executeInstagramAnalysis(mastra);
    
    logger?.info("✅ [Scheduled] Analysis completed successfully", {
      totalAccountsProcessed: result.totalAccountsProcessed,
      totalViralReelsSent: result.totalViralReelsSent,
    });

    return result;
  } catch (error: any) {
    logger?.error("❌ [Scheduled] Analysis failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
```

---

### ШАГ 5: Создать run-scheduled.ts (entry point)

Создайте файл `src/run-scheduled.ts`:

```typescript
import { runHourlyAnalysis } from "./mastra/index";

async function main() {
  console.log("🔧 [Scheduled Entry Point] Starting...");
  
  try {
    await runHourlyAnalysis();
    console.log("✅ [Scheduled Entry Point] Completed");
    process.exit(0); // успешное завершение
  } catch (error: any) {
    console.error("❌ [Scheduled Entry Point] Failed", error);
    process.exit(1); // ошибка
  }
}

main();
```

---

### ШАГ 6: Настроить Scheduled Deployment

1. **Откройте вкладку "Deploy"** в правой панели Replit
2. **Нажмите "Set up deployment"** или "Manage" → "Change deployment type"
3. **Выберите "Scheduled Deployment"**
4. **Настройте параметры:**

```
Schedule:
  Natural language: "Every hour at :00 minutes"
  OR
  Cron expression: 0 * * * *
  Timezone: UTC

Machine configuration:
  1 vCPU / 2GB RAM (минимум)
  Recommended: 2 vCPU / 4GB RAM (для надежности)

Job timeout:
  55 minutes
  
Build command:
  npm install

Run command:
  npx tsx src/run-scheduled.ts
```

5. **Добавьте Environment Secrets** (если еще не добавили)
6. **Нажмите "Deploy"**

---

### ШАГ 7: Настроить Google Sheets Integration

В новом проекте Google Sheets integration нужно настроить заново:

1. Откройте вкладку **"Tools"** в Replit
2. Найдите **"Google Sheets"** integration
3. Нажмите **"Add"** или **"Connect"**
4. Авторизуйтесь с вашим Google аккаунтом
5. Дайте доступ к нужному spreadsheet

---

### ШАГ 8: Создать PostgreSQL базу данных

1. В Replit перейдите на вкладку **"Database"**
2. Нажмите **"Create PostgreSQL database"**
3. База данных создастся автоматически
4. Environment variables (DATABASE_URL, PGHOST, etc.) добавятся сами

---

### ШАГ 9: Push database schema

После создания БД, запустите миграцию:

```bash
npm run db:push
```

Это создаст таблицу `viral_reels` для хранения отправленных постов (дедупликация).

---

### ШАГ 10: Тестирование

Перед первым scheduled запуском протестируйте вручную:

```bash
npx tsx src/run-scheduled.ts
```

Проверьте:
- ✅ Читает аккаунты из Google Sheets
- ✅ Scrapes Instagram через Apify
- ✅ Анализирует viral reels/carousels
- ✅ Отправляет в Telegram chat -1003149740303
- ✅ Сохраняет в PostgreSQL (no duplicates)

---

## 📊 ЧТО ДЕЛАТЬ ПОСЛЕ DEPLOYMENT

### ✅ **Оба проекта работают:**

**Project A (Telegram Bot) - Autoscale:**
- Принимает Instagram ссылки через Telegram
- Добавляет аккаунты в Google Sheets
- Может засыпать - это OK, пользователь повторит попытку

**Project B (Instagram Analyzer) - Scheduled:**
- Запускается точно каждый час в :00 minutes UTC
- Читает аккаунты из Google Sheets
- Анализирует Instagram viral контент
- Отправляет уведомления в Telegram
- **НИКОГДА не пропускает hourly triggers**

### 🎯 **Как они взаимодействуют:**

```
User → Telegram Bot (Project A) → Google Sheets
                                       ↓
                               Project B (hourly)
                                       ↓
                               Telegram notifications
```

---

## 🔧 TROUBLESHOOTING

### Проблема: Scheduled deployment не запускается

**Решение:**
1. Проверьте что **Run command** правильный: `npx tsx src/run-scheduled.ts`
2. Убедитесь что все secrets настроены
3. Проверьте логи deployment

### Проблема: Google Sheets не читается

**Решение:**
1. Переподключите Google Sheets integration
2. Проверьте GOOGLE_SHEETS_SPREADSHEET_ID
3. Убедитесь что у Google аккаунта есть доступ к spreadsheet

### Проблема: Telegram не отправляет сообщения

**Решение:**
1. Проверьте TELEGRAM_BOT_TOKEN
2. Проверьте TELEGRAM_CHAT_ID (должен быть -1003149740303)
3. Убедитесь что бот добавлен в chat и имеет права

---

## ✅ ГОТОВО!

После настройки вы получите **надежную систему 24/7**:
- ✅ Telegram bot работает на Autoscale
- ✅ Hourly анализ работает на Scheduled Deployment  
- ✅ **НИКАКИХ пропущенных hourly triggers**
- ✅ Полная автоматизация Instagram viral content detection
