import { mastra } from "./src/mastra/index";
import { executeInstagramAnalysis } from "./src/mastra/workflows/instagramAnalysisWorkflow";

async function main() {
  console.log("🚀 Manually triggering Instagram analysis workflow...");
  
  try {
    const result = await executeInstagramAnalysis(mastra);
    
    console.log("✅ Workflow completed successfully!");
    console.log("📊 Results:", {
      totalAccountsProcessed: result.totalAccountsProcessed,
      totalViralReelsSent: result.totalViralReelsSent,
    });
    
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Workflow failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
