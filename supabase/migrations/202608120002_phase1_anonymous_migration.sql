-- Called only by the migration Edge Function after it has verified both the
-- source anonymous JWT and the target email-account JWT. The target is derived
-- from auth.uid(), never accepted from the browser request body.
create or replace function public.migrate_anonymous_wishes(source_owner_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved_count integer;
begin
  if auth.uid() is null or source_owner_id is null or source_owner_id = auth.uid() then
    return 0;
  end if;

  update public.wishes
     set owner_id = auth.uid(), updated_at = now()
   where owner_id = source_owner_id;
  get diagnostics moved_count = row_count;
  return moved_count;
end;
$$;

revoke all on function public.migrate_anonymous_wishes(uuid) from public;
grant execute on function public.migrate_anonymous_wishes(uuid) to authenticated;
