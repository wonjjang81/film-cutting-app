import { asyncStorageLibraryAdapter } from './asyncStorageLibraryAdapter';
import { createCloudflareLibraryAdapter } from './cloudflareLibraryAdapter';
import { createLibraryRepository, type LibraryRepository } from './libraryRepository';

export function configuredCloudflareUrl(): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env.EXPO_PUBLIC_CLOUDFLARE_API_URL;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();

  // Direct Wrangler uploads do not run the GitHub Actions build that normally
  // injects EXPO_PUBLIC_CLOUDFLARE_API_URL. On a Pages production/preview host,
  // the API is same-origin, so detect that trusted hosting boundary at runtime.
  if (typeof window !== 'undefined' && /(?:^|\.)pages\.dev$/i.test(window.location.hostname)) {
    return window.location.origin;
  }

  return undefined;
}

/** Uses D1-backed Pages Functions only when explicitly configured; otherwise preserves local mode. */
export function createAppLibraryRepository(): LibraryRepository {
  const baseUrl = configuredCloudflareUrl();
  return createLibraryRepository(baseUrl ? createCloudflareLibraryAdapter({ baseUrl }) : asyncStorageLibraryAdapter);
}
