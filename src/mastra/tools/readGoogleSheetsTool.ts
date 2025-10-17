import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { google } from "googleapis";

export const readGoogleSheetsTool = createTool({
  id: "read-google-sheets-instagram-accounts",
  description: "Reads Instagram account URLs from Google Sheets (column A)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(z.string()),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔧 [ReadGoogleSheets] Starting execution");

    let spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk";
    if (spreadsheetId === "EaGqRAGA0klWbRFzkWTB5VaHyDP9Of31zwTuqNsd96k") {
      spreadsheetId = "1AES2YwY_ejmYWblQfABO7e9IUdJhNGeuqCTWvlZ-Jnk";
    }
    if (!spreadsheetId) {
      throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");
    }

    logger?.info("📝 [ReadGoogleSheets] Fetching connection settings");

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (!xReplitToken) {
      throw new Error("X_REPLIT_TOKEN not found for repl/depl");
    }

    logger?.info("📝 [ReadGoogleSheets] Fetching Google Sheets connection");
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

    logger?.info("📝 [ReadGoogleSheets] Creating Google Sheets client", {
      spreadsheetId,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
    });

    const sheets = google.sheets({ version: "v4", auth });

    logger?.info("📝 [ReadGoogleSheets] Reading data from spreadsheet", {
      spreadsheetId,
    });

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "A:A",
      });
      
      const rows = response.data.values || [];
      // Skip first row (header) and filter empty values
      const accounts = rows
        .slice(1) // Skip header row
        .flat()
        .filter((url) => url && url.trim().length > 0)
        .map((url) => url.trim());

      logger?.info("✅ [ReadGoogleSheets] Completed successfully", {
        accountsCount: accounts.length,
        accounts,
      });

      return { accounts };
    } catch (error: any) {
      logger?.error("❌ [ReadGoogleSheets] Error details:", {
        message: error.message,
        code: error.code,
        status: error.status,
        spreadsheetId,
      });
      throw error;
    }
  },
});
