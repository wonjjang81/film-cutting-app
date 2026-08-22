import { describe, expect, it, vi } from 'vitest';

import { createCloudflareLibraryAdapter } from './cloudflareLibraryAdapter';

describe('Cloudflare library adapter', () => {
  it('carries the server ETag into an optimistic PUT', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"version":1}', { status: 200, headers: { ETag: '"v1"' } }))
      .mockResolvedValueOnce(new Response('{"version":1}', { status: 200, headers: { ETag: '"v2"' } }));
    const adapter = createCloudflareLibraryAdapter({ baseUrl: 'https://film.example.com/', fetchImpl });

    await expect(adapter.get('film-cutting-library-v1')).resolves.toBe('{"version":1}');
    await adapter.set('film-cutting-library-v1', '{"version":1,"jobs":[]}');

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://film.example.com/api/library', { headers: { Accept: 'application/json' } });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://film.example.com/api/library', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
      body: '{"version":1,"jobs":[]}',
    }));
  });

  it('surfaces a conflict as a user-actionable error', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { ETag: '"v1"' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const adapter = createCloudflareLibraryAdapter({ baseUrl: 'https://film.example.com', fetchImpl });
    await adapter.get('key');
    await expect(adapter.set('key', '{}')).rejects.toThrow('다른 기기에서 프로젝트가 변경되었습니다');
  });
});
