import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { readGoogleSheetsTool } from "../tools/readGoogleSheetsTool";
import { scrapeInstagramTool } from "../tools/scrapeInstagramTool";
import { sendSingleViralReelTool } from "../tools/sendSingleViralReelTool";
import { getAccountPrioritiesTool } from "../tools/getAccountPrioritiesTool";
import { updateAccountCheckTool } from "../tools/updateAccountCheckTool";
import { RuntimeContext } from "@mastra/core/di";
import { getAppSettings } from "../services/settings";

const runtimeContext = new RuntimeContext();

// Process ALL accounts in a single run - from first to last row
// The account list now lives in Postgres (instagram_accounts)
// Each account analyzed for up to 100 latest reels/carousels
export async function executeInstagramAnalysis(mastra: any) {
  const logger = mastra?.getLogger();
  logger?.info(
    "🚀 [Workflow] Starting Instagram viral analysis - processing ALL accounts from DB list (first to last)",
  );

  // Step 1: Read ALL accounts from DB (ordered by created_at)
  logger?.info("📖 [Step1] Reading ALL Instagram accounts from Postgres storage");

  const { accounts } = await readGoogleSheetsTool.execute({
    context: {},
    mastra,
    runtimeContext,
  });

  logger?.info("✅ [Step1] ALL accounts read successfully", {
    totalAccounts: accounts.length,
    message: "Will analyze all accounts from first to last row",
  });

  const appSettings = await getAppSettings();
  const postsPerAccount = Math.max(1, appSettings.postsPerAccount || 100);
  const viralityFormula = appSettings.viralityFormula || "current";
  const testAccountsLimit =
    typeof appSettings.testAccountsLimit === "number" &&
      appSettings.testAccountsLimit > 0
      ? appSettings.testAccountsLimit
      : 0;

  logger?.info("⚙️ [Workflow] Settings loaded", {
    schedulerMode: appSettings.schedulerMode,
    dailyTime: appSettings.dailyTime,
    weeklyDay: appSettings.weeklyDay,
    weeklyTime: appSettings.weeklyTime,
    postsPerAccount,
    viralityFormula,
    testAccountsLimit,
  });

  // Step 1.5: Prioritize accounts by last check time (never checked first, then oldest)
  logger?.info("🎯 [Step1.5] Prioritizing accounts based on last check time");

  const { prioritizedUsernames, neverChecked, oldestCheckAge } = await getAccountPrioritiesTool.execute({
    context: { allUsernames: accounts },
    mastra,
    runtimeContext,
  });

  logger?.info("✅ [Step1.5] Accounts prioritized", {
    totalAccounts: prioritizedUsernames.length,
    neverChecked,
    oldestCheckAge: oldestCheckAge || "N/A",
    message: "Never-checked accounts first, then oldest checks"
  });

  // Step 2: Process each account and send findings immediately
  let totalViralReelsSent = 0;
  let accountsProcessed = 0;

  for (const accountUrl of prioritizedUsernames) {
    if (testAccountsLimit > 0 && accountsProcessed >= testAccountsLimit) {
      logger?.info("⏹️ [Workflow] Test limit reached, stopping early", {
        testAccountsLimit,
      });
      break;
    }
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

      // Track viral reels found for this account
      let viralReelsFoundForAccount = 0;

      // Analyze each reel for virality
      if (accountData.reels.length === 0) {
        logger?.info("⏭️ [Step2] No reels found, skipping", {
          username: accountData.username,
        });

        // Update check history even if no reels found
        await updateAccountCheckTool.execute({
          context: {
            username: accountData.username,
            viralReelsFound: 0,
          },
          mastra,
          runtimeContext,
        });

        continue;
      }

      // Limit number of posts per account
      const reelsToAnalyze = accountData.reels.slice(0, postsPerAccount);

      // Calculate average views for this account
      const totalViews = reelsToAnalyze.reduce(
        (sum, reel) => sum + reel.viewCount,
        0,
      );
      const averageViews =
        reelsToAnalyze.length > 0 ? totalViews / reelsToAnalyze.length : 0;

      logger?.info("📊 [Step2] Analyzing reels and carousels for virality", {
        username: accountData.username,
        totalPosts: reelsToAnalyze.length,
        averageViews,
        postsPerAccount,
      });

      // Determine adaptive criteria based on account size
      const followersCount = accountData.followersCount;
      let accountSizeCategory: string;
      let viewsMultiplier: number;

      // V10 PROGRESSIVE MULTIPLIER CRITERIA:
      // REELS: Views >= followers * multiplier (smooth progression from X100 to X2)
      // CAROUSELS: Same logic as reels
      // MINIMUM: 100K views for any reel
      // TARGET: 1K followers → 100K+ views, 1M followers → 2M+ views

      // Calculate progressive multiplier using settings
      const m = appSettings.viralityMultipliers;

      if (followersCount < 5000) {
        viewsMultiplier = m.tier1_1k_5k; // 1K-5K
        accountSizeCategory = "Микро (1K-5K)";
      } else if (followersCount < 10000) {
        viewsMultiplier = m.tier2_5k_10k; // 5K-10K
        accountSizeCategory = "Микро (5K-10K)";
      } else if (followersCount < 20000) {
        viewsMultiplier = m.tier3_10k_20k; // 10K-20K
        accountSizeCategory = "Микро (10K-20K)";
      } else if (followersCount < 50000) {
        viewsMultiplier = m.tier4_20k_50k; // 20K-50K
        accountSizeCategory = "Малый (20K-50K)";
      } else if (followersCount < 100000) {
        viewsMultiplier = m.tier5_50k_100k; // 50K-100K
        accountSizeCategory = "Малый (50K-100K)";
      } else if (followersCount < 200000) {
        viewsMultiplier = m.tier6_100k_200k; // 100K-200K
        accountSizeCategory = "Средний (100K-200K)";
      } else if (followersCount < 500000) {
        viewsMultiplier = m.tier7_200k_500k; // 200K-500K
        accountSizeCategory = "Средний (200K-500K)";
      } else {
        viewsMultiplier = m.tier8_500k_plus; // 500K+
        accountSizeCategory = followersCount >= 1000000 ? "Мега (1M+)" : "Большой (500K-1M)";
      }

      // Calculate minimum views
      // For accounts ≥ 500K: use X2 multiplier but with 2M floor to ensure monotonic growth
      const calculatedMinimum = followersCount * viewsMultiplier;
      let minimumViewsReel: number;

      if (followersCount >= 500000) {
        // For big accounts (≥500K): X2 multiplier with 2M minimum
        minimumViewsReel = Math.max(2000000, calculatedMinimum);
      } else {
        // For smaller accounts: 100K minimum
        minimumViewsReel = Math.max(100000, calculatedMinimum);
      }

      // Carousel engagement thresholds (MUCH LOWER than reels)
      // Example: 500K followers → 15K engagement is acceptable
      // Using ~3% of followers as baseline
      let carouselMultiplier: number;

      const mCarousel = appSettings.carouselMultipliers;

      if (followersCount < 5000) {
        carouselMultiplier = mCarousel.tier1_1k_5k; // 1K-5K
      } else if (followersCount < 10000) {
        carouselMultiplier = mCarousel.tier2_5k_10k; // 5K-10K
      } else if (followersCount < 20000) {
        carouselMultiplier = mCarousel.tier3_10k_20k; // 10K-20K
      } else if (followersCount < 50000) {
        carouselMultiplier = mCarousel.tier4_20k_50k; // 20K-50K
      } else if (followersCount < 100000) {
        carouselMultiplier = mCarousel.tier5_50k_100k; // 50K-100K
      } else if (followersCount < 200000) {
        carouselMultiplier = mCarousel.tier6_100k_200k; // 100K-200K
      } else if (followersCount < 500000) {
        carouselMultiplier = mCarousel.tier7_200k_500k; // 200K-500K
      } else {
        carouselMultiplier = mCarousel.tier8_500k_plus; // 500K+
      }

      const carouselCalculated = followersCount * carouselMultiplier;
      const minimumEngagementCarousel = Math.max(5000, carouselCalculated); // Minimum 5K engagement

      logger?.info("📏 [Step2] Virality criteria set (v10 progressive)", {
        username: accountData.username,
        followersCount,
        accountSizeCategory,
        reelsMultiplier: `X${viewsMultiplier}`,
        carouselsMultiplier: `X${carouselMultiplier}`,
        reelsCriteria: `Views >= ${minimumViewsReel.toLocaleString()}`,
        carouselsCriteria: `Engagement >= ${minimumEngagementCarousel.toLocaleString()} (лайки+комментарии)`,
        viralityFormula,
      });

      // Check each reel
      for (const reel of reelsToAnalyze) {
        const reelDate = new Date(reel.timestamp);
        const now = new Date();
        const ageInDays = Math.floor(
          (now.getTime() - reelDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Skip if older than 60 days
        if (ageInDays > 60) {
          continue;
        }

        // Calculate metrics
        const engagement = reel.likeCount + reel.commentCount;
        const isCarousel = reel.type === "Sidecar";
        const shareCount = (reel as any).shareCount ?? 0;

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

          if (!isViral && viralityFormula === "shares") {
            const shareThreshold = Math.max(
              500,
              Math.round(followersCount * 0.01),
            );
            if (shareCount >= shareThreshold) {
              isViral = true;
              viralityReason = `Shares: ${shareCount.toLocaleString()} >= ${shareThreshold.toLocaleString()} [Reel]`;
            }
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
            shareCount,
            followersCount,
            accountSizeCategory,
          });

          // Send immediately to Telegram
          try {
            const currentGrowthMultiplier = averageViews > 0 ? reel.viewCount / averageViews : 0;

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
                growthMultiplier: currentGrowthMultiplier,
                averageViews: averageViews,
                followersCount: accountData.followersCount,
              },
              mastra,
              runtimeContext,
            });

            // Save to DB for Feed
            try {
              const { saveViralPost } = await import("../services/viralPosts");
              await saveViralPost({
                username: accountData.username,
                postUrl: reel.url,
                contentType: reel.type,
                viewCount: reel.viewCount,
                likeCount: reel.likeCount,
                commentCount: reel.commentCount,
                takenAt: new Date(reel.timestamp * 1000),
                viralityScore: currentGrowthMultiplier,
                viralityReason: viralityReason,
                thumbnailUrl: (reel as any).displayUrl || (reel as any).thumbnailUrl || (reel as any).imageUrl || "",
              });
              logger?.info("💾 [Step2] Saved viral post to DB", { url: reel.url });
            } catch (dbErr) {
              logger?.error("❌ [Step2] Failed to save viral post to DB", { error: String(dbErr) });
            }

            totalViralReelsSent++;
            viralReelsFoundForAccount++;

            logger?.info("✅ [Step2] Viral reel processed", {
              username: accountData.username,
              reelUrl: reel.url,
            });
          } catch (error) {
            logger?.error("❌ [Step2] Failed to process viral reel", {
              username: accountData.username,
              reelUrl: reel.url,
              error: String(error),
            });
          }
        }
      }

      // Update check history after processing this account
      logger?.info("📝 [Step2] Updating check history", {
        username: accountData.username,
        viralReelsFound: viralReelsFoundForAccount,
      });

      await updateAccountCheckTool.execute({
        context: {
          username: accountData.username,
          viralReelsFound: viralReelsFoundForAccount,
        },
        mastra,
        runtimeContext,
      });

    } catch (error) {
      logger?.error("❌ [Step2] Error processing account", {
        accountUrl,
        error: String(error),
      });

      // Update check history even on error (to avoid re-checking failed accounts immediately)
      try {
        const username = accountUrl.replace(/^@/, "").split("/").pop() || accountUrl;
        await updateAccountCheckTool.execute({
          context: {
            username,
            viralReelsFound: 0,
          },
          mastra,
          runtimeContext,
        });
      } catch (updateError) {
        logger?.error("❌ [Step2] Failed to update check history after error", {
          accountUrl,
          error: String(updateError),
        });
      }
    }
  }

  logger?.info("✅ [Workflow] Analysis complete - ALL accounts processed", {
    totalAccountsProcessed: accountsProcessed,
    totalViralReelsSent,
    totalAccountsInSheet: accounts.length,
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
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
  execute: async ({ mastra }) => {
    return await executeInstagramAnalysis(mastra);
  },
});

export const instagramAnalysisWorkflow = createWorkflow({
  id: "instagram-viral-analysis",
  description:
    "Analyze Instagram accounts for viral reels and carousels and send instant notifications",
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
}).then(stepProcessAccountsAndSendFindings).commit();
