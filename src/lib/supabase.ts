import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[FieldCheck] Missing Supabase env vars.\n' +
    'Copy .env.example → .env and fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.\n' +
    'Find these in: Supabase Dashboard → Project Settings → API'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})
