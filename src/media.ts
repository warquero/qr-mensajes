import type { Env } from "./env";
import { apiError } from "./http";

/** Solo aceptamos claves con el formato interno: m/<id>.<ext> */
const KEY_PATTERN = /^m\/[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}\.[a-z0-9]{2,4}$/;

type RangeQuery = { offset: number; length: number } | { suffix: number } | undefined;

/**
 * GET /f/m/<id>.<ext> — sirve el archivo desde R2.
 * - Soporta Range (seek en video/audio) respondiendo 206.
 * - Content-Type fijo desde los metadatos del objeto (nunca sniffing).
 * - Cache inmutable: el contenido de una clave nunca cambia.
 */
export async function serveMedia(key: string, request: Request, env: Env): Promise<Response> {
  if (!KEY_PATTERN.test(key)) return apiError("Archivo no encontrado.", 404);

  const rangeHeader = request.headers.get("range");
  const parsedRange = parseRange(rangeHeader);
  const object = await env.MEDIA.get(key, { range: parsedRange });

  if (!object) return apiError("Archivo no encontrado.", 404);

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-disposition", "inline");
  headers.set("etag", object.etag);
  headers.set("x-content-type-options", "nosniff");

  const totalSize = object.size;

  if (parsedRange && "offset" in parsedRange) {
    const start = parsedRange.offset ?? 0;
    const length = Math.min(parsedRange.length ?? totalSize - start, totalSize - start);
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${totalSize}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  if (parsedRange && "suffix" in parsedRange) {
    const length = Math.min(parsedRange.suffix, totalSize);
    const start = totalSize - length;
    headers.set("content-range", `bytes ${start}-${totalSize - 1}/${totalSize}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(totalSize));
  return new Response(object.body, { status: 200, headers });
}

/** Parser mínimo de "bytes=start-end" / "bytes=-suffix". */
function parseRange(header: string | null): RangeQuery {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return undefined;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return undefined;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    return suffix > 0 ? { suffix } : undefined;
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? Number.MAX_SAFE_INTEGER : Number(rawEnd);
  if (start > end) return undefined;
  return { offset: start, length: Math.max(end - start + 1, 1) };
}
