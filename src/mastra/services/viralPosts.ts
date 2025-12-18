import { db, pool } from "../storage/postgres.js";
import { pgTable, serial, text, integer, timestamp, boolean, varchar, jsonb } from "drizzle-orm/pg-core";
import { eq, desc } from "drizzle-orm";

// Define the schema
export const viralPosts = pgTable("viral_posts", {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 255 }).notNull(),
    postUrl: text("post_url").notNull().unique(), // Unique to prevent duplicates
    contentType: varchar("content_type", { length: 50 }), // 'Reel', 'Sidecar', 'Image'
    viewCount: integer("view_count"),
    likeCount: integer("like_count"),
    commentCount: integer("comment_count"),
    takenAt: timestamp("taken_at"), // Publication date
    foundAt: timestamp("found_at").defaultNow().notNull(), // When we scraped it
    viralityScore: integer("virality_score"), // Growth multiplier (e.g. 2.5x -> stored as 250 or float?) better float but integer for simplicity scaled x100? Let's use real type or just store as string/json if needed. Postgres has real/double. Drizzle has real.
    // Actually let's use jsonb for flexible metadata or just text for "reason"
    viralityReason: text("virality_reason"),
    thumbnailUrl: text("thumbnail_url"),
});

// Helper type
export type ViralPost = typeof viralPosts.$inferSelect;
export type NewViralPost = typeof viralPosts.$inferInsert;

let ensured = false;

export async function ensureViralPostsTable() {
    if (ensured) return;
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS viral_posts (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        post_url TEXT NOT NULL UNIQUE,
        content_type VARCHAR(50),
        view_count INTEGER,
        like_count INTEGER,
        comment_count INTEGER,
        taken_at TIMESTAMP,
        found_at TIMESTAMP DEFAULT now() NOT NULL,
        virality_score REAL,
        virality_reason TEXT,
        thumbnail_url TEXT
      );
    `);
        console.log("✅ [DB] viral_posts ensured");
        ensured = true;
    } catch (error) {
        console.error("❌ [DB] Failed to ensure viral_posts", error);
        ensured = false;
        throw error;
    }
}

export async function saveViralPost(post: Omit<NewViralPost, "id" | "foundAt">) {
    await ensureViralPostsTable();

    // Use upsert to avoid duplicate errors if we scan the same viral post twice (e.g. daily scan)
    // If it's already there, maybe update the views/score?

    // Drizzle with simple sql fallback
    try {
        // Check if exists
        const existing = await db.select().from(viralPosts).where(eq(viralPosts.postUrl, post.postUrl));
        if (existing.length > 0) {
            // Update stats
            await db.update(viralPosts).set({
                viewCount: post.viewCount,
                likeCount: post.likeCount,
                commentCount: post.commentCount,
                viralityScore: post.viralityScore,
                viralityReason: post.viralityReason,
                // don't update foundAt, keep original discovery time
            }).where(eq(viralPosts.postUrl, post.postUrl));
            return { action: 'updated', id: existing[0].id };
        } else {
            // Insert
            const res = await db.insert(viralPosts).values(post).returning();
            return { action: 'inserted', id: res[0].id };
        }
    } catch (err) {
        console.error("Failed to save viral post", err);
        return null;
    }
}

export async function getViralPosts(limit = 100, offset = 0) {
    await ensureViralPostsTable();

    return await db
        .select()
        .from(viralPosts)
        .orderBy(desc(viralPosts.foundAt))
        .limit(limit)
        .offset(offset);
}
