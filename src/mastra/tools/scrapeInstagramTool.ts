import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { upsertFollowers } from "../services/accounts.js";

export const scrapeInstagramTool = createTool({
  id: "scrape-instagram-reels",
  description:
    "Scrapes Instagram account reels and carousel posts data using RapidAPI (gets recent reels/carousels with views count)",
  inputSchema: z.object({
    accountUrl: z.string().describe("Instagram account URL"),
  }),
  outputSchema: z.object({
    username: z.string(),
    followersCount: z.number(),
    relatedProfiles: z.array(z.string()),
    reels: z.array(
      z.object({
        id: z.string(),
        type: z.string(), // "Reel", "Video", or "Sidecar" (carousel)
        caption: z.string().optional(),
        viewCount: z.number(),
        likeCount: z.number(),
        commentCount: z.number(),
        shareCount: z.number().optional(),
        timestamp: z.string(),
        url: z.string(),
      }),
    ),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { accountUrl } = context;

    logger?.info("🔧 [ScrapeInstagram] Starting execution", { accountUrl });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost =
      process.env.RAPIDAPI_HOST || "instagram-social-api.p.rapidapi.com";
    if (!rapidApiKey) {
      throw new Error("RAPIDAPI_KEY is not set");
    }

    const username = accountUrl.split("/").filter(Boolean).pop() || "";
    logger?.info("📝 [ScrapeInstagram] Extracted username", { username });

    const headers = {
      "X-Rapidapi-Key": rapidApiKey,
      "X-Rapidapi-Host": rapidApiHost,
    };

    const getFollowerCountFn = async () => {
      const { getFollowerCount } = await import("../services/accounts.js");
      return await getFollowerCount(username);
    };

    logger?.info("📝 [ScrapeInstagram] Fetching via RapidAPI /v1/posts");

    const reels: any[] = [];
    let followersCount = await getFollowerCountFn();

    if (followersCount > 0) {
      logger?.info("✅ [ScrapeInstagram] Using follower count from DB", { followersCount });
    } else {
      logger?.info("ℹ️ [ScrapeInstagram] Follower count missing or 0 in DB, will attempt to extract from posts");
    }

    let paginationToken: string | undefined;
    const maxPages = 10; // safety cap
    let pageCount = 0;

    const toContentType = (item: any) => {
      if (item?.media_type === 8) return "Sidecar";
      if (item?.media_type === 2) {
        return item?.product_type === "clips" ? "Reel" : "Video";
      }
      if (item?.product_type === "clips") return "Reel";
      if (item?.media_type === 1) return "Image";
      return "Unknown";
    };

    while (pageCount < maxPages) {
      pageCount++;
      const url = new URL(`https://${rapidApiHost}/v1/posts`);
      url.searchParams.set("username_or_id_or_url", username);
      if (paginationToken) {
        url.searchParams.set("pagination_token", paginationToken);
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const errorText = await response.text();
        logger?.error("❌ [ScrapeInstagram] RapidAPI posts request failed", {
          status: response.status,
          error: errorText,
          pageCount,
        });
        throw new Error(`RapidAPI posts request failed: ${response.statusText}`);
      }

      const json = await response.json();
      const items = Array.isArray(json?.data?.items) ? json.data.items : [];

      if (items.length === 0) {
        logger?.info("ℹ️ [ScrapeInstagram] No items on page", { pageCount });
        break;
      }

      // Set followers count once if available
      if (!followersCount) {
        const firstMetrics = items[0]?.metrics || {};
        followersCount =
          firstMetrics.user_follower_count ||
          items[0]?.owner?.follower_count ||
          items[0]?.user?.follower_count ||
          0;
      }

      // Fallback: If still 0, try fetching from instagram-looter2 (Profile API)
      if (!followersCount) {
        logger?.info("⚠️ [ScrapeInstagram] Follower count not found in posts/DB, using fallback API (instagram-looter2)");
        try {
          const followersHost = "instagram-looter2.p.rapidapi.com";
          const profileUrl = new URL(`https://${followersHost}/profile2`);
          profileUrl.searchParams.set("username", username);

          const profileRes = await fetch(profileUrl.toString(), {
            headers: {
              "X-Rapidapi-Key": rapidApiKey,
              "X-Rapidapi-Host": followersHost,
            },
          });

          if (profileRes.ok) {
            const profileData = await profileRes.json();
            followersCount = profileData?.follower_count || 0;
            logger?.info("✅ [ScrapeInstagram] Recovered follower count from fallback API", { followersCount });
          } else {
            logger?.warn("⚠️ [ScrapeInstagram] Fallback API request failed", { status: profileRes.status });
          }
        } catch (err) {
          logger?.warn("❌ [ScrapeInstagram] Fallback follower fetch failed", { error: String(err) });
        }
      }

      if (pageCount === 1) {
        const sample = items[0];
        logger?.info("🔍 [ScrapeInstagram] First item sample", {
          keys: sample ? Object.keys(sample) : [],
          media_type: sample?.media_type,
          product_type: sample?.product_type,
          metricsKeys: sample?.metrics ? Object.keys(sample.metrics) : [],
          user: sample?.user,
          owner: sample?.owner,
        });
      }

      for (const item of items) {
        const type = toContentType(item);
        if (type !== "Reel" && type !== "Sidecar" && type !== "Video") {
          continue;
        }

        const metrics = item?.metrics || {};
        const viewCount =
          metrics.view_count ??
          metrics.play_count ??
          item?.play_count ??
          item?.video_play_count ??
          0;
        const likeCount =
          metrics.like_count ??
          item?.like_count ??
          metrics.fb_like_count ??
          0;
        const commentCount =
          metrics.comment_count ??
          item?.comment_count ??
          metrics.fb_aggregated_comment_count ??
          0;
        const shareCount =
          metrics.share_count ??
          metrics.shareCount ??
          item?.share_count ??
          0;

        const timestamp = item?.taken_at
          ? new Date(item.taken_at * 1000).toISOString()
          : new Date().toISOString();
        const code = item?.code || item?.id;
        const url = code ? `https://www.instagram.com/p/${code}/` : "";

        reels.push({
          id: String(item?.id || code || reels.length + 1),
          type,
          caption: item?.caption?.text || item?.caption || "",
          viewCount,
          likeCount,
          commentCount,
          shareCount,
          timestamp,
          url,
        });
      }

      paginationToken = json?.pagination_token;
      if (!paginationToken || reels.length >= 120) {
        break;
      }
    }

    const relatedProfiles: string[] = [];

    logger?.info("✅ [ScrapeInstagram] Completed successfully", {
      username,
      followersCount,
      reelsCount: reels.length,
      relatedProfilesCount: relatedProfiles.length,
    });

    const limitedReels = reels.slice(0, 100);

    if (followersCount) {
      upsertFollowers(username, followersCount).catch((err) => {
        logger?.warn("⚠️ [ScrapeInstagram] Failed to persist followers", {
          error: String(err),
        });
      });
    }

    return {
      username,
      followersCount,
      relatedProfiles,
      reels: limitedReels,
    };
  },
});
