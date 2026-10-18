-- Minimal imitation of the parts of a Supabase project that schema.sql depends on,
-- so the schema and its security policies can be tested on a plain, empty Postgres.
-- NOT needed on a real Supabase project (it already has all of this).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key, is_anonymous boolean not null default true);

-- Same definition Supabase uses: the user id comes from the verified JWT.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create publication supabase_realtime;

-- Supabase hands every new table/function to the API roles by default;
-- schema.sql must claw that back. Mirror it so the test is honest.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
