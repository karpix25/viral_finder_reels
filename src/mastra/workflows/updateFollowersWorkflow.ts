import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { RuntimeContext } from "@mastra/core/di";
import { getAllInstagramAccounts } from "../services/accounts.js";
import { fetchProfileStatsTool } from "../tools/fetchProfileStatsTool.js";

const runtimeContext = new RuntimeContext();

export async function executeFollowerUpdate(mastra: any) {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Workflow] Starting Instagram follower update - processing ALL accounts");

    // Step 1: Get ALL accounts from DB
    const accounts = await getAllInstagramAccounts();
    logger?.info(`📖 [Step1] Found ${accounts.length} accounts to update`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const username of accounts) {
        try {
            const accountUrl = `https://www.instagram.com/${username}/`;
            logger?.info(`📝 [Step2] Updating followers for ${username}`);

            // Step 2: Fetch and update (tool handles the upsert internally)
            const result = await fetchProfileStatsTool.execute({
                context: { accountUrl },
                mastra,
                runtimeContext,
            });

            logger?.info(`✅ [Step2] Updated ${username}: ${result.followersCount} followers`);
            updatedCount++;
        } catch (error) {
            logger?.error(`❌ [Step2] Failed to update followers for ${username}`, {
                error: String(error),
            });
            errorCount++;
        }
    }

    logger?.info("✅ [Workflow] Follower update complete", {
        totalAccounts: accounts.length,
        updatedCount,
        errorCount,
    });

    return {
        totalAccounts: accounts.length,
        updatedCount,
        errorCount,
    };
}

// Step wrapper for Inngest workflow
const stepUpdateFollowers = createStep({
    id: "update-instagram-followers",
    description: "Updates follower counts for all tracked Instagram accounts",
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    execute: async ({ mastra }) => {
        return await executeFollowerUpdate(mastra);
    },
});

export const updateFollowersWorkflow = createWorkflow({
    id: "instagram-followers-update",
    description: "Scheduled task to update Instagram follower counts",
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
}).then(stepUpdateFollowers).commit();
