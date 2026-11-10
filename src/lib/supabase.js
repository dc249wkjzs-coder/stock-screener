import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

// With no Supabase settings the site runs in demo mode with sample numbers.
export const DEMO = !url || !key
export const supabase = DEMO ? null : createClient(url, key)
