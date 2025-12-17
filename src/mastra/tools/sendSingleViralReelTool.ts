import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Telegraf } from "telegraf";
import { db, pool } from "../storage";
import { sentViralReels } from "../storage/schema";
import { eq } from "drizzle-orm";

let ensuredSent = false;
async function ensureSentViralReelsTable() {
  if (ensuredSent) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sent_viral_reels (
      id SERIAL PRIMARY KEY,
      reel_url VARCHAR(500) UNIQUE NOT NULL,
      username VARCHAR(255) NOT NULL,
      sent_at TIMESTAMP DEFAULT now() NOT NULL
    );
  `);
  ensuredSent = true;
  console.log("✅ [DB] sent_viral_reels ensured");
}

export const sendSingleViralReelTool = createTool({
  id: "send-single-viral-reel",
  description: "Send a single viral reel notification to Telegram",
  inputSchema: z.object({
    username: z.string(),
    reelUrl: z.string(),
    contentType: z.string(), // "Reel", "Video", or "Sidecar" (carousel)
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
      contentType,
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

    await ensureSentViralReelsTable();

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
    // Viral posts go to TELEGRAM_CHAT_ID (References chat) WITHOUT thread
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }

    if (!chatId) {
      throw new Error("TELEGRAM_CHAT_ID is not set");
    }

    const bot = new Telegraf(botToken);

    logger?.info("📝 [SendSingleViral] Telegram settings", {
      chatId,
      thread: "основной чат (без ветки)",
    });

    // Escape HTML characters in caption
    const escapeHtml = (text: string) => {
      // Normalize to NFC to avoid Telegram UTF-8 errors, then escape HTML
      const normalized = text.normalize("NFC");
      return normalized
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    };

    const captionText = caption
      ? escapeHtml(caption.slice(0, 100) + (caption.length > 100 ? "..." : ""))
      : "";
    
    // Determine content emoji and name
    const contentEmoji = contentType === "Sidecar" ? "🖼" : "🎬";
    const contentName = contentType === "Sidecar" ? "КАРУСЕЛЬ" : "РИЛС";

    const message = `
🔥 <b>ВИРУСНЫЙ ${contentName} НАЙДЕН!</b> ${contentEmoji}

👤 <b>Аккаунт:</b> @${username}
👥 <b>Подписчиков:</b> ${followersCount.toLocaleString()}
🔗 <b>Ссылка:</b> ${reelUrl}

📊 <b>Статистика (на момент скрапинга):</b>
👁 Просмотры: ${viewCount.toLocaleString()}
❤️ Лайки: ${likeCount.toLocaleString()}
💬 Комментарии: ${commentCount.toLocaleString()}

📈 <b>Анализ вирусности:</b>
⏱ Возраст: ${ageInDays} дней
🚀 Рост: ${growthMultiplier.toFixed(1)}x от среднего
📊 Средний показатель: ${averageViews.toLocaleString()} просмотров

${captionText ? `📝 <b>Описание:</b> ${captionText}` : ""}

<i>⚠️ Данные могут быть не актуальны, проверяйте на Instagram</i>
`.trim();

    try {
      // Send to main chat without thread ID
      const result = await bot.telegram.sendMessage(chatId, message, {
        parse_mode: "HTML",
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
