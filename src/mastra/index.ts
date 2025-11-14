import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { addAccountToSheetsTool } from "./tools/addAccountToSheetsTool";
import { getPostOwnerTool } from "./tools/getPostOwnerTool";
import { startTelegramBot } from "./services/telegramBot";

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
        addAccountToSheetsTool,
        getPostOwnerTool,
      },
    }),
  },
  bundler: {
    // A few dependencies are not properly picked up by
    // the bundler if they are not added directly to the
    // entrypoint.
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    // sourcemaps are good for debugging.
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    middleware: [
      async (c, next) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              // This is typically a non-retirable error. It means that the request was not
              // setup correctly to pass in the necessary parameters.
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            // Validation errors are never retriable.
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      // API endpoint to add Instagram accounts to Google Sheets
      {
        path: "/api/add-account",
        method: "POST",
        createHandler: async ({ mastra }) => {
          const { RuntimeContext } = await import("@mastra/core/di");
          
          return async (c) => {
            const logger = mastra.getLogger();
            try {
              const body = await c.req.json();
              const { username } = body;
              
              if (!username) {
                return c.json({ error: "username is required" }, 400);
              }
              
              logger?.info("📝 [API] Adding account", { username });
              
              const runtimeContext = new RuntimeContext();
              const result = await addAccountToSheetsTool.execute({
                context: { username },
                runtimeContext,
                mastra,
              });
              
              return c.json({ success: true, added: result.added, username });
            } catch (error: any) {
              logger?.error("❌ [API] Error adding account", {
                error: error.message,
              });
              return c.json({ error: error.message }, 500);
            }
          };
        },
      },
    ],
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

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

// Start Telegram bot for processing Instagram links from group chat
// Note: Telegram only allows ONE polling connection per token
// This bot ONLY adds accounts to Google Sheets
// The hourly Instagram analysis is done by a separate Scheduled Deployment project
startTelegramBot(mastra).catch((error) => {
  const logger = mastra.getLogger();
  logger?.error("❌ [Main] Failed to start Telegram bot", {
    error: error.message,
  });
  logger?.warn("⚠️ [Main] Telegram bot not started - continuing without it");
  logger?.warn("💡 [Main] To add accounts, use Google Sheets directly or curl API");
});

console.log("✅ [Main] Telegram Bot project initialized (Autoscale mode)");
console.log("💡 [Main] This project ONLY handles adding accounts via Telegram bot");
console.log("💡 [Main] Hourly Instagram analysis is handled by separate Scheduled Deployment project");
