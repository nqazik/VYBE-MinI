-- Behavioural tests for schema.sql: access control, room capacity, host-only controls,
-- chat, queue and cleanup. Run with:  psql -v ON_ERROR_STOP=1 -f supabase/tests/10-schema-tests.sql
-- (after 00-supabase-stub.sql and ../schema.sql). Any failed assertion aborts with an error.

\set QUIET on
\pset tuples_only on
set client_min_messages = notice;

-- ---------------------------------------------------------------- test helpers
drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon, authenticated;

create function t.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false); end $$;

create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Run `stmt`; it must fail with an error containing `expected`.
create function t.raises(stmt text, expected text, msg text) returns void language plpgsql as $$
declare raised boolean := false; err text;
begin
  begin execute stmt;
  exception when others then raised := true; err := sqlerrm; end;
  if not raised then raise exception 'ASSERT FAILED: % (expected error "%", but it succeeded)', msg, expected; end if;
  if err not ilike '%' || expected || '%' then
    raise exception 'ASSERT FAILED: % (expected error "%", got "%")', msg, expected, err;
  end if;
  raise notice 'ok - %', msg;
end $$;

create function t.scalar_int(stmt text) returns int language plpgsql as $$
declare v int; begin execute stmt into v; return v; end $$;

grant execute on all functions in schema t to anon, authenticated;

-- ---------------------------------------------------------------- fixtures (as superuser)
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- A: host
  ('00000000-0000-0000-0000-00000000000b'),  -- B
  ('00000000-0000-0000-0000-00000000000c'),  -- C
  ('00000000-0000-0000-0000-00000000000d'),  -- D: 4th person
  ('00000000-0000-0000-0000-00000000000e');  -- E: outsider

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

set role authenticated;

-- ---------------------------------------------------------------- creating a room
select t.as_user('00000000-0000-0000-0000-00000000000a');
do $$
declare r public.rooms;
begin
  r := public.create_room('  Alice ', '🦊');
  perform t.ok(r.code ~ '^[A-HJ-NP-Z2-9]{10}$', 'room code is 10 chars from the safe alphabet');
  perform t.ok(r.host_id = '00000000-0000-0000-0000-00000000000a', 'creator is host');
  perform t.ok((select name from public.room_members where room_id = r.id) = 'Alice', 'creator is a member, name trimmed');
  insert into ctx values ('code', r.code), ('room', r.id::text);
end $$;

select t.raises($$select public.create_room('', '🦊')$$, 'invalid_name', 'empty display name is rejected');
select t.raises($$select public.create_room(repeat('x', 25), '🦊')$$, 'invalid_name', 'over-long display name is rejected');

-- ---------------------------------------------------------------- joining
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(t.scalar_int('select count(*)::int from public.rooms') = 0, 'non-member cannot see any room (no listing)');
do $$
declare r public.rooms; c text := (select v from ctx where k = 'code');
begin
  r := public.join_room(substr(lower(c), 1, 5) || '-' || substr(lower(c), 6), 'Bob', '🐼');
  perform t.ok(r.id::text = (select v from ctx where k = 'room'), 'B joins with a lower-case, dashed code');
end $$;
select t.ok(t.scalar_int('select count(*)::int from public.rooms') = 1, 'member can see the room');
select t.ok(t.scalar_int('select count(*)::int from public.room_members') = 2, 'member sees both participants');

select t.raises($$select public.join_room('AAAAAAAAAA', 'Bob', '🐼')$$, 'room_not_found', 'unknown code is rejected');
select t.raises($$select public.join_room('', 'Bob', '🐼')$$, 'room_not_found', 'empty code is rejected');

select t.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin perform public.join_room((select v from ctx where k = 'code'), 'Cleo', '🦄'); end $$;

select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.raises(format($$select public.join_room(%L, 'Dan', '🐙')$$, (select v from ctx where k = 'code')),
                'room_full', 'a 4th person cannot join (max 3)');

select t.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.join_room((select v from ctx where k = 'code'), 'Bobby', '🐧');
  perform t.ok((select name from public.room_members where user_id = '00000000-0000-0000-0000-00000000000b') = 'Bobby',
               're-joining updates the profile instead of taking a second seat');
  perform t.ok((select count(*) from public.room_members) = 3, 'still exactly 3 members');
end $$;

