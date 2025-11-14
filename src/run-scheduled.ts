import { mastra } from "./mastra/index.js";
import { executeInstagramAnalysis } from "./mastra/workflows/instagramAnalysisWorkflow.js";

async function runHourlyAnalysis() {
  const logger = mastra.getLogger();
  
  logger?.info("🚀 [Scheduled] Starting hourly Instagram analysis");
  logger?.info("⏰ [Scheduled] Current time", { utc: new Date().toISOString() });

  try {
    const result = await executeInstagramAnalysis(mastra);
    
    logger?.info("✅ [Scheduled] Analysis completed", {
      totalAccountsProcessed: result.totalAccountsProcessed,
      totalViralReelsSent: result.totalViralReelsSent,
    });

    return result;
  } catch (error: any) {
    logger?.error("❌ [Scheduled] Analysis failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function main() {
  console.log("🔧 [Scheduled Entry Point] Starting...");
  
  try {
    await runHourlyAnalysis();
    console.log("✅ [Scheduled Entry Point] Completed successfully");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ [Scheduled Entry Point] Failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
