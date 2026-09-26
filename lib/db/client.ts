import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client using the anon (public) key. Read + Realtime only;
// RLS allows anon SELECT but no writes. Person B's pages use this to read and
// subscribe to live updates. Safe to import into client components.
//
// Null-safe: before the env vars arrive, `supabase` is null instead of a client
// built from undefined values. Guard with `isSupabaseConfigured` (or a null
// check) so pages render without crashing.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
