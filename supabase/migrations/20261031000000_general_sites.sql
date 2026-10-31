-- Lets a tracked site be "general": a site you just want to keep an eye on, not yours, a client's or a competitor's.
alter table public.sync_sites drop constraint if exists sync_sites_role_check;
alter table public.sync_sites add constraint sync_sites_role_check check (role in ('mine', 'client', 'competitor', 'general'));
