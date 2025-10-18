import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Telegraf } from "telegraf";
import { db } from "../storage";
import { sentViralReels } from "../storage/schema";
import { eq } from "drizzle-orm";

export const sendSingleViralReelTool = createTool({
  id: "send-single-viral-reel",
  description: "Send a single viral reel notification to Telegram",
  inputSchema: z.object({
    username: z.string(),
    reelUrl: z.string(),
    caption: z.string().optional(),
    viewCount: z.number(),
    likeCount: z.number(),
    commentCount: z.number(),
    ageInDays: z.number(),
    growthMultiplier: z.number(),
    averageViews: z.number(),
    followersCount: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const {
      username,
      reelUrl,
      caption,
      viewCount,
      likeCount,
      commentCount,
      ageInDays,
      growthMultiplier,
      averageViews,
      followersCount,
    } = context;

    logger?.info("🚀 [SendSingleViral] Checking if reel was already sent", {
      username,
      reelUrl,
    });

    // Check if reel was already sent
    const existingReel = await db
      .select()
      .from(sentViralReels)
      .where(eq(sentViralReels.reelUrl, reelUrl))
      .limit(1);

    if (existingReel.length > 0) {
      logger?.info("⏭️ [SendSingleViral] Reel already sent, skipping", {
        reelUrl,
        sentAt: existingReel[0].sentAt,
      });
      return {
        success: false,
        messageId: undefined,
      };
    }

    logger?.info("🚀 [SendSingleViral] Sending viral reel to Telegram", {
      username,
      reelUrl,
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }

    if (!chatId) {
      throw new Error("TELEGRAM_CHAT_ID is not set");
    }

    const bot = new Telegraf(botToken);

    const message = `
🔥 *ВИРУСНЫЙ РИЛС НАЙДЕН!*

👤 *Аккаунт:* @${username}
👥 *Подписчиков:* ${followersCount.toLocaleString()}
🔗 *Ссылка:* ${reelUrl}

📊 *Статистика:*
👁 Просмотры: ${viewCount.toLocaleString()}
❤️ Лайки: ${likeCount.toLocaleString()}
💬 Комментарии: ${commentCount.toLocaleString()}

📈 *Анализ вирусности:*
⏱ Возраст: ${ageInDays} дней
🚀 Рост: ${growthMultiplier.toFixed(1)}x от среднего
📊 Средний показатель: ${averageViews.toLocaleString()} просмотров

${caption ? `📝 *Описание:* ${caption.slice(0, 100)}${caption.length > 100 ? "..." : ""}` : ""}
`.trim();

    try {
      const result = await bot.telegram.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });

      logger?.info("✅ [SendSingleViral] Message sent successfully", {
        messageId: result.message_id,
      });

      // Save sent reel to database
      await db.insert(sentViralReels).values({
        reelUrl,
        username,
      });

      logger?.info("✅ [SendSingleViral] Reel saved to database", {
        reelUrl,
      });

      return {
        success: true,
        messageId: result.message_id,
      };
    } catch (error) {
      logger?.error("❌ [SendSingleViral] Failed to send message", {
        error: String(error),
      });

      throw error;
    }
  },
});
