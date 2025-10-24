import { mastra } from "./src/mastra/index";
import { executeInstagramAnalysis } from "./src/mastra/workflows/instagramAnalysisWorkflow";

async function runWorkflowNow() {
  console.log("🚀 Running Instagram analysis workflow manually...");
  
  try {
    const result = await executeInstagramAnalysis(mastra);
    
    console.log("✅ Workflow completed successfully!");
    console.log("📊 Results:", {
      totalAccountsProcessed: result.totalAccountsProcessed,
      totalViralReelsSent: result.totalViralReelsSent,
    });
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

runWorkflowNow();
