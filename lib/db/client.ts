import { createClient } from "@supabase/supabase-js";

// Browser Supabase client using the anon (public) key. Read + Realtime only;
// RLS allows anon SELECT but no writes. Person B's pages use this to read and
// subscribe to live updates. Safe to import into client components.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
