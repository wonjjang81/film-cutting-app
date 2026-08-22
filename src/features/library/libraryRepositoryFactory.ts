import { asyncStorageLibraryAdapter } from './asyncStorageLibraryAdapter';
import { createCloudflareLibraryAdapter } from './cloudflareLibraryAdapter';
import { createLibraryRepository, type LibraryRepository } from './libraryRepository';

function configuredCloudflareUrl(): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env.EXPO_PUBLIC_CLOUDFLARE_API_URL;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Uses D1-backed Pages Functions only when explicitly configured; otherwise preserves local mode. */
export function createAppLibraryRepository(): LibraryRepository {
  const baseUrl = configuredCloudflareUrl();
  return createLibraryRepository(baseUrl ? createCloudflareLibraryAdapter({ baseUrl }) : asyncStorageLibraryAdapter);
}
