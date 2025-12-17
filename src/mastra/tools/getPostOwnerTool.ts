import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getPostOwnerTool = createTool({
  id: "get-instagram-post-owner",
  description: "Gets the owner username from an Instagram post URL using RapidAPI",
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

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost =
      process.env.RAPIDAPI_HOST || "instagram-social-api.p.rapidapi.com";
    if (!rapidApiKey) {
      throw new Error("RAPIDAPI_KEY is not set");
    }

    logger?.info("📝 [GetPostOwner] Fetching via RapidAPI /v1/post_info");

    const url = `https://${rapidApiHost}/v1/post_info?code_or_id_or_url=${encodeURIComponent(postUrl)}`;
    const response = await fetch(url, {
      headers: {
        "X-Rapidapi-Key": rapidApiKey,
        "X-Rapidapi-Host": rapidApiHost,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger?.error("❌ [GetPostOwner] RapidAPI post_info failed", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`RapidAPI post_info failed: ${response.statusText}`);
    }

    const json = await response.json();
    const postData = json?.data;

    logger?.info("📝 [GetPostOwner] Post data received", {
      hasError: !!postData?.error,
      availableFields: postData ? Object.keys(postData) : [],
    });

    if (!postData) {
      throw new Error("RapidAPI post_info returned no data");
    }

    if (postData.error) {
      logger?.error("❌ [GetPostOwner] RapidAPI returned error", {
        url: postUrl,
        error: postData.error,
      });
      throw new Error(`RapidAPI error for ${postUrl}: ${postData.error}`);
    }

    const username =
      postData.owner?.username ||
      postData.user?.username ||
      postData.caption?.user?.username ||
      null;

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
