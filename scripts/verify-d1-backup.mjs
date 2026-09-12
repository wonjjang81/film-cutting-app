import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: node scripts/verify-d1-backup.mjs <backup.sql>');
  process.exit(2);
}

const sql = readFileSync(backupPath, 'utf8');
const database = new DatabaseSync(':memory:');
database.exec(sql);
const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check;
if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);

const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const counts = Object.fromEntries(tables.map(({ name }) => [name, database.prepare(`SELECT COUNT(*) AS count FROM "${String(name).replaceAll('"', '""')}"`).get()?.count ?? 0]));
console.log(JSON.stringify({ sha256: createHash('sha256').update(sql).digest('hex'), integrity, counts }, null, 2));
