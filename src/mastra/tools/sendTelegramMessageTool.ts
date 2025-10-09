import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const sendTelegramMessageTool = createTool({
  id: "send-telegram-message",
  description: "Sends a message to Telegram group with viral reels report",
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
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { viralReels } = context;

    logger?.info("🔧 [SendTelegram] Starting execution", {
      viralReelsCount: viralReels.length,
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
    }

    let message = "🔥 <b>Отчет о виральных роликах Instagram</b>\n\n";

    if (viralReels.length === 0) {
      message += "Виральных роликов не найдено за последние 3 дня.";
    } else {
      message += `Найдено виральных роликов: <b>${viralReels.length}</b>\n\n`;

      for (const reel of viralReels) {
        message += `👤 <b>@${reel.username}</b>\n`;
        message += `📊 Просмотры: <b>${reel.viewCount.toLocaleString()}</b> (средн: ${reel.averageViews.toLocaleString()})\n`;
        message += `📈 Рост: <b>${reel.growthMultiplier}x</b>\n`;
        message += `❤️ Лайки: ${reel.likeCount.toLocaleString()} | 💬 Комментарии: ${reel.commentCount.toLocaleString()}\n`;
        message += `🕐 Возраст: ${reel.ageInDays} ${reel.ageInDays === 1 ? "день" : reel.ageInDays < 5 ? "дня" : "дней"}\n`;
        if (reel.caption) {
          const shortCaption =
            reel.caption.length > 100
              ? reel.caption.substring(0, 100) + "..."
              : reel.caption;
          message += `📝 ${shortCaption}\n`;
        }
        message += `🔗 <a href="${reel.reelUrl}">Смотреть ролик</a>\n\n`;
      }
    }

    message +=
      `\n<i>📅 Отчет сформирован: ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</i>`;

    logger?.info("📝 [SendTelegram] Sending message to Telegram", {
      messageLength: message.length,
    });

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      },
    );

    const result = await response.json();

    if (!result.ok) {
      logger?.error("❌ [SendTelegram] Failed to send message", {
        error: result,
      });
      throw new Error(`Failed to send Telegram message: ${result.description}`);
    }

    logger?.info("✅ [SendTelegram] Message sent successfully", {
      messageId: result.result.message_id,
    });

    return {
      success: true,
      messageId: result.result.message_id,
    };
  },
});
