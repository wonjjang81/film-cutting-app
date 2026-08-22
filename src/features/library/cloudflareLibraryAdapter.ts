import type { KeyValueAdapter } from './libraryRepository';

export type CloudflareLibraryAdapterOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/library`;
}

/** KeyValueAdapter bridge for the Pages Functions /api/library endpoint. */
export function createCloudflareLibraryAdapter({ baseUrl, fetchImpl = fetch }: CloudflareLibraryAdapterOptions): KeyValueAdapter {
  let etag: string | null = null;
  return {
    async get(): Promise<string | null> {
      const response = await fetchImpl(endpoint(baseUrl), { headers: { Accept: 'application/json' } });
      if (response.status === 404) { etag = null; return null; }
      if (!response.ok) throw new Error(`Cloudflare 프로젝트 조회 실패 (${response.status}).`);
      etag = response.headers.get('ETag');
      return response.text();
    },
    async set(_key, value): Promise<void> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      const response = await fetchImpl(endpoint(baseUrl), { method: 'PUT', headers, body: value });
      if (response.status === 409) throw new Error('다른 기기에서 프로젝트가 변경되었습니다. 최신 데이터를 불러온 후 다시 시도해 주세요.');
      if (!response.ok) throw new Error(`Cloudflare 프로젝트 저장 실패 (${response.status}).`);
      etag = response.headers.get('ETag');
    },
  };
}
