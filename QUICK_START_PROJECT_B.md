# 🚀 БЫСТРЫЙ СТАРТ: Создание Project B (Instagram Analyzer)

## 📋 ЧТО У ВАС СЕЙЧАС ЕСТЬ

**✅ PROJECT A (ТЕКУЩИЙ) - Telegram Bot:**
- Работает на Autoscale
- Принимает Instagram ссылки через Telegram
- Добавляет аккаунты в Google Sheets
- **ГОТОВ К ИСПОЛЬЗОВАНИЮ**

**📝 PROJECT B - Instagram Analyzer:**
- Нужно создать отдельно
- Будет работать на Scheduled Deployment (hourly в :00 UTC)
- Читает Google Sheets, анализирует Instagram, отправляет viral посты

---

## 🎯 ПРОБЛЕМА КОТОРУЮ МЫ РЕШАЕМ

**Replit Agents & Automations НЕ позволяет:**
- Комбинировать Autoscale + Scheduled deployment в одном проекте
- Переключить тип deployment после создания

**РЕШЕНИЕ:**
- 2 отдельных проекта, связанных через Google Sheets

---

## 📂 ВАРИАНТ 1: КОПИРОВАНИЕ ФАЙЛОВ ВРУЧНУЮ (РЕКОМЕНДУЮ)

Это займет 15-20 минут, но даст полный контроль.

### ШАГ 1: Создать новый обычный Node.js проект

```bash
# НА ГЛАВНОЙ СТРАНИЦЕ REPLIT:
# 1. Нажмите "+ Create App"
# 2. В поиске введите "Node.js"
# 3. Выберите "Node.js" template
# 4. Название: "InstaAnalyzerScheduled"
# 5. Нажмите "Create"
```

### ШАГ 2: Скопировать файлы из ЭТОГО проекта

Откройте **ОБА** проекта в разных вкладках браузера:
- **Вкладка 1:** InstaViralTracker (этот проект)
- **Вкладка 2:** InstaAnalyzerScheduled (новый проект)

**Скопируйте следующие файлы:**

#### 📁 Структура папок (создать в новом проекте):

```
src/
├── mastra/
│   ├── workflows/
│   ├── tools/
│   ├── storage/
│   └── index.ts
└── run-scheduled.ts
```

#### 📄 Файлы для копирования:

**1. Workflows:**
```
src/mastra/workflows/instagramAnalysisWorkflow.ts
```

**2. Tools:**
```
src/mastra/tools/readGoogleSheetsTool.ts
src/mastra/tools/scrapeInstagramTool.ts
src/mastra/tools/analyzeViralReelsTool.ts
src/mastra/tools/sendTelegramMessageTool.ts
src/mastra/tools/sendSingleViralReelTool.ts
```

**3. Storage:**
```
src/mastra/storage/schema.ts
src/mastra/storage.ts
```

**4. Создать новый src/mastra/index.ts:**

```typescript
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel } from "@mastra/core/logger";
import { MCPServer } from "@mastra/mcp";
import pino from "pino";

import { sharedPostgresStorage } from "./storage";
import { executeInstagramAnalysis } from "./workflows/instagramAnalysisWorkflow";
import { readGoogleSheetsTool } from "./tools/readGoogleSheetsTool";
import { scrapeInstagramTool } from "./tools/scrapeInstagramTool";
import { analyzeViralReelsTool } from "./tools/analyzeViralReelsTool";
import { sendTelegramMessageTool } from "./tools/sendTelegramMessageTool";
import { sendSingleViralReelTool } from "./tools/sendSingleViralReelTool";

class ProductionPinoLogger extends PinoLogger {
  protected logger: pino.Logger;

  constructor(options: { name?: string; level?: LogLevel } = {}) {
    super(options);
    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
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
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({ name: "Mastra", level: "info" })
      : new PinoLogger({ name: "Mastra", level: "info" }),
});

export async function runHourlyAnalysis() {
  const logger = mastra.getLogger();
  
  logger?.info("🚀 [Scheduled] Starting hourly Instagram analysis");
  logger?.info("⏰ [Scheduled] Current time", { utc: new Date().toISOString() });

  try {
    const result = await executeInstagramAnalysis(mastra);
    
    logger?.info("✅ [Scheduled] Analysis completed", {
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

**5. Создать src/run-scheduled.ts:**

```typescript
import { runHourlyAnalysis } from "./mastra/index";

async function main() {
  console.log("🔧 [Scheduled Entry Point] Starting...");
  
  try {
    await runHourlyAnalysis();
    console.log("✅ [Scheduled Entry Point] Completed");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ [Scheduled Entry Point] Failed", error);
    process.exit(1);
  }
}

