-- Firma del regalo: nombre de quien lo regala (opcional), editable al crear el QR.
-- Se muestra en la vista pública como "con cariño, de <from_name>".
-- Si es null, la vista muestra el texto genérico "de quien te lo regaló".

alter table public.messages add column if not exists from_name text;

-- get_message cambia su tipo de retorno (agrega from_name): hay que recrearla.
drop function if exists public.get_message(text);

create or replace function public.get_message(p_id text)
returns table (
  id           text,
  kind         text,
  message_text text,
  from_name    text,
  media_key    text,
  media_mime   text,
  created_at   timestamptz,
  expires_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.text, m.from_name, m.media_key, m.media_mime, m.created_at, m.expires_at
  from public.messages m
  where m.id = p_id and m.active and m.expires_at > now();
$$;

grant execute on function public.get_message(text) to anon, authenticated;
