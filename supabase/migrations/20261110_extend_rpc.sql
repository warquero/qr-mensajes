-- Extensión de vigencia (solo la llama la Edge Function admin con service_role).
-- greatest(): extender nunca acorta la vigencia actual.

create or replace function public.extend_message(p_id text, p_expires_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  changed integer;
begin
  update public.messages
  set expires_at = greatest(expires_at, p_expires_at)
  where id = p_id;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke execute on function public.extend_message(text, timestamptz) from anon, authenticated, public;
