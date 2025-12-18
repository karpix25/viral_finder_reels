import { mastra } from "./src/mastra/index.js";
import { executeFollowerUpdate } from "./src/mastra/workflows/updateFollowersWorkflow.js";

console.log("🚀 [Follower Update] Starting global follower count update...");
console.log("⏰ [Follower Update] Current time:", new Date().toISOString());

try {
    const result = await executeFollowerUpdate(mastra);

    console.log("✅ [Follower Update] Completed successfully", {
        totalAccounts: result.totalAccounts,
        updated: result.updatedCount,
        errors: result.errorCount,
        timestamp: new Date().toISOString(),
    });

    process.exit(0);
} catch (error: any) {
    console.error("❌ [Follower Update] Failed", {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
    });

    process.exit(1);
}
