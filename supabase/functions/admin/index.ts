// Edge Function: POST /functions/v1/admin
// Panel del taller. Auth: Bearer <token>; el hash SHA-256 del token se compara
// en tiempo constante contra public.app_config (solo legible con service_role).
// Acciones (body JSON): { action: "list" } | { action: "setActive", id, active }
//                       | { action: "extend", id, days } | { action: "delete", id }
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- Autenticación ----
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return json({ error: "Token de administrador inválido." }, 401);

  const { data: config, error: configError } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "admin_token_sha256")
    .maybeSingle();
  if (configError || !config?.value) {
    console.error("app_config read failed:", configError?.message);
    return json({ error: "El panel no está configurado todavía." }, 500);
  }
  const provided = await sha256Hex(token);
  if (provided !== config.value) {
    return json({ error: "Token de administrador inválido." }, 401);
  }

  // ---- Acciones ----
  let body: { action?: string; id?: string; active?: boolean; days?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  switch (body.action) {
    case "list": {
      const { data, error } = await supabase
        .from("messages")
        .select("id, kind, text, media_size, created_at, expires_at, active, views")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ error: error.message }, 500);
      return json({ messages: data });
    }

    case "setActive": {
      if (!body.id) return json({ error: "Falta el id." }, 400);
      const { data, error } = await supabase
        .from("messages")
        .update({ active: Boolean(body.active) })
        .eq("id", body.id)
        .select("id");
      if (error) return json({ error: error.message }, 500);
      if (!data || data.length === 0) return json({ error: "Mensaje no encontrado." }, 404);
      return json({ ok: true, active: Boolean(body.active) });
    }

    case "extend": {
      if (!body.id) return json({ error: "Falta el id." }, 400);
      if (body.days !== 30 && body.days !== 90 && body.days !== 365) {
        return json({ error: "Días inválidos (30, 90 o 365)." }, 400);
      }
      const newExpiry = new Date(Date.now() + (body.days as number) * 24 * 60 * 60 * 1000).toISOString();
      // MAX(expira_actual, nueva): extender nunca acorta la vigencia.
      const { data, error } = await supabase.rpc("extend_message", {
        p_id: body.id,
        p_expires_at: newExpiry,
      });
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Mensaje no encontrado." }, 404);
      return json({ ok: true, expiresAt: newExpiry });
    }

    case "delete": {
      if (!body.id) return json({ error: "Falta el id." }, 400);
      const { data: row, error: readError } = await supabase
        .from("messages")
        .select("media_key")
        .eq("id", body.id)
        .maybeSingle();
      if (readError) return json({ error: readError.message }, 500);
      if (!row) return json({ error: "Mensaje no encontrado." }, 404);

      if (row.media_key) {
        const { error: rmError } = await supabase.storage.from("messages").remove([row.media_key]);
        if (rmError) console.error("storage remove failed:", rmError.message);
      }
      const { error: delError } = await supabase.from("messages").delete().eq("id", body.id);
      if (delError) return json({ error: delError.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});
