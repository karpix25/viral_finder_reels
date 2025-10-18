import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const scrapeInstagramTool = createTool({
  id: "scrape-instagram-reels",
  description:
    "Scrapes Instagram account reels and carousel posts data using Apify (gets recent reels/carousels with views count)",
  inputSchema: z.object({
    accountUrl: z.string().describe("Instagram account URL"),
  }),
  outputSchema: z.object({
    username: z.string(),
    followersCount: z.number(),
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
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { accountUrl } = context;

    logger?.info("🔧 [ScrapeInstagram] Starting execution", { accountUrl });

    const apifyApiKey = process.env.APIFY_API_KEY;
    if (!apifyApiKey) {
      throw new Error("APIFY_API_KEY is not set");
    }

    const username = accountUrl.split("/").filter(Boolean).pop() || "";
    logger?.info("📝 [ScrapeInstagram] Extracted username", { username });

    logger?.info("📝 [ScrapeInstagram] Starting Apify actor");

    const actorRunResponse = await fetch(
      "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apifyApiKey}`,
        },
        body: JSON.stringify({
          usernames: [username],
          resultsLimit: 50,
          resultsType: "posts",
          searchType: "user",
          searchLimit: 1,
        }),
      },
    );

    if (!actorRunResponse.ok) {
      throw new Error(
        `Failed to start Apify actor: ${actorRunResponse.statusText}`,
      );
    }

    const runData = await actorRunResponse.json();
    const runId = runData.data.id;

    logger?.info("📝 [ScrapeInstagram] Waiting for actor to finish", { runId });

    let runStatus = "RUNNING";
    let attempts = 0;
    const maxAttempts = 60;

    while (runStatus === "RUNNING" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${apifyApiKey}`,
          },
        },
      );

      const statusData = await statusResponse.json();
      runStatus = statusData.data.status;
      attempts++;

      logger?.info("📝 [ScrapeInstagram] Actor status", {
        runStatus,
        attempts,
      });
    }

    if (runStatus !== "SUCCEEDED") {
      throw new Error(`Apify actor failed with status: ${runStatus}`);
    }

    logger?.info("📝 [ScrapeInstagram] Fetching results");

    const resultsResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      {
        headers: {
          Authorization: `Bearer ${apifyApiKey}`,
        },
      },
    );

    const results = await resultsResponse.json();

    logger?.info("📝 [ScrapeInstagram] Raw results structure", {
      isArray: Array.isArray(results),
      type: typeof results,
      keys: Object.keys(results || {}),
      firstItemType: results?.[0] ? typeof results[0] : "no items",
      error: results?.error || null,
    });

    if (results?.error) {
      logger?.error("❌ [ScrapeInstagram] Apify returned error", {
        error: results.error,
        username,
      });
      return { username, followersCount: 0, reels: [] };
    }

    const resultsArray = Array.isArray(results) ? results : [];

    logger?.info("📝 [ScrapeInstagram] Processing results", {
      resultsCount: resultsArray.length,
    });

    if (resultsArray.length > 0) {
      const firstResult = resultsArray[0];
      logger?.info("📝 [ScrapeInstagram] First result sample", {
        keys: Object.keys(firstResult || {}),
        ownerUsername: firstResult?.ownerUsername,
        username: firstResult?.username,
        error: firstResult?.error || null,
        errorDescription: firstResult?.errorDescription || null,
        latestPostsCount: firstResult?.latestPosts?.length || 0,
      });

      if (firstResult?.error) {
        logger?.error("❌ [ScrapeInstagram] Apify returned account error", {
          username,
          error: firstResult.error,
          errorDescription: firstResult.errorDescription,
        });
        return { username, followersCount: 0, reels: [] };
      }
    }

    const allPosts = resultsArray.flatMap((item: any) => item.latestPosts || []);

    logger?.info("📝 [ScrapeInstagram] Extracted posts from latestPosts", {
      totalPosts: allPosts.length,
    });

    const filteredReels = allPosts.filter(
      (item: any) => item.type === "Video" || item.type === "Reel" || item.type === "Sidecar",
    );

    // Log first reel details for debugging
    if (filteredReels.length > 0) {
      const firstReel = filteredReels[0];
      logger?.info("🔍 [ScrapeInstagram] First reel raw data sample", {
        url: firstReel.url,
        keys: Object.keys(firstReel),
        videoViewCount: firstReel.videoViewCount,
        playCount: firstReel.playCount,
        viewCount: firstReel.viewCount,
        videoPlayCount: firstReel.videoPlayCount,
        likesCount: firstReel.likesCount,
        commentsCount: firstReel.commentsCount,
      });
    }

    const reels = filteredReels
      .map((item: any) => ({
        id: item.id,
        caption: item.caption || "",
        viewCount: item.videoViewCount || item.playCount || 0,
        likeCount: item.likesCount || 0,
        commentCount: item.commentsCount || 0,
        timestamp: item.timestamp,
        url: item.url,
      }))
      .slice(0, 20);

    // Extract followers count from first result
    const followersCount = resultsArray[0]?.followersCount || 0;

    logger?.info("✅ [ScrapeInstagram] Completed successfully", {
      username,
      followersCount,
      reelsCount: reels.length,
    });

    return {
      username,
      followersCount,
      reels,
    };
  },
});
