-- Esquema de D1 (SQLite) para qr-mensajes.
-- Aplicar con: npm run db:local  (desarrollo)  |  npm run db:remote  (producción)

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,            -- ID aleatorio no adivinable (12 chars)
  kind         TEXT NOT NULL,               -- 'text' | 'audio' | 'video'
  text         TEXT,                        -- dedicatoria (opcional si hay media)
  media_key    TEXT,                        -- clave del objeto en R2 (NULL si es solo texto)
  media_mime   TEXT,                        -- tipo MIME del archivo
  media_size   INTEGER,                     -- bytes
  created_at   INTEGER NOT NULL,            -- epoch ms
  expires_at   INTEGER NOT NULL,            -- epoch ms; vencido => no se sirve
  active       INTEGER NOT NULL DEFAULT 1,  -- 0 = pausado por el taller
  views        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages (expires_at);
