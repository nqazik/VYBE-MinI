import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config'

/**
 * One shared browser client. It only ever holds the PUBLIC key; what a visitor may read or
 * change is decided by the Row Level Security policies in supabase/schema.sql.
 * When the app isn't configured yet we still create a client (with dummy values) so imports
 * don't crash - the setup screen is shown before anything calls it.
 */
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'not-configured',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  },
)
