import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../storage/index.js";
import { accountCheckHistory } from "../storage/schema.js";

export const updateAccountCheckTool = createTool({
  id: "updateAccountCheck",
  description: "Update the last check timestamp for an Instagram account in the database",
  inputSchema: z.object({
    username: z.string().describe("Instagram username that was checked"),
    viralReelsFound: z.number().default(0).describe("Number of viral reels found in this check"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    username: z.string(),
    lastCheckedAt: z.string(),
    totalChecks: z.number(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { username, viralReelsFound } = context;
    
    logger?.info("🔧 [UpdateAccountCheck] Starting execution", { username, viralReelsFound });
    
    try {
      // Upsert account check history
      const result = await db
        .insert(accountCheckHistory)
        .values({
          username,
          lastCheckedAt: new Date(),
          totalChecks: 1,
          lastViralReelsFound: viralReelsFound,
        })
        .onConflictDoUpdate({
          target: accountCheckHistory.username,
          set: {
            lastCheckedAt: new Date(),
            totalChecks: sql`${accountCheckHistory.totalChecks} + 1`,
            lastViralReelsFound: viralReelsFound,
          },
        })
        .returning();
      
      const updated = result[0];
      
      logger?.info("✅ [UpdateAccountCheck] Account check updated", {
        username,
        totalChecks: updated.totalChecks,
        lastViralReelsFound: viralReelsFound,
      });
      
      return {
        success: true,
        username: updated.username,
        lastCheckedAt: updated.lastCheckedAt.toISOString(),
        totalChecks: updated.totalChecks,
      };
    } catch (error: any) {
      logger?.error("❌ [UpdateAccountCheck] Failed to update", {
        username,
        error: error.message,
      });
      throw error;
    }
  },
});
