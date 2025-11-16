import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";

import { sharedPostgresStorage } from "./storage/index.js";
import { readGoogleSheetsTool } from "./tools/readGoogleSheetsTool.js";
import { scrapeInstagramTool } from "./tools/scrapeInstagramTool.js";
import { analyzeViralReelsTool } from "./tools/analyzeViralReelsTool.js";
import { sendTelegramMessageTool } from "./tools/sendTelegramMessageTool.js";
import { sendSingleViralReelTool } from "./tools/sendSingleViralReelTool.js";
import { getAccountPrioritiesTool } from "./tools/getAccountPrioritiesTool.js";
import { updateAccountCheckTool } from "./tools/updateAccountCheckTool.js";

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

console.log("✅ [Main] Instagram Analyzer project initialized (Scheduled mode)");
console.log("💡 [Main] This project ONLY handles hourly Instagram analysis");
console.log("💡 [Main] Account management is handled by separate Telegram Bot project");
console.log("⏰ [Main] Cron scheduling handled by Replit's Scheduled Deployment (0 * * * *)");
