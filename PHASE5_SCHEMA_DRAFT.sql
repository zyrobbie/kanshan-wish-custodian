-- Stage 5 schema draft. Generated as a deployable design because the Supabase CLI
-- is not installed in this workspace. Do not apply this file manually as a fake
-- migration: an independent deployer must first run `supabase migration new
-- phase5_wish_lifecycle` and place this reviewed SQL in the generated file.

alter table public.wishes
  add column if not exists idempotency_key uuid,
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.wishes
  add constraint wishes_idempotency_key_unique unique (owner_id, idempotency_key),
  -- Existing Stage 1 diagnostic rows may be intentionally smaller snapshots.
  -- NOT VALID preserves them while enforcing the Stage 5 shape for new writes.
  add constraint wishes_product_shape_check check (
    product ? 'itemId' and product ? 'title' and product ? 'sellingPrice' and product ? 'promotionUrl'
  ) not valid;

create index if not exists wishes_owner_active_idx on public.wishes (owner_id, expires_at)
  where status in ('sealed', 'expired');

-- Keep the existing Stage 1 ownership policy explicit after the lifecycle change.
alter policy "wishes_update_own" on public.wishes
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create or replace function public.create_custody_wish(
  p_product jsonb, p_evidence jsonb, p_custody_hours smallint, p_idempotency_key uuid
) returns public.wishes
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_existing public.wishes; v_active integer;
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if p_custody_hours not in (24,48,72) then raise exception 'invalid_duration'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(p_product) <> 'object' or jsonb_typeof(p_evidence) <> 'object'
    or nullif(trim(p_product->>'itemId'), '') is null or nullif(trim(p_product->>'title'), '') is null
    or nullif(trim(p_product->>'promotionUrl'), '') is null
    or not ((p_product->>'sellingPrice') ~ '^[0-9]+(\\.[0-9]{1,2})?$') then raise exception 'invalid_product'; end if;
  select * into v_existing from public.wishes where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select count(*) into v_active from public.wishes where owner_id=v_owner and status in ('sealed','expired');
  if v_active >= 5 then raise exception 'active_limit_reached'; end if;
  insert into public.wishes(owner_id, product, evidence, custody_hours, demo_duration_seconds, expires_at, status, promotion_url, idempotency_key, last_seen_at)
  values (v_owner, p_product, p_evidence, p_custody_hours, p_custody_hours, now() + make_interval(secs => p_custody_hours), 'sealed', p_product->>'promotionUrl', p_idempotency_key, now())
  returning * into v_existing;
  return v_existing;
end; $$;

create or replace function public.list_my_custody_wishes(p_offset integer default 0, p_limit integer default 20)
returns table(wish jsonb, summary jsonb)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  update public.wishes set status='expired', updated_at=now(), last_seen_at=now()
    where owner_id=v_owner and status='sealed' and expires_at <= now();
  return query select to_jsonb(w), jsonb_build_object(
    'wishCount', count(*) over (),
    'sealedCount', count(*) filter (where w.status='sealed') over (),
    'expiredCount', count(*) filter (where w.status='expired') over (),
    'abandonedCount', count(*) filter (where w.status='abandoned') over (),
    'purchaseIntentCount', count(*) filter (where w.status='purchased_intent') over (),
    'abandonedListedAmount', coalesce(sum(w.counted_amount) filter (where w.status='abandoned') over (), 0)
  ) from public.wishes w where w.owner_id=v_owner
  order by case when w.status='expired' then 0 when w.status='sealed' then 1 else 2 end, w.expires_at asc, w.updated_at desc
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),20);
end; $$;

create or replace function public.decide_custody_wish(p_wish_id uuid, p_decision text)
returns public.wishes
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_owner uuid := auth.uid(); v_wish public.wishes;
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if p_decision not in ('purchase','abandon') then raise exception 'invalid_decision'; end if;
  update public.wishes set status='expired', updated_at=now(), last_seen_at=now()
    where id=p_wish_id and owner_id=v_owner and status='sealed' and expires_at <= now();
  select * into v_wish from public.wishes where id=p_wish_id and owner_id=v_owner for update;
  if not found then raise exception 'not_found'; end if;
  if v_wish.status in ('purchased_intent','abandoned') then return v_wish; end if;
  if v_wish.status <> 'expired' then raise exception 'wish_not_expired'; end if;
  update public.wishes set status=case when p_decision='purchase' then 'purchased_intent' else 'abandoned' end,
    decision_at=now(), counted_amount=case when p_decision='abandon' then coalesce(nullif(product->>'estimatedPrice','')::numeric, nullif(product->>'sellingPrice','')::numeric) else 0 end,
    last_seen_at=now(), updated_at=now()
  where id=p_wish_id and owner_id=v_owner returning * into v_wish;
  return v_wish;
end; $$;

create or replace function public.delete_my_custody_wish(p_wish_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin delete from public.wishes where id=p_wish_id and owner_id=auth.uid(); return found; end; $$;
create or replace function public.clear_my_custody_wishes() returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n integer; begin delete from public.wishes where owner_id=auth.uid(); get diagnostics n = row_count; return n; end; $$;

revoke all on function public.create_custody_wish(jsonb,jsonb,smallint,uuid) from public, anon;
revoke all on function public.list_my_custody_wishes(integer,integer) from public, anon;
revoke all on function public.decide_custody_wish(uuid,text) from public, anon;
revoke all on function public.delete_my_custody_wish(uuid) from public, anon;
revoke all on function public.clear_my_custody_wishes() from public, anon;
grant execute on function public.create_custody_wish(jsonb,jsonb,smallint,uuid), public.list_my_custody_wishes(integer,integer), public.decide_custody_wish(uuid,text), public.delete_my_custody_wish(uuid), public.clear_my_custody_wishes() to authenticated;

-- Independent deployment only: enable pg_cron after reviewing anonymous
-- detection against current Auth docs. The cleanup job must call a restricted
-- service function that identifies auth.jwt()->>'is_anonymous' safely and deletes
-- only users inactive for 30 days. It is intentionally not implemented/applied here.
