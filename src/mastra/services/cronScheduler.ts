import type { Mastra } from "@mastra/core";
import { executeInstagramAnalysis } from "../workflows/instagramAnalysisWorkflow";
import { getAppSettings } from "./settings";

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

    logger?.info("⏰ [CronScheduler] Trigger", {
      mode,
      runKey,
      time: now.toISOString(),
    });
    
    try {
      const result = await executeInstagramAnalysis(mastra);
      
      logger?.info("✅ [CronScheduler] Workflow completed successfully", {
        totalAccountsProcessed: result.totalAccountsProcessed,
        totalViralReelsSent: result.totalViralReelsSent,
      });
    } catch (error: any) {
      logger?.error("❌ [CronScheduler] Workflow failed", {
        error: error.message,
        stack: error.stack,
      });
      
      logger?.warn("⚠️ [CronScheduler] Will retry on next scheduled run");
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
