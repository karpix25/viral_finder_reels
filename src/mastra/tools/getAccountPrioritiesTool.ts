import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { asc, sql } from "drizzle-orm";
import { accountCheckHistory } from "../storage/schema.js";

export const getAccountPrioritiesTool = createTool({
  id: "getAccountPriorities",
  description: "Get account check priorities - accounts that haven't been checked recently are prioritized",
  inputSchema: z.object({
    allUsernames: z.array(z.string()).describe("All usernames from Google Sheets"),
  }),
  outputSchema: z.object({
    prioritizedUsernames: z.array(z.string()).describe("Usernames sorted by priority (never checked first, then oldest checks)"),
    neverChecked: z.number().describe("Number of accounts never checked before"),
    oldestCheckAge: z.string().optional().describe("Age of the oldest check in human readable format"),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { allUsernames } = context;
    
    logger?.info("🔧 [GetAccountPriorities] Starting execution", { 
      totalAccounts: allUsernames.length 
    });
    
    const storage = mastra?.storage as any;
    if (!storage?.db) {
      throw new Error("Database not available");
    }
    
    const db = storage.db;
    
    try {
      // Get all check history, ordered by oldest checks first
      const checkHistory = await db
        .select()
        .from(accountCheckHistory)
        .orderBy(asc(accountCheckHistory.lastCheckedAt));
      
      logger?.info("📊 [GetAccountPriorities] Loaded check history", {
        historyCount: checkHistory.length,
      });
      
      // Create a map of username -> lastCheckedAt
      const checkMap = new Map<string, Date>();
      for (const record of checkHistory) {
        checkMap.set(record.username, record.lastCheckedAt);
      }
      
      // Separate never-checked and checked accounts
      const neverChecked: string[] = [];
      const checked: Array<{ username: string; lastCheckedAt: Date }> = [];
      
      for (const username of allUsernames) {
        const lastCheck = checkMap.get(username);
        if (lastCheck) {
          checked.push({ username, lastCheckedAt: lastCheck });
        } else {
          neverChecked.push(username);
        }
      }
      
      // Sort checked accounts by oldest first
      checked.sort((a, b) => a.lastCheckedAt.getTime() - b.lastCheckedAt.getTime());
      
      // Prioritize: never checked first, then oldest checks
      const prioritizedUsernames = [
        ...neverChecked,
        ...checked.map(c => c.username),
      ];
      
      // Calculate oldest check age
      let oldestCheckAge: string | undefined;
      if (checked.length > 0) {
        const oldestCheck = checked[0].lastCheckedAt;
        const ageMs = Date.now() - oldestCheck.getTime();
        const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
        const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
        oldestCheckAge = `${ageHours}h ${ageMinutes}m ago`;
      }
      
      logger?.info("✅ [GetAccountPriorities] Prioritization complete", {
        neverChecked: neverChecked.length,
        checked: checked.length,
        oldestCheckAge,
      });
      
      return {
        prioritizedUsernames,
        neverChecked: neverChecked.length,
        oldestCheckAge,
      };
    } catch (error: any) {
      logger?.error("❌ [GetAccountPriorities] Failed", {
        error: error.message,
      });
      throw error;
    }
  },
});
