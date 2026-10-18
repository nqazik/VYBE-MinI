-- =============================================================================
-- VYBE Mini - database schema, security policies and RPC functions
--
-- Run this whole file once in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- It is safe to re-run: it drops and recreates the VYBE objects.
-- WARNING: re-running deletes all rooms, chat history and queues.
--
-- Security model
--   * Every visitor gets an anonymous Supabase Auth user (Authentication ->
--     Sign In / Providers -> "Allow anonymous sign-ins" must be ON). No sign-up form,
--     but every request still carries a real, verifiable user id (auth.uid()).
--   * Rooms are found by a random 10-character code (~50 bits of entropy).
--     Nobody can list rooms: Row Level Security only shows a room to its members.
--   * The ONLY way to become a member is the join_room() function, which checks the
--     code and the 3-person limit. Tables have no INSERT/UPDATE policies for rooms or
--     members, so clients cannot edit them directly.
--   * Playback state can only be changed by the room's host (checked inside the
--     functions below, not in the browser).
--   * No service_role key is ever needed in the browser.
-- =============================================================================

drop table if exists public.queue_items cascade;
drop table if exists public.messages cascade;
drop table if exists public.room_members cascade;
drop table if exists public.rooms cascade;

drop function if exists public.is_room_member(uuid) cascade;
drop function if exists public.is_room_host(uuid) cascade;
drop function if exists public.generate_room_code() cascade;
drop function if exists public.assert_profile(text, text) cascade;
drop function if exists public.create_room(text, text) cascade;
drop function if exists public.join_room(text, text, text) cascade;
drop function if exists public.leave_room(uuid) cascade;
drop function if exists public.touch_member(uuid) cascade;
drop function if exists public.server_time() cascade;
drop function if exists public.set_playback(uuid, boolean, double precision) cascade;
drop function if exists public.load_video(uuid, text, text) cascade;
drop function if exists public.set_video_title(uuid, text, text) cascade;
drop function if exists public.play_next(uuid) cascade;
drop function if exists public.play_queue_item(uuid) cascade;
drop function if exists public.transfer_host(uuid, uuid) cascade;
drop function if exists public.claim_host(uuid) cascade;
drop function if exists public.purge_idle_rooms(integer) cascade;
drop function if exists public.messages_fill() cascade;
drop function if exists public.queue_items_fill() cascade;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  host_id          uuid not null references auth.users (id) on delete cascade,
  max_members      smallint not null default 3 check (max_members between 2 and 3),
  -- Shared playback state. position_sec was valid at state_updated_at (server time).
  video_id         text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_title      text check (char_length(video_title) <= 200),
  is_playing       boolean not null default false,
  position_sec     double precision not null default 0 check (position_sec >= 0),
  state_updated_at timestamptz not null default now(),
  state_seq        bigint not null default 0,
  created_at       timestamptz not null default now()
);

create table public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 24),
  avatar    text not null check (char_length(avatar) between 1 and 16),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default '',
  avatar     text not null default '',
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at);

create table public.queue_items (
  id         uuid primary key default gen_random_uuid(),
  seq        bigint generated always as identity,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  video_id   text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title      text check (char_length(title) <= 200),
  added_by   uuid not null references auth.users (id) on delete cascade,
  added_name text not null default '',
  created_at timestamptz not null default now()
);
create index queue_items_room_seq_idx on public.queue_items (room_id, seq);

-- -----------------------------------------------------------------------------
-- Helper functions used by policies. SECURITY DEFINER so they can read
-- room_members without recursing into its own policy.
-- -----------------------------------------------------------------------------

create function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = auth.uid()
  );
$$;

create function public.is_room_host(p_room uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms
    where id = p_room and host_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.messages     enable row level security;
alter table public.queue_items  enable row level security;

-- Start from zero privileges, then grant only what the app needs.
revoke all on public.rooms, public.room_members, public.messages, public.queue_items
  from public, anon, authenticated;

grant select on public.rooms, public.room_members, public.messages, public.queue_items to authenticated;
grant insert on public.messages, public.queue_items to authenticated;
grant delete on public.queue_items to authenticated;

create policy "members can read their rooms"
  on public.rooms for select to authenticated
  using (public.is_room_member(id));

create policy "members can read the member list"
  on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can read chat"
  on public.messages for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can send chat as themselves"
  on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_room_member(room_id));

create policy "members can read the queue"
  on public.queue_items for select to authenticated
  using (public.is_room_member(room_id));

create policy "members can add to the queue as themselves"
  on public.queue_items for insert to authenticated
  with check (added_by = auth.uid() and public.is_room_member(room_id));

create policy "host or the adder can remove queue items"
  on public.queue_items for delete to authenticated
  using (added_by = auth.uid() or public.is_room_host(room_id));

