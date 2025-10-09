import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { readGoogleSheetsTool } from "../tools/readGoogleSheetsTool";
import { scrapeInstagramTool } from "../tools/scrapeInstagramTool";
import { analyzeViralReelsTool } from "../tools/analyzeViralReelsTool";
import { sendTelegramMessageTool } from "../tools/sendTelegramMessageTool";
import { RuntimeContext } from "@mastra/core/di";

const runtimeContext = new RuntimeContext();

const step1ReadAccounts = createStep({
  id: "read-instagram-accounts",
  description: "Read Instagram accounts from Google Sheets",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(z.string()),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🚀 [Step1] Reading Instagram accounts from Google Sheets");

    const result = await readGoogleSheetsTool.execute({
      context: {},
      mastra,
      runtimeContext,
    });

    logger?.info("✅ [Step1] Accounts read successfully", {
      count: result.accounts.length,
    });

    return result;
  },
});

const step2ScrapeReels = createStep({
  id: "scrape-instagram-reels",
  description: "Scrape reels data from Instagram accounts using Apify",
  inputSchema: z.object({
    accounts: z.array(z.string()),
  }),
  outputSchema: z.object({
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
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { accounts } = inputData;

    logger?.info("🚀 [Step2] Scraping reels from Instagram accounts", {
      accountsCount: accounts.length,
    });

    const accountData = [];

    for (const accountUrl of accounts) {
      try {
        logger?.info("📝 [Step2] Processing account", { accountUrl });

        const result = await scrapeInstagramTool.execute({
          context: { accountUrl },
          mastra,
          runtimeContext,
        });

        accountData.push(result);

        logger?.info("✅ [Step2] Account processed", {
          username: result.username,
          reelsCount: result.reels.length,
        });
      } catch (error) {
        logger?.error("❌ [Step2] Error processing account", {
          accountUrl,
          error: String(error),
        });
      }
    }

    logger?.info("✅ [Step2] All accounts scraped", {
      totalAccounts: accountData.length,
    });

    return { accountData };
  },
});

const step3AnalyzeViral = createStep({
  id: "analyze-viral-reels",
  description: "Analyze reels to find viral content",
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
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { accountData } = inputData;

    logger?.info("🚀 [Step3] Analyzing viral reels", {
      accountsCount: accountData.length,
    });

    const result = await analyzeViralReelsTool.execute({
      context: { accountData },
      mastra,
      runtimeContext,
    });

    logger?.info("✅ [Step3] Analysis complete", {
      viralReelsCount: result.viralReels.length,
    });

    return result;
  },
});

const step4SendTelegram = createStep({
  id: "send-telegram-report",
  description: "Send viral reels report to Telegram",
  inputSchema: z.object({
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
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { viralReels } = inputData;

    logger?.info("🚀 [Step4] Sending report to Telegram", {
      viralReelsCount: viralReels.length,
    });

    const result = await sendTelegramMessageTool.execute({
      context: { viralReels },
      mastra,
      runtimeContext,
    });

    logger?.info("✅ [Step4] Report sent successfully");

    return result;
  },
});

export const instagramAnalysisWorkflow = createWorkflow({
  id: "instagram-viral-analysis",
  description: "Analyze Instagram accounts for viral reels and send reports",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
  }),
  triggerSchema: z.object({}),
})
  .then(step1ReadAccounts)
  .then(step2ScrapeReels)
  .then(step3AnalyzeViral)
  .then(step4SendTelegram)
  .commit();