-- ---------------------------------------------------------------- outsiders & direct writes
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.ok(t.scalar_int('select count(*)::int from public.rooms') = 0, 'outsider sees no rooms');
select t.ok(t.scalar_int('select count(*)::int from public.room_members') = 0, 'outsider sees no members');
select t.ok(t.scalar_int('select count(*)::int from public.messages') = 0, 'outsider sees no chat');
select t.ok(t.scalar_int('select count(*)::int from public.queue_items') = 0, 'outsider sees no queue');
select t.raises(format($$insert into public.messages (room_id, user_id, body) values (%L, auth.uid(), 'hi')$$, (select v from ctx where k = 'room')),
                'row-level security', 'outsider cannot post chat');
select t.raises(format($$select public.set_playback(%L, true, 5)$$, (select v from ctx where k = 'room')), 'not_host', 'outsider cannot control playback');
select t.raises(format($$select public.transfer_host(%L, auth.uid())$$, (select v from ctx where k = 'room')), 'not_host', 'outsider cannot take the host role');
select t.raises(format($$select public.claim_host(%L)$$, (select v from ctx where k = 'room')), 'not_a_member', 'outsider cannot claim host');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.raises($$update public.rooms set host_id = auth.uid()$$, 'permission denied', 'members cannot update rooms directly');
select t.raises($$delete from public.rooms$$, 'permission denied', 'members cannot delete rooms directly');
select t.raises(format($$insert into public.room_members (room_id, user_id, name, avatar) values (%L, '00000000-0000-0000-0000-00000000000e', 'E', 'x')$$, (select v from ctx where k = 'room')),
                'permission denied', 'members cannot add members directly');
select t.raises($$update public.room_members set name = 'hax'$$, 'permission denied', 'members cannot edit members directly');
select t.raises($$select public.purge_idle_rooms(0)$$, 'permission denied', 'purge_idle_rooms is not callable by app users');
select t.raises($$select public.generate_room_code()$$, 'permission denied', 'internal helpers are not callable by app users');

-- ---------------------------------------------------------------- anonymous (not signed in) role
reset role;
set role anon;
select t.raises($$select * from public.rooms$$, 'permission denied', 'anon role cannot read rooms');
select t.raises($$select public.create_room('x', 'y')$$, 'permission denied', 'anon role cannot create rooms');
reset role;
set role authenticated;
select t.as_user(null);
select t.raises($$select public.create_room('Ghost', '👻')$$, 'not_authenticated', 'requests without a user id are rejected');

-- ---------------------------------------------------------------- playback control (host only)
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.raises(format($$select public.set_playback(%L, true, 5)$$, (select v from ctx where k = 'room')), 'not_host', 'non-host cannot play/pause/seek');
select t.raises(format($$select public.load_video(%L, 'dQw4w9WgXcQ', 't')$$, (select v from ctx where k = 'room')), 'not_host', 'non-host cannot change the video');

select t.as_user('00000000-0000-0000-0000-00000000000a');
do $$
declare r public.rooms; room uuid := (select v from ctx where k = 'room')::uuid; seq0 bigint;
begin
  r := public.load_video(room, 'dQw4w9WgXcQ', '  Never Gonna  ');
  perform t.ok(r.video_id = 'dQw4w9WgXcQ' and r.is_playing and r.position_sec = 0, 'host loads a video: playing from 0');
  perform t.ok(r.video_title = 'Never Gonna', 'title is trimmed');
  seq0 := r.state_seq;
  r := public.set_playback(room, false, 42.5);
  perform t.ok(not r.is_playing and r.position_sec = 42.5 and r.state_seq = seq0 + 1, 'host pauses at 42.5s; sequence number increments');
  r := public.set_playback(room, true, -3);
  perform t.ok(r.position_sec = 0, 'negative positions are clamped to 0');
end $$;
select t.raises(format($$select public.load_video(%L, 'short', 'x')$$, (select v from ctx where k = 'room')), 'invalid_video', 'malformed video id is rejected');
select t.raises(format($$select public.load_video(%L, 'dQw4w9WgXc!', 'x')$$, (select v from ctx where k = 'room')), 'invalid_video', 'video id with bad characters is rejected');
select t.raises(format($$select public.set_playback(%L, true, 'NaN')$$, (select v from ctx where k = 'room')), 'invalid_position', 'NaN position is rejected');

-- title fill-in by any member, without touching playback
select t.as_user('00000000-0000-0000-0000-00000000000c');
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid; before_seq bigint;
begin
  select state_seq into before_seq from public.rooms where id = room;
  perform public.set_video_title(room, 'dQw4w9WgXcQ', 'Should not overwrite');
  perform t.ok((select video_title from public.rooms where id = room) = 'Never Gonna', 'an existing title is not overwritten');
