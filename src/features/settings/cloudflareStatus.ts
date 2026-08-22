export type CloudflareHealth = {
  ok: boolean;
  databaseConfigured?: boolean;
};

export function cloudflareHealthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/health`;
}

export async function checkCloudflareHealth(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<CloudflareHealth> {
  const response = await fetchImpl(cloudflareHealthUrl(baseUrl), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Cloudflare API 응답 오류 (${response.status}).`);
  const value = await response.json() as CloudflareHealth;
  if (value.ok !== true) throw new Error('Cloudflare API가 준비되지 않았습니다.');
  return value;
}
