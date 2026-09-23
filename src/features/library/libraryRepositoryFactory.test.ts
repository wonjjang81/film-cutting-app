import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredCloudflareUrl } from './libraryRepositoryFactory';

describe('configuredCloudflareUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_CLOUDFLARE_API_URL;
  });

  it('uses the explicit public API URL when configured', () => {
    process.env.EXPO_PUBLIC_CLOUDFLARE_API_URL = 'https://api.example.com/';
    expect(configuredCloudflareUrl()).toBe('https://api.example.com/');
  });

  it('uses same-origin API on Cloudflare Pages', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'film-cutting-app.pages.dev', origin: 'https://film-cutting-app.pages.dev' },
    });
    expect(configuredCloudflareUrl()).toBe('https://film-cutting-app.pages.dev');
  });

  it('keeps GitHub Pages in local mode', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'wonjjang81.github.io', origin: 'https://wonjjang81.github.io' },
    });
    expect(configuredCloudflareUrl()).toBeUndefined();
  });
});
