import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { readGoogleSheetsTool } from "../tools/readGoogleSheetsTool";
import { scrapeInstagramTool } from "../tools/scrapeInstagramTool";
import { sendSingleViralReelTool } from "../tools/sendSingleViralReelTool";
import { RuntimeContext } from "@mastra/core/di";
import { db } from "../storage";
import { workflowProgress } from "../storage/schema";
import { eq } from "drizzle-orm";

const runtimeContext = new RuntimeContext();
const WORKFLOW_NAME = "instagram-viral-analysis";

// Process ALL accounts in a single run
// System handles 1000+ accounts efficiently with parallel processing
const MAX_ACCOUNTS_PER_RUN = 100000;

// Core workflow logic - can be called from step OR directly from cron scheduler
export async function executeInstagramAnalysis(mastra: any) {
  const logger = mastra?.getLogger();
  logger?.info(
    "🚀 [Workflow] Starting Instagram viral analysis with instant notifications",
  );

  // Step 1: Get or create workflow progress
  logger?.info("📊 [Step0] Checking workflow progress");

  let progress = await db
    .select()
    .from(workflowProgress)
    .where(eq(workflowProgress.workflowName, WORKFLOW_NAME))
    .limit(1);

  if (progress.length === 0) {
    await db.insert(workflowProgress).values({
      workflowName: WORKFLOW_NAME,
      lastProcessedIndex: 0,
    });
    progress = await db
      .select()
      .from(workflowProgress)
      .where(eq(workflowProgress.workflowName, WORKFLOW_NAME))
      .limit(1);
  }

  const startIndex = progress[0].lastProcessedIndex;

  logger?.info("📊 [Step0] Progress loaded", {
    startIndex,
  });

  // Step 2: Read accounts from Google Sheets
  logger?.info("📖 [Step1] Reading Instagram accounts from Google Sheets");

  const { accounts: allAccounts } = await readGoogleSheetsTool.execute({
    context: {},
    mastra,
    runtimeContext,
  });

  // Get next batch of accounts starting from lastProcessedIndex
  const endIndex = Math.min(
    startIndex + MAX_ACCOUNTS_PER_RUN,
    allAccounts.length,
  );
  const accounts = allAccounts.slice(startIndex, endIndex);

  logger?.info("✅ [Step1] Accounts read successfully", {
    totalInSheet: allAccounts.length,
    processingNow: accounts.length,
    startIndex,
    endIndex,
    limit: MAX_ACCOUNTS_PER_RUN,
  });

  if (endIndex < allAccounts.length) {
    logger?.info("⚠️ [Step1] More accounts to process", {
      remaining: allAccounts.length - endIndex,
      message: `This run will process ${accounts.length} accounts (${startIndex}-${endIndex}). Run workflow again to process more.`,
    });
  } else {
    logger?.info("✅ [Step1] This is the final batch", {
      message:
        "After this run, progress will reset to 0 for next full cycle.",
    });
  }

  // Step 2: Process each account and send findings immediately
  let totalViralReelsSent = 0;
  let accountsProcessed = 0;

  for (const accountUrl of accounts) {
    try {
      logger?.info("📝 [Step2] Processing account", { accountUrl });

      // Scrape the account
      const accountData = await scrapeInstagramTool.execute({
        context: { accountUrl },
        mastra,
        runtimeContext,
      });

      logger?.info("✅ [Step2] Account scraped", {
        username: accountData.username,
        reelsCount: accountData.reels.length,
      });

      accountsProcessed++;

      // Analyze each reel for virality
      if (accountData.reels.length === 0) {
        logger?.info("⏭️ [Step2] No reels found, skipping", {
          username: accountData.username,
        });
        continue;
      }

      // Calculate average views for this account
      const totalViews = accountData.reels.reduce(
        (sum, reel) => sum + reel.viewCount,
        0,
      );
      const averageViews = totalViews / accountData.reels.length;

      logger?.info("📊 [Step2] Analyzing reels and carousels for virality", {
        username: accountData.username,
        totalPosts: accountData.reels.length,
        averageViews,
      });

      // Determine adaptive criteria based on account size with DETAILED GRADATION
      const followersCount = accountData.followersCount;
      let minimumEngagementCarousel: number;
      let accountSizeCategory: string;

      // DETAILED GRADATION FOR CAROUSELS
      // До 100K: градация по 10K
      // 100K-999,999: градация по 50K
      // 1M-2,999,999: градация по 500K
      // 3M+: единая группа
      
      if (followersCount < 10000) {
        minimumEngagementCarousel = 3000; // 0-10K
        accountSizeCategory = "Микро (0-10K)";
      } else if (followersCount < 20000) {
        minimumEngagementCarousel = 6000; // 10K-20K
        accountSizeCategory = "Микро (10K-20K)";
      } else if (followersCount < 30000) {
        minimumEngagementCarousel = 9000; // 20K-30K
        accountSizeCategory = "Микро (20K-30K)";
      } else if (followersCount < 40000) {
        minimumEngagementCarousel = 12000; // 30K-40K
        accountSizeCategory = "Микро (30K-40K)";
      } else if (followersCount < 50000) {
        minimumEngagementCarousel = 15000; // 40K-50K
        accountSizeCategory = "Микро (40K-50K)";
      } else if (followersCount < 60000) {
        minimumEngagementCarousel = 18000; // 50K-60K
        accountSizeCategory = "Микро (50K-60K)";
      } else if (followersCount < 70000) {
        minimumEngagementCarousel = 21000; // 60K-70K
        accountSizeCategory = "Малый (60K-70K)";
      } else if (followersCount < 80000) {
        minimumEngagementCarousel = 24000; // 70K-80K
        accountSizeCategory = "Малый (70K-80K)";
      } else if (followersCount < 90000) {
        minimumEngagementCarousel = 27000; // 80K-90K
        accountSizeCategory = "Малый (80K-90K)";
      } else if (followersCount < 100000) {
        minimumEngagementCarousel = 30000; // 90K-100K
        accountSizeCategory = "Малый (90K-100K)";
      } else if (followersCount < 150000) {
        minimumEngagementCarousel = 45000; // 100K-150K
        accountSizeCategory = "Средний (100K-150K)";
      } else if (followersCount < 200000) {
        minimumEngagementCarousel = 60000; // 150K-200K
        accountSizeCategory = "Средний (150K-200K)";
      } else if (followersCount < 250000) {
        minimumEngagementCarousel = 75000; // 200K-250K
        accountSizeCategory = "Средний (200K-250K)";
      } else if (followersCount < 300000) {
        minimumEngagementCarousel = 90000; // 250K-300K
        accountSizeCategory = "Средний (250K-300K)";
      } else if (followersCount < 350000) {
        minimumEngagementCarousel = 105000; // 300K-350K
        accountSizeCategory = "Средний (300K-350K)";
      } else if (followersCount < 400000) {
        minimumEngagementCarousel = 120000; // 350K-400K
        accountSizeCategory = "Средний (350K-400K)";
      } else if (followersCount < 450000) {
        minimumEngagementCarousel = 135000; // 400K-450K
        accountSizeCategory = "Средний (400K-450K)";
      } else if (followersCount < 500000) {
        minimumEngagementCarousel = 150000; // 450K-500K
        accountSizeCategory = "Средний (450K-500K)";
      } else if (followersCount < 550000) {
        minimumEngagementCarousel = 165000; // 500K-550K
        accountSizeCategory = "Средний (500K-550K)";
      } else if (followersCount < 600000) {
        minimumEngagementCarousel = 180000; // 550K-600K
        accountSizeCategory = "Средний (550K-600K)";
      } else if (followersCount < 650000) {
        minimumEngagementCarousel = 195000; // 600K-650K
        accountSizeCategory = "Средний (600K-650K)";
      } else if (followersCount < 700000) {
        minimumEngagementCarousel = 210000; // 650K-700K
        accountSizeCategory = "Средний (650K-700K)";
      } else if (followersCount < 750000) {
        minimumEngagementCarousel = 225000; // 700K-750K
        accountSizeCategory = "Средний (700K-750K)";
      } else if (followersCount < 800000) {
        minimumEngagementCarousel = 240000; // 750K-800K
        accountSizeCategory = "Средний (750K-800K)";
      } else if (followersCount < 850000) {
        minimumEngagementCarousel = 255000; // 800K-850K
        accountSizeCategory = "Средний (800K-850K)";
      } else if (followersCount < 900000) {
        minimumEngagementCarousel = 270000; // 850K-900K
        accountSizeCategory = "Средний (850K-900K)";
      } else if (followersCount < 950000) {
        minimumEngagementCarousel = 285000; // 900K-950K
        accountSizeCategory = "Средний (900K-950K)";
      } else if (followersCount < 1000000) {
        minimumEngagementCarousel = 300000; // 950K-1M
        accountSizeCategory = "Средний (950K-1M)";
      } else if (followersCount < 1500000) {
        minimumEngagementCarousel = 450000; // 1M-1.5M
        accountSizeCategory = "Большой (1M-1.5M)";
      } else if (followersCount < 2000000) {
        minimumEngagementCarousel = 600000; // 1.5M-2M
        accountSizeCategory = "Большой (1.5M-2M)";
      } else if (followersCount < 2500000) {
        minimumEngagementCarousel = 750000; // 2M-2.5M
        accountSizeCategory = "Большой (2M-2.5M)";
      } else if (followersCount < 3000000) {
        minimumEngagementCarousel = 900000; // 2.5M-3M
        accountSizeCategory = "Большой (2.5M-3M)";
      } else {
        minimumEngagementCarousel = 1000000; // 3M+
        accountSizeCategory = "Мега (3M+)";
      }

      logger?.info("📏 [Step2] Virality criteria set (detailed gradation)", {
        username: accountData.username,
        followersCount,
        accountSizeCategory,
        reelsCriteria: "Views >= 3x followers",
        carouselsCriteria: `Engagement >= ${minimumEngagementCarousel.toLocaleString()}`,
      });

      // Check each reel
      for (const reel of accountData.reels) {
        const reelDate = new Date(reel.timestamp);
        const now = new Date();
        const ageInDays = Math.floor(
          (now.getTime() - reelDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Skip if older than 20 days
        if (ageInDays > 20) {
          continue;
        }

        // Calculate metrics
        const engagement = reel.likeCount + reel.commentCount;
        const isCarousel = reel.type === "Sidecar";

        // NEW VIRALITY CRITERIA
        let isViral = false;
        let viralityReason = "";

        if (isCarousel) {
          // CAROUSELS: Only engagement-based (no viewCount available in API)
          if (engagement >= minimumEngagementCarousel) {
            isViral = true;
            viralityReason = `Engagement: ${engagement.toLocaleString()} (${reel.likeCount.toLocaleString()} likes + ${reel.commentCount.toLocaleString()} comments) >= ${minimumEngagementCarousel.toLocaleString()} [Carousel]`;
          }
        } else {
          // REELS/VIDEOS: Views must be 3x followers count
          const requiredViews = followersCount * 3;
          if (reel.viewCount > 0 && reel.viewCount >= requiredViews) {
            isViral = true;
            viralityReason = `Views: ${reel.viewCount.toLocaleString()} >= ${requiredViews.toLocaleString()} (3x ${followersCount.toLocaleString()} followers) [Reel]`;
          }
        }

        if (isViral) {
          logger?.info("🔥 [Step2] VIRAL CONTENT FOUND!", {
            username: accountData.username,
            contentUrl: reel.url,
            contentType: reel.type,
            ageInDays,
            viralityReason,
            viewCount: reel.viewCount,
            engagement,
            followersCount,
            accountSizeCategory,
          });

          // Send immediately to Telegram
          try {
            await sendSingleViralReelTool.execute({
              context: {
                username: accountData.username,
                reelUrl: reel.url,
                contentType: reel.type,
                caption: reel.caption,
                viewCount: reel.viewCount,
                likeCount: reel.likeCount,
                commentCount: reel.commentCount,
                ageInDays,
                growthMultiplier: 0, // Not used in new criteria
                averageViews: 0, // Not used in new criteria
                followersCount: accountData.followersCount,
              },
              mastra,
              runtimeContext,
            });

            totalViralReelsSent++;

            logger?.info("✅ [Step2] Viral reel sent to Telegram", {
              username: accountData.username,
              reelUrl: reel.url,
            });
          } catch (error) {
            logger?.error("❌ [Step2] Failed to send viral reel", {
              username: accountData.username,
              reelUrl: reel.url,
              error: String(error),
            });
          }
        }
      }
    } catch (error) {
      logger?.error("❌ [Step2] Error processing account", {
        accountUrl,
        error: String(error),
      });
    }
  }

  // Update progress for next run
  const newIndex = endIndex >= allAccounts.length ? 0 : endIndex;

  await db
    .update(workflowProgress)
    .set({
      lastProcessedIndex: newIndex,
      updatedAt: new Date(),
    })
    .where(eq(workflowProgress.workflowName, WORKFLOW_NAME));

  logger?.info("✅ [Workflow] Analysis complete", {
    totalAccountsProcessed: accountsProcessed,
    totalViralReelsSent,
    nextStartIndex: newIndex,
    cycleComplete: newIndex === 0,
  });

  return {
    totalAccountsProcessed: accountsProcessed,
    totalViralReelsSent,
  };
}

// Step wrapper for Inngest workflow
const stepProcessAccountsAndSendFindings = createStep({
  id: "process-accounts-and-send-findings",
  description:
    "Process Instagram accounts, analyze for viral reels and carousels, and send findings immediately",
  inputSchema: z.object({}),
  outputSchema: z.object({
    totalAccountsProcessed: z.number(),
    totalViralReelsSent: z.number(),
  }),
  execute: async ({ mastra }) => {
    return await executeInstagramAnalysis(mastra);
  },
});

export const instagramAnalysisWorkflow = createWorkflow({
  id: "instagram-viral-analysis",
  description:
    "Analyze Instagram accounts for viral reels and carousels and send instant notifications",
  inputSchema: z.object({}),
  outputSchema: z.object({
    totalAccountsProcessed: z.number(),
    totalViralReelsSent: z.number(),
  }),
})
  .then(stepProcessAccountsAndSendFindings)
  .commit();
