import { Telegraf } from "telegraf";
import { addAccountToSheetsTool } from "../tools/addAccountToSheetsTool";
import { getPostOwnerTool } from "../tools/getPostOwnerTool";
import { RuntimeContext } from "@mastra/core/di";
import type { Mastra } from "@mastra/core";

// Extract Instagram username from various URL formats
function extractInstagramUsername(url: string): string | null {
  // Remove trailing slashes and clean URL
  const cleanUrl = url.trim().replace(/\/+$/, '');
  
  // Pattern 1: https://instagram.com/username/reel/ABC123 or https://instagram.com/username/p/ABC123
  // This extracts "username" when it appears before /reel/ or /p/
  const userWithPostPattern = /instagram\.com\/([^\/\s?]+)\/(?:reel|p)\//;
  const userWithPostMatch = cleanUrl.match(userWithPostPattern);
  if (userWithPostMatch && userWithPostMatch[1]) {
    const username = userWithPostMatch[1];
    // Make sure it's not a keyword like "reel", "p", "stories", "tv", etc.
    if (!['reel', 'p', 'tv', 'stories', 'explore', 'direct'].includes(username.toLowerCase())) {
      return username;
    }
  }
  
  // Pattern 2: https://instagram.com/username/ or https://instagram.com/username
  // This is for direct profile links
  const directProfilePattern = /instagram\.com\/([^\/\s?]+)\/?$/;
  const directProfileMatch = cleanUrl.match(directProfilePattern);
  if (directProfileMatch && directProfileMatch[1]) {
    const username = directProfileMatch[1];
    // Make sure it's not a keyword
    if (!['reel', 'p', 'tv', 'stories', 'explore', 'direct'].includes(username.toLowerCase())) {
      return username;
    }
  }
  
  // If we can't extract username, return null
  // (e.g., for links like instagram.com/reel/ABC123/ without username)
  return null;
}

// Extract all Instagram URLs from message text
function extractInstagramUrls(text: string): string[] {
  const urlPattern = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/g;
  return text.match(urlPattern) || [];
}

export async function startTelegramBot(mastra: Mastra) {
  const logger = mastra.getLogger();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    logger?.error("❌ [TelegramBot] TELEGRAM_BOT_TOKEN not set");
    return;
  }

  logger?.info("🤖 [TelegramBot] Starting Telegram bot");

  const bot = new Telegraf(botToken);
  const runtimeContext = new RuntimeContext();

  // Help command
  bot.command("help", async (ctx) => {
    try {
      const helpMessage = `🤖 **Инструкция по работе с ботом**\n\n` +
        `Я автоматически добавляю Instagram аккаунты в Google Sheets для анализа вирусных постов.\n\n` +
        `**Как это работает:**\n` +
        `1. Отправьте ссылку на Instagram аккаунт или пост в чат\n` +
        `2. Я автоматически извлеку username аккаунта\n` +
        `3. Проверю, нет ли его уже в таблице\n` +
        `4. Добавлю, если это новый аккаунт\n\n` +
        `**Для добавления старых ссылок:**\n` +
        `Просто перешлите или скопируйте старые сообщения с Instagram ссылками в этот чат, и я их обработаю!\n\n` +
        `**Поддерживаемые форматы:**\n` +
        `• https://instagram.com/username/ (прямая ссылка на аккаунт)\n` +
        `• https://instagram.com/username/reel/...\n` +
        `• https://instagram.com/reel/... (извлеку username автоматически)\n` +
        `• https://instagram.com/p/... (посты и карусели)`;
      
      await ctx.reply(helpMessage);
    } catch (error: any) {
      logger?.error("❌ [TelegramBot] Error in help command", {
        error: error.message,
      });
    }
  });

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
        let username = extractInstagramUsername(url);

        // If we couldn't extract username from URL, try using Apify
        if (!username) {
          logger?.info("⚠️ [TelegramBot] Could not extract username from URL, trying Apify", {
            url,
          });
          
          try {
            const postOwner = await getPostOwnerTool.execute({
              context: { postUrl: url },
              runtimeContext,
              mastra,
            });
            username = postOwner.username;
            logger?.info("✅ [TelegramBot] Got username from Apify", {
              username,
              url,
            });
          } catch (error: any) {
            logger?.error("❌ [TelegramBot] Failed to get username from Apify", {
              url,
              error: error.message,
            });
            
            // Check if error is due to restricted access
            if (error.message.includes("restricted") || error.message.includes("Restricted")) {
              failedAccounts.push(`${url} (приватный/ограниченный доступ)`);
            } else {
              failedAccounts.push(`${url} (не удалось получить username)`);
            }
            continue;
          }
        }
        
        // Validate username format (Instagram usernames are alphanumeric + dots + underscores)
        if (!/^[a-zA-Z0-9._]+$/.test(username)) {
          logger?.warn("⚠️ [TelegramBot] Invalid username format", {
            username,
            url,
          });
          failedAccounts.push(`${username} (некорректный формат)`);
          continue;
        }

        logger?.info("📝 [TelegramBot] Processing username", {
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

      // Send response message to specific chat/thread
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
        // Add a small delay to avoid Telegram rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send to specific chat/thread if configured, otherwise reply in current chat
        const notificationChatId = process.env.TELEGRAM_ACCOUNTS_CHAT_ID;
        const notificationThreadId = process.env.TELEGRAM_ACCOUNTS_THREAD_ID;
        
        if (notificationChatId) {
          logger?.info("📤 [TelegramBot] Sending notification to configured chat/thread", {
            chatId: notificationChatId,
            threadId: notificationThreadId || "основной чат",
          });
          
          try {
            await bot.telegram.sendMessage(notificationChatId, responseMessage.trim(), {
              message_thread_id: notificationThreadId ? parseInt(notificationThreadId) : undefined,
            });
          } catch (error: any) {
            logger?.error("❌ [TelegramBot] Failed to send to configured chat, falling back to reply", {
              error: error.message,
            });
            // Fallback to reply in current chat
            await ctx.reply(responseMessage.trim(), {
              reply_parameters: {
                message_id: message.message_id,
              },
            });
          }
        } else {
          // No specific chat configured, reply in current chat
          await ctx.reply(responseMessage.trim(), {
            reply_parameters: {
              message_id: message.message_id,
            },
          });
        }
      }
    } catch (error: any) {
      logger?.error("❌ [TelegramBot] Error processing message", {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Start the bot
  logger?.info("🚀 [TelegramBot] Launching bot with polling...");
  
  try {
    await bot.launch();
    logger?.info("✅ [TelegramBot] Bot is ready to receive messages");
  } catch (error: any) {
    logger?.error("❌ [TelegramBot] Failed to launch bot", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
