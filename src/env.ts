// Tipos del entorno de Cloudflare Workers.
export interface Env {
  /** D1: metadatos de mensajes. */
  DB: D1Database;
  /** R2: archivos multimedia. */
  MEDIA: R2Bucket;
  /** Assets estáticos del frontend. */
  ASSETS: Fetcher;
  /** Secreto: token del panel de administración. */
  ADMIN_TOKEN: string;
}

export type MessageKind = "text" | "audio" | "video";

export interface MessageRow {
  id: string;
  kind: MessageKind;
  text: string | null;
  media_key: string | null;
  media_mime: string | null;
  media_size: number | null;
  created_at: number;
  expires_at: number;
  active: number;
  views: number;
}
