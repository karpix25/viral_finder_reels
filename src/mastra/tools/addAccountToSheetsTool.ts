import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addInstagramAccount,
  ensureInstagramAccountsTable,
} from "../services/accounts.js";

export const addAccountToSheetsTool = createTool({
  id: "add-account-to-sheets",
  description: "Adds a new Instagram account username to Postgres if it doesn't exist",
  inputSchema: z.object({
    username: z.string().describe("Instagram username to add"),
  }),
  outputSchema: z.object({
    added: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const { username } = context;
    const logger = mastra?.getLogger();
    
    logger?.info("🔧 [AddAccount] Starting execution", {
      username,
    });

    try {
      await ensureInstagramAccountsTable();
      const result = await addInstagramAccount(username);

      if (result.added) {
        logger?.info("✅ [AddAccount] Account added successfully", { username });
      } else {
        logger?.info("⚠️ [AddAccount] Account already exists", { username });
      }

      return result;
    } catch (error: any) {
      logger?.error("❌ [AddAccount] Error details:", {
        message: error.message,
        code: error.code,
        status: error.status,
        username,
      });
      throw error;
    }
  },
});
