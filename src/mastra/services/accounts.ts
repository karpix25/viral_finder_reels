import { asc, eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { db, pool } from "../storage/index.js";
import { instagramAccounts } from "../storage/schema.js";

let ensured = false;
let seededFromFile = false;

export async function ensureInstagramAccountsTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_accounts (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      followers INTEGER DEFAULT 0 NOT NULL
    );
  `);
  // Ensure followers column exists on old deployments
  await pool.query(`
    ALTER TABLE instagram_accounts
    ADD COLUMN IF NOT EXISTS followers INTEGER DEFAULT 0 NOT NULL;
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

export async function upsertFollowers(username: string, followers: number) {
  await ensureInstagramAccountsTable();
  const cleaned = username.trim();
  if (!cleaned) return;
  const safeFollowers = Math.max(0, Math.floor(followers || 0));

  await db
    .insert(instagramAccounts)
    .values({ username: cleaned, followers: safeFollowers })
    .onConflictDoUpdate({
      target: instagramAccounts.username,
      set: {
        followers: safeFollowers,
      },
    });
}

export async function seedInstagramAccountsFromFile(
  filePath = process.env.SEED_ACCOUNTS_FILE ||
    path.join(process.cwd(), "Парсинг аккаунтов - Лист1.csv"),
) {
  if (seededFromFile) return;
  await ensureInstagramAccountsTable();
  try {
    await fs.access(filePath);
  } catch {
    console.log(`ℹ️ [DB] Seed file not found, skipping (${filePath})`);
    seededFromFile = true;
    return;
  }

  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const usernames = lines
    .map((line) => line.replace(/^@/, ""))
    .filter((line) => line.length > 0 && !/^названия/i.test(line));

  if (!usernames.length) {
    console.log("ℹ️ [DB] Seed file empty, skipping");
    seededFromFile = true;
    return;
  }

  const values = usernames.map((u) => ({ username: u }));

  await db
    .insert(instagramAccounts)
    .values(values)
    .onConflictDoNothing();

  console.log(
    `✅ [DB] Seeded ${usernames.length} accounts from file into instagram_accounts`,
  );
  seededFromFile = true;
}

export async function getFollowerCount(username: string): Promise<number> {
  await ensureInstagramAccountsTable();
  const cleaned = username.trim();
  if (!cleaned) return 0;

  const result = await db
    .select({ followers: instagramAccounts.followers })
    .from(instagramAccounts)
    .where(eq(instagramAccounts.username, cleaned))
    .limit(1);

  return result[0]?.followers ?? 0;
}
