import cron from "node-cron";
import type { Mastra } from "@mastra/core";
import { instagramAnalysisWorkflow } from "../workflows/instagramAnalysisWorkflow";

export function startCronScheduler(mastra: Mastra) {
  const logger = mastra.getLogger();
  
  console.log("⏰ [CronScheduler] startCronScheduler called", {
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Don't start cron scheduler in development (Inngest Dev Server handles it)
  if (process.env.NODE_ENV !== "production") {
    console.log("⏰ [CronScheduler] Skipping cron scheduler in development (using Inngest Dev Server)");
    return;
  }
  
  const cronExpression = process.env.SCHEDULE_CRON_EXPRESSION || "0 * * * *"; // Every hour
  const timezone = process.env.SCHEDULE_CRON_TIMEZONE || "Europe/Moscow";
  
  console.log("⏰ [CronScheduler] Starting cron scheduler", {
    expression: cronExpression,
    timezone,
  });

  // Schedule the workflow
  const task = cron.schedule(
    cronExpression,
    async () => {
      logger?.info("🚀 [CronScheduler] Starting Instagram analysis workflow");
      
      try {
        logger?.info("📡 [CronScheduler] Executing workflow directly");
        
        // Execute workflow directly (more reliable in production)
        const result = await instagramAnalysisWorkflow.execute({
          inputData: {},
          runtimeContext: {},
        });
        
        logger?.info("✅ [CronScheduler] Workflow completed successfully", {
          result: result ? "success" : "no result",
        });
      } catch (error: any) {
        logger?.error("❌ [CronScheduler] Workflow failed", {
          error: error.message,
          stack: error.stack,
        });
        
        // Don't throw - let cron continue on next schedule
        logger?.warn("⚠️ [CronScheduler] Will retry on next scheduled run");
      }
    },
    {
      timezone,
    }
  );
  
  // Start the task immediately
  task.start();

  logger?.info("✅ [CronScheduler] Cron scheduler started successfully");

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
