import type { Env } from "./env";

/**
 * Cron diario: elimina mensajes vencidos (fila en D1 + archivo en R2).
 * Se ejecuta una vez al día, así que una expiración puede seguir sirviendo
 * hasta ~24 h después de vencer si nadie la pide: la validación en caliente
 * está en getMessage, el cron es solo higiene de almacenamiento.
 */
export async function cleanupExpired(env: Env): Promise<void> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, media_key FROM messages WHERE expires_at < ?1 LIMIT 500`
  )
    .bind(now)
    .all<{ id: string; media_key: string | null }>();

  if (!results?.length) return;

  for (const row of results) {
    if (row.media_key) {
      try {
        await env.MEDIA.delete(row.media_key);
      } catch (err) {
        console.error(`R2 delete failed for ${row.media_key}`, err);
      }
    }
  }

  await env.DB.prepare(`DELETE FROM messages WHERE expires_at < ?1`).bind(now).run();
  console.log(`Limpieza: ${results.length} mensajes expirados eliminados.`);
}
