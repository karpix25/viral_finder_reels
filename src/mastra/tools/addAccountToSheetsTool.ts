import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { google } from "googleapis";

export const addAccountToSheetsTool = createTool({
  id: "add-account-to-sheets",
  description: "Adds a new Instagram account username to Google Sheets if it doesn't exist",
  inputSchema: z.object({
    username: z.string().describe("Instagram username to add"),
  }),
  outputSchema: z.object({
    added: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const { username } = context;
    const logger = mastra?.getLogger();
    
    logger?.info("🔧 [AddAccountToSheets] Starting execution", {
      username,
    });

    let spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk";
    if (spreadsheetId === "EaGqRAGA0klWbRFzkWTB5VaHyDP9Of31zwTuqNsd96k") {
      spreadsheetId = "1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk";
    }

    logger?.info("📝 [AddAccountToSheets] Fetching connection settings");

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (!xReplitToken) {
      throw new Error("X_REPLIT_TOKEN not found for repl/depl");
    }

    logger?.info("📝 [AddAccountToSheets] Fetching Google Sheets connection");
    const res = await fetch(
      "https://" +
        hostname +
        "/api/v2/connection?include_secrets=true&connector_names=google-sheet",
      {
        headers: {
          Accept: "application/json",
          X_REPLIT_TOKEN: xReplitToken,
        },
      },
    );

    const resJson = await res.json();
    const connectionSettings = resJson?.items?.[0];

    const accessToken =
      connectionSettings?.settings?.oauth?.credentials?.access_token ||
      connectionSettings?.settings?.access_token;

    if (!connectionSettings || !accessToken) {
      throw new Error(
        `Google Sheets not connected or missing access token: HTTP ${res.status} ${res.statusText}`,
      );
    }

    logger?.info("📝 [AddAccountToSheets] Creating Google Sheets client", {
      spreadsheetId,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
    });

    const sheets = google.sheets({ version: "v4", auth });

    try {
      // First, read existing accounts to check for duplicates
      logger?.info("📝 [AddAccountToSheets] Reading existing accounts");
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "A:A",
      });

      const rows = response.data.values || [];
      const accounts = rows
        .slice(1)
        .flat()
        .filter((url) => url && url.trim().length > 0)
        .map((url) => url.trim());

      // Check if account already exists
      if (accounts.includes(username)) {
        logger?.info("⚠️ [AddAccountToSheets] Account already exists", {
          username,
        });
        return {
          added: false,
          message: `Account @${username} already exists in the sheet`,
        };
      }

      // Append new account
      logger?.info("📝 [AddAccountToSheets] Adding new account", {
        username,
      });
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "A:A",
        valueInputOption: "RAW",
        requestBody: {
          values: [[username]],
        },
      });

      logger?.info("✅ [AddAccountToSheets] Account added successfully", {
        username,
      });

      return {
        added: true,
        message: `Account @${username} added successfully`,
      };
    } catch (error: any) {
      logger?.error("❌ [AddAccountToSheets] Error details:", {
        message: error.message,
        code: error.code,
        status: error.status,
        username,
      });
      throw error;
    }
  },
});
