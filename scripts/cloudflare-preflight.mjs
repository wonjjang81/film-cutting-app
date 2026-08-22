import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'functions/api/health.ts',
  'functions/api/library.ts',
  'cloudflare/schema.sql',
  'cloudflare/wrangler.toml.example',
];

const missingFiles = requiredFiles.filter((file) => !existsSync(resolve(root, file)));
if (missingFiles.length > 0) {
  console.error(`Cloudflare preflight failed: missing ${missingFiles.join(', ')}`);
  process.exit(1);
}

const schema = readFileSync(resolve(root, 'cloudflare/schema.sql'), 'utf8');
const wranglerConfig = readFileSync(resolve(root, 'cloudflare/wrangler.toml.example'), 'utf8');
const structuralErrors = [];
if (!/CREATE TABLE IF NOT EXISTS libraries/i.test(schema)) structuralErrors.push('libraries D1 table');
if (!/pages_build_output_dir\s*=\s*["']dist["']/i.test(wranglerConfig)) structuralErrors.push('Pages dist output');
if (!/binding\s*=\s*["']DB["']/i.test(wranglerConfig)) structuralErrors.push('D1 DB binding');
if (structuralErrors.length > 0) {
  console.error(`Cloudflare preflight failed: ${structuralErrors.join(', ')} configuration is missing.`);
  process.exit(1);
}

if (process.argv.includes('--ci')) {
  const requiredEnv = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_PROJECT_NAME',
    'EXPO_PUBLIC_CLOUDFLARE_API_URL',
  ];
  const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
  if (missingEnv.length > 0) {
    console.error(`Cloudflare preflight failed: missing CI variables ${missingEnv.join(', ')}.`);
    process.exit(1);
  }
  try {
    const apiUrl = new URL(process.env.EXPO_PUBLIC_CLOUDFLARE_API_URL);
    if (apiUrl.protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    console.error('Cloudflare preflight failed: EXPO_PUBLIC_CLOUDFLARE_API_URL must be an HTTPS URL.');
    process.exit(1);
  }
}

console.log(`Cloudflare preflight passed${process.argv.includes('--ci') ? ' (CI)' : ''}.`);
