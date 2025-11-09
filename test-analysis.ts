import { mastra } from "./src/mastra/index.js";
import { executeInstagramAnalysis } from "./src/mastra/workflows/instagramAnalysisWorkflow.js";

console.log("🧪 [Test] Starting manual Instagram analysis...");

try {
  const result = await executeInstagramAnalysis(mastra);
  console.log("✅ [Test] Analysis completed", result);
  process.exit(0);
} catch (error: any) {
  console.error("❌ [Test] Analysis failed", error.message);
  console.error(error.stack);
  process.exit(1);
}
