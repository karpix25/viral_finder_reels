import type { Mastra } from "@mastra/core";
import { executeInstagramAnalysis } from "../workflows/instagramAnalysisWorkflow";

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
  let lastRunHour = -1;

  // Check every minute if we need to run
  const intervalId = setInterval(async () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    // PRODUCTION MODE: Run at :00 minutes of every hour, only once per hour
    if (currentMinute === 0 && currentHour !== lastRunHour && !isRunning) {
      lastRunHour = currentHour;
      isRunning = true;
      
      console.log("⏰ [CronScheduler] HOURLY TRIGGER!", {
        time: now.toISOString(),
        hour: currentHour,
      });
      logger?.info("🚀 [CronScheduler] Starting Instagram analysis workflow");
      
      try {
        logger?.info("📡 [CronScheduler] Executing workflow logic directly");
        
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
