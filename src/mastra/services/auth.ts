
import crypto from 'node:crypto';
import { db, pool } from "../storage/index.js";
import { users } from "../storage/schema.js";
import { eq, sql } from "drizzle-orm";

let ensured = false;

async function ensureUsersTable() {
    if (ensured) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'ACCOUNTS_ONLY',
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);
    ensured = true;
}

// === AUTH UTILS ===

function hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(password: string, hash: string, salt: string) {
    const calculatedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === calculatedHash;
}

// === USER MANAGEMENT ===

export async function createUser(email: string, password: string, role: 'ADMIN' | 'ACCOUNTS_ONLY' = 'ACCOUNTS_ONLY') {
    await ensureUsersTable();
    const cleanEmail = email.trim().toLowerCase();

    // Check existing
    const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (existing.length) {
        throw new Error(`User ${cleanEmail} already exists`);
    }

    const { salt, hash } = hashPassword(password);

    await db.insert(users).values({
        email: cleanEmail,
        passwordHash: hash,
        salt: salt,
        role: role
    });

    console.log(`✅ [AUTH] Created user: ${cleanEmail} (${role})`);
    return { success: true, email: cleanEmail };
}

export async function authenticateUser(email: string, password: string) {
    await ensureUsersTable();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (!user.length) {
        return null; // User not found
    }

    const record = user[0];
    if (verifyPassword(password, record.passwordHash, record.salt)) {
        return { id: record.id, email: record.email, role: record.role };
    }
    return null; // Invalid password
}

export async function getAllUsers() {
    await ensureUsersTable();
    return db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt
    }).from(users);
}

export async function deleteUser(email: string) {
    await ensureUsersTable();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === 'admin@example.com') {
        throw new Error("Cannot delete default admin");
    }

    await db.delete(users).where(eq(users.email, cleanEmail));
    console.log(`🗑️ [AUTH] Deleted user: ${cleanEmail}`);
    return { success: true };
}

// === SEED DEFAULT ADMIN ===
export async function seedDefaultAdmin() {
    await ensureUsersTable();
    const adminEmail = 'admin@example.com';
    const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existing.length === 0) {
        console.log("🌱 [AUTH] Seeding default admin user...");
        await createUser(adminEmail, 'admin', 'ADMIN');
    }
}
