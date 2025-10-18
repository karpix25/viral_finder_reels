import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Telegraf } from "telegraf";

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
    } = context;

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
        disable_web_page_preview: false,
      });

      logger?.info("✅ [SendSingleViral] Message sent successfully", {
        messageId: result.message_id,
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
