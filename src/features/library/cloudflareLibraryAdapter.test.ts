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

    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringMatching(/^https:\/\/film\.example\.com\/api\/library\?v=\d+-\d+$/), expect.objectContaining({ credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, redirect: 'error', signal: expect.any(AbortSignal) }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://film.example.com/api/library', expect.objectContaining({
      credentials: 'include',
      cache: 'no-store',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"', 'Cache-Control': 'no-cache' },
      body: '{"version":1,"jobs":[]}',
      redirect: 'error',
      signal: expect.any(AbortSignal),
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

  it('fails fast when the Access-protected request never completes', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')), { once: true });
    }));
    const adapter = createCloudflareLibraryAdapter({ baseUrl: 'https://film.example.com', fetchImpl, timeoutMs: 5 });

    await expect(adapter.get('key')).rejects.toThrow('Cloudflare 프로젝트 요청 시간이 초과되었습니다');
  });

  it('does not let a stale concurrent GET overwrite the ETag after a successful PUT', async () => {
    let version = 'v1';
    let getCount = 0;
    let releaseStaleRead: ((response: Response) => void) | undefined;
    const staleRead = new Promise<Response>((resolve) => { releaseStaleRead = resolve; });
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const expected = new Headers(init.headers).get('If-Match')?.replace(/^"|"$/g, '');
        if (expected !== version) return Promise.resolve(new Response('{}', { status: 409 }));
        version = 'v2';
        return Promise.resolve(new Response('{}', { status: 200, headers: { ETag: '"v2"' } }));
      }
      getCount += 1;
      if (getCount === 2) return staleRead;
      return Promise.resolve(new Response('{}', { status: 200, headers: { ETag: `"${version}"` } }));
    });
    const adapter = createCloudflareLibraryAdapter({ baseUrl: 'https://film.example.com', fetchImpl });

    await adapter.get('key');
    const pendingRead = adapter.get('key');
    await adapter.set('key', '{}');
    releaseStaleRead!(new Response('{}', { status: 200, headers: { ETag: '"v1"' } }));
    await pendingRead;
    await expect(adapter.set('key', '{}')).resolves.toBeUndefined();

    const putCalls = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(new Headers(putCalls[1]?.[1]?.headers).get('If-Match')).toBe('"v2"');
  });
});
