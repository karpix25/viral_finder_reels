import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const scrapeInstagramTool = createTool({
  id: "scrape-instagram-reels",
  description:
    "Scrapes Instagram account reels data using Apify (gets recent reels with views count)",
  inputSchema: z.object({
    accountUrl: z.string().describe("Instagram account URL"),
  }),
  outputSchema: z.object({
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
      return { username, reels: [] };
    }

    const resultsArray = Array.isArray(results) ? results : [];

    logger?.info("📝 [ScrapeInstagram] Processing results", {
      resultsCount: resultsArray.length,
    });

    const reels = resultsArray
      .filter((item: any) => item.type === "Video" || item.type === "Reel")
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

    logger?.info("✅ [ScrapeInstagram] Completed successfully", {
      username,
      reelsCount: reels.length,
    });

    return {
      username,
      reels,
    };
  },
});
