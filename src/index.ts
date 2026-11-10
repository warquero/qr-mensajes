import type { Env } from "./env";
import { createMessage, countView, getMessage } from "./api";
import { serveMedia } from "./media";
import { cleanupExpired } from "./cron";
import { extend, listMessages, removeMessage, setActive } from "./admin";
import { apiError } from "./http";

/** Cabeceras de seguridad para el frontend estático. */
function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "media-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; ")
  );
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(self), microphone=(self), geolocation=()");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- API ----
    if (path === "/api/messages" && request.method === "POST") {
      return createMessage(request, env);
    }

    const messageMatch = /^\/api\/m\/([abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{12})$/.exec(path);
    if (messageMatch?.[1]) {
      const id = messageMatch[1];
      if (request.method === "GET") return getMessage(id, env);
      if (request.method === "POST") return countView(id, env);
      return apiError("Método no permitido.", 405);
    }

    const viewMatch = /^\/api\/m\/([abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{12})\/view$/.exec(path);
    if (viewMatch?.[1]) {
      if (request.method === "POST") return countView(viewMatch[1], env);
      return apiError("Método no permitido.", 405);
    }

    // ---- Archivos desde R2 ----
    const fileMatch = /^\/f\/(m\/[A-Za-z0-9]{12}\.[a-z0-9]{2,4})$/.exec(path);
    if (fileMatch?.[1] && request.method === "GET") {
      return serveMedia(fileMatch[1], request, env);
    }

    // ---- Admin ----
    if (path === "/api/admin/messages" && request.method === "GET") {
      return listMessages(request, env);
    }
    const adminMatch = /^\/api\/admin\/messages\/([A-Za-z0-9]{12})\/(active|extend)$/.exec(path);
    if (adminMatch?.[1] && adminMatch[2] && request.method === "POST") {
      const [, id, action] = adminMatch;
      return action === "active" ? setActive(id, request, env) : extend(id, request, env);
    }
    const adminDeleteMatch = /^\/api\/admin\/messages\/([A-Za-z0-9]{12})$/.exec(path);
    if (adminDeleteMatch?.[1] && request.method === "DELETE") {
      return removeMessage(adminDeleteMatch[1], request, env);
    }

    // ---- Frontend (assets estáticos con fallback SPA) ----
    if (request.method !== "GET" && request.method !== "HEAD") {
      return apiError("Método no permitido.", 405);
    }
    const assetResponse = await env.ASSETS.fetch(request);
    return securityHeaders(assetResponse);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await cleanupExpired(env);
  },
} satisfies ExportedHandler<Env>;
