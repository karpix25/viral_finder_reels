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

    logger?.info("🚀 [SendSingleViral] Processing viral reel", {
      username,
      reelUrl,
    });

    await ensureSentViralReelsTable();

    // 1. ATTEMPT TO LOCK (INSERT) FIRST
    // This prevents race conditions where two processes check simultaneously
    try {
      await db.insert(sentViralReels).values({
        reelUrl,
        username,
      });
      logger?.info("🔒 [SendSingleViral] Reel locked (inserted in DB)", { reelUrl });
    } catch (dbError: any) {
      // Check for unique constraint violation (Postgres code 23505)
      if (dbError.code === '23505' || String(dbError).includes('unique constraint')) {
        logger?.info("⏭️ [SendSingleViral] Reel already sent (lock failed), skipping", {
          reelUrl,
        });
        return {
          success: false,
          messageId: undefined,
        };
      }
      // Re-throw other DB errors
      throw dbError;
    }

    // 2. PREPARE MESSAGE
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      // Rollback lock if config missing
      await db.delete(sentViralReels).where(eq(sentViralReels.reelUrl, reelUrl));
      throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
    }

    const bot = new Telegraf(botToken);

    // Escape HTML characters in caption
    const escapeHtml = (text: string) => {
      const normalized = text.normalize("NFC");
      return normalized
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    };

    const captionText = caption
      ? escapeHtml(caption.slice(0, 100) + (caption.length > 100 ? "..." : ""))
      : "";

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

    // 3. SEND MESSAGE
    try {
      const result = await bot.telegram.sendMessage(chatId, message, {
        parse_mode: "HTML",
      });

      logger?.info("✅ [SendSingleViral] Message sent successfully", {
        messageId: result.message_id,
      });

      return {
        success: true,
        messageId: result.message_id,
      };

    } catch (error) {
      logger?.error("❌ [SendSingleViral] Failed to send message, rolling back DB lock", {
        error: String(error),
      });

      // 4. ROLLBACK ON FAILURE
      // If sending failed, delete the record so we can try again later
      try {
        await db.delete(sentViralReels).where(eq(sentViralReels.reelUrl, reelUrl));
        logger?.info("↺ [SendSingleViral] DB lock released (rollback)", { reelUrl });
      } catch (rollbackError) {
        logger?.error("❌ [SendSingleViral] CRITICAL: Failed to rollback DB lock", { error: String(rollbackError) });
      }

      throw error;
    }
  },
});
