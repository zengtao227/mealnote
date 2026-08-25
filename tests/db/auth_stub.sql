-- Test-only Supabase auth stub.
--
-- Run this only against a disposable PostgreSQL database. It intentionally
-- creates a minimal auth schema so the repository migrations can be exercised
-- without a real Supabase project.

create schema auth;

create table auth.users (
  id uuid primary key
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
