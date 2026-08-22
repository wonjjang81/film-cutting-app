import type { CloudflareEnv, PagesContext } from '../_types';
import { jsonResponse } from '../_types';

function corsHeaders(request: Request, env: CloudflareEnv): Record<string, string> {
  const allowedOrigin = env.ALLOWED_ORIGIN ?? '*';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (allowedOrigin !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

export function onRequestOptions({ request, env }: PagesContext<CloudflareEnv>): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function onRequestGet({ request, env }: PagesContext<CloudflareEnv>): Response {
  return jsonResponse(
    { ok: true, service: 'film-cutting-api', databaseConfigured: Boolean(env.DB) },
    200,
    corsHeaders(request, env),
  );
}