end $$;

-- ---------------------------------------------------------------- chat
select t.as_user('00000000-0000-0000-0000-00000000000b');
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid; m public.messages;
begin
  insert into public.messages (room_id, user_id, body, name, avatar)
  values (room, auth.uid(), '  hello there  ', 'IM-SPOOFING', 'x') returning * into m;
  perform t.ok(m.name = 'Bobby' and m.avatar = '🐧', 'sender name/avatar come from membership, not from the client');
  perform t.ok(m.body = 'hello there', 'message body is trimmed');
end $$;
select t.raises(format($$insert into public.messages (room_id, user_id, body) values (%L, '00000000-0000-0000-0000-00000000000c', 'as cleo')$$, (select v from ctx where k = 'room')),
                'row-level security', 'cannot send a message as someone else');
select t.raises(format($$insert into public.messages (room_id, user_id, body) values (%L, auth.uid(), '   ')$$, (select v from ctx where k = 'room')),
                'violates check constraint', 'blank messages are rejected');
select t.raises(format($$insert into public.messages (room_id, user_id, body) values (%L, auth.uid(), repeat('a', 501))$$, (select v from ctx where k = 'room')),
                'violates check constraint', 'messages over 500 characters are rejected');
select t.raises($$update public.messages set body = 'edited'$$, 'permission denied', 'messages cannot be edited');
select t.raises($$delete from public.messages$$, 'permission denied', 'messages cannot be deleted');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok(t.scalar_int('select count(*)::int from public.messages') = 1, 'other members receive the message');

-- ---------------------------------------------------------------- queue
select t.as_user('00000000-0000-0000-0000-00000000000b');
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid;
begin
  insert into public.queue_items (room_id, video_id, title, added_by) values (room, 'aaaaaaaaaaa', 'First', auth.uid());
  insert into public.queue_items (room_id, video_id, title, added_by) values (room, 'bbbbbbbbbbb', 'Second', auth.uid());
  perform t.ok((select added_name from public.queue_items where video_id = 'aaaaaaaaaaa') = 'Bobby', 'queue item records who added it');
end $$;
select t.raises(format($$insert into public.queue_items (room_id, video_id, added_by) values (%L, 'ccccccccccc', '00000000-0000-0000-0000-00000000000c')$$, (select v from ctx where k = 'room')),
                'row-level security', 'cannot queue a video as someone else');
select t.raises(format($$insert into public.queue_items (room_id, video_id, added_by) values (%L, 'nope', auth.uid())$$, (select v from ctx where k = 'room')),
                'violates check constraint', 'malformed video id is rejected in the queue');
select t.raises(format($$select public.play_next(%L)$$, (select v from ctx where k = 'room')), 'not_host', 'non-host cannot play the next video');

select t.as_user('00000000-0000-0000-0000-00000000000c');
do $$ declare n int; begin
  delete from public.queue_items where video_id = 'aaaaaaaaaaa';
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'a member who is neither the adder nor host cannot remove an item');
end $$;