-- -----------------------------------------------------------------------------
-- Triggers: stop clients spoofing names, cap queue length
-- -----------------------------------------------------------------------------

create function public.messages_fill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  select m.name, m.avatar into new.name, new.avatar
  from public.room_members m
  where m.room_id = new.room_id and m.user_id = new.user_id;
  new.body := btrim(new.body);
  return new;
end;
$$;

create trigger messages_fill_trg
  before insert on public.messages
  for each row execute function public.messages_fill();

create function public.queue_items_fill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (select count(*) from public.queue_items where room_id = new.room_id) >= 30 then
    raise exception 'queue_full';
  end if;
  select m.name into new.added_name
  from public.room_members m
  where m.room_id = new.room_id and m.user_id = new.added_by;
  return new;
end;
$$;

create trigger queue_items_fill_trg
  before insert on public.queue_items
  for each row execute function public.queue_items_fill();

-- -----------------------------------------------------------------------------
-- Functions callable from the app (supabase.rpc). All validate the caller.
-- -----------------------------------------------------------------------------

-- 10 random characters from a 32-symbol alphabet (no I, O, 0, 1) = 50 bits.
-- gen_random_uuid() is cryptographically random; bytes 6 and 8 hold fixed
-- version/variant bits, so they are skipped.
create function public.generate_room_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  picks constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  result text := '';
  i int;
