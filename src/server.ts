import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { mastra } from "./mastra/index.js";
import { startCronScheduler } from "./mastra/services/cronScheduler.js";
import {
  ensureAppSettingsTable,
  getAppSettings,
  updateAppSettings,
} from "./mastra/services/settings.js";

const app = new Hono();

const port = Number(process.env.PORT || 3000);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>InstaViral Scheduler</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f6f7;
      --card: #ffffff;
      --accent: #007aff;
      --text: #0b0c0f;
      --muted: #6b7280;
      --shadow: 0 10px 30px rgba(0,0,0,0.08);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif;
      background: linear-gradient(135deg, #fdfdfd 0%, #eef2ff 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .shell {
      width: 100%;
      max-width: 960px;
      background: var(--card);
      border-radius: 28px;
      box-shadow: var(--shadow);
      padding: 28px;
      border: 1px solid rgba(0,0,0,0.04);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.2px;
    }
    .pill {
      background: rgba(0,122,255,0.1);
      color: var(--accent);
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .card {
      background: #f9fafb;
      border-radius: var(--radius);
      padding: 16px;
      border: 1px solid rgba(0,0,0,0.04);
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      color: #111827;
    }
    input, select {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      background: #fff;
      font-size: 15px;
      transition: border 0.2s, box-shadow 0.2s;
    }
    input:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(0,122,255,0.15);
    }
    .muted { color: var(--muted); font-size: 13px; margin-top: 4px; }
    button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 16px;
      border-radius: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
      box-shadow: 0 10px 20px rgba(0,122,255,0.18);
    }
    button:active { transform: translateY(1px); }
    .actions {
      margin-top: 18px;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .status {
      font-weight: 600;
      color: #059669;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <div class="pill">Insta Viral Control</div>
        <h1>Настройки парсера</h1>
      </div>
      <button id="refresh">Обновить</button>
    </header>
    <div class="grid">
      <div class="card">
        <label for="mode">Частота</label>
        <select id="mode">
          <option value="daily">Каждый день</option>
          <option value="weekly">Каждую неделю</option>
        </select>
        <div class="muted">Выберите режим расписания</div>
      </div>
      <div class="card">
        <label for="dailyTime">Время (UTC)</label>
        <input type="time" id="dailyTime" />
        <div class="muted">Используется для ежедневного запуска</div>
      </div>
      <div class="card">
        <label for="weeklyDay">День недели</label>
        <select id="weeklyDay">
          <option value="0">Воскресенье</option>
          <option value="1">Понедельник</option>
          <option value="2">Вторник</option>
          <option value="3">Среда</option>
          <option value="4">Четверг</option>
          <option value="5">Пятница</option>
          <option value="6">Суббота</option>
        </select>
        <div class="muted">Для еженедельного режима</div>
      </div>
      <div class="card">
        <label for="weeklyTime">Время (UTC) — неделя</label>
        <input type="time" id="weeklyTime" />
        <div class="muted">Используется, если выбрана неделя</div>
      </div>
      <div class="card">
        <label for="postsPerAccount">Постов на аккаунт</label>
        <input type="number" id="postsPerAccount" min="1" max="200" />
        <div class="muted">Сколько последних постов/рилсов анализировать для каждого аккаунта.</div>
      </div>
      <div class="card">
        <label for="testAccountsLimit">Лимит аккаунтов за запуск</label>
        <input type="number" id="testAccountsLimit" min="0" max="10" />
        <div class="muted">0 — все, 1-10 — ограничить количество аккаунтов в прогоне.</div>
      </div>
      <div class="card">
        <label for="viralityFormula">Формула виральности</label>
        <select id="viralityFormula">
          <option value="current">Текущая (views/engagement)</option>
          <option value="shares">Учитывать шеринг</option>
        </select>
        <div class="muted">Shares: пост считается вирусным, если шаров ≥ 1% фолловеров или 500+</div>
      </div>
    </div>
    <div class="actions">
      <button id="save">Сохранить</button>
      <span class="status" id="status"></span>
    </div>
  </div>

  <script>
    const statusEl = document.getElementById('status');
    const modeSelect = document.getElementById('mode');
    const dailyInput = document.getElementById('dailyTime');
    const weeklyDaySelect = document.getElementById('weeklyDay');
    const weeklyTimeInput = document.getElementById('weeklyTime');
    const postsInput = document.getElementById('postsPerAccount');
    const testAccountsInput = document.getElementById('testAccountsLimit');
    const formulaSelect = document.getElementById('viralityFormula');

    async function loadSettings() {
      statusEl.textContent = 'Загружаю...';
      const res = await fetch('/api/settings');
      const data = await res.json();
      modeSelect.value = data.schedulerMode;
      dailyInput.value = data.dailyTime;
      weeklyDaySelect.value = String(data.weeklyDay);
      weeklyTimeInput.value = data.weeklyTime;
      postsInput.value = data.postsPerAccount;
      testAccountsInput.value = data.testAccountsLimit ?? 0;
      formulaSelect.value = data.viralityFormula;
      statusEl.textContent = 'Готово';
    }

    async function saveSettings() {
      statusEl.textContent = 'Сохраняю...';
      const body = {
        schedulerMode: modeSelect.value,
        dailyTime: dailyInput.value,
        weeklyDay: Number(weeklyDaySelect.value),
        weeklyTime: weeklyTimeInput.value,
        postsPerAccount: Number(postsInput.value),
        testAccountsLimit: Number(testAccountsInput.value),
        viralityFormula: formulaSelect.value,
      };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        statusEl.textContent = 'Ошибка: ' + text;
        return;
      }
      const data = await res.json();
      modeSelect.value = data.schedulerMode;
      dailyInput.value = data.dailyTime;
      weeklyDaySelect.value = String(data.weeklyDay);
      weeklyTimeInput.value = data.weeklyTime;
      postsInput.value = data.postsPerAccount;
      testAccountsInput.value = data.testAccountsLimit ?? 0;
      formulaSelect.value = data.viralityFormula;
      statusEl.textContent = 'Сохранено';
    }

    document.getElementById('save').addEventListener('click', saveSettings);
    document.getElementById('refresh').addEventListener('click', loadSettings);
    loadSettings();
  </script>
</body>
</html>`;

app.get("/", (c) => c.html(html));

app.get("/api/settings", async (c) => {
  try {
    console.log("🔎 [API] GET /api/settings");
    const settings = await getAppSettings();
    console.log("🔎 [API] GET /api/settings ->", settings);
    return c.json(settings);
  } catch (err: any) {
    console.error("Failed to read settings", err);
    return c.json({ error: "Failed to read settings", details: String(err) }, 500);
  }
});

app.post("/api/settings", async (c) => {
  try {
    const body = await c.req.json();
    console.log("💾 [API] POST /api/settings payload", body);
    const schedulerMode =
      body.schedulerMode === "weekly" ? "weekly" : "daily";
    const dailyTime = typeof body.dailyTime === "string" ? body.dailyTime : "09:00";
    const weeklyDay = Number.isInteger(body.weeklyDay)
      ? Math.min(6, Math.max(0, body.weeklyDay))
      : 1;
    const weeklyTime = typeof body.weeklyTime === "string" ? body.weeklyTime : "09:00";
    const postsPerAccount = Math.min(200, Math.max(1, Number(body.postsPerAccount || 0)));
    const testAccountsLimit = Math.min(10, Math.max(0, Number(body.testAccountsLimit || 0)));
    const viralityFormula = body.viralityFormula === "shares" ? "shares" : "current";

    const updated = await updateAppSettings({
      schedulerMode,
      dailyTime,
      weeklyDay,
      weeklyTime,
      postsPerAccount,
      testAccountsLimit,
      viralityFormula,
    });

    console.log("💾 [API] POST /api/settings saved", updated);
    return c.json(updated);
  } catch (err: any) {
    console.error("Failed to save settings", err);
    return c.json({ error: "Failed to save settings", details: String(err) }, 500);
  }
});

ensureAppSettingsTable()
  .catch((err) => {
    console.error("Failed to ensure app_settings table", err);
  })
  .finally(() => {
    startCronScheduler(mastra);
    console.log("⏰ [Scheduler] Started after ensuring settings table");
    serve(
      {
        fetch: app.fetch,
        port,
      },
      () => {
        console.log(`🖥️  UI ready on http://0.0.0.0:${port}`);
      },
    );
  });
