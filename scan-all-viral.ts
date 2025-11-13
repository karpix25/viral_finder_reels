import { mastra } from "./src/mastra/index.js";
import { readGoogleSheetsTool } from "./src/mastra/tools/readGoogleSheetsTool.js";
import { scrapeInstagramTool } from "./src/mastra/tools/scrapeInstagramTool.js";
import { RuntimeContext } from "@mastra/core/di";

const runtimeContext = new RuntimeContext();

console.log("🚀 Starting full viral scan of all accounts...\n");

// Virality criteria v10
function getViralityCriteria(followersCount: number) {
  if (followersCount < 1000) {
    return { reelsMultiplier: 100, carouselsMultiplier: 0.5, minEngagement: 5000, category: "Нано (<1K)" };
  } else if (followersCount < 10000) {
    return { reelsMultiplier: 100, carouselsMultiplier: 0.5, minEngagement: 5000, category: "Микро (1K-10K)" };
  } else if (followersCount < 20000) {
    return { reelsMultiplier: 30, carouselsMultiplier: 0.2, minEngagement: 5000, category: "Микро (10K-20K)" };
  } else if (followersCount < 50000) {
    return { reelsMultiplier: 50, carouselsMultiplier: 0.2, minEngagement: 5000, category: "Микро (20K-50K)" };
  } else if (followersCount < 100000) {
    return { reelsMultiplier: 10, carouselsMultiplier: 0.1, minEngagement: 5000, category: "Малый (50K-100K)" };
  } else if (followersCount < 200000) {
    return { reelsMultiplier: 8, carouselsMultiplier: 0.05, minEngagement: 5000, category: "Средний (100K-200K)" };
  } else if (followersCount < 500000) {
    return { reelsMultiplier: 4, carouselsMultiplier: 0.05, minEngagement: 5000, category: "Средний (200K-500K)" };
  } else if (followersCount < 1000000) {
    return { reelsMultiplier: 2, carouselsMultiplier: 0.03, minEngagement: 5000, category: "Большой (500K-1M)" };
  } else if (followersCount < 10000000) {
    return { reelsMultiplier: 2, carouselsMultiplier: 0.03, minEngagement: 5000, category: "Мега (1M-10M)" };
  } else {
    return { reelsMultiplier: 2, carouselsMultiplier: 0.03, minEngagement: 5000, category: "Гига (10M+)" };
  }
}

async function scanAllAccounts() {
  const logger = mastra.getLogger();
  
  // Read all accounts
  const { accounts } = await readGoogleSheetsTool.execute({
    context: {},
    mastra,
    runtimeContext,
  });
  
  console.log(`📊 Total accounts to scan: ${accounts.length}\n`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  let totalScanned = 0;
  let totalViralReels = 0;
  let totalViralCarousels = 0;
  const viralContent: any[] = [];
  
  for (const accountUrl of accounts) {
    try {
      totalScanned++;
      
      const accountData = await scrapeInstagramTool.execute({
        context: { accountUrl },
        mastra,
        runtimeContext,
      });
      
      const criteria = getViralityCriteria(accountData.followersCount);
      const reelsThreshold = accountData.followersCount * criteria.reelsMultiplier;
      const minReelsThreshold = criteria.reelsMultiplier >= 2 ? 2000000 : 0;
      const finalReelsThreshold = Math.max(reelsThreshold, minReelsThreshold);
      
      const carouselsThreshold = accountData.followersCount * criteria.carouselsMultiplier;
      const finalCarouselsThreshold = Math.max(carouselsThreshold, criteria.minEngagement);
      
      const now = new Date();
      const maxAgeInDays = 60;
      
      // Check each reel/carousel
      for (const reel of accountData.reels) {
        const postDate = new Date(reel.timestamp);
        const ageInDays = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (ageInDays > maxAgeInDays) continue;
        
        // Check if viral
        let isViral = false;
        let reason = "";
        
        if (reel.type === "Video" && reel.viewCount >= finalReelsThreshold) {
          isViral = true;
          reason = `Views: ${reel.viewCount.toLocaleString()} >= ${finalReelsThreshold.toLocaleString()} [Reel]`;
          totalViralReels++;
        } else if (reel.type === "Sidecar") {
          const engagement = reel.likeCount + reel.commentCount;
          if (engagement >= finalCarouselsThreshold) {
            isViral = true;
            reason = `Engagement: ${engagement.toLocaleString()} >= ${finalCarouselsThreshold.toLocaleString()} [Carousel]`;
            totalViralCarousels++;
          }
        }
        
        if (isViral) {
          viralContent.push({
            username: accountData.username,
            followers: accountData.followersCount,
            url: reel.url,
            type: reel.type === "Video" ? "Reel" : "Carousel",
            views: reel.viewCount,
            likes: reel.likeCount,
            comments: reel.commentCount,
            age: ageInDays,
            reason,
            category: criteria.category,
          });
          
          console.log(`🔥 VIRAL! @${accountData.username} (${accountData.followersCount.toLocaleString()} followers)`);
          console.log(`   ${reel.url}`);
          console.log(`   ${reason}`);
          console.log(`   📅 ${ageInDays} days old\n`);
        }
      }
      
      // Progress update every 50 accounts
      if (totalScanned % 50 === 0) {
        console.log(`\n⏳ Progress: ${totalScanned}/${accounts.length} accounts scanned`);
        console.log(`   🔥 Found ${totalViralReels} viral reels + ${totalViralCarousels} viral carousels\n`);
      }
      
    } catch (error: any) {
      console.error(`❌ Error scanning ${accountUrl}: ${error.message}`);
    }
  }
  
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ SCAN COMPLETE!\n`);
  console.log(`📊 Total accounts scanned: ${totalScanned}`);
  console.log(`🔥 Total viral reels: ${totalViralReels}`);
  console.log(`🎠 Total viral carousels: ${totalViralCarousels}`);
  console.log(`📋 Total viral content: ${viralContent.length}\n`);
  
  if (viralContent.length > 0) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 ALL VIRAL CONTENT:\n`);
    
    // Sort by views (descending)
    viralContent.sort((a, b) => b.views - a.views);
    
    viralContent.forEach((content, index) => {
      console.log(`${index + 1}. @${content.username} (${content.followers.toLocaleString()} followers)`);
      console.log(`   ${content.url}`);
      console.log(`   ${content.type} - ${content.views.toLocaleString()} views - ${content.age} days old`);
      console.log(`   ${content.reason}\n`);
    });
  }
  
  process.exit(0);
}

scanAllAccounts().catch((err) => {
  console.error(err);
  process.exit(1);
});