begin
  for i in 1..10 loop
    result := result || substr(alphabet, (get_byte(bytes, picks[i]) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

create function public.assert_profile(p_name text, p_avatar text)
returns void
language plpgsql immutable
as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 then
    raise exception 'invalid_name';
  end if;
  if p_avatar is null or char_length(p_avatar) not between 1 and 16 then
    raise exception 'invalid_avatar';
  end if;
end;
$$;

create function public.server_time()
returns timestamptz
language sql stable
as $$ select now(); $$;

create function public.create_room(p_name text, p_avatar text)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  tries int := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.assert_profile(p_name, p_avatar);

  -- A person can host at most 10 rooms at a time (cheap abuse guard).
  if (select count(*) from public.rooms where host_id = uid) >= 10 then
    raise exception 'too_many_rooms';
  end if;

  loop
    begin
      insert into public.rooms (code, host_id)
      values (public.generate_room_code(), uid)
      returning * into r;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, name, avatar)
  values (r.id, uid, btrim(p_name), p_avatar);

  return r;
end;
$$;

-- Join (or re-join / update your profile in) a room by code.
create function public.join_room(p_code text, p_name text, p_avatar text)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r public.rooms;
  n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.assert_profile(p_name, p_avatar);

  -- Lock the row so two people joining at once cannot both take the last seat.
  select * into r from public.rooms where rooms.code = v_code for update;
  if not found then raise exception 'room_not_found'; end if;

  if exists (select 1 from public.room_members where room_id = r.id and user_id = uid) then
    update public.room_members
       set name = btrim(p_name), avatar = p_avatar, last_seen = now()
     where room_id = r.id and user_id = uid;
    return r;
  end if;

  -- Free seats held by people who vanished (cleared their browser data, etc.).
  delete from public.room_members
   where room_id = r.id and last_seen < now() - interval '2 hours';

  select count(*) into n from public.room_members where room_id = r.id;
  if n >= r.max_members then raise exception 'room_full'; end if;

  -- If the host was among the evicted (or everyone was), the newcomer takes the remote.
  if not exists (select 1 from public.room_members where room_id = r.id and user_id = r.host_id) then
    update public.rooms set host_id = uid where id = r.id returning * into r;
  end if;

  insert into public.room_members (room_id, user_id, name, avatar)
  values (r.id, uid, btrim(p_name), p_avatar);

  return r;
end;
$$;

create function public.touch_member(p_room uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.room_members set last_seen = now()
   where room_id = p_room and user_id = auth.uid();
$$;

-- Leave a room. The host role passes to the longest-standing member; an empty room is deleted.
create function public.leave_room(p_room uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  next_host uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  delete from public.room_members where room_id = p_room and user_id = uid;

  select user_id into next_host
    from public.room_members where room_id = p_room
   order by joined_at limit 1;

  if next_host is null then
    delete from public.rooms where id = p_room;
  else
    update public.rooms set host_id = next_host
     where id = p_room and host_id = uid;
  end if;
end;
$$;

-- Host-only: play / pause / seek. p_position is where the playhead is *at the server's now()*.
create function public.set_playback(p_room uuid, p_playing boolean, p_position double precision)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rooms;
begin
  if p_position is null or p_position = 'NaN'::float8 or p_position = 'Infinity'::float8 then
    raise exception 'invalid_position';
  end if;

  update public.rooms
     set is_playing = p_playing,
         position_sec = greatest(p_position, 0),
         state_updated_at = now(),
         state_seq = state_seq + 1
   where id = p_room and host_id = auth.uid()
  returning * into r;

  if not found then raise exception 'not_host'; end if;
  return r;
end;
$$;

-- Host-only: put a video on for everyone, starting from 0:00.
create function public.load_video(p_room uuid, p_video_id text, p_title text)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rooms;
begin
  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'invalid_video';
  end if;

  update public.rooms
     set video_id = p_video_id,
         video_title = nullif(left(btrim(coalesce(p_title, '')), 200), ''),
         is_playing = true,
         position_sec = 0,
         state_updated_at = now(),
         state_seq = state_seq + 1
   where id = p_room and host_id = auth.uid()
  returning * into r;

  if not found then raise exception 'not_host'; end if;
  return r;
end;
$$;

-- Any member may fill in a missing title for the current video. Does not touch playback state.
create function public.set_video_title(p_room uuid, p_video_id text, p_title text)
returns void
language sql security definer
set search_path = public
as $$
  update public.rooms
     set video_title = nullif(left(btrim(coalesce(p_title, '')), 200), '')
   where id = p_room
     and video_id = p_video_id
     and video_title is null
     and public.is_room_member(id);
$$;

-- Host-only: play the next queued video and remove it from the queue.
create function public.play_next(p_room uuid)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rooms;
  q public.queue_items;
begin
  if not public.is_room_host(p_room) then raise exception 'not_host'; end if;

  select * into q from public.queue_items
   where room_id = p_room order by seq limit 1 for update;
  if not found then raise exception 'queue_empty'; end if;

  delete from public.queue_items where id = q.id;

  update public.rooms
     set video_id = q.video_id,
         video_title = q.title,
         is_playing = true,
         position_sec = 0,
         state_updated_at = now(),
         state_seq = state_seq + 1
   where id = p_room
  returning * into r;
  return r;
end;
$$;

-- Host-only: jump to a specific queued video.
create function public.play_queue_item(p_item uuid)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  r public.rooms;
  q public.queue_items;
begin
  select * into q from public.queue_items where id = p_item for update;
  if not found then raise exception 'queue_empty'; end if;
  if not public.is_room_host(q.room_id) then raise exception 'not_host'; end if;

  delete from public.queue_items where id = q.id;

  update public.rooms
     set video_id = q.video_id,
         video_title = q.title,
         is_playing = true,
         position_sec = 0,
         state_updated_at = now(),
         state_seq = state_seq + 1
   where id = q.room_id
  returning * into r;
  return r;
end;
$$;

-- Host-only: hand the remote to another member.
create function public.transfer_host(p_room uuid, p_new_host uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_room_host(p_room) then raise exception 'not_host'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room and user_id = p_new_host) then
    raise exception 'not_a_member';
  end if;
  update public.rooms set host_id = p_new_host where id = p_room;
end;
$$;

-- Any member may take the remote if the host has been silent for 45+ seconds.
create function public.claim_host(p_room uuid)
returns public.rooms
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  host_seen timestamptz;
begin
  if not public.is_room_member(p_room) then raise exception 'not_a_member'; end if;

  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.host_id = uid then return r; end if;

  select last_seen into host_seen from public.room_members
   where room_id = p_room and user_id = r.host_id;

  if host_seen is not null and host_seen > now() - interval '45 seconds' then
    raise exception 'host_still_here';
  end if;

  update public.rooms set host_id = uid where id = p_room returning * into r;
  return r;
end;
$$;

-- Housekeeping (NOT callable from the app): delete rooms nobody has touched for p_days.
-- Run manually, or schedule it - see README "Cleaning up old rooms".
create function public.purge_idle_rooms(p_days integer default 30)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  with idle as (
    select r.id from public.rooms r
    where greatest(
            r.created_at,
            r.state_updated_at,
            coalesce((select max(m.last_seen) from public.room_members m where m.room_id = r.id), r.created_at)
          ) < now() - make_interval(days => p_days)
  )
  delete from public.rooms where id in (select id from idle);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: nobody by default, then only signed-in (incl. anonymous) users.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_room_member(uuid),
  public.is_room_host(uuid),
  public.server_time(),
  public.create_room(text, text),
  public.join_room(text, text, text),
  public.leave_room(uuid),
  public.touch_member(uuid),
  public.set_playback(uuid, boolean, double precision),
  public.load_video(uuid, text, text),
  public.set_video_title(uuid, text, text),
  public.play_next(uuid),
  public.play_queue_item(uuid),
  public.transfer_host(uuid, uuid),
  public.claim_host(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: broadcast row changes (filtered by the RLS policies above).
-- DELETE events need the full old row to be useful, hence REPLICA IDENTITY FULL.
-- -----------------------------------------------------------------------------

alter table public.room_members replica identity full;
alter table public.queue_items  replica identity full;

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rooms', 'room_members', 'messages', 'queue_items'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
