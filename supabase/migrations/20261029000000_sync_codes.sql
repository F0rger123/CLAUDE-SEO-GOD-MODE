-- SEO God Mode sync by code (replaces email sign-in): no account or email needed.
-- Turning on sync in the extension makes a random 20-character sync code (about 100 bits). Every device that knows the
-- code shares one copy of the tracked sites and their history. Synced rows are filed under its
-- SHA-256 hash. The tables can't be read or written directly by anyone using the public key; only the functions
-- below reach them, and each one needs the code. Accounts (username + password, no email) are optional: end of file.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. It removes the email-based tables from
-- 20261028000000_sync.sql (nothing had synced into them). Safe to run again.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

drop table if exists public.sites cascade;
drop table if exists public.site_data cascade;
drop function if exists public.touch_updated_at();

create table if not exists public.sync_sites (
  space text not null,
  origin text not null check (origin ~ '^https?://[^/]+$' and length(origin) <= 300),
  name text not null default '' check (length(name) <= 200),
  role text not null default 'mine' check (role in ('mine', 'client', 'competitor')),
  competitor_of text check (competitor_of is null or length(competitor_of) <= 300),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 200),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (space, origin)
);

create table if not exists public.sync_data (
  space text not null,
  key text not null check (length(key) <= 400),
  value jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (space, key),
  check (value is null or pg_column_size(value) <= 2000000)
);

create index if not exists sync_sites_space_updated_idx on public.sync_sites (space, updated_at);
create index if not exists sync_data_space_updated_idx on public.sync_data (space, updated_at);

-- Locked: RLS on with no policies, and no table rights for the public roles.
alter table public.sync_sites enable row level security;
alter table public.sync_data enable row level security;
revoke all on public.sync_sites, public.sync_data from public, anon, authenticated;

-- The code, checked and hashed. Crockford base32 (no I, L, O, U); dashes and spaces are ignored.
create or replace function private.sgm_space(p_code text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if v !~ '^[0-9A-HJKMNP-TV-Z]{20}$' then raise exception 'That sync code is not valid' using errcode = '22023'; end if;
  return encode(extensions.digest(v, 'sha256'), 'hex');
end $$;

-- Rows changed after p_since, oldest first (at most 500). p_table: 'sites' or 'data'.
create or replace function public.sgm_pull(p_code text, p_table text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s text := private.sgm_space(p_code);
begin
  if p_table = 'sites' then
    return coalesce((select jsonb_agg(to_jsonb(r) - 'space' order by r.updated_at)
      from (select * from public.sync_sites where space = s and updated_at > p_since order by updated_at limit 500) r), '[]'::jsonb);
  elsif p_table = 'data' then
    return coalesce((select jsonb_agg(to_jsonb(r) - 'space' order by r.updated_at)
      from (select * from public.sync_data where space = s and updated_at > p_since order by updated_at limit 500) r), '[]'::jsonb);
  end if;
  raise exception 'Unknown table' using errcode = '22023';
end $$;

-- Save sites (new, changed or deleted). The server stamps updated_at; the newest change wins.
create or replace function public.sgm_push_sites(p_code text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := private.sgm_space(p_code);
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then raise exception 'Send 1 to 200 rows' using errcode = '22023'; end if;
  insert into public.sync_sites as t (space, origin, name, role, competitor_of, keywords, added_at, deleted_at, updated_at)
  select s, r.origin, coalesce(r.name, ''), coalesce(r.role, 'mine'), r.competitor_of, coalesce(r.keywords, '{}'), coalesce(r.added_at, now()), r.deleted_at, clock_timestamp()
  from jsonb_to_recordset(p_rows) as r(origin text, name text, role text, competitor_of text, keywords text[], added_at timestamptz, deleted_at timestamptz)
  on conflict (space, origin) do update set name = excluded.name, role = excluded.role, competitor_of = excluded.competitor_of,
    keywords = excluded.keywords, added_at = excluded.added_at, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
end $$;

-- Save history, positions, keyword reports and scans (one JSON value per key; null value = deleted).
create or replace function public.sgm_push_data(p_code text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := private.sgm_space(p_code);
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'Send 1 to 50 rows' using errcode = '22023'; end if;
  insert into public.sync_data as t (space, key, value, deleted_at, updated_at)
  select s, r.key, r.value, r.deleted_at, clock_timestamp()
  from jsonb_to_recordset(p_rows) as r(key text, value jsonb, deleted_at timestamptz)
  on conflict (space, key) do update set value = excluded.value, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
end $$;

revoke all on function public.sgm_pull(text, text, timestamptz), public.sgm_push_sites(text, jsonb), public.sgm_push_data(text, jsonb) from public;
grant execute on function public.sgm_pull(text, text, timestamptz), public.sgm_push_sites(text, jsonb), public.sgm_push_data(text, jsonb) to anon, authenticated;
revoke all on function private.sgm_space(text) from public, anon, authenticated;

-- Optional accounts: a username and password, made in the app or the extension. No email, and nothing to set up in
-- Supabase Auth. An account only remembers its sync code, so signing in on a new phone or computer finds your sites
-- without typing the code. Passwords are stored as bcrypt hashes. Ten wrong passwords lock the account for 15 minutes.
create table if not exists private.sgm_accounts (
  name text primary key check (name ~ '^[a-z0-9._@-]{3,60}$'),
  pw text not null,
  code text not null,
  failed int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.sgm_accounts from public, anon, authenticated;

-- p_create true: make the account for p_code (this device's code). false: sign in. Returns {"code": ...} or {"error": ...}
-- (an error is returned, not raised, so a wrong password still counts toward the lock).
create or replace function public.sgm_account(p_name text, p_password text, p_create boolean, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n text := lower(btrim(coalesce(p_name, '')));
  a private.sgm_accounts;
begin
  if n !~ '^[a-z0-9._@-]{3,60}$' then return jsonb_build_object('error', 'Pick a username of 3 to 60 letters, numbers, dots, dashes or underscores.'); end if;
  if length(coalesce(p_password, '')) < 8 or length(p_password) > 72 then return jsonb_build_object('error', 'Use a password of 8 to 72 characters.'); end if;
  if p_create then
    perform private.sgm_space(p_code);
    if exists (select 1 from private.sgm_accounts where name = n) then return jsonb_build_object('error', 'That username is taken. Pick another, or sign in.'); end if;
    insert into private.sgm_accounts (name, pw, code)
      values (n, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), upper(regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g')));
    return jsonb_build_object('code', (select code from private.sgm_accounts where name = n));
  end if;
  select * into a from private.sgm_accounts where name = n for update;
  if not found then return jsonb_build_object('error', 'Wrong username or password.'); end if;
  if a.locked_until > now() then return jsonb_build_object('error', 'Too many wrong passwords. Try again in 15 minutes.'); end if;
  if a.pw = extensions.crypt(p_password, a.pw) then
    update private.sgm_accounts set failed = 0, locked_until = null where name = n;
    return jsonb_build_object('code', a.code);
  end if;
  update private.sgm_accounts set failed = case when a.failed + 1 >= 10 then 0 else a.failed + 1 end,
    locked_until = case when a.failed + 1 >= 10 then now() + interval '15 minutes' end where name = n;
  return jsonb_build_object('error', 'Wrong username or password.');
end $$;

revoke all on function public.sgm_account(text, text, boolean, text) from public;
grant execute on function public.sgm_account(text, text, boolean, text) to anon, authenticated;
