// Edge Function: POST /functions/v1/create-message
// Crea un mensaje: valida, sube el archivo al bucket 'messages' y registra la fila.
// Autenticación: pública (el ID aleatorio es el secreto del mensaje).
// Env disponibles en runtime: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const MAX_TEXT = 2000;
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const VALID_DAYS = new Set([30, 90, 365]);

const ALLOWED_MEDIA: Record<string, { kind: string; ext: string }> = {
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

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const form = await req.formData();

    const kind = String(form.get("kind") ?? "");
    if (kind !== "text" && kind !== "audio" && kind !== "video") {
      return json({ error: "Tipo de mensaje inválido." }, 400);
    }

    const rawText = form.get("text");
    const text = typeof rawText === "string" && rawText.trim() ? rawText.trim() : null;
    if (text && text.length > MAX_TEXT) {
      return json({ error: `El texto no puede superar ${MAX_TEXT} caracteres.` }, 400);
    }

    const daysRaw = Number(form.get("days") ?? 365);
    const days = VALID_DAYS.has(daysRaw) ? daysRaw : 365;

    const fileEntry = form.get("file");
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (kind === "text") {
      if (!text) return json({ error: "Escribí el mensaje que va en el QR." }, 400);
      if (file) return json({ error: "Un mensaje de texto no lleva archivo." }, 400);
    } else if (!file) {
      return json({ error: kind === "audio" ? "Falta el audio." : "Falta el video." }, 400);
    }

    let mime = "";
    let ext = "";
    if (file) {
      mime = (file.type || "").split(";")[0].trim();
      const allowed = ALLOWED_MEDIA[mime];
      if (!allowed || allowed.kind !== kind) {
        return json({ error: "Formato de archivo no permitido. Usá MP4/WebM para video o MP3/M4A/OGG/WAV/WebM para audio." }, 415);
      }
      if (file.size > MAX_BYTES) {
        return json({ error: "El archivo supera el límite de 30 MB. Grabá un video más corto." }, 413);
      }
      ext = allowed.ext;
    }

    const id = randomId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const mediaKey = file ? `m/${id}.${ext}` : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Subir el archivo (si hay).
    if (file && mediaKey) {
      const { error } = await supabase.storage.from("messages").upload(mediaKey, file, {
        contentType: mime,
      });
      if (error) {
        console.error("storage upload failed:", error.message);
        return json({ error: "No se pudo guardar el archivo. Intentá de nuevo." }, 502);
      }
    }

    // 2) Registrar la fila. Si falla, limpiar el archivo para no dejar basura.
    const { error: insertError } = await supabase.from("messages").insert({
      id,
      kind,
      text,
      media_key: mediaKey,
      media_mime: mime || null,
      media_size: file ? file.size : null,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    if (insertError) {
      console.error("insert failed:", insertError.message);
      if (mediaKey) await supabase.storage.from("messages").remove([mediaKey]);
      return json({ error: "No se pudo registrar el mensaje. Intentá de nuevo." }, 500);
    }

    return json({ id, expiresAt: expiresAt.toISOString(), kind }, 201);
  } catch (err) {
    console.error("unexpected:", err);
    return json({ error: "Error inesperado. Intentá de nuevo." }, 500);
  }
});
