import { db, pool } from "../storage";
import { appSettings } from "../storage/schema";
import { eq } from "drizzle-orm";

export type AppSettings = {
  schedulerMode: "daily" | "weekly";
  dailyTime: string; // HH:MM (UTC)
  weeklyDay: number; // 0-6 (0=Sunday)
  weeklyTime: string; // HH:MM (UTC)
  postsPerAccount: number; // how many posts/reels to analyze per account
  viralityFormula: "current" | "shares";
  testAccountsLimit: number; // 0 = all, >0 limit accounts per run
};

const DEFAULT_SETTINGS: AppSettings = {
  schedulerMode: "daily",
  dailyTime: "09:00",
  weeklyDay: 1, // Monday
  weeklyTime: "09:00",
  postsPerAccount: 100,
  viralityFormula: "current",
  testAccountsLimit: 0,
};

const SETTINGS_KEY = "default";

let ensured = false;
export async function ensureAppSettingsTable() {
  if (ensured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);
    console.log("✅ [DB] app_settings ensured");
    ensured = true;
  } catch (error) {
    console.error("❌ [DB] Failed to ensure app_settings", error);
    ensured = false;
    throw error;
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureAppSettingsTable();
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTINGS_KEY))
    .limit(1);
  if (!rows.length) return DEFAULT_SETTINGS;
  const value = rows[0].value as Partial<AppSettings>;
  const schedulerMode =
    value.schedulerMode === "weekly" ? "weekly" : "daily";

  return {
    schedulerMode,
    dailyTime: value.dailyTime ?? DEFAULT_SETTINGS.dailyTime,
    weeklyDay: value.weeklyDay ?? DEFAULT_SETTINGS.weeklyDay,
    weeklyTime: value.weeklyTime ?? DEFAULT_SETTINGS.weeklyTime,
    postsPerAccount: value.postsPerAccount ?? DEFAULT_SETTINGS.postsPerAccount,
    viralityFormula: (value.viralityFormula as AppSettings["viralityFormula"]) ??
      DEFAULT_SETTINGS.viralityFormula,
    testAccountsLimit: value.testAccountsLimit ?? DEFAULT_SETTINGS.testAccountsLimit,
  };
}

export async function updateAppSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  await ensureAppSettingsTable();
  const current = await getAppSettings();
  const next: AppSettings = {
    schedulerMode: payload.schedulerMode ?? current.schedulerMode,
    dailyTime: payload.dailyTime ?? current.dailyTime,
    weeklyDay: payload.weeklyDay ?? current.weeklyDay,
    weeklyTime: payload.weeklyTime ?? current.weeklyTime,
    postsPerAccount: payload.postsPerAccount ?? current.postsPerAccount,
    viralityFormula: payload.viralityFormula ?? current.viralityFormula,
    testAccountsLimit:
      payload.testAccountsLimit ?? current.testAccountsLimit ?? 0,
  };

  await db
    .insert(appSettings)
    .values({
      key: SETTINGS_KEY,
      value: next,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: next,
        updatedAt: new Date(),
      },
    });

  return next;
}
