import type { KeyValueAdapter } from './libraryRepository';

export type CloudflareLibraryAdapterOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Prevent an Access redirect or stalled network request from blocking the UI forever. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/library`;
}

/** KeyValueAdapter bridge for the Pages Functions /api/library endpoint. */
export function createCloudflareLibraryAdapter({ baseUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: CloudflareLibraryAdapterOptions): KeyValueAdapter {
  let etag: string | null = null;
  const request = async (input: RequestInfo | URL, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, redirect: 'error', signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Cloudflare 프로젝트 요청 시간이 초과되었습니다. 로그인 상태와 Access 설정을 확인해 주세요.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    async get(): Promise<string | null> {
      const response = await request(endpoint(baseUrl), { credentials: 'include', headers: { Accept: 'application/json' } });
      if (response.status === 404) { etag = null; return null; }
      if (!response.ok) throw new Error(`Cloudflare 프로젝트 조회 실패 (${response.status}).`);
      etag = response.headers.get('ETag');
      return response.text();
    },
    async set(_key, value): Promise<void> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      const response = await request(endpoint(baseUrl), { credentials: 'include', method: 'PUT', headers, body: value });
      if (response.status === 409) throw new Error('다른 기기에서 프로젝트가 변경되었습니다. 최신 데이터를 불러온 후 다시 시도해 주세요.');
      if (!response.ok) throw new Error(`Cloudflare 프로젝트 저장 실패 (${response.status}).`);
      etag = response.headers.get('ETag');
    },
  };
}
