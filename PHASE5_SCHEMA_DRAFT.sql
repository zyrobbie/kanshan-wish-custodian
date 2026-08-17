-- Stage 5 schema draft. Generated as a deployable design because the Supabase CLI
-- is not installed in this workspace. Do not apply this file manually as a fake
-- migration: an independent deployer must first run `supabase migration new
-- phase5_wish_lifecycle` and place this reviewed SQL in the generated file.
-- The non-destructive Phase 6 isolation follow-up uses the same
-- `idempotency_key is not null` boundary shown below; it must never rewrite
-- or delete Stage 1 diagnostic rows whose key is NULL.

alter table public.wishes
  add column if not exists idempotency_key uuid,
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.wishes
  add constraint wishes_idempotency_key_unique unique (owner_id, idempotency_key),
  -- Existing Stage 1 diagnostic rows may be intentionally smaller snapshots.
  -- NOT VALID avoids an initial table scan, while the idempotency-key guard keeps
  -- later lifecycle updates compatible with those legacy rows. All Stage 5 RPC
  -- creates require a non-null idempotency key and therefore enforce the shape.
  add constraint wishes_product_shape_check check (
    idempotency_key is null or (
      product ? 'itemId' and product ? 'title' and product ? 'sellingPrice' and product ? 'promotionUrl'
    )
  ) not valid;

create index if not exists wishes_owner_active_idx on public.wishes (owner_id, expires_at)
  where status in ('sealed', 'expired');

-- Browser clients may read only through their existing RLS policy. Lifecycle
-- authority fields are writable only by the audited functions below.
revoke insert, update, delete, truncate on table public.wishes from public, anon, authenticated;

create or replace function public.phase5_valid_promotion_url(p_value text)
returns boolean language sql immutable set search_path = '' as $$
  select p_value is not null and octet_length(p_value) <= 4096
    and p_value !~ '[[:cntrl:]]'
    and p_value ~ '^https://([A-Za-z0-9-]+\.)*(taobao\.com|tmall\.com|e\.tb\.cn)(/|$)';
$$;

-- Validate before casting, and catch conversion overflow explicitly. This keeps
-- later decision writes from re-casting an untrusted price snapshot.
create or replace function public.phase5_amount_or_null(p_value text)
returns numeric(12,2) language plpgsql immutable set search_path = '' as $$
declare v_amount numeric(12,2);
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then return null; end if;
  begin v_amount := p_value::numeric(12,2); exception when numeric_value_out_of_range or invalid_text_representation then return null; end;
  if v_amount < 0 then return null; end if;
  return v_amount;
end; $$;

-- Keep the existing Stage 1 ownership policy explicit after the lifecycle change.
alter policy "wishes_update_own" on public.wishes
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create or replace function public.create_custody_wish(
  p_product jsonb, p_evidence jsonb, p_custody_hours smallint, p_idempotency_key uuid
) returns public.wishes
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_existing public.wishes; v_active integer;
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if p_custody_hours not in (24,48,72) then raise exception 'invalid_duration'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(p_product) <> 'object' or jsonb_typeof(p_evidence) <> 'object'
    or nullif(trim(p_product->>'itemId'), '') is null or nullif(trim(p_product->>'title'), '') is null
    or octet_length(p_product::text) > 16384 or octet_length(p_evidence::text) > 65536
    or not public.phase5_valid_promotion_url(p_product->>'promotionUrl')
    or public.phase5_amount_or_null(p_product->>'sellingPrice') is null
    or (p_product ? 'estimatedPrice' and p_product->'estimatedPrice' <> 'null'::jsonb and public.phase5_amount_or_null(p_product->>'estimatedPrice') is null) then raise exception 'invalid_product'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_existing from public.wishes where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;
  select count(*) into v_active from public.wishes where owner_id=v_owner and idempotency_key is not null and status in ('sealed','expired');
  if v_active >= 5 then raise exception 'active_limit_reached'; end if;
  insert into public.wishes(owner_id, product, evidence, custody_hours, demo_duration_seconds, expires_at, status, promotion_url, idempotency_key, last_seen_at)
  values (v_owner, p_product, p_evidence, p_custody_hours, p_custody_hours, now() + make_interval(secs => p_custody_hours), 'sealed', p_product->>'promotionUrl', p_idempotency_key, now())
  returning * into v_existing;
  return v_existing;
end; $$;

