import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

// Table to track sent viral reels (prevent duplicates)
export const sentViralReels = pgTable("sent_viral_reels", {
  id: serial("id").primaryKey(),
  reelUrl: varchar("reel_url", { length: 500 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});
