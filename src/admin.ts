import type { Env } from "./env";
import { apiError, json, secretsEqual } from "./http";

/**
 * Panel mínimo del taller. Autenticación por Bearer token (ADMIN_TOKEN).
 * Endpoints:
 *   GET    /api/admin/messages               → lista (últimos 200)
 *   POST   /api/admin/messages/:id/active    → { active: 0 | 1 }
 *   POST   /api/admin/messages/:id/extend    → { days: 30 | 90 | 365 }
 *   DELETE /api/admin/messages/:id           → elimina fila + archivo
 */

async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !(await secretsEqual(token, env.ADMIN_TOKEN))) {
    return apiError("Token de administrador inválido.", 401);
  }
  return null;
}

export async function listMessages(request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const { results } = await env.DB.prepare(
    `SELECT id, kind, text, media_size, created_at, expires_at, active, views
     FROM messages ORDER BY created_at DESC LIMIT 200`
  ).all();

  return json({ messages: results });
}

export async function setActive(id: string, request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  let body: { active?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("Body JSON inválido.", 400);
  }
  const active = body.active ? 1 : 0;

  const result = await env.DB.prepare(`UPDATE messages SET active = ?2 WHERE id = ?1`)
    .bind(id, active)
    .run();
  if (!result.meta?.changes) return apiError("Mensaje no encontrado.", 404);
  return json({ ok: true, active });
}

export async function extend(id: string, request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  let body: { days?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("Body JSON inválido.", 400);
  }
  const days = body.days;
  if (days !== 30 && days !== 90 && days !== 365) {
    return apiError("Días inválidos (30, 90 o 365).", 400);
  }

  const newExpiry = Date.now() + days * 24 * 60 * 60 * 1000;
  const result = await env.DB.prepare(
    `UPDATE messages SET expires_at = MAX(expires_at, ?2) WHERE id = ?1`
  )
    .bind(id, newExpiry)
    .run();
  if (!result.meta?.changes) return apiError("Mensaje no encontrado.", 404);
  return json({ ok: true, expiresAt: newExpiry });
}

export async function removeMessage(id: string, request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const key = await env.DB.prepare(`SELECT media_key FROM messages WHERE id = ?1`)
    .bind(id)
    .first<{ media_key: string | null }>();
  if (!key) return apiError("Mensaje no encontrado.", 404);

  // Primero el archivo en R2, después la fila. Si la fila falla, el objeto
  // huérfano lo limpia igual el cron (ver cleanupExpired).
  if (key.media_key) await env.MEDIA.delete(key.media_key);
  await env.DB.prepare(`DELETE FROM messages WHERE id = ?1`).bind(id).run();

  return json({ ok: true });
}
