-- QR Mensajes — esquema inicial
-- Tabla de mensajes, RLS (denegado por defecto), RPCs públicos seguros
-- y bucket público de archivos.

create table if not exists public.messages (
  id           text primary key,               -- ID aleatorio de 12 caracteres
  kind         text not null,                  -- 'text' | 'audio' | 'video'
  text         text,
  media_key    text,                           -- ruta en el bucket 'messages' (m/<id>.<ext>)
  media_mime   text,
  media_size   bigint,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  active       boolean not null default true,
  views        integer not null default 0
);

create index if not exists idx_messages_expires on public.messages (expires_at);

-- RLS: denegado para todos por defecto. El acceso público pasa SOLO por
-- las funciones SECURITY DEFINER (get_message / count_message_view),
-- que filtran por id + vigencia. Nadie puede listar mensajes ajenos.
alter table public.messages enable row level security;

create or replace function public.get_message(p_id text)
returns table (
  id           text,
  kind         text,
  message_text text,
  media_key    text,
  media_mime   text,
  created_at   timestamptz,
  expires_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.text, m.media_key, m.media_mime, m.created_at, m.expires_at
  from public.messages m
  where m.id = p_id and m.active and m.expires_at > now();
$$;

create or replace function public.count_message_view(p_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  changed integer;
begin
  update public.messages set views = views + 1
  where id = p_id and active and expires_at > now();
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

grant execute on function public.get_message(text) to anon, authenticated;
grant execute on function public.count_message_view(text) to anon, authenticated;

-- Configuración protegida (solo service_role): hash SHA-256 del token admin.
-- El valor se inserta por SQL Editor: el hash nunca va al código fuente.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;

-- Bucket público de archivos (lectura por URL directa; escritura solo service_role).
insert into storage.buckets (id, name, public)
values ('messages', 'messages', true)
on conflict (id) do nothing;
