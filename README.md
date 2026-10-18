# VYBE Mini 🍿

A tiny, private **watch-together app** for you and up to two friends. Open it on your phones, join the same room, paste a YouTube link, and watch in sync while you chat. Installable on the home screen of Android and iPhone — no App Store, no Play Store.

- **Rooms** – private, 10-character code (~50 bits, e.g. `K7M2Q-9XWPD`) + shareable invitation link, max 3 people, no accounts.
- **Synced YouTube** – play / pause / seek / change video for everyone, late joiners and reconnects catch up automatically.
- **Chat** – real-time, with names, avatars and timestamps.
- **Shared queue** – anyone adds videos, the host plays them (and the queue auto-advances when a video ends).
- **Voice chat** *(optional)* – WebRTC through LiveKit, with mute / unmute and microphone-permission handling.
- **PWA** – installable, themed (Midnight / Twilight / Daylight).

Stack: React 19 + TypeScript, Vite, Tailwind CSS v4, Supabase (Postgres + Realtime + anonymous auth). There is **no custom backend server**; all rules live in Postgres (`supabase/schema.sql`).

---

## 1. Set it up (about 15 minutes, free)

You need [Node.js 20+](https://nodejs.org) and a free [Supabase](https://supabase.com) account.

### Step 1 — Create a Supabase project
Supabase dashboard → **New project**. Pick any name/region and a database password (you won't need it in the app).

### Step 2 — Create the database
Dashboard → **SQL Editor** → **New query** → paste the whole of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
This creates the tables, the Row Level Security policies, the functions the app calls, and switches on Realtime for the four tables. It is safe to re-run, but note that re-running **deletes all rooms, chat and queues**.

### Step 3 — Allow anonymous sign-ins
Dashboard → **Authentication → Sign In / Providers** → switch **“Allow anonymous sign-ins”** ON.
(Everyone gets a hidden, real user id without a sign-up form. This is what makes “only members can read a room” enforceable.)

### Step 4 — Copy your keys
Dashboard → **Project Settings → API**. Then in this folder:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | the **Project URL** |
| `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key — the *public* one |
| `VITE_LIVEKIT_URL` | leave empty unless you set up voice chat (below) |

> ⚠️ Never put the `service_role` / secret key anywhere in this project. The app only needs the public key; Row Level Security does the protecting.

### Step 5 — Run it

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173`. To try it with a friend on a phone on the same Wi-Fi, open the `Network:` address that Vite prints.

### Try it alone with two “people”
Open the app in a normal window and in a **private/incognito window** (they get different anonymous identities). Create a room in one, copy the invitation, join from the other. Press play as host and watch the second window follow; send chat messages; add to the queue.

---

## 2. Deploy it (free / cheap)

Any static host works because the app is just HTML + JS. All three below have free tiers and give you the **HTTPS** that phones need for installing the app and for microphone access.

**Cloudflare Pages** *(recommended – free, fast)*
1. Push this folder to a GitHub repository.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command `npm run build`, output directory `dist`.
4. Add the environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and `VITE_LIVEKIT_URL`).
5. Deploy. `public/_redirects` already makes `/join/CODE` and `/room/CODE` links work.

**Vercel** – Import the repo; framework preset “Vite”; add the same env vars. `vercel.json` handles link rewrites.

**Netlify** – Same idea; build `npm run build`, publish `dist`. `public/_redirects` is honoured.

After deploying, nothing else is needed in Supabase — the invitation links simply use your new domain.

---

## 3. Install it on phones

**Android (Chrome)**
1. Open your site’s address in Chrome.
2. Tap the **⋮** menu → **Install app** (or **Add to Home screen**).
3. Open VYBE from the home screen like any app.

**iPhone / iPad (Safari — must be Safari)**
1. Open your site’s address in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open VYBE from the home screen.

> 💡 **iPhone tip:** the home-screen app and Safari don’t share data, so the installed app counts as a *new device* (new anonymous identity, and you’ll re-enter your name). **Install first, then join your room from the installed app.** If you already joined from Safari, tap **Leave room** there first so you don’t use up one of the 3 seats. (Seats held by people who vanished are freed automatically after 2 hours.)

---

## 4. Using it

- **Home** → pick a name + avatar → **Create a private room**. Send the invitation link to your friends (copy button / share sheet in the **People** tab and the room header).
- **Join** → open the link, or enter the code (pasting a whole link into the code box works too).
- **Host** (the crown 👑): whoever creates the room. Only the host plays, pauses, seeks and changes the video — everyone else’s player follows. The host can hand over with **Make host**; if the host disappears for a while anyone can **take the remote**.
- **Add video**: host → *Play now* or *Add to queue*; everyone else → *Add to queue*. Host taps ▶ on a queue item or **Play next**.
- **“Tap to join the show”**: phones refuse to autoplay video until you touch the page. If that happens, you’ll see this button — tap it once.
- **Leave room** frees your seat. The ← arrow just goes Home and keeps your seat.

### Good to know about YouTube
- The app uses YouTube’s official embedded player. It doesn’t download videos or remove ads; **ads can play** on each person’s own device and may briefly put them out of step. The sync loop catches them up as soon as the ad ends.
- Some videos can’t be embedded (the owner turned it off, age restrictions, music labels). You’ll get a clear message and can pick another one.
- Embeds need a real website address: `localhost` and your deployed `https://` domain both work; opening the built files straight from disk (`file://`) doesn’t.

---

## 5. Voice chat (optional)

Voice uses [LiveKit](https://livekit.io) (free “Build” tier is plenty for 3 friends). It’s completely optional — without it the 🎧 button simply doesn’t appear. It needs a tiny server function because LiveKit tokens are signed with a secret that must never be in the browser.

1. Create a free project at <https://cloud.livekit.io>. Note the **WebSocket URL** (`wss://…livekit.cloud`), **API key** and **API secret**.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   ```
3. Store the secrets and deploy the function (it lives in `supabase/functions/livekit-token`):
   ```bash
   supabase secrets set LIVEKIT_API_KEY=your-key LIVEKIT_API_SECRET=your-secret
   supabase functions deploy livekit-token
   ```
4. Put the WebSocket URL in `.env.local` (and in your host’s env vars): `VITE_LIVEKIT_URL=wss://your-project.livekit.cloud`, then rebuild/redeploy.

The function only issues a token if the caller is a member of that room, and the token only works for that room. Tap 🎧 in the room header to join; the browser will ask for microphone permission. If you deny it you stay in as a listener, and the mic button tells you how to fix it. **Use headphones** — otherwise your microphone picks up the video’s sound.

---

## 6. How it works (and why it stays in sync)

- The `rooms` row stores the **shared playback state**: video, playing/paused, position, and a *server timestamp* of when that position was true.
- Every device — host included — runs a small loop that asks “where should the playhead be *right now*?” (position + time since the server timestamp, measured against the **server clock**, not the phone’s) and fixes its own player if it differs by more than ~1 second.
- Player events are never sent to other people. Only the host’s on-screen controls send commands, and the database refuses commands from anyone else. So there are no echo loops by construction.
- Realtime delivers changes instantly; a heartbeat + re-read on reconnect / when the app returns to the foreground heals anything missed. Slow loaders simply sync when their player is ready.

## 7. Security model

- Every visitor is an **anonymous Supabase user**. Tables have Row Level Security: you can only read rooms, members, chat and queue of rooms **you are a member of**; rooms can’t be listed or guessed.
- The only way in is the `join_room` function, which checks the code and the 3-person limit (with a row lock so two people can’t grab the last seat). Chat names/avatars are filled in by the database, so nobody can impersonate anyone.
- Playback commands are checked *in the database* for host rights. The browser holds only the public key.
- Stored data: display name, avatar, chat messages, queue — nothing else. No emails, no IPs.
- The room code is a bearer secret (anyone with it can join if a seat is free). Share links only with friends.
- Presence uses a public Realtime channel named after the room’s internal id (known only to members), carrying no data other than “someone is here”.

### Cleaning up old rooms
Rooms don’t expire by themselves. To delete rooms untouched for 30 days, run occasionally in the SQL Editor:
```sql
select public.purge_idle_rooms(30);
```
or schedule it (Dashboard → Database → Extensions → enable `pg_cron`):
```sql
select cron.schedule('vybe-purge', '0 4 * * *', $$ select public.purge_idle_rooms(30) $$);
```
(Free Supabase projects also pause after a week with no activity — just press “Restore” in the dashboard.)

---

## 8. Project layout

```
src/
  pages/        Home, Join, Room (the watch screen), Settings, Setup
  components/   Player (YouTube + sync), Chat, Queue, People, AddVideo, VoiceBar, ui
  hooks/        useSession (anonymous sign-in), useSettings, useRoom (data + realtime), useVoice
  lib/          sync.ts (pure sync maths, unit-tested), youtube.ts, api.ts, clock.ts, code.ts ...
supabase/
  schema.sql                 tables, RLS policies, functions, realtime
  functions/livekit-token/   optional voice-token function
  tests/                     SQL tests (membership, host-only, limits, ...)
scripts/                     make-icons.py, test-schema.sh
public/                      PWA icons, SPA redirect file
```

## 9. Scripts & tests

```bash
npm run dev         # dev server
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build
npm test            # unit tests for sync maths, YouTube URL parsing, room codes
bash scripts/test-schema.sh   # runs schema.sql + SQL security tests on a throw-away local PostgreSQL
npm run icons       # regenerate the PWA icons (needs Python + Pillow)
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| “One more step” screen | `.env.local` missing or still has placeholder values; restart `npm run dev`. |
| “Anonymous sign-ins are switched off” | Step 3. |
| “The database isn’t set up yet” | Run `supabase/schema.sql` (Step 2). |
| Chat/queue only update after refresh | Realtime isn’t enabled for the tables — re-run `schema.sql`. |
| “Room full” but only 2 people are there | A stale seat (e.g. same person on Safari *and* the installed app). Wait 2 h, or have that person **Leave room** on the other device. |
| Video says it can’t be played | Owner disabled embedding; use another video. |
| Black player / “Couldn’t load the YouTube player” | Ad blocker or network blocking `youtube.com`; try without it. |
| Stuck on “Tap to join the show” | Tap it once — your browser needs a touch before it allows playback. |
