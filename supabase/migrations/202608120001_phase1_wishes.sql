-- Phase 1 identity/persistence baseline. This migration is intentionally limited
-- to test wishes; product search and countdown UI remain outside this phase.
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product jsonb not null,
  evidence jsonb not null default '{"expert": [], "experience": []}'::jsonb,
  custody_hours smallint not null,
  demo_duration_seconds smallint not null,
  expires_at timestamptz not null,
  status text not null default 'sealed',
  decision_at timestamptz,
  promotion_url text,
  counted_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishes_custody_hours_check check (custody_hours in (24, 48, 72)),
  constraint wishes_demo_duration_seconds_check check (demo_duration_seconds in (24, 48, 72)),
  constraint wishes_status_check check (status in ('sealed', 'expired', 'purchased_intent', 'abandoned')),
  constraint wishes_counted_amount_check check (counted_amount >= 0),
  constraint wishes_product_object_check check (jsonb_typeof(product) = 'object'),
  constraint wishes_evidence_object_check check (jsonb_typeof(evidence) = 'object')
);

create index if not exists wishes_owner_status_expires_at_idx on public.wishes (owner_id, status, expires_at);
create index if not exists wishes_owner_created_at_idx on public.wishes (owner_id, created_at desc);

grant select, insert, update, delete on table public.wishes to authenticated;
alter table public.wishes enable row level security;
alter table public.wishes force row level security;

create policy "wishes_select_own" on public.wishes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "wishes_insert_own" on public.wishes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "wishes_update_own" on public.wishes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "wishes_delete_own" on public.wishes for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.set_wishes_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger wishes_set_updated_at before update on public.wishes
for each row execute function public.set_wishes_updated_at();