select t.as_user('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  delete from public.queue_items where video_id = 'bbbbbbbbbbb';
  get diagnostics n = row_count;
  perform t.ok(n = 1, 'the adder can remove their own item');
  insert into public.queue_items (room_id, video_id, title, added_by)
  values ((select v from ctx where k = 'room')::uuid, 'bbbbbbbbbbb', 'Second', auth.uid());
end $$;

select t.as_user('00000000-0000-0000-0000-00000000000a');
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid; r public.rooms; q uuid;
begin
  r := public.play_next(room);
  perform t.ok(r.video_id = 'aaaaaaaaaaa' and r.video_title = 'First' and r.is_playing and r.position_sec = 0, 'play_next starts the oldest queued video');
  perform t.ok((select count(*) from public.queue_items where room_id = room) = 1, 'play_next removes it from the queue');
  select id into q from public.queue_items where room_id = room;
  r := public.play_queue_item(q);
  perform t.ok(r.video_id = 'bbbbbbbbbbb', 'host can jump to a specific queued video');
end $$;
select t.raises(format($$select public.play_next(%L)$$, (select v from ctx where k = 'room')), 'queue_empty', 'play_next on an empty queue errors cleanly');

-- queue cap
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid; i int;
begin
  for i in 1..30 loop
    insert into public.queue_items (room_id, video_id, added_by) values (room, lpad(i::text, 11, 'q'), auth.uid());
  end loop;
end $$;
select t.raises(format($$insert into public.queue_items (room_id, video_id, added_by) values (%L, 'zzzzzzzzzzz', auth.uid())$$, (select v from ctx where k = 'room')),
                'queue_full', 'the queue is capped at 30 items');

-- ---------------------------------------------------------------- host transfer / claim / leave
do $$
declare room uuid := (select v from ctx where k = 'room')::uuid;
begin
  perform public.transfer_host(room, '00000000-0000-0000-0000-00000000000b');
  perform t.ok((select host_id from public.rooms where id = room) = '00000000-0000-0000-0000-00000000000b', 'host hands the remote to B');
end $$;
select t.raises(format($$select public.set_playback(%L, false, 1)$$, (select v from ctx where k = 'room')), 'not_host', 'the previous host lost control');
select t.raises(format($$select public.transfer_host(%L, '00000000-0000-0000-0000-00000000000e')$$, (select v from ctx where k = 'room')), 'not_host', 'only the current host can transfer');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.raises(format($$select public.transfer_host(%L, '00000000-0000-0000-0000-00000000000e')$$, (select v from ctx where k = 'room')), 'not_a_member', 'cannot hand the remote to a non-member');

select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.raises(format($$select public.claim_host(%L)$$, (select v from ctx where k = 'room')), 'host_still_here', 'cannot take the remote from an active host');

reset role;
update public.room_members set last_seen = now() - interval '5 minutes' where user_id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');
do $$ declare room uuid := (select v from ctx where k = 'room')::uuid; begin
  perform public.claim_host(room);
  perform t.ok((select host_id from public.rooms where id = room) = '00000000-0000-0000-0000-00000000000c', 'a member can take the remote after the host has been silent');
end $$;

-- host leaves -> next-oldest member becomes host; last one out deletes the room
do $$ begin
  perform public.leave_room((select v from ctx where k = 'room')::uuid);
end $$;
select t.ok(t.scalar_int('select count(*)::int from public.rooms') = 0, 'after leaving, the room is no longer visible to that person');
reset role;  -- inspect the result as superuser (the leaver can no longer see the room, by design)
do $$ declare room uuid := (select v from ctx where k = 'room')::uuid; begin
  perform t.ok((select count(*) from public.room_members where room_id = room) = 2, 'leaving removes the membership');
  perform t.ok((select host_id from public.rooms where id = room) <> '00000000-0000-0000-0000-00000000000c', 'host role passes on when the host leaves');
  perform t.ok((select host_id from public.rooms where id = room) in (select user_id from public.room_members where room_id = room), 'the new host is a current member');
end $$;
set role authenticated;

-- stale members are evicted to make room for a newcomer
reset role;
update public.room_members set last_seen = now() - interval '3 hours' where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.room_members (room_id, user_id, name, avatar)
  select id, '00000000-0000-0000-0000-00000000000d', 'Dan', '🐙' from public.rooms limit 1;
update public.room_members set last_seen = now() - interval '3 hours' where user_id = '00000000-0000-0000-0000-00000000000d';
insert into public.room_members (room_id, user_id, name, avatar)
  select id, '00000000-0000-0000-0000-00000000000c', 'Cleo', '🦄' from public.rooms limit 1;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  perform public.join_room((select code from (select v as code from ctx where k = 'code') x), 'Eve', '🦉');
  perform t.ok((select count(*) from public.room_members) <= 3, 'stale members were evicted so the newcomer fits (still max 3)');
  perform t.ok(exists (select 1 from public.room_members where user_id = '00000000-0000-0000-0000-00000000000e'), 'newcomer is in');
end $$;

-- ---------------------------------------------------------------- housekeeping + realtime publication
reset role;
do $$ declare n int; begin
  update public.rooms set created_at = now() - interval '90 days', state_updated_at = now() - interval '90 days';
  update public.room_members set last_seen = now() - interval '90 days';
  n := public.purge_idle_rooms(30);
  perform t.ok(n = 1, 'purge_idle_rooms removes rooms idle for 30+ days');
  perform t.ok((select count(*) from public.room_members) = 0 and (select count(*) from public.messages) = 0 and (select count(*) from public.queue_items) = 0,
               'purging a room cascades to members, chat and queue');
end $$;

do $$ begin
  perform t.ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') = 4,
               'all 4 tables are in the realtime publication');
end $$;

-- re-running the schema file must work (idempotent)
\echo ALL SQL TESTS PASSED
