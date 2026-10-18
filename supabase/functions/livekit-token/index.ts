// Supabase Edge Function: hands a short-lived LiveKit voice token to members of a room.
//
// Why a server function? LiveKit tokens are signed with your LiveKit API *secret*, which must
// never be shipped to browsers. This function checks, with the caller's own Supabase login,
// that they are really a member of the room, then signs a token that only works for that room.
//
// Deploy:  supabase functions deploy livekit-token
// Secrets: supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
// (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!apiKey || !apiSecret) return json({ error: 'voice_not_configured' }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'not_authenticated' }, 401)

  // A client that acts *as the caller*, so Row Level Security decides what they may see.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'not_authenticated' }, 401)
  const user = userData.user

  let roomId = ''
  try {
    roomId = String((await req.json()).room_id ?? '')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!UUID.test(roomId)) return json({ error: 'bad_request' }, 400)

  const { data: member } = await supabase
    .from('room_members')
    .select('name')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return json({ error: 'not_a_member' }, 403)

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id, // the app maps this id back to a member to show who is speaking
    name: member.name,
    ttl: '2h',
  })
  token.addGrant({
    room: `vybe-${roomId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  })

  return json({ token: await token.toJwt() })
})
