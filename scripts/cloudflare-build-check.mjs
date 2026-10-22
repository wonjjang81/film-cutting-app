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

for (const file of ['manifest.webmanifest','sw.js','pwa.js','offline.html','icons/pwa-192.png','icons/pwa-512.png','icons/pwa-maskable-512.png','icons/apple-touch-icon.png']) {
  if (!existsSync(resolve(root,'dist',file))) throw new Error(`PWA build asset missing: ${file}`);
}
if (!/rel="manifest"[^>]*href="\/manifest.webmanifest"/.test(html)) throw new Error('PWA manifest link missing or incorrectly scoped.');
if (!html.includes('src="/pwa.js"')) throw new Error('PWA installer script is missing.');
console.log('PWA build check passed: install metadata and worker assets present.');
