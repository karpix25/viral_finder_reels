import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const analyzeViralReelsTool = createTool({
  id: "analyze-viral-reels",
  description:
    "Analyzes reels to find viral content (posted <3 days ago, 5x higher views than average)",
  inputSchema: z.object({
    accountData: z.array(
      z.object({
        username: z.string(),
        reels: z.array(
          z.object({
            id: z.string(),
            caption: z.string().optional(),
            viewCount: z.number(),
            likeCount: z.number(),
            commentCount: z.number(),
            timestamp: z.string(),
            url: z.string(),
          }),
        ),
      }),
    ),
  }),
  outputSchema: z.object({
    viralReels: z.array(
      z.object({
        username: z.string(),
        reelUrl: z.string(),
        caption: z.string().optional(),
        viewCount: z.number(),
        likeCount: z.number(),
        commentCount: z.number(),
        ageInDays: z.number(),
        growthMultiplier: z.number(),
        averageViews: z.number(),
      }),
    ),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { accountData } = context;

    logger?.info("🔧 [AnalyzeViralReels] Starting execution", {
      accountsCount: accountData.length,
    });

    const viralReels: any[] = [];
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    for (const account of accountData) {
      logger?.info("📝 [AnalyzeViralReels] Processing account", {
        username: account.username,
        reelsCount: account.reels.length,
      });

      if (account.reels.length === 0) {
        logger?.info("⚠️ [AnalyzeViralReels] No reels found for account", {
          username: account.username,
        });
        continue;
      }

      const recentReels = account.reels.filter((reel) => {
        const reelDate = new Date(reel.timestamp);
        return reelDate >= threeDaysAgo;
      });

      const olderReels = account.reels.filter((reel) => {
        const reelDate = new Date(reel.timestamp);
        return reelDate < threeDaysAgo;
      });

      if (recentReels.length === 0) {
        logger?.info("⚠️ [AnalyzeViralReels] No recent reels for account", {
          username: account.username,
        });
        continue;
      }

      const averageViews =
        olderReels.length > 0
          ? olderReels.reduce((sum, reel) => sum + reel.viewCount, 0) /
            olderReels.length
          : account.reels.reduce((sum, reel) => sum + reel.viewCount, 0) /
            account.reels.length;

      logger?.info("📝 [AnalyzeViralReels] Calculated average views", {
        username: account.username,
        averageViews,
        recentReelsCount: recentReels.length,
        olderReelsCount: olderReels.length,
      });

      for (const reel of recentReels) {
        const growthMultiplier = reel.viewCount / averageViews;
        const reelDate = new Date(reel.timestamp);
        const ageInDays = Math.floor(
          (now.getTime() - reelDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (growthMultiplier >= 5) {
          logger?.info("🔥 [AnalyzeViralReels] Found viral reel!", {
            username: account.username,
            viewCount: reel.viewCount,
            averageViews,
            growthMultiplier: growthMultiplier.toFixed(2),
            ageInDays,
          });

          viralReels.push({
            username: account.username,
            reelUrl: reel.url,
            caption: reel.caption,
            viewCount: reel.viewCount,
            likeCount: reel.likeCount,
            commentCount: reel.commentCount,
            ageInDays,
            growthMultiplier: parseFloat(growthMultiplier.toFixed(2)),
            averageViews: Math.round(averageViews),
          });
        }
      }
    }

    logger?.info("✅ [AnalyzeViralReels] Completed successfully", {
      viralReelsCount: viralReels.length,
    });

    return { viralReels };
  },
});
