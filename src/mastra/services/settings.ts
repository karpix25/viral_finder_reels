import { db, pool } from "../storage";
import { appSettings } from "../storage/schema";
import { eq } from "drizzle-orm";

export type ViralityMultipliers = {
  tier1_1k_5k: number;
  tier2_5k_10k: number;
  tier3_10k_20k: number;
  tier4_20k_50k: number;
  tier5_50k_100k: number;
  tier6_100k_200k: number;
  tier7_200k_500k: number;
  tier8_500k_plus: number;
};

export type AppSettings = {
  schedulerMode: "daily" | "weekly";
  dailyTime: string; // HH:MM (UTC)
  weeklyDay: number; // 0-6 (0=Sunday)
  weeklyTime: string; // HH:MM (UTC)
  postsPerAccount: number; // how many posts/reels to analyze per account
  viralityFormula: "current" | "shares";
  testAccountsLimit: number; // 0 = all, >0 limit accounts per run
  followersUpdateFreqDays: number; // how often to update followers (in days)
  viralityMultipliers: ViralityMultipliers;
};

const DEFAULT_MULTIPLIERS: ViralityMultipliers = {
  tier1_1k_5k: 100,
  tier2_5k_10k: 50,
  tier3_10k_20k: 30,
  tier4_20k_50k: 15,
  tier5_50k_100k: 8,
  tier6_100k_200k: 5,
  tier7_200k_500k: 2.5,
  tier8_500k_plus: 1.5,
};

const DEFAULT_SETTINGS: AppSettings = {
  schedulerMode: "daily",
  dailyTime: "09:00",
  weeklyDay: 1, // Monday
  weeklyTime: "09:00",
  postsPerAccount: 100,
  viralityFormula: "current",
  testAccountsLimit: 0,
  followersUpdateFreqDays: 4,
  viralityMultipliers: DEFAULT_MULTIPLIERS,
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

  const mergedMultipliers = {
    ...DEFAULT_MULTIPLIERS,
    ...(value.viralityMultipliers || {}),
  };

  return {
    schedulerMode,
    dailyTime: value.dailyTime ?? DEFAULT_SETTINGS.dailyTime,
    weeklyDay: value.weeklyDay ?? DEFAULT_SETTINGS.weeklyDay,
    weeklyTime: value.weeklyTime ?? DEFAULT_SETTINGS.weeklyTime,
    postsPerAccount: value.postsPerAccount ?? DEFAULT_SETTINGS.postsPerAccount,
    viralityFormula: (value.viralityFormula as AppSettings["viralityFormula"]) ??
      DEFAULT_SETTINGS.viralityFormula,
    testAccountsLimit: value.testAccountsLimit ?? DEFAULT_SETTINGS.testAccountsLimit,
    followersUpdateFreqDays: value.followersUpdateFreqDays ?? DEFAULT_SETTINGS.followersUpdateFreqDays,
    viralityMultipliers: mergedMultipliers,
  };
}

export async function updateAppSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  await ensureAppSettingsTable();
  const current = await getAppSettings();

  // Merge multipliers if provided partially
  const nextMultipliers = {
    ...current.viralityMultipliers,
    ...(payload.viralityMultipliers || {}),
  };

  const next: AppSettings = {
    schedulerMode: payload.schedulerMode ?? current.schedulerMode,
    dailyTime: payload.dailyTime ?? current.dailyTime,
    weeklyDay: payload.weeklyDay ?? current.weeklyDay,
    weeklyTime: payload.weeklyTime ?? current.weeklyTime,
    postsPerAccount: payload.postsPerAccount ?? current.postsPerAccount,
    viralityFormula: payload.viralityFormula ?? current.viralityFormula,
    testAccountsLimit:
      payload.testAccountsLimit ?? current.testAccountsLimit ?? 0,
    followersUpdateFreqDays: payload.followersUpdateFreqDays ?? current.followersUpdateFreqDays,
    viralityMultipliers: nextMultipliers,
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
