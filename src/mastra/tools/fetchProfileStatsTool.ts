import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { upsertFollowers } from "../services/accounts.js";

export const fetchProfileStatsTool = createTool({
    id: "fetch-profile-stats",
    description: "Fetches Instagram profile stats (follower count) using instagram-looter2 API",
    inputSchema: z.object({
        accountUrl: z.string().describe("Instagram account URL"),
    }),
    outputSchema: z.object({
        username: z.string(),
        followersCount: z.number(),
    }),
    execute: async ({ context, mastra }) => {
        const logger = mastra?.getLogger();
        const { accountUrl } = context;

        logger?.info("🔧 [FetchProfileStats] Starting execution", { accountUrl });

        const rapidApiKey = process.env.RAPIDAPI_KEY;
        if (!rapidApiKey) {
            throw new Error("RAPIDAPI_KEY is not set");
        }

        const username = accountUrl.split("/").filter(Boolean).pop() || "";
        logger?.info("📝 [FetchProfileStats] Extracted username", { username });

        const fetchFollowersCount = async (): Promise<number> => {
            try {
                const followersHost = "instagram-looter2.p.rapidapi.com";
                const url = new URL(`https://${followersHost}/profile2`);
                url.searchParams.set("username", username);

                const followersHeaders = {
                    "X-Rapidapi-Key": rapidApiKey,
                    "X-Rapidapi-Host": followersHost,
                };

                const res = await fetch(url.toString(), { headers: followersHeaders });
                if (!res.ok) {
                    const errText = await res.text();
                    logger?.warn("⚠️ [FetchProfileStats] Followers request failed", {
                        status: res.status,
                        errText,
                    });
                    return 0;
                }
                const data = await res.json();
                const total = data?.follower_count ?? 0;

                logger?.info("📊 [FetchProfileStats] Followers fetched", {
                    username,
                    followers: total,
                });
                return Number(total) || 0;
            } catch (err: any) {
                logger?.warn("⚠️ [FetchProfileStats] Followers fetch error", {
                    error: String(err),
                });
                return 0;
            }
        };

        const followersCount = await fetchFollowersCount();

        if (followersCount > 0) {
            upsertFollowers(username, followersCount).catch((err) => {
                logger?.warn("⚠️ [FetchProfileStats] Failed to persist followers", {
                    error: String(err),
                });
            });
        }

        return {
            username,
            followersCount,
        };
    },
});
