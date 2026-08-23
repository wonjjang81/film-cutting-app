import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const indexPath = resolve(root, 'dist', 'index.html');

if (!existsSync(indexPath)) {
  console.error('Cloudflare build check failed: dist/index.html is missing.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const hasRootAsset = /(?:src|href)=["']\/_expo\//.test(html);
const hasProjectAsset = /(?:src|href)=["']\/film-cutting-app\/_expo\//.test(html);

if (!hasRootAsset || hasProjectAsset) {
  console.error('Cloudflare build check failed: static assets must use the root /_expo path.');
  process.exit(1);
}

console.log('Cloudflare build check passed: root static asset paths are configured.');
