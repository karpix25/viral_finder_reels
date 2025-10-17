import { Telegraf } from "telegraf";
import { addAccountToSheetsTool } from "../tools/addAccountToSheetsTool";
import { RuntimeContext } from "@mastra/core/di";
import { mastra } from "../index";

const logger = mastra.getLogger();

// Extract Instagram username from various URL formats
function extractInstagramUsername(url: string): string | null {
  const patterns = [
    // https://www.instagram.com/reel/ABC123/
    /instagram\.com\/reel\/[^\/]+\/?\?igsh=([^&\s]+)/,
    // https://www.instagram.com/p/ABC123/
    /instagram\.com\/p\/[^\/]+/,
    // https://www.instagram.com/username/reel/ABC123/
    /instagram\.com\/([^\/\s]+)\/(?:reel|p)\//,
    // https://www.instagram.com/username/
    /instagram\.com\/([^\/\s?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Extract all Instagram URLs from message text
function extractInstagramUrls(text: string): string[] {
  const urlPattern = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/g;
  return text.match(urlPattern) || [];
}

export async function startTelegramBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    logger?.error("❌ [TelegramBot] TELEGRAM_BOT_TOKEN not set");
    return;
  }

  logger?.info("🤖 [TelegramBot] Starting Telegram bot");

  const bot = new Telegraf(botToken);
  const runtimeContext = new RuntimeContext();

  // Handle all messages in groups/supergroups
  bot.on("message", async (ctx) => {
    try {
      const message = ctx.message;
      
      // Only process text messages
      if (!("text" in message)) {
        return;
      }

      const text = message.text;
      const chatId = message.chat.id;
      const chatType = message.chat.type;

      logger?.info("📩 [TelegramBot] Received message", {
        chatId,
        chatType,
        text: text.substring(0, 100),
      });

      // Only process messages from groups/supergroups
      if (chatType !== "group" && chatType !== "supergroup") {
        logger?.info("⚠️ [TelegramBot] Ignoring message from non-group chat");
        return;
      }

      // Extract Instagram URLs from the message
      const instagramUrls = extractInstagramUrls(text);

      if (instagramUrls.length === 0) {
        logger?.info("⚠️ [TelegramBot] No Instagram URLs found in message");
        return;
      }

      logger?.info("🔗 [TelegramBot] Found Instagram URLs", {
        count: instagramUrls.length,
        urls: instagramUrls,
      });

      const addedAccounts: string[] = [];
      const existingAccounts: string[] = [];
      const failedAccounts: string[] = [];

      // Process each URL
      for (const url of instagramUrls) {
        const username = extractInstagramUsername(url);

        if (!username) {
          logger?.warn("⚠️ [TelegramBot] Could not extract username from URL", {
            url,
          });
          failedAccounts.push(url);
          continue;
        }

        logger?.info("📝 [TelegramBot] Extracted username", {
          username,
          url,
        });

        try {
          // Add account to sheets
          const result = await addAccountToSheetsTool.execute({
            context: { username },
            runtimeContext,
            mastra,
          });

          if (result.added) {
            addedAccounts.push(username);
            logger?.info("✅ [TelegramBot] Account added", { username });
          } else {
            existingAccounts.push(username);
            logger?.info("⚠️ [TelegramBot] Account already exists", { username });
          }
        } catch (error: any) {
          logger?.error("❌ [TelegramBot] Error adding account", {
            username,
            error: error.message,
          });
          failedAccounts.push(username);
        }
      }

      // Send response message
      let responseMessage = "";

      if (addedAccounts.length > 0) {
        responseMessage += `✅ Добавлены новые аккаунты (${addedAccounts.length}):\n`;
        responseMessage += addedAccounts.map((u) => `• @${u}`).join("\n");
        responseMessage += "\n\n";
      }

      if (existingAccounts.length > 0) {
        responseMessage += `⚠️ Уже в списке (${existingAccounts.length}):\n`;
        responseMessage += existingAccounts.map((u) => `• @${u}`).join("\n");
        responseMessage += "\n\n";
      }

      if (failedAccounts.length > 0) {
        responseMessage += `❌ Не удалось обработать (${failedAccounts.length}):\n`;
        responseMessage += failedAccounts.map((u) => `• ${u}`).join("\n");
      }

      if (responseMessage) {
        await ctx.reply(responseMessage.trim(), {
          reply_parameters: {
            message_id: message.message_id,
          },
        });
      }
    } catch (error: any) {
      logger?.error("❌ [TelegramBot] Error processing message", {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Start the bot
  logger?.info("🚀 [TelegramBot] Bot is ready to receive messages");
  await bot.launch();

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
