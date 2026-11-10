import type { Env, MessageKind } from "./env";
import { apiError, json } from "./http";
import { randomId } from "./ids";

const MAX_TEXT_LENGTH = 2000;
const MAX_MEDIA_BYTES = 30 * 1024 * 1024; // 30 MB
const DEFAULT_EXPIRY_DAYS = 365;
const VALID_EXPIRY_DAYS = new Set([30, 90, 365]);

/** MIME types aceptados, con la extensión que usamos en R2. */
const ALLOWED_MEDIA: Record<string, { kind: MessageKind; ext: string }> = {
  "audio/webm": { kind: "audio", ext: "weba" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/aac": { kind: "audio", ext: "m4a" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/ogg": { kind: "audio", ext: "oga" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
};

/**
 * POST /api/messages
 * Body: multipart/form-data
 *   kind            "text" | "audio" | "video"
 *   text            dedicatoria (obligatoria si kind=text, opcional si hay media)
 *   days            vigencia: 30 | 90 | 365 (default 365)
 *   file            archivo (obligatorio si kind=audio|video)
 * Respuesta: { id, url, expiresAt }
 */
export async function createMessage(request: Request, env: Env): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("No se pudo leer el formulario (¿multipart/form-data?).", 400);
  }

  const kind = String(form.get("kind") ?? "");
  if (kind !== "text" && kind !== "audio" && kind !== "video") {
    return apiError("Tipo de mensaje inválido.", 400);
  }

  const rawText = form.get("text");
  const text = typeof rawText === "string" && rawText.trim() ? rawText.trim() : null;
  if (text && text.length > MAX_TEXT_LENGTH) {
    return apiError(`El texto no puede superar ${MAX_TEXT_LENGTH} caracteres.`, 400);
  }

  const daysRaw = Number(form.get("days") ?? DEFAULT_EXPIRY_DAYS);
  const days = VALID_EXPIRY_DAYS.has(daysRaw) ? daysRaw : DEFAULT_EXPIRY_DAYS;

  // Validación de contenido según el tipo.
  const fileEntry = form.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (kind === "text") {
    if (!text) return apiError("Escribí el mensaje que va en el QR.", 400);
    if (file) return apiError("Un mensaje de texto no lleva archivo.", 400);
  } else if (!file) {
    return apiError(kind === "audio" ? "Falta el audio." : "Falta el video.", 400);
  }

  let mime = "";
  let ext = "";
  if (file) {
    mime = ((file.type || "").split(";")[0] ?? "").trim();
    const allowed = mime ? ALLOWED_MEDIA[mime] : undefined;
    if (!allowed || allowed.kind !== kind) {
      return apiError("Formato de archivo no permitido. Usá MP4/WebM para video o MP3/M4A/OGG/WAV/WebM para audio.", 415);
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return apiError("El archivo supera el límite de 30 MB. Grabá un video más corto.", 413);
    }
    ext = allowed.ext;
  }

  const id = randomId();
  const now = Date.now();
  const expiresAt = now + days * 24 * 60 * 60 * 1000;
  const mediaKey = file ? `m/${id}.${ext}` : null;

  // 1) Subir el archivo a R2 (si hay).
  if (file && mediaKey) {
    try {
      await env.MEDIA.put(mediaKey, file.stream(), {
        httpMetadata: { contentType: mime },
      });
    } catch (err) {
      console.error("R2 put failed", err);
      return apiError("No se pudo guardar el archivo. Intentá de nuevo.", 502);
    }
  }

  // 2) Registrar en D1. Si falla, limpiamos el objeto de R2 para no dejar basura.
  try {
    await env.DB.prepare(
      `INSERT INTO messages (id, kind, text, media_key, media_mime, media_size, created_at, expires_at, active, views)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 0)`
    )
      .bind(id, kind, text, mediaKey, mime || null, file ? file.size : null, now, expiresAt)
      .run();
  } catch (err) {
    console.error("D1 insert failed", err);
    if (mediaKey) await env.MEDIA.delete(mediaKey);
    return apiError("No se pudo registrar el mensaje. Intentá de nuevo.", 500);
  }

  const url = new URL(request.url);
  const publicUrl = `${url.origin}/m/${id}`;
  return json({ id, url: publicUrl, expiresAt, kind }, 201);
}

/**
 * GET /api/m/:id — metadatos del mensaje para la landing.
 * No expone claves internas ni contadores de administración.
 */
export async function getMessage(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT kind, text, media_key, media_mime, created_at, expires_at, active
     FROM messages WHERE id = ?1`
  )
    .bind(id)
    .first<{ kind: MessageKind; text: string | null; media_key: string | null; media_mime: string | null; created_at: number; expires_at: number; active: number }>();

  if (!row) return apiError("Este mensaje no existe.", 404, "not_found");
  if (!row.active) return apiError("Este mensaje fue pausado por el taller.", 403, "inactive");
  if (row.expires_at < Date.now()) {
    return apiError("Este mensaje ya expiró.", 410, "expired");
  }

  return json({
    id,
    kind: row.kind,
    text: row.text,
    mediaUrl: row.media_key ? `/f/${row.media_key}` : null,
    mediaMime: row.media_mime,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
}

/**
 * POST /api/m/:id/view — cuenta una reproducción.
 * El cliente lo llama una vez por sesión (guard en sessionStorage) para
 * no inflar el contador cuando la gente re-escanea o recarga.
 */
export async function countView(id: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `UPDATE messages SET views = views + 1
     WHERE id = ?1 AND active = 1 AND expires_at > ?2`
  )
    .bind(id, Date.now())
    .run();

  const changed = result.meta?.changes ?? 0;
  if (!changed) return apiError("Este mensaje no existe o no está activo.", 404);
  return json({ ok: true });
}
