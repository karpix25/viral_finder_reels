import { mastra } from "./src/mastra/index.js";
import { readGoogleSheetsTool } from "./src/mastra/tools/readGoogleSheetsTool.js";
import { scrapeInstagramTool } from "./src/mastra/tools/scrapeInstagramTool.js";
import { RuntimeContext } from "@mastra/core/di";

const runtimeContext = new RuntimeContext();

console.log("🔍 Analyzing big accounts (>1M followers) to check post age...\n");

async function analyzeBigAccounts() {
  const logger = mastra.getLogger();
  
  // Read all accounts
  const { accounts } = await readGoogleSheetsTool.execute({
    context: {},
    mastra,
    runtimeContext,
  });
  
  console.log(`📊 Total accounts in sheet: ${accounts.length}\n`);
  
  let analyzedCount = 0;
  const targetAccounts = 10; // Analyze 10 big accounts
  
  for (const accountUrl of accounts) {
    if (analyzedCount >= targetAccounts) break;
    
    try {
      const accountData = await scrapeInstagramTool.execute({
        context: { accountUrl },
        mastra,
        runtimeContext,
      });
      
      // Only analyze accounts with >1M followers
      if (accountData.followersCount < 1000000) continue;
      
      analyzedCount++;
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`👤 @${accountData.username}`);
      console.log(`👥 Followers: ${accountData.followersCount.toLocaleString()}`);
      console.log(`📹 Reels found: ${accountData.reels.length}`);
      
      if (accountData.reels.length > 0) {
        // Sort by timestamp to find oldest and newest
        const sortedReels = [...accountData.reels].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        const newestReel = sortedReels[0];
        const oldestReel = sortedReels[sortedReels.length - 1];
        
        const newestDate = new Date(newestReel.timestamp);
        const oldestDate = new Date(oldestReel.timestamp);
        const now = new Date();
        
        const newestDaysAgo = Math.floor((now.getTime() - newestDate.getTime()) / (1000 * 60 * 60 * 24));
        const oldestDaysAgo = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`\n🆕 Newest reel (1st of ${accountData.reels.length}):`);
        console.log(`   📅 ${newestDaysAgo} days ago (${newestDate.toISOString().split('T')[0]})`);
        console.log(`   👁️ Views: ${newestReel.viewCount.toLocaleString()}`);
        console.log(`   🔗 ${newestReel.url}`);
        
        console.log(`\n🕐 Oldest reel (${accountData.reels.length}th of ${accountData.reels.length}):`);
        console.log(`   📅 ${oldestDaysAgo} days ago (${oldestDate.toISOString().split('T')[0]})`);
        console.log(`   👁️ Views: ${oldestReel.viewCount.toLocaleString()}`);
        console.log(`   🔗 ${oldestReel.url}`);
        
        console.log(`\n📊 Time span: ${newestDaysAgo} to ${oldestDaysAgo} days ago (${oldestDaysAgo - newestDaysAgo} days range)`);
        
        // Show all reels ages
        console.log(`\n📆 All ${accountData.reels.length} reels ages:`);
        sortedReels.forEach((reel, index) => {
          const daysAgo = Math.floor((now.getTime() - new Date(reel.timestamp).getTime()) / (1000 * 60 * 60 * 24));
          const viewsK = Math.round(reel.viewCount / 1000);
          console.log(`   ${index + 1}. ${daysAgo} days ago - ${viewsK}K views`);
        });
      }
      
    } catch (error: any) {
      console.error(`❌ Error analyzing account: ${error.message}`);
    }
  }
  
  console.log(`\n\n✅ Analysis complete! Analyzed ${analyzedCount} accounts with >1M followers`);
}

analyzeBigAccounts().catch(console.error);
