import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
database.exec(`PRAGMA foreign_keys = ON;\n${readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8')}`);

const expected = ['audit_events', 'auth_bootstrap', 'libraries', 'memberships', 'oauth_attempts', 'sessions', 'tenants', 'users'];
const actual = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(({ name }) => name);
const missing = expected.filter((name) => !actual.includes(name));
if (missing.length) {
  console.error(`Auth schema check failed: missing ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Auth schema check passed (${expected.length} tables).`);