create or replace function public.list_my_custody_wishes(p_offset integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_total integer; v_items jsonb; v_summary jsonb; v_page_limit integer := least(greatest(p_limit,1),20); v_offset integer := greatest(p_offset,0);
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  update public.wishes set status='expired', updated_at=now(), last_seen_at=now()
    where owner_id=v_owner and idempotency_key is not null and status='sealed' and expires_at <= now();
  select count(*), jsonb_build_object('wishCount',count(*),'sealedCount',count(*) filter(where status='sealed'),'expiredCount',count(*) filter(where status='expired'),'abandonedCount',count(*) filter(where status='abandoned'),'purchaseIntentCount',count(*) filter(where status='purchased_intent'),'abandonedListedAmount',coalesce(sum(counted_amount) filter(where status='abandoned'),0)) into v_total, v_summary from public.wishes where owner_id=v_owner and idempotency_key is not null;
  select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) into v_items from (select * from public.wishes where owner_id=v_owner and idempotency_key is not null order by case when status='expired' then 0 when status='sealed' then 1 else 2 end, expires_at asc, updated_at desc offset v_offset limit v_page_limit) w;
  return jsonb_build_object('items',v_items,'hasMore',v_offset+v_page_limit<v_total,'nextOffset',case when v_offset+v_page_limit<v_total then v_offset+v_page_limit else null end,'summary',v_summary);
end; $$;

create or replace function public.decide_custody_wish(p_wish_id uuid, p_decision text)
returns public.wishes
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_wish public.wishes;
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if p_decision not in ('purchase','abandon') then raise exception 'invalid_decision'; end if;
  update public.wishes set status='expired', updated_at=now(), last_seen_at=now()
    where id=p_wish_id and owner_id=v_owner and idempotency_key is not null and status='sealed' and expires_at <= now();
  select * into v_wish from public.wishes where id=p_wish_id and owner_id=v_owner and idempotency_key is not null for update;
  if not found then raise exception 'not_found'; end if;
  if v_wish.status in ('purchased_intent','abandoned') then return v_wish; end if;
  if v_wish.status <> 'expired' then raise exception 'wish_not_expired'; end if;
  update public.wishes set status=case when p_decision='purchase' then 'purchased_intent' else 'abandoned' end,
    decision_at=now(), counted_amount=case when p_decision='abandon' then coalesce(public.phase5_amount_or_null(product->>'estimatedPrice'), public.phase5_amount_or_null(product->>'sellingPrice'), 0::numeric(12,2)) else 0::numeric(12,2) end,
    last_seen_at=now(), updated_at=now()
  where id=p_wish_id and owner_id=v_owner and idempotency_key is not null returning * into v_wish;
  return v_wish;
end; $$;

create or replace function public.delete_my_custody_wish(p_wish_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin if auth.uid() is null then raise exception 'authentication_required'; end if; delete from public.wishes where id=p_wish_id and owner_id=auth.uid() and idempotency_key is not null; return found; end; $$;
create or replace function public.clear_my_custody_wishes() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer; begin if auth.uid() is null then raise exception 'authentication_required'; end if; delete from public.wishes where owner_id=auth.uid() and idempotency_key is not null and status in ('purchased_intent','abandoned'); get diagnostics n = row_count; return n; end; $$;

revoke all on function public.create_custody_wish(jsonb,jsonb,smallint,uuid) from public, anon;
revoke all on function public.list_my_custody_wishes(integer,integer) from public, anon;
revoke all on function public.decide_custody_wish(uuid,text) from public, anon;
revoke all on function public.delete_my_custody_wish(uuid) from public, anon;
revoke all on function public.clear_my_custody_wishes() from public, anon;
revoke all on function public.phase5_valid_promotion_url(text) from public, anon, authenticated;
revoke all on function public.phase5_amount_or_null(text) from public, anon, authenticated;
grant execute on function public.create_custody_wish(jsonb,jsonb,smallint,uuid), public.list_my_custody_wishes(integer,integer), public.decide_custody_wish(uuid,text), public.delete_my_custody_wish(uuid), public.clear_my_custody_wishes() to authenticated;

-- SQL-level deployment acceptance: two ordinary users must be unable to read,
-- update or delete each other's rows; direct client INSERT/UPDATE/DELETE must
-- be denied; same-key concurrent creates return one row; concurrent decisions
-- preserve the first result; pre-expiry decisions, invalid prices, invalid URLs
-- and oversized payloads reject; page two must preserve full summary totals.
-- Promotion URL vectors: https://s.click.taobao.com/x, https://detail.tmall.com/x
-- and https://e.tb.cn/x pass; https://eviltaobao.com/x,
-- https://taobao.com.evil.example/x, http://s.click.taobao.com/x,
-- https://user@s.click.taobao.com/x and any control character reject.
-- Amount vectors: sellingPrice and estimatedPrice must convert to numeric(12,2),
-- be non-negative, and stay within the numeric(12,2) range; decision writes use
-- the validated helper and therefore cannot overflow through a second raw cast.
-- Independent deployment only: enable pg_cron after reviewing anonymous
-- detection against current Auth docs. The cleanup job must call a restricted
-- service function that identifies auth.jwt()->>'is_anonymous' safely and deletes
-- only users inactive for 30 days. It is intentionally not implemented/applied here.
