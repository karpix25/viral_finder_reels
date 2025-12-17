import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import cron from "node-cron";

import { sharedPostgresStorage } from "./storage/index.js";
import { readGoogleSheetsTool } from "./tools/readGoogleSheetsTool.js";
import { scrapeInstagramTool } from "./tools/scrapeInstagramTool.js";
import { analyzeViralReelsTool } from "./tools/analyzeViralReelsTool.js";
import { sendTelegramMessageTool } from "./tools/sendTelegramMessageTool.js";
import { sendSingleViralReelTool } from "./tools/sendSingleViralReelTool.js";
import { getAccountPrioritiesTool } from "./tools/getAccountPrioritiesTool.js";
import { updateAccountCheckTool } from "./tools/updateAccountCheckTool.js";
import { executeInstagramAnalysis } from "./workflows/instagramAnalysisWorkflow.js";

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  agents: {},
  workflows: {},
  mcpServers: {
    allTools: new MCPServer({
      name: "allTools",
      version: "1.0.0",
      tools: {
        readGoogleSheetsTool,
        scrapeInstagramTool,
        analyzeViralReelsTool,
        sendTelegramMessageTool,
        sendSingleViralReelTool,
        getAccountPrioritiesTool,
        updateAccountCheckTool,
      },
    }),
  },
  bundler: {
    externals: [
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

console.log("✅ [Main] Instagram Analyzer project initialized (Autoscale mode)");
console.log("💡 [Main] This project ONLY handles hourly Instagram analysis");
console.log("💡 [Main] Account management is handled by separate Telegram Bot project");

// Legacy cron scheduler (disabled by default; enable with ENABLE_LEGACY_CRON=1)
if (process.env.NODE_ENV === "production" && process.env.ENABLE_LEGACY_CRON === "1") {
  const logger = mastra.getLogger();
  
  logger?.info("⏰ [Cron] Starting hourly Instagram analysis scheduler");
  logger?.info("⏰ [Cron] Schedule: Every hour at :00 minutes (0 * * * *)");
  
  // Run every hour at :00 minutes
  cron.schedule("0 * * * *", async () => {
    const now = new Date().toISOString();
    logger?.info("🚀 [Cron] Hourly trigger fired", { time: now });
    
    try {
      const result = await executeInstagramAnalysis(mastra);
      
      logger?.info("✅ [Cron] Analysis completed successfully", {
        totalAccountsProcessed: result.totalAccountsProcessed,
        totalViralReelsSent: result.totalViralReelsSent,
        completedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger?.error("❌ [Cron] Analysis failed", {
        error: error.message,
        stack: error.stack,
        failedAt: new Date().toISOString(),
      });
    }
  });
  
  logger?.info("✅ [Cron] Hourly scheduler started successfully");
  logger?.info("⏰ [Cron] Next run: Top of the hour (:00 minutes)");
}
