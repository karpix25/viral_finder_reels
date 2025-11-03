import cron from "node-cron";
import type { Mastra } from "@mastra/core";
import { executeInstagramAnalysis } from "../workflows/instagramAnalysisWorkflow";

export function startCronScheduler(mastra: Mastra) {
  const logger = mastra.getLogger();
  
  console.log("⏰ [CronScheduler] startCronScheduler called", {
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Cron runs on UTC time (timezone option doesn't work in Replit)
  const cronExpression = process.env.SCHEDULE_CRON_EXPRESSION || "0 * * * *"; // Every hour at :00
  
  console.log("⏰ [CronScheduler] Starting cron scheduler", {
    expression: cronExpression,
    note: "Running on UTC time",
  });

  // Log current time for debugging
  console.log("🕐 [CronScheduler] Current time", {
    utc: new Date().toISOString(),
  });

  // Schedule the workflow (using UTC timezone)
  const task = cron.schedule(
    cronExpression,
    async () => {
      console.log("⏰ [CronScheduler] CRON TRIGGERED!", {
        time: new Date().toISOString(),
      });
      logger?.info("🚀 [CronScheduler] Starting Instagram analysis workflow");
      
      try {
        logger?.info("📡 [CronScheduler] Executing workflow logic directly (bypassing Inngest)");
        
        // Execute the core workflow logic directly
        // This bypasses the Inngest wrapper which requires event context
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
        
        // Don't throw - let cron continue on next schedule
        logger?.warn("⚠️ [CronScheduler] Will retry on next scheduled run");
      }
    }
    // Removed timezone option - using UTC instead
  );
  
  // Start the task immediately
  task.start();

  logger?.info("✅ [CronScheduler] Cron scheduler started successfully", {
    note: "Workflow will run every hour at :00 minutes (UTC)",
  });

  // Graceful shutdown
  process.once("SIGINT", () => {
    logger?.info("⏰ [CronScheduler] Stopping cron scheduler...");
    task.stop();
  });
  process.once("SIGTERM", () => {
    logger?.info("⏰ [CronScheduler] Stopping cron scheduler...");
    task.stop();
  });
}
