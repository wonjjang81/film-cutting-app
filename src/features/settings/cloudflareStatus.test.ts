import { describe, expect, it, vi } from 'vitest';

import { checkCloudflareHealth, cloudflareHealthUrl } from './cloudflareStatus';

describe('cloudflare status', () => {
  it('normalizes the health endpoint URL', () => {
    expect(cloudflareHealthUrl('https://film.example.com/')).toBe('https://film.example.com/api/health');
  });

  it('reads the API and D1 readiness response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true,"databaseConfigured":true}', { status: 200 }));
    await expect(checkCloudflareHealth('https://film.example.com', fetchImpl)).resolves.toEqual({ ok: true, databaseConfigured: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://film.example.com/api/health', expect.objectContaining({ credentials: 'include' }));
  });
});
