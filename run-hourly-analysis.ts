import { mastra } from "./src/mastra/index.js";
import { executeInstagramAnalysis } from "./src/mastra/workflows/instagramAnalysisWorkflow.js";

console.log("🚀 [Time-based Automation] Starting hourly Instagram analysis...");
console.log("⏰ [Time-based Automation] Current time:", new Date().toISOString());

try {
  const result = await executeInstagramAnalysis(mastra);
  
  console.log("✅ [Time-based Automation] Analysis completed successfully", {
    totalAccountsProcessed: result.totalAccountsProcessed,
    totalViralReelsSent: result.totalViralReelsSent,
    timestamp: new Date().toISOString(),
  });
  
  process.exit(0);
} catch (error: any) {
  console.error("❌ [Time-based Automation] Analysis failed", {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  
  process.exit(1);
}
