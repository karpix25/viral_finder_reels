import { mastra } from "./src/mastra/index.js";
import { scrapeInstagramTool } from "./src/mastra/tools/scrapeInstagramTool.js";
import { RuntimeContext } from "@mastra/core/di";

const runtimeContext = new RuntimeContext();

// Manual list of known big accounts from the sheet
const bigAccounts = [
  "themarkethustle",    // 1M+
  "thewealthvault",     // Check if big
  "businessboomers",    // Check if big  
  "worldka_business",   // Previously found viral content
];

console.log("🔍 Quick analysis of big accounts\n");

async function quickAnalyze() {
  for (const username of bigAccounts) {
    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Analyzing: ${username}...`);
      
      const accountData = await scrapeInstagramTool.execute({
        context: { accountUrl: username },
        mastra,
        runtimeContext,
      });
      
      console.log(`👤 @${accountData.username}`);
      console.log(`👥 Followers: ${accountData.followersCount.toLocaleString()}`);
      console.log(`📹 Reels/Posts found: ${accountData.reels.length}`);
      
      if (accountData.reels.length > 0) {
        const sortedReels = [...accountData.reels].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        const now = new Date();
        
        console.log(`\n📆 All ${accountData.reels.length} posts by age:`);
        sortedReels.forEach((reel, index) => {
          const daysAgo = Math.floor((now.getTime() - new Date(reel.timestamp).getTime()) / (1000 * 60 * 60 * 24));
          const viewsK = reel.viewCount > 0 ? Math.round(reel.viewCount / 1000) : 0;
          const type = reel.type === 'Sidecar' ? '🎠' : '🎬';
          console.log(`   ${index + 1}. ${type} ${daysAgo} days ago - ${viewsK}K views - ${reel.type}`);
        });
        
        const oldestReel = sortedReels[sortedReels.length - 1];
        const oldestDaysAgo = Math.floor((now.getTime() - new Date(oldestReel.timestamp).getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`\n⏰ Oldest post is ${oldestDaysAgo} days old`);
        console.log(`⏰ Range: ${Math.floor((now.getTime() - new Date(sortedReels[0].timestamp).getTime()) / (1000 * 60 * 60 * 24))} to ${oldestDaysAgo} days`);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n\n✅ Analysis complete!`);
  process.exit(0);
}

quickAnalyze().catch((err) => {
  console.error(err);
  process.exit(1);
});
