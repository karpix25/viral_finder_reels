import { db } from "../storage";
import { appSettings } from "../storage/schema";
import { eq } from "drizzle-orm";

export type AppSettings = {
  schedulerMode: "daily" | "weekly";
  dailyTime: string; // HH:MM (UTC)
  weeklyDay: number; // 0-6 (0=Sunday)
  weeklyTime: string; // HH:MM (UTC)
  postsPerAccount: number; // how many posts/reels to analyze per account
  viralityFormula: "current" | "shares";
};

const DEFAULT_SETTINGS: AppSettings = {
  schedulerMode: "daily",
  dailyTime: "09:00",
  weeklyDay: 1, // Monday
  weeklyTime: "09:00",
  postsPerAccount: 100,
  viralityFormula: "current",
};

const SETTINGS_KEY = "default";

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .limit(1);
    if (!rows.length) return DEFAULT_SETTINGS;
    const value = rows[0].value as Partial<AppSettings>;
    return {
      schedulerMode: (value.schedulerMode as AppSettings["schedulerMode"]) ??
        (value as any).schedulerMinutes
        ? "daily"
        : DEFAULT_SETTINGS.schedulerMode,
      dailyTime: value.dailyTime ?? "09:00",
      weeklyDay: value.weeklyDay ?? DEFAULT_SETTINGS.weeklyDay,
      weeklyTime: value.weeklyTime ?? DEFAULT_SETTINGS.weeklyTime,
      postsPerAccount: value.postsPerAccount ?? DEFAULT_SETTINGS.postsPerAccount,
      viralityFormula: (value.viralityFormula as AppSettings["viralityFormula"]) ??
        DEFAULT_SETTINGS.viralityFormula,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateAppSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = {
    schedulerMode: payload.schedulerMode ?? current.schedulerMode,
    dailyTime: payload.dailyTime ?? current.dailyTime,
    weeklyDay: payload.weeklyDay ?? current.weeklyDay,
    weeklyTime: payload.weeklyTime ?? current.weeklyTime,
    postsPerAccount: payload.postsPerAccount ?? current.postsPerAccount,
    viralityFormula: payload.viralityFormula ?? current.viralityFormula,
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
