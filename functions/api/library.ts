import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { CloudflareEnv, D1Database, PagesContext } from '../_types';
import { jsonResponse } from '../_types';

const EMPTY_DOCUMENT = { version: 1, presets: [], jobs: [], remnants: [], mergedJobs: [] };
const MAX_DOCUMENT_BYTES = 2_000_000;

type LibraryRow = { user_id: string; user_email: string; document_json: string; updated_at: string };
type Identity = { subject: string; email: string };

class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function corsHeaders(request: Request, env: CloudflareEnv): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN ?? requestOrigin ?? '*';
  return { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', Vary: 'Origin' };
}

async function identityFromAccess(request: Request, env: CloudflareEnv): Promise<Identity> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new ApiError(503, 'Cloudflare Access 설정이 완료되지 않았습니다.');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new ApiError(401, 'Cloudflare Access 인증 토큰이 없습니다.');
  try {
    const keySet = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, keySet, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) throw new Error('subject missing');
    return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : payload.sub };
  } catch {
    throw new ApiError(403, 'Cloudflare Access 인증 토큰이 유효하지 않습니다.');
  }
}

function database(env: CloudflareEnv): D1Database {
  if (!env.DB) throw new ApiError(503, 'D1 데이터베이스 바인딩이 설정되지 않았습니다.');
  return env.DB;
}

function validDocument(value: unknown): value is Record<string, unknown> & { version: 1; presets: unknown[]; jobs: unknown[]; remnants: unknown[]; mergedJobs: unknown[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.presets) && Array.isArray(record.jobs) && Array.isArray(record.remnants) && Array.isArray(record.mergedJobs);
}

async function readRow(db: D1Database, identity: Identity): Promise<LibraryRow | null> {
  return db.prepare('SELECT user_id, user_email, document_json, updated_at FROM libraries WHERE user_id = ?1').bind(identity.subject).first<LibraryRow>();
}

function responseForDocument(document: unknown, updatedAt: string, request: Request, env: CloudflareEnv): Response {
  return jsonResponse(document, 200, { ETag: `"${updatedAt}"`, ...corsHeaders(request, env) });
}

export async function onRequestOptions({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export async function onRequestGet({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  try {
    const identity = await identityFromAccess(request, env);
    const row = await readRow(database(env), identity);
    if (!row) return responseForDocument(EMPTY_DOCUMENT, '', request, env);
    let document: unknown;
    try { document = JSON.parse(row.document_json); } catch { throw new ApiError(500, '서버에 저장된 프로젝트 데이터가 손상되었습니다.'); }
    return responseForDocument(document, row.updated_at, request, env);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(500, '프로젝트 데이터를 불러오지 못했습니다.');
    return jsonResponse({ error: apiError.message }, apiError.status, corsHeaders(request, env));
  }
}

export async function onRequestPut({ request, env }: PagesContext<CloudflareEnv>): Promise<Response> {
  try {
    const identity = await identityFromAccess(request, env);
    const db = database(env);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_BYTES) throw new ApiError(413, '프로젝트 데이터가 너무 큽니다.');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ApiError(400, '프로젝트 데이터 JSON이 올바르지 않습니다.'); }
    const document = typeof body === 'object' && body !== null && 'document' in body ? (body as { document: unknown }).document : body;
    if (!validDocument(document)) throw new ApiError(400, '프로젝트 문서 구조가 올바르지 않습니다.');
    const current = await readRow(db, identity);
    const expected = request.headers.get('If-Match')?.replace(/^"|"$/g, '');
    if (current && expected && expected !== current.updated_at) throw new ApiError(409, '다른 기기에서 프로젝트가 변경되었습니다. 다시 불러온 후 저장해 주세요.');
    const now = new Date().toISOString();
    const documentJson = JSON.stringify(document);
    if (current) {
      const result = await db.prepare('UPDATE libraries SET user_email = ?1, document_json = ?2, updated_at = ?3 WHERE user_id = ?4 AND updated_at = ?5').bind(identity.email, documentJson, now, identity.subject, current.updated_at).run();
      if ((result.meta?.changes ?? 0) !== 1) throw new ApiError(409, '다른 기기에서 프로젝트가 변경되었습니다. 다시 불러온 후 저장해 주세요.');
    } else {
      await db.prepare('INSERT INTO libraries (user_id, user_email, document_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)').bind(identity.subject, identity.email, documentJson, now).run();
    }
    return responseForDocument(document, now, request, env);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(500, '프로젝트 데이터를 저장하지 못했습니다.');
    return jsonResponse({ error: apiError.message }, apiError.status, corsHeaders(request, env));
  }
}
