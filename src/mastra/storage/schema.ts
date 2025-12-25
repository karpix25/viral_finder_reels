import {
  pgTable,
  serial,
  varchar,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

// Table to store Instagram accounts (replaces Google Sheets list)
export const instagramAccounts = pgTable("instagram_accounts", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  followers: integer("followers").default(0).notNull(),
});

// Table to track sent viral reels (prevent duplicates)
export const sentViralReels = pgTable("sent_viral_reels", {
  id: serial("id").primaryKey(),
  reelUrl: varchar("reel_url", { length: 500 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  salt: varchar("salt", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("ACCOUNTS_ONLY"), // 'ADMIN' or 'ACCOUNTS_ONLY'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table to track workflow progress
export const workflowProgress = pgTable("workflow_progress", {
  id: serial("id").primaryKey(),
  workflowName: varchar("workflow_name", { length: 255 }).notNull().unique(),
  lastProcessedIndex: integer("last_processed_index").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Table to track when each account was last checked (for smart prioritization)
export const accountCheckHistory = pgTable("account_check_history", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
  totalChecks: integer("total_checks").notNull().default(1),
  lastViralReelsFound: integer("last_viral_reels_found").notNull().default(0),
});

// Key-value app settings
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
