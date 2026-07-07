import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Guest accounts table for temporary guest logins with expiration.
 */
export const guestAccounts = mysqlTable("guest_accounts", {
  id: int("id").autoincrement().primaryKey(),
  guestToken: varchar("guestToken", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  userId: int("userId"), // NULL for guest, set when converting to user
});

export type GuestAccount = typeof guestAccounts.$inferSelect;
export type InsertGuestAccount = typeof guestAccounts.$inferInsert;

/**
 * Sessions table for managing active sessions and enforcing single-device login.
 */
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // NULL for guest sessions
  guestAccountId: int("guestAccountId"), // NULL for regular user sessions
  deviceId: varchar("deviceId", { length: 255 }).notNull(),
  accessTokenJti: varchar("accessTokenJti", { length: 255 }).notNull().unique(),
  refreshTokenJti: varchar("refreshTokenJti", { length: 255 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isActive: int("isActive").default(1).notNull(), // 1 = true, 0 = false
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Access codes table for managing app access codes issued by admin.
 */
export const accessCodes = mysqlTable("access_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // e.g., "ABC123XYZ789"
  isActive: int("isActive").default(1).notNull(), // 1 = active, 0 = revoked
  usageLimit: int("usageLimit"), // NULL = unlimited
  usageCount: int("usageCount").default(0).notNull(), // Current usage count
  expiresAt: timestamp("expiresAt"), // NULL = no expiration
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: varchar("createdBy", { length: 255 }), // Admin email or ID
  notes: text("notes"), // Admin notes about this code
});

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;