main();
```

**6. Скопировать package.json dependencies:**

Добавьте в новый проект все dependencies из текущего:

```json
{
  "dependencies": {
    "@mastra/core": "latest",
    "@mastra/inngest": "latest",
    "@mastra/libsql": "latest",
    "@mastra/loggers": "latest",
    "@mastra/pg": "latest",
    "apify-client": "latest",
    "drizzle-orm": "latest",
    "googleapis": "latest",
    "inngest": "latest",
    "pino": "latest",
    "telegraf": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "zod": "latest"
  },
  "scripts": {
    "dev": "tsx src/run-scheduled.ts",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

Затем выполните:
```bash
npm install
```

### ШАГ 3: Настроить PostgreSQL

1. В новом проекте откройте **Tools & Files** → **Database**
2. Нажмите **"Create PostgreSQL database"**
3. База создастся автоматически
4. Environment variables добавятся сами

Затем создайте таблицы:
```bash
npm run db:push
```

### ШАГ 4: Настроить Google Sheets Integration

1. В новом проекте откройте **Tools & Files** → **Integrations**
2. Найдите **"Google Sheets"**
3. Нажмите **"Add"** или **"Connect"**
4. Авторизуйтесь с вашим Google аккаунтом
5. Дайте доступ к spreadsheet

### ШАГ 5: Добавить Secrets

В новом проекте откройте **Tools & Files** → **Secrets** и добавьте:

```bash
GOOGLE_SHEETS_SPREADSHEET_ID=1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk
TELEGRAM_BOT_TOKEN=<ваш токен>
TELEGRAM_CHAT_ID=-1003149740303
APIFY_API_KEY=<ваш ключ>
```

### ШАГ 6: Протестировать вручную

Запустите hourly анализ вручную:

```bash
npm run dev
```

Проверьте что:
- ✅ Читает аккаунты из Google Sheets
- ✅ Scrapes Instagram через Apify
- ✅ Анализирует viral reels/carousels
- ✅ Отправляет в Telegram -1003149740303
- ✅ Сохраняет в PostgreSQL (no duplicates)

### ШАГ 7: Настроить Scheduled Deployment

1. Откройте **Tools & Files** → **Publishing**
2. Нажмите **"Set up deployment"** или **"Deploy"**
3. Выберите **"Scheduled Deployment"**
4. Настройте параметры:

```
Schedule:
  Cron expression: 0 * * * *
  Timezone: UTC
  Description: Every hour at :00 minutes

Machine:
  1 vCPU / 2GB RAM (минимум)
  Recommended: 2 vCPU / 4GB RAM

Job timeout:
  55 minutes

Build command:
  npm install

Run command:
  npm run dev
```

5. Нажмите **"Deploy"**

### ШАГ 8: Проверить первый hourly запуск

После deployment:
1. Подождите до следующего часа (:00 minutes UTC)
2. Проверьте логи deployment
3. Убедитесь что workflow выполнился
4. Проверьте Telegram - пришли ли viral посты

---

## ✅ ГОТОВО!

Теперь у вас **2 проекта работают вместе**:

**PROJECT A (InstaViralTracker) - Autoscale:**
- Telegram bot принимает ссылки
- Добавляет аккаунты в Google Sheets

**PROJECT B (InstaAnalyzerScheduled) - Scheduled:**
- Запускается каждый час в :00 UTC
- Читает Google Sheets
- Анализирует Instagram
- Отправляет viral посты в Telegram
- **НИКОГДА не пропускает hourly triggers**

---

## 🔧 TROUBLESHOOTING

### Google Sheets не читается
- Переподключите integration
- Проверьте GOOGLE_SHEETS_SPREADSHEET_ID
- Убедитесь что у аккаунта есть доступ

### Telegram не отправляет
- Проверьте TELEGRAM_BOT_TOKEN
- Проверьте TELEGRAM_CHAT_ID
- Убедитесь что бот в chat

### Scheduled deployment не запускается
- Проверьте Run command: `npm run dev`
- Проверьте все secrets
- Посмотрите логи deployment

---

## 📞 СВЯЗЬ МЕЖДУ ПРОЕКТАМИ

```
User sends Instagram link
        ↓
Telegram Bot (Project A - Autoscale)
        ↓
Adds username to Google Sheets
        ↓
[Shared Google Sheets]
        ↓
Hourly cron (Project B - Scheduled, :00 UTC)
        ↓
Reads accounts from Google Sheets
        ↓
Scrapes Instagram via Apify
        ↓
Analyzes viral reels/carousels
        ↓
Sends notifications to Telegram chat
        ↓
Saves to PostgreSQL (deduplication)
```

---

## 🎯 ПРЕИМУЩЕСТВА ЭТОГО РЕШЕНИЯ

✅ **Надежность:** Scheduled Deployment НИКОГДА не засыпает перед hourly trigger
✅ **Разделение:** Каждый проект делает одну вещь хорошо
✅ **Гибкость:** Можете обновлять/тестировать их независимо
✅ **Стоимость:** Платите только за время выполнения hourly cron
✅ **Масштабируемость:** Легко добавить больше источников данных

---

## 💡 СЛЕДУЮЩИЕ ШАГИ

1. **Сейчас:** Project A (Telegram Bot) работает на Autoscale
2. **Когда будет время:** Создайте Project B по этой инструкции
3. **После создания:** Оба проекта будут работать вместе 24/7

**Удачи! 🚀**
