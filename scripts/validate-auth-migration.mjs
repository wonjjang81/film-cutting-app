import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [backupPath, migrationPath] = process.argv.slice(2);
if (!backupPath || !migrationPath) {
  console.error('Usage: node scripts/validate-auth-migration.mjs <backup.sql> <migration.sql>');
  process.exit(2);
}

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON;');
database.exec(readFileSync(backupPath, 'utf8'));
const before = database.prepare('SELECT user_id, user_email, document_json, created_at, updated_at FROM libraries ORDER BY user_id').all();
database.exec(readFileSync(migrationPath, 'utf8'));
const after = database.prepare('SELECT user_id, user_email, document_json, created_at, updated_at FROM libraries ORDER BY user_id').all();
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Migration changed existing library rows or identifiers.');
const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check;
if (integrity !== 'ok') throw new Error(`Post-migration integrity check failed: ${integrity}`);
const authTables = ['audit_events', 'auth_bootstrap', 'memberships', 'oauth_attempts', 'sessions', 'tenants', 'users'];
const existing = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name));
const missing = authTables.filter((name) => !existing.has(name));
if (missing.length) throw new Error(`Missing auth tables: ${missing.join(', ')}`);
console.log(JSON.stringify({ integrity, preservedLibraryRows: after.length, authTables: authTables.length }, null, 2));
