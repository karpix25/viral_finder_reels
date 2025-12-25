import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { mastra } from "./mastra/index.js";
import { startCronScheduler } from "./mastra/services/cronScheduler.js";
import {
  ensureAppSettingsTable,
  getAppSettings,
  updateAppSettings,
} from "./mastra/services/settings.js";
import { executeInstagramAnalysis } from "./mastra/workflows/instagramAnalysisWorkflow.js";
import { executeFollowerUpdate } from "./mastra/workflows/updateFollowersWorkflow.js";
import {
  seedInstagramAccountsFromFile,
  getAccountsList,
  addInstagramAccount,
  deleteInstagramAccount,
} from "./mastra/services/accounts.js";
import { startTelegramBot } from "./mastra/services/telegramBot.js";

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
    .btn-secondary {
      background: #e5e7eb;
      color: #111827;
      box-shadow: none;
    }
    .btn-warning {
      background: #fff7ed;
      color: #c2410c;
      border: 1px solid #fed7aa;
      box-shadow: none;
    }
    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    
    /* Tabs */
    .tabs { display: flex; gap: 20px; margin-bottom: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .tab { cursor: pointer; padding: 8px 16px; font-weight: 500; color: var(--muted); border-radius: 8px; transition: 0.2s; }
    .tab.active { background: #fff; color: var(--text); box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    
    /* View Visibility */
    .view-section { display: none; }
    .view-section.active { display: block; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

    /* Feed Styles */
    .feed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .feed-card {
      border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
      display: flex; flex-direction: column; background: #fff; transition: 0.2s;
    }
    .feed-card:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
    .feed-thumb { height: 280px; background: #f3f4f6; background-size: cover; background-position: center; position: relative; }
    .feed-badge {
        position: absolute; top: 10px; right: 10px;
        background: rgba(0,0,0,0.7); color: #fff; padding: 4px 8px;
        border-radius: 6px; font-size: 11px; font-weight: bold; backdrop-filter: blur(4px);
    }
    .feed-info { padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .feed-user { font-weight: 600; font-size: 14px; color: var(--text); }
    .feed-stats { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); }
    .feed-reason { font-size: 11px; color: var(--muted); margin-top: 8px; line-height: 1.3; border-top: 1px solid #f3f4f6; padding-top: 6px; }
    .feed-link { display: block; margin-top: auto; text-align: center; background: #f9fafb; padding: 10px; color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600; border-top: 1px solid #e5e7eb; }
    .feed-link:hover { background: #f0f9ff; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <div class="pill">Insta Viral Control</div>
        <h1>Dashboard</h1>
      </div>
      <div class="header-actions">
        <button id="refresh-feed" class="btn-secondary" style="padding: 8px 16px; font-size: 13px; display: none;">🔄 Обновить ленту</button>
      </div>
    </header>

    <div class="tabs">
        <div class="tab active" onclick="switchTab('settings')">Настройки</div>
        <div class="tab" onclick="switchTab('feed')">Лента (Viral Feed)</div>
        <div class="tab" onclick="switchTab('accounts')">Аккаунты</div>
    </div>

    <!-- SETTINGS VIEW -->
    <div id="settings-view" class="view-section active">
        <div class="grid">
      <div class="card">
        <label for="mode">Частота (Сбор контента)</label>
        <select id="mode">
          <option value="daily">Каждый день</option>
          <option value="weekly">Каждую неделю</option>
        </select>
        <div class="muted">Режим запуска парсинга рилс/каруселей</div>
      </div>
      <div class="card" id="daily-card">
        <label for="dailyTime">Время (UTC)</label>
        <input type="time" id="dailyTime" />
        <div class="muted">Используется для ежедневного запуска</div>
      </div>
      <div class="card" id="weekly-day-card">
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
      <div class="card" id="weekly-time-card">
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
      <div class="card">
        <label for="followersFreq">Обновление подписчиков (дни)</label>
        <input type="number" id="followersFreq" min="1" max="30" />
        <div class="muted">Как часто обновлять кол-во подписчиков (в днях). Например: 4</div>
      </div>
      <div class="card">
        <label for="maxPostAgeDays">Возраст поста (дней)</label>
        <input type="number" id="maxPostAgeDays" min="1" max="365" />
        <div class="muted">Фильтр новизны: анализировать только посты не старше X дней (например, 30).</div>
      </div>
    </div>
    
    <h2 style="margin-top: 32px; font-size: 18px;">Коэффициенты виральности (Множители)</h2>
    <div class="muted" style="margin-bottom: 8px;">
      Формула: <strong>Порог просмотров = Подписчики × Множитель</strong>.
    </div>
    <div class="muted" style="margin-bottom: 16px; line-height: 1.4;">
      Например, если у аккаунта 1000 подписчиков и множитель 100, то вирусным считается рилс с 100,000+ просмотров.<br>
      Чем <em>меньше</em> множитель, тем <em>легче</em> видео попасть в список вирусных.
    </div>
    
    <div class="grid">
      <div class="card">
        <label for="tier1">1K - 5K</label>
        <input type="number" id="tier1" step="0.1" />
      </div>
      <div class="card">
        <label for="tier2">5K - 10K</label>
        <input type="number" id="tier2" step="0.1" />
      </div>
      <div class="card">
        <label for="tier3">10K - 20K</label>
        <input type="number" id="tier3" step="0.1" />
      </div>
      <div class="card">
        <label for="tier4">20K - 50K</label>
        <input type="number" id="tier4" step="0.1" />
      </div>
      <div class="card">
        <label for="tier5">50K - 100K</label>
        <input type="number" id="tier5" step="0.1" />
      </div>
      <div class="card">
        <label for="tier6">100K - 200K</label>
        <input type="number" id="tier6" step="0.1" />
      </div>
      <div class="card">
        <label for="tier7">200K - 500K</label>
        <input type="number" id="tier7" step="0.1" />
      </div>
      <div class="card">
        <label for="tier8">500K+</label>
        <input type="number" id="tier8" step="0.1" />
      </div>
    </div>

    <h2 style="margin-top: 32px; font-size: 18px;">Коэффициенты виральности (Посты/Карусели)</h2>
    <div class="muted" style="margin-bottom: 8px;">
      Формула: <strong>Порог вовлеченности (Лайки+Комменты) = Подписчики × Множитель</strong>.
    </div>
    <div class="muted" style="margin-bottom: 16px; line-height: 1.4;">
      Для каруселей и фото множители обычно ниже (0.05-0.5), так как реакций меньше, чем просмотров.<br>
      Например: 1000 подписчиков * 0.5 = 500 реакций для вирусности.
    </div>
    
    <div class="grid">
      <div class="card">
        <label for="tier1_c">1K - 5K</label>
        <input type="number" id="tier1_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier2_c">5K - 10K</label>
        <input type="number" id="tier2_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier3_c">10K - 20K</label>
        <input type="number" id="tier3_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier4_c">20K - 50K</label>
        <input type="number" id="tier4_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier5_c">50K - 100K</label>
        <input type="number" id="tier5_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier6_c">100K - 200K</label>
        <input type="number" id="tier6_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier7_c">200K - 500K</label>
        <input type="number" id="tier7_c" step="0.01" />
      </div>
      <div class="card">
        <label for="tier8_c">500K+</label>
        <input type="number" id="tier8_c" step="0.01" />
      </div>
    </div>

    <div class="actions">
      <button id="save">Сохранить</button>
      <button id="test-run" class="btn-secondary">Тест: Парсинг контента</button>
      <button id="test-followers-update" class="btn-warning">Тест: Обновить подписчиков</button>
      <span class="status" id="status"></span>
    </div>
  </div>

  <!-- FEED VIEW -->
  <div id="feed-view" class="view-section">
      <div id="feed-container" class="feed-grid">
          <div class="muted" style="text-align:center; grid-column: 1/-1;">Нажмите "Обновить ленту", чтобы загрузить данные</div>
      </div>
  </div>

  <!-- ACCOUNTS VIEW -->
  <div id="accounts-view" class="view-section">
      <div class="card" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
           <h3 style="margin: 0;">Управление аккаунтами</h3>
           <div style="display: flex; gap: 10px;">
               <input type="text" id="new-account-username" placeholder="username (без @)" style="width: 200px;" />
               <button id="add-account-btn" style="padding: 8px 16px;">Добавить</button>
           </div>
      </div>
      
      <!-- Pagination Controls -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
             <label class="muted" for="limit-select" style="margin:0; font-weight:normal;">Показывать по:</label>
             <select id="limit-select" style="width: auto; padding: 6px 10px;">
                 <option value="10">10</option>
                 <option value="20">20</option>
                 <option value="30">30</option>
                 <option value="50">50</option>
                 <option value="0">Все</option>
             </select>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
              <button id="prev-page" class="btn-secondary" style="padding: 6px 12px; font-size: 13px;" disabled>Previous</button>
              <span id="page-info" class="muted" style="font-size: 13px;">Page 1</span>
              <button id="next-page" class="btn-secondary" style="padding: 6px 12px; font-size: 13px;" disabled>Next</button>
          </div>
      </div>

      <div class="card">
          <table style="width: 100%; text-align: left; border-collapse: collapse;">
              <thead>
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                      <th style="padding: 10px;">Username</th>
                      <th style="padding: 10px;">Подписчики</th>
                      <th style="padding: 10px;">Добавлен</th>
                      <th style="padding: 10px; text-align: right;">Действия</th>
                  </tr>
              </thead>
              <tbody id="accounts-table-body">
              </tbody>
          </table>
      </div>
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
    const followersFreqInput = document.getElementById('followersFreq');
    
    // Cards for visibility toggling
    const dailyCard = document.getElementById('daily-card');
    const weeklyDayCard = document.getElementById('weekly-day-card');
    const weeklyTimeCard = document.getElementById('weekly-time-card');
    
    // Multiplier inputs (Reels)
    const t1 = document.getElementById('tier1');
    const t2 = document.getElementById('tier2');
    const t3 = document.getElementById('tier3');
    const t4 = document.getElementById('tier4');
    const t5 = document.getElementById('tier5');
    const t6 = document.getElementById('tier6');
    const t7 = document.getElementById('tier7');
    const t8 = document.getElementById('tier8');

    // Multiplier inputs (Carousel)
    const tc1 = document.getElementById('tier1_c');
    const tc2 = document.getElementById('tier2_c');
    const tc3 = document.getElementById('tier3_c');
    const tc4 = document.getElementById('tier4_c');
    const tc5 = document.getElementById('tier5_c');
    const tc6 = document.getElementById('tier6_c');
    const tc7 = document.getElementById('tier7_c');
    const tc8 = document.getElementById('tier8_c');

    function updateVisibility() {
      const mode = modeSelect.value;
      if (mode === 'daily') {
        dailyCard.style.display = 'block';
        weeklyDayCard.style.display = 'none';
        weeklyTimeCard.style.display = 'none';
      } else {
        dailyCard.style.display = 'none';
        weeklyDayCard.style.display = 'block';
        weeklyTimeCard.style.display = 'block';
      }
    }

    modeSelect.addEventListener('change', updateVisibility);

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
      followersFreqInput.value = data.followersUpdateFreqDays ?? 4;
      document.getElementById('maxPostAgeDays').value = data.maxPostAgeDays ?? 30;
      
      const m = data.viralityMultipliers || {};
      t1.value = m.tier1_1k_5k ?? 100;
      t2.value = m.tier2_5k_10k ?? 50;
      t3.value = m.tier3_10k_20k ?? 30;
      t4.value = m.tier4_20k_50k ?? 15;
      t5.value = m.tier5_50k_100k ?? 8;
      t6.value = m.tier6_100k_200k ?? 5;
      t7.value = m.tier7_200k_500k ?? 2.5;
      t8.value = m.tier8_500k_plus ?? 1.5;

      const mc = data.carouselMultipliers || {};
      tc1.value = mc.tier1_1k_5k ?? 0.5;
      tc2.value = mc.tier2_5k_10k ?? 0.5;
      tc3.value = mc.tier3_10k_20k ?? 0.2;
      tc4.value = mc.tier4_20k_50k ?? 0.2;
      tc5.value = mc.tier5_50k_100k ?? 0.1;
      tc6.value = mc.tier6_100k_200k ?? 0.05;
      tc7.value = mc.tier7_200k_500k ?? 0.05;
      tc8.value = mc.tier8_500k_plus ?? 0.03;

      updateVisibility();
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
        followersUpdateFreqDays: Number(followersFreqInput.value),
        maxPostAgeDays: Number(document.getElementById('maxPostAgeDays').value),
        viralityMultipliers: {
            tier1_1k_5k: Number(t1.value),
            tier2_5k_10k: Number(t2.value),
            tier3_10k_20k: Number(t3.value),
            tier4_20k_50k: Number(t4.value),
            tier5_50k_100k: Number(t5.value),
            tier6_100k_200k: Number(t6.value),
            tier7_200k_500k: Number(t7.value),
            tier8_500k_plus: Number(t8.value),
        },
        carouselMultipliers: {
            tier1_1k_5k: Number(tc1.value),
            tier2_5k_10k: Number(tc2.value),
            tier3_10k_20k: Number(tc3.value),
            tier4_20k_50k: Number(tc4.value),
            tier5_50k_100k: Number(tc5.value),
            tier6_100k_200k: Number(tc6.value),
            tier7_200k_500k: Number(tc7.value),
            tier8_500k_plus: Number(tc8.value),
        }
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
      // Reload UI values just in case
      modeSelect.value = data.schedulerMode;
      dailyInput.value = data.dailyTime;
      weeklyDaySelect.value = String(data.weeklyDay);
      weeklyTimeInput.value = data.weeklyTime;
      postsInput.value = data.postsPerAccount;
      testAccountsInput.value = data.testAccountsLimit ?? 0;
      formulaSelect.value = data.viralityFormula;
      followersFreqInput.value = data.followersUpdateFreqDays;
      document.getElementById('maxPostAgeDays').value = data.maxPostAgeDays;
      
      const m = data.viralityMultipliers || {};
      t1.value = m.tier1_1k_5k;
      t2.value = m.tier2_5k_10k;
      t3.value = m.tier3_10k_20k;
      t4.value = m.tier4_20k_50k;
      t5.value = m.tier5_50k_100k;
      t6.value = m.tier6_100k_200k;
      t7.value = m.tier7_200k_500k;
      t8.value = m.tier8_500k_plus;

      const mc = data.carouselMultipliers || {};
      tc1.value = mc.tier1_1k_5k;
      tc2.value = mc.tier2_5k_10k;
      tc3.value = mc.tier3_10k_20k;
      tc4.value = mc.tier4_20k_50k;
      tc5.value = mc.tier5_50k_100k;
      tc6.value = mc.tier6_100k_200k;
      tc7.value = mc.tier7_200k_500k;
      tc8.value = mc.tier8_500k_plus;

      updateVisibility();
      statusEl.textContent = 'Сохранено';
    }

    async function runTest() {
      statusEl.textContent = 'Тестовый запуск контента...';
      const res = await fetch('/api/test-run', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusEl.textContent = 'Парсинг запущен: ' + JSON.stringify(data);
      } else {
        statusEl.textContent = 'Ошибка тестового запуска: ' + (data.error || res.status);
      }
    }

    async function runFollowersTest() {
      if(!confirm('Это запустит обновление подписчиков для ВСЕХ аккаунтов. Это может занять время и потратить квоту API. Продолжить?')) return;
      
      statusEl.textContent = 'Запуск обновления подписчиков...';
      const res = await fetch('/api/test-followers-update', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusEl.textContent = 'Обновление подписчиков запущено: ' + JSON.stringify(data);
      } else {
        statusEl.textContent = 'Ошибка запуска обновления: ' + (data.error || res.status);
      }
    }

    document.getElementById('save').addEventListener('click', saveSettings);
    // document.getElementById('refresh').addEventListener('click', loadSettings); // Removed
    document.getElementById('test-run').addEventListener('click', runTest);
    // document.getElementById('test-run-top').addEventListener('click', runTest); // Removed
    document.getElementById('test-followers-update').addEventListener('click', runFollowersTest);
    
    // TABS & FEED LOGIC
    const refreshBtn = document.getElementById('refresh-feed');
    refreshBtn.addEventListener('click', loadFeed);

    window.switchTab = function(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        if (tabName === 'settings') document.querySelectorAll('.tab')[0].classList.add('active');
        if (tabName === 'feed') document.querySelectorAll('.tab')[1].classList.add('active');
        if (tabName === 'accounts') document.querySelectorAll('.tab')[2].classList.add('active');

        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        if (tabName === 'settings') {
            document.getElementById('settings-view').classList.add('active');
            refreshBtn.style.display = 'none';
        }
        if (tabName === 'feed') {
            document.getElementById('feed-view').classList.add('active');
            refreshBtn.style.display = 'block';
            loadFeed();
        }
        if (tabName === 'accounts') {
            document.getElementById('accounts-view').classList.add('active');
            refreshBtn.style.display = 'none';
            loadAccounts();
        }
    };

    async function loadFeed() {
        const container = document.getElementById('feed-container');
        container.innerHTML = '<div class="muted">Загрузка...</div>';
        
        try {
            const res = await fetch('/api/feed');
            const posts = await res.json();
            
            if (!posts || posts.length === 0) {
                container.innerHTML = '<div class="muted" style="grid-column: 1/-1; text-align: center;">Пока пусто. Запустите парсинг, чтобы найти вирусный контент.</div>';
                return;
            }

            container.innerHTML = '';
            posts.forEach(post => {
                const growth = post.viralityScore ? \`🚀 \${parseFloat(post.viralityScore).toFixed(1)}x\` : '';
                const views = post.viewCount ? post.viewCount.toLocaleString() : '-';
                const likes = post.likeCount ? post.likeCount.toLocaleString() : '-';
                const comments = post.commentCount ? post.commentCount.toLocaleString() : '-';
                const date = new Date(post.foundAt || post.takenAt).toLocaleDateString();
                const thumb = post.thumbnailUrl || '';
                
                const card = document.createElement('div');
                card.className = 'feed-card';
                card.innerHTML = \`
                    <div class="feed-thumb" style="background-image: url('\${thumb}'); background-color: #eee;">
                        \${growth ? \`<div class="feed-badge">\${growth}</div>\` : ''}
                    </div>
                    <div class="feed-info">
                        <div class="feed-user">\${post.username}</div>
                        <div class="feed-stats">
                            <span>👁 \${views}</span>
                            <span>❤ \${likes}</span>
                            <span>💬 \${comments}</span>
                        </div>
                        <div class="feed-reason">\${post.viralityReason || ''}</div>
                        <div class="muted" style="font-size: 10px; margin-top: auto;">\${date}</div>
                    </div>
                    <a href="\${post.postUrl}" target="_blank" class="feed-link">Открыть в Instagram</a>
                \`;
                container.appendChild(card);
            });

        } catch (err) {
            container.innerHTML = '<div class="muted" style="color:red">Ошибка загрузки ленты</div>';
            console.error(err);
        }
    }

    // ACCOUNTS LOGIC
    const addAccountBtn = document.getElementById('add-account-btn');
    const newAccountInput = document.getElementById('new-account-username');
    const accountsTableBody = document.getElementById('accounts-table-body');
    
    // Pagination Controls
    const limitSelect = document.getElementById('limit-select');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    let currentPage = 1;
    let currentLimit = 10;
    
    limitSelect.addEventListener('change', () => {
        currentLimit = Number(limitSelect.value);
        currentPage = 1;
        loadAccounts();
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadAccounts();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        currentPage++;
        loadAccounts();
    });

    async function loadAccounts() {
        accountsTableBody.innerHTML = '<tr><td colspan="4" style="padding:10px; text-align:center;" class="muted">Загрузка...</td></tr>';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;

        try {
             const res = await fetch(\`/api/accounts?page=\${currentPage}&limit=\${currentLimit}\`);
             const data = await res.json();
             const accounts = data.accounts || []; // handle object return
             const total = data.total || 0;
             
             // Update pagination state
             const totalPages = currentLimit > 0 ? Math.ceil(total / currentLimit) : 1;
             pageInfo.textContent = \`Page \${currentPage} of \${totalPages} (Total: \${total})\`;
             
             prevPageBtn.disabled = currentPage <= 1;
             nextPageBtn.disabled = currentPage >= totalPages;

             if (!accounts || accounts.length === 0) {
                 accountsTableBody.innerHTML = '<tr><td colspan="4" style="padding:10px; text-align:center;" class="muted">Нет аккаунтов. Добавьте первый!</td></tr>';
                 return;
             }

             accountsTableBody.innerHTML = '';
             accounts.forEach(acc => {
                 const tr = document.createElement('tr');
                 tr.style.borderBottom = '1px solid #f3f4f6';
                 tr.innerHTML = \`
                    <td style="padding: 10px; font-weight: 500;">\${acc.username}</td>
                    <td style="padding: 10px;" class="muted">\${acc.followers.toLocaleString()}</td>
                    <td style="padding: 10px;" class="muted">\${new Date(acc.createdAt).toLocaleDateString()}</td>
                    <td style="padding: 10px; text-align: right;">
                        <button onclick="deleteAccount('\${acc.username}')" style="background: #fee2e2; color: #b91c1c; padding: 6px 12px; border-radius: 8px; font-size: 12px; box-shadow:none;">Удалить</button>
                    </td>
                 \`;
                 accountsTableBody.appendChild(tr);
             });
        } catch(err) {
            accountsTableBody.innerHTML = '<tr><td colspan="4" style="padding:10px; text-align:center; color:red;">Ошибка загрузки</td></tr>';
        }
    }

    async function addAccount() {
        const username = newAccountInput.value.trim();
        if (!username) return;
        
        addAccountBtn.disabled = true;
        addAccountBtn.textContent = '...';
        
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();
            if (data.added) {
                newAccountInput.value = '';
                loadAccounts();
            } else {
                alert(data.message || 'Ошибка');
            }
        } catch(err) {
            alert('Ошибка сети');
        } finally {
            addAccountBtn.disabled = false;
            addAccountBtn.textContent = 'Добавить';
        }
    }

    async function deleteAccount(username) {
        if (!confirm(\`Удалить аккаунт @\${username}?\`)) return;
        
        try {
            const res = await fetch('/api/accounts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();
            if (data.deleted) {
                loadAccounts();
            } else {
                alert(data.message || 'Ошибка');
            }
        } catch(err) {
            alert('Ошибка сети');
        }
    }
    
    // Expose deleteAccount to window for onclick
    window.deleteAccount = deleteAccount;
    addAccountBtn.addEventListener('click', addAccount);

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
    const testAccountsLimit = Math.min(1000, Math.max(0, Number(body.testAccountsLimit || 0)));
    const viralityFormula = body.viralityFormula === "shares" ? "shares" : "current";
    const followersUpdateFreqDays = Math.max(1, Number(body.followersUpdateFreqDays || 4));
    const maxPostAgeDays = Math.max(1, Number(body.maxPostAgeDays || 30));

    const viralityMultipliers = body.viralityMultipliers || {};

    const updated = await updateAppSettings({
      schedulerMode,
      dailyTime,
      weeklyDay,
      weeklyTime,
      postsPerAccount,
      testAccountsLimit,
      viralityFormula,
      followersUpdateFreqDays,
      maxPostAgeDays,
      viralityMultipliers,
    });

    console.log("💾 [API] POST /api/settings saved", updated);
    return c.json(updated);
  } catch (err: any) {
    console.error("Failed to save settings", err);
    return c.json({ error: "Failed to save settings", details: String(err) }, 500);
  }
});

app.get("/api/feed", async (c) => {
  try {
    const { getViralPosts } = await import("./mastra/services/viralPosts.js");
    const posts = await getViralPosts(100, 0);
    return c.json(posts);
  } catch (err: any) {
    console.error("Failed to fetch feed", err);
    return c.json({ error: "Failed to fetch feed" }, 500);
  }
});

app.post("/api/test-run", async (c) => {
  try {
    console.log("▶️ [API] POST /api/test-run");
    // Fire-and-forget so UI returns instantly; workflow logs progress.
    executeInstagramAnalysis(mastra)
      .then(() => {
        console.log("✅ [API] Test run completed");
      })
      .catch((err) => {
        console.error("❌ [API] Test run failed", err);
      });
    return c.json({ status: "started" });
  } catch (err: any) {
    console.error("Failed to start test run", err);
    return c.json({ error: "Failed to start test run", details: String(err) }, 500);
  }
});

app.post("/api/test-followers-update", async (c) => {
  try {
    console.log("▶️ [API] POST /api/test-followers-update");
    // Fire-and-forget so UI returns instantly
    executeFollowerUpdate(mastra)
      .then(() => {
        console.log("✅ [API] Followers update test run completed");
      })
      .catch((err) => {
        console.error("❌ [API] Followers update test run failed", err);
      });
    return c.json({ status: "started" });
  } catch (err: any) {
    console.error("Failed to start follower update", err);
    return c.json({ error: "Failed to start follower update", details: String(err) }, 500);
  }
});


app.get("/api/accounts", async (c) => {
  try {
    const page = Number(c.req.query("page") || "1");
    const limit = Number(c.req.query("limit") || "0"); // 0 means all

    console.log(`🔎 [API] GET /api/accounts?page=${page}&limit=${limit}`);
    const result = await getAccountsList(page, limit);
    return c.json(result);
  } catch (err: any) {
    console.error("Failed to fetch accounts", err);
    return c.json({ error: "Failed to fetch accounts" }, 500);
  }
});

app.post("/api/accounts", async (c) => {
  try {
    const body = await c.req.json();
    const { username } = body;
    console.log(`➕ [API] POST /api/accounts request for ${username}`);
    if (!username) return c.json({ error: "Username required" }, 400);

    const result = await addInstagramAccount(username);
    console.log(`✅ [API] Account added result:`, result);
    return c.json(result);
  } catch (err: any) {
    console.error("Failed to add account", err);
    return c.json({ error: "Failed to add account" }, 500);
  }
});

app.delete("/api/accounts", async (c) => {
  try {
    const body = await c.req.json();
    const { username } = body;
    console.log(`🗑️ [API] DELETE /api/accounts request for ${username}`);
    if (!username) return c.json({ error: "Username required" }, 400);

    const result = await deleteInstagramAccount(username);
    console.log(`✅ [API] Account delete result:`, result);
    return c.json(result);
  } catch (err: any) {
    console.error("Failed to delete account", err);
    return c.json({ error: "Failed to delete account" }, 500);
  }
});

const startup = async () => {
  try {
    await ensureAppSettingsTable();
    const newAccounts = await seedInstagramAccountsFromFile();
    await startTelegramBot(mastra);

    // If we found new accounts in the CSV that were just inserted, 
    // immediately trigger a follower count update for them.
    if (newAccounts && newAccounts.length > 0) {
      console.log(`🚀 [Startup] Triggering immediate follower update for ${newAccounts.length} new accounts`);
      executeFollowerUpdate(mastra, { targetUsernames: newAccounts })
        .catch(err => console.error("❌ [Startup] specific follower update failed", err));
    }

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
  } catch (err) {
    console.error("Failed to run startup tasks", err);
  }
};

startup();
