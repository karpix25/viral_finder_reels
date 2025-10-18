import { pgTable, serial, varchar, timestamp, integer } from "drizzle-orm/pg-core";

// Table to track sent viral reels (prevent duplicates)
export const sentViralReels = pgTable("sent_viral_reels", {
  id: serial("id").primaryKey(),
  reelUrl: varchar("reel_url", { length: 500 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// Table to track workflow progress
export const workflowProgress = pgTable("workflow_progress", {
  id: serial("id").primaryKey(),
  workflowName: varchar("workflow_name", { length: 255 }).notNull().unique(),
  lastProcessedIndex: integer("last_processed_index").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
