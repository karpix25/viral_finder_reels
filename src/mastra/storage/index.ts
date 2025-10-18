import { PostgresStore } from "@mastra/pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Create a single shared PostgreSQL storage instance
export const sharedPostgresStorage = new PostgresStore({
  connectionString:
    process.env.DATABASE_URL || "postgresql://localhost:5432/mastra",
});

// Create Drizzle database instance for custom queries
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://localhost:5432/mastra",
});

export const db = drizzle(pool, { schema });
