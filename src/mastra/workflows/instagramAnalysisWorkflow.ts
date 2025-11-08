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

      // Determine adaptive criteria based on account size
      const followersCount = accountData.followersCount;
      let minimumEngagementCarousel: number; // For Carousels
      let accountSizeCategory: string;
      let viewsMultiplier: number;

      // V10 PROGRESSIVE MULTIPLIER CRITERIA:
      // REELS: Views >= followers * multiplier (arithmetic progression from X100 to X2)
      // CAROUSELS: Engagement thresholds (-30% from v8)
      // MINIMUM: 100K views for any reel
      
      // Calculate progressive multiplier based on follower count
      if (followersCount < 10000) {
        viewsMultiplier = 100; // Small accounts need 100x
        accountSizeCategory = "Микро (0-10K)";
      } else if (followersCount < 50000) {
        viewsMultiplier = 50; // 10K-50K: 50x
        accountSizeCategory = "Микро (10K-50K)";
      } else if (followersCount < 100000) {
        viewsMultiplier = 20; // 50K-100K: 20x
        accountSizeCategory = "Малый (50K-100K)";
      } else if (followersCount < 500000) {
        viewsMultiplier = 10; // 100K-500K: 10x
        accountSizeCategory = "Средний (100K-500K)";
      } else if (followersCount < 1000000) {
        viewsMultiplier = 5; // 500K-1M: 5x
        accountSizeCategory = "Большой (500K-1M)";
      } else {
        viewsMultiplier = 2; // 1M+: 2x
        accountSizeCategory = "Мега (1M+)";
      }
      
      // Calculate minimum views with floor of 100K
      const calculatedMinimum = followersCount * viewsMultiplier;
      const minimumViewsReel = Math.max(100000, calculatedMinimum);
      
      // Carousel engagement thresholds (same progressive logic)
      if (followersCount < 10000) {
        minimumEngagementCarousel = 100000; // Minimum 100K
      } else if (followersCount < 50000) {
        minimumEngagementCarousel = Math.max(100000, followersCount * 30);
      } else if (followersCount < 100000) {
        minimumEngagementCarousel = followersCount * 15;
      } else if (followersCount < 500000) {
        minimumEngagementCarousel = followersCount * 8;
      } else if (followersCount < 1000000) {
        minimumEngagementCarousel = followersCount * 4;
      } else {
        minimumEngagementCarousel = followersCount * 2;
      }

      logger?.info("📏 [Step2] Virality criteria set (v10 progressive)", {
        username: accountData.username,
        followersCount,
        accountSizeCategory,
        viewsMultiplier: `X${viewsMultiplier}`,
        calculatedMinimum: calculatedMinimum.toLocaleString(),
        reelsCriteria: `Views >= ${minimumViewsReel.toLocaleString()} (max of ${calculatedMinimum.toLocaleString()} or 100K floor)`,
        carouselsCriteria: `Engagement >= ${minimumEngagementCarousel.toLocaleString()}`,
      });

      // Check each reel
      for (const reel of accountData.reels) {
        const reelDate = new Date(reel.timestamp);
        const now = new Date();
        const ageInDays = Math.floor(
          (now.getTime() - reelDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Skip if older than 30 days
        if (ageInDays > 30) {
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
          // REELS/VIDEOS: Absolute views threshold
          if (reel.viewCount > 0 && reel.viewCount >= minimumViewsReel) {
            isViral = true;
            viralityReason = `Views: ${reel.viewCount.toLocaleString()} >= ${minimumViewsReel.toLocaleString()} [Reel]`;
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
