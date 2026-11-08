import type { AuthIdentity } from '../../../_auth';
import type { CloudflareEnv, PagesContext } from '../../../_types';
import { jsonResponse } from '../../../_types';

export async function onRequestPost({ request, env, data }: PagesContext<CloudflareEnv, { auth?: AuthIdentity }>): Promise<Response> {
  if (!data.auth?.email) return jsonResponse({ error: '로그인이 필요합니다.' }, 401, { 'Cache-Control': 'no-store' });
  if (!env.CONSTRUCTION_MANAGER_ORIGIN || !env.CONSTRUCTION_MANAGER_SERVICE_TOKEN) return jsonResponse({ error: '건설매니저 자동 연계가 아직 설정되지 않았습니다.' }, 503, { 'Cache-Control': 'no-store' });
  const payload = await request.json() as Record<string, unknown>;
  const upstream = await fetch(`${env.CONSTRUCTION_MANAGER_ORIGIN.replace(/\/$/, '')}/api/integrations/v1/estimate-snapshots`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CONSTRUCTION_MANAGER_SERVICE_TOKEN}`, 'Content-Type': 'application/json' }, // 제출자는 로그인 세션에서 정하며, 건설매니저가 연동 권한(총괄이 부여)을 확인합니다.
    body: JSON.stringify({ ...payload, schema: 'film-estimate/v1', submittedBy: data.auth.email }),
  });
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
