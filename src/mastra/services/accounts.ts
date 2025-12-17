import { asc, eq } from "drizzle-orm";
import { db, pool } from "../storage/index.js";
import { instagramAccounts } from "../storage/schema.js";

let ensured = false;

export async function ensureInstagramAccountsTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_accounts (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    );
  `);
  ensured = true;
  console.log("✅ [DB] instagram_accounts ensured");
}

export async function getAllInstagramAccounts(): Promise<string[]> {
  await ensureInstagramAccountsTable();
  const rows = await db
    .select({ username: instagramAccounts.username })
    .from(instagramAccounts)
    .orderBy(asc(instagramAccounts.createdAt));
  return rows.map((r) => r.username);
}

export async function addInstagramAccount(username: string) {
  await ensureInstagramAccountsTable();
  const cleaned = username.trim();
  if (!cleaned) {
    throw new Error("Username is empty");
  }

  const existing = await db
    .select()
    .from(instagramAccounts)
    .where(eq(instagramAccounts.username, cleaned))
    .limit(1);

  if (existing.length) {
    return {
      added: false,
      message: `Account @${cleaned} already exists`,
    };
  }

  await db.insert(instagramAccounts).values({ username: cleaned });

  return {
    added: true,
    message: `Account @${cleaned} added`,
  };
}
