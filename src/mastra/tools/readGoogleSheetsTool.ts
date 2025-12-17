import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  ensureInstagramAccountsTable,
  getAllInstagramAccounts,
} from "../services/accounts.js";

export const readGoogleSheetsTool = createTool({
  id: "read-google-sheets-instagram-accounts",
  description: "Reads Instagram account usernames from Postgres storage",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(z.string()),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [ReadAccounts] Loading accounts from Postgres");

    try {
      await ensureInstagramAccountsTable();
      const accounts = await getAllInstagramAccounts();

      logger?.info("✅ [ReadAccounts] Completed successfully", {
        accountsCount: accounts.length,
      });

      return { accounts };
    } catch (error: any) {
      logger?.error("❌ [ReadAccounts] Error details:", {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
});
