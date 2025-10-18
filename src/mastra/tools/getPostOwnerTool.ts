import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getPostOwnerTool = createTool({
  id: "get-instagram-post-owner",
  description: "Gets the owner username from an Instagram post URL using Apify",
  inputSchema: z.object({
    postUrl: z.string().describe("Instagram post or reel URL"),
  }),
  outputSchema: z.object({
    username: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { postUrl } = context;

    logger?.info("🔧 [GetPostOwner] Starting execution", { postUrl });

    const apifyApiKey = process.env.APIFY_API_KEY;
    if (!apifyApiKey) {
      throw new Error("APIFY_API_KEY is not set");
    }

    logger?.info("📝 [GetPostOwner] Starting Apify actor with directUrls");

    // Use instagram-scraper actor which supports directUrls
    const actorRunResponse = await fetch(
      "https://api.apify.com/v2/acts/apify~instagram-scraper/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apifyApiKey}`,
        },
        body: JSON.stringify({
          directUrls: [postUrl],
          resultsLimit: 1,
          resultsType: "posts",
        }),
      },
    );

    if (!actorRunResponse.ok) {
      const errorText = await actorRunResponse.text();
      logger?.error("❌ [GetPostOwner] Failed to start Apify actor", {
        status: actorRunResponse.status,
        error: errorText,
      });
      throw new Error(
        `Failed to start Apify actor: ${actorRunResponse.statusText}`,
      );
    }

    const runData = await actorRunResponse.json();
    const runId = runData.data.id;

    logger?.info("📝 [GetPostOwner] Waiting for actor to finish", { runId });

    let runStatus = "RUNNING";
    let attempts = 0;
    const maxAttempts = 30;

    while (runStatus === "RUNNING" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const statusResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${apifyApiKey}`,
          },
        },
      );

      const statusData = await statusResponse.json();
      runStatus = statusData.data.status;
      attempts++;

      logger?.info("📝 [GetPostOwner] Actor status", {
        runStatus,
        attempts,
      });
    }

    if (runStatus !== "SUCCEEDED") {
      throw new Error(`Apify actor failed with status: ${runStatus}`);
    }

    logger?.info("📝 [GetPostOwner] Fetching results");

    const resultsResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      {
        headers: {
          Authorization: `Bearer ${apifyApiKey}`,
        },
      },
    );

    const results = await resultsResponse.json();

    logger?.info("📝 [GetPostOwner] Raw results", {
      isArray: Array.isArray(results),
      count: results?.length || 0,
      firstItem: results?.[0] || null,
    });

    if (!results || results.length === 0) {
      logger?.error("❌ [GetPostOwner] No results returned from Apify", {
        url: postUrl,
        resultsLength: results?.length,
      });
      throw new Error(`No results returned from Apify for URL: ${postUrl}`);
    }

    const postData = results[0];
    
    // Log the full post data for debugging
    logger?.info("📝 [GetPostOwner] Post data received", {
      url: postUrl,
      hasError: !!postData.error,
      error: postData.error,
      errorDescription: postData.errorDescription,
      availableFields: Object.keys(postData),
    });
    
    // Check for restricted access error
    if (postData.error === "restricted_page") {
      logger?.error("❌ [GetPostOwner] Restricted access to post", {
        url: postUrl,
        errorDescription: postData.errorDescription,
      });
      throw new Error(`Restricted access - post is private or has limited access: ${postUrl}`);
    }
    
    // Check for other errors
    if (postData.error) {
      logger?.error("❌ [GetPostOwner] Apify returned error", {
        url: postUrl,
        error: postData.error,
        errorDescription: postData.errorDescription,
      });
      throw new Error(`Apify error for ${postUrl}: ${postData.error}`);
    }
    
    // The response should have ownerUsername at the top level or nested
    // Check different possible fields
    let username = 
      postData.ownerUsername || 
      postData.owner?.username ||
      postData.username ||
      postData.ownerFullName;

    // If still no username, try to extract from latestPosts
    if (!username && postData.latestPosts && postData.latestPosts.length > 0) {
      const firstPost = postData.latestPosts[0];
      username = firstPost.ownerUsername || firstPost.owner?.username;
    }

    if (!username) {
      logger?.error("❌ [GetPostOwner] Could not find username in results", {
        postData: JSON.stringify(postData).substring(0, 1000),
        keys: Object.keys(postData),
      });
      throw new Error("Could not extract username from post data");
    }

    logger?.info("✅ [GetPostOwner] Successfully extracted username", {
      username,
      postUrl,
    });

    return { username };
  },
});
