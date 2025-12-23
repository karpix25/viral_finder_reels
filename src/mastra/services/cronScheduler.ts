import type { Mastra } from "@mastra/core";
import { executeInstagramAnalysis } from "../workflows/instagramAnalysisWorkflow";
import { executeFollowerUpdate } from "../workflows/updateFollowersWorkflow";
import { getAppSettings, updateAppSettings } from "./settings";

export function startCronScheduler(mastra: Mastra) {
  const logger = mastra.getLogger();

  console.log("⏰ [CronScheduler] startCronScheduler called", {
    nodeEnv: process.env.NODE_ENV,
  });

  console.log("⏰ [CronScheduler] Starting interval-based scheduler (node-cron doesn't work in Replit)");
  console.log("🕐 [CronScheduler] Current time", {
    utc: new Date().toISOString(),
  });

  let isRunning = false;
  let lastRunKey = "";

  const matchesTime = (date: Date, hhmm: string) => {
    const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
    return date.getUTCHours() === hh && date.getUTCMinutes() === mm;
  };

  const weekKey = (date: Date) => {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const days = Math.floor(
      (date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000),
    );
    const week = Math.ceil((days + firstDay.getUTCDay() + 1) / 7);
    return `${date.getUTCFullYear()}-W${week}`;
  };

  // Check every minute if we need to run
  const intervalId = setInterval(async () => {
    const now = new Date();
    const settings = await getAppSettings();
    const mode = settings.schedulerMode || "daily";

    let shouldRun = false;
    let runKey = "";

    if (mode === "daily") {
      if (matchesTime(now, settings.dailyTime || "09:00")) {
        runKey = now.toISOString().split("T")[0]; // YYYY-MM-DD
        shouldRun = runKey !== lastRunKey;
      }
    } else {
      const targetDay = settings.weeklyDay ?? 1;
      if (now.getUTCDay() === targetDay && matchesTime(now, settings.weeklyTime || "09:00")) {
        runKey = `${weekKey(now)}-${targetDay}`;
        shouldRun = runKey !== lastRunKey;
      }
    }

    if (!shouldRun || isRunning) return;

    isRunning = true;
    lastRunKey = runKey;

    logger?.info("⏰ [CronScheduler] Trigger fired", {
      mode,
      runKey,
      time: now.toISOString(),
    });

    // 1. Run the main content analysis workflow
    try {
      logger?.info("🚀 [CronScheduler] Starting Instagram Analysis...");
      const result = await executeInstagramAnalysis(mastra);

      logger?.info("✅ [CronScheduler] Analysis completed successfully", {
        totalAccountsProcessed: result.totalAccountsProcessed,
        totalViralReelsSent: result.totalViralReelsSent,
      });
    } catch (error: any) {
      logger?.error("❌ [CronScheduler] Analysis workflow failed", {
        error: error.message,
        stack: error.stack,
      });
    }

    // 2. Check if we need to update follower counts
    // Logic: If last update was > X days ago (or never)
    try {
      const freqDays = settings.followersUpdateFreqDays || 4;
      const lastUpdate = settings.lastFollowerUpdateAt ? new Date(settings.lastFollowerUpdateAt) : null;

      let shouldUpdateFollowers = false;
      if (!lastUpdate) {
        shouldUpdateFollowers = true;
      } else {
        const daysSince = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= freqDays) {
          shouldUpdateFollowers = true;
        }
      }

      if (shouldUpdateFollowers) {
        logger?.info("🚀 [CronScheduler] Triggering periodic follower count update", {
          freqDays,
          lastUpdate: lastUpdate ? lastUpdate.toISOString() : "NEVER"
        });

        // Run the workflow
        const result = await executeFollowerUpdate(mastra);

        // Update the timestamp in settings
        await updateAppSettings({
          lastFollowerUpdateAt: new Date().toISOString()
        });

        logger?.info("✅ [CronScheduler] Follower update completed", {
          updated: result.updatedCount,
          errors: result.errorCount
        });
      } else {
        logger?.info("⏭️ [CronScheduler] Skipping follower update (not due yet)", {
          lastUpdate: lastUpdate?.toISOString(),
          freqDays
        });
      }

    } catch (error: any) {
      logger?.error("❌ [CronScheduler] Follower update failed", {
        error: error.message
      });
    } finally {
      isRunning = false;
    }
  }, 60000); // Check every minute

  logger?.info("✅ [CronScheduler] Scheduler started successfully", {
    note: "Running every hour at :00 minutes (UTC)",
    checkInterval: "60 seconds",
  });

  // Graceful shutdown
  process.once("SIGINT", () => {
    logger?.info("⏰ [CronScheduler] Stopping scheduler...");
    clearInterval(intervalId);
  });
  process.once("SIGTERM", () => {
    logger?.info("⏰ [CronScheduler] Stopping scheduler...");
    clearInterval(intervalId);
  });
}
