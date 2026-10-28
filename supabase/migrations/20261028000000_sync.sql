-- SEO God Mode sync: the Chrome extension and the Android app share one copy of your tracked sites and their history.
-- Every row belongs to one signed-in user. Row Level Security means a user can only ever read or change their own rows;
-- signed-out (anon) requests get nothing.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.

-- One row per tracked website. Deleting a site on one device sets deleted_at, so the other device removes it too.
create table if not exists public.sites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origin text not null check (origin ~ '^https?://[^/]+$' and length(origin) <= 300),
  name text not null default '' check (length(name) <= 200),
  role text not null default 'mine' check (role in ('mine', 'client', 'competitor')),
  competitor_of text check (competitor_of is null or length(competitor_of) <= 300),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 200),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, origin)
);

-- Everything else, stored the way the extension keeps it: one JSON value per key, for example
-- "trend:https://example.com" (score history), "kwpos:..." (Google positions), "kwreport:..." (keyword report),
-- "scan:..." (latest whole-site scan). The newest updated_at wins.
create table if not exists public.site_data (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (length(key) <= 400),
  value jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, key),
  check (value is null or pg_column_size(value) <= 2000000)
);

-- Lets each device fetch only what changed since it last synced.
create index if not exists sites_user_updated_idx on public.sites (user_id, updated_at);
create index if not exists site_data_user_updated_idx on public.site_data (user_id, updated_at);

-- The server sets updated_at, so clocks on different devices can't make an old change win.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before insert or update on public.sites for each row execute function public.touch_updated_at();
drop trigger if exists site_data_touch on public.site_data;
create trigger site_data_touch before insert or update on public.site_data for each row execute function public.touch_updated_at();
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- Only signed-in users, and only their own rows.
alter table public.sites enable row level security;
alter table public.site_data enable row level security;
revoke all on public.sites, public.site_data from anon, public;
grant select, insert, update, delete on public.sites, public.site_data to authenticated;

drop policy if exists sites_own on public.sites;
create policy sites_own on public.sites for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists site_data_own on public.site_data;
create policy site_data_own on public.site_data for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Live updates: a change on one device reaches the other within seconds (Realtime respects the policies above).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sites') then
    alter publication supabase_realtime add table public.sites;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'site_data') then
    alter publication supabase_realtime add table public.site_data;
  end if;
end $$;
