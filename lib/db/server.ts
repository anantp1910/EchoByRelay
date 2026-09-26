import "server-only";

import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. Bypasses RLS, so it
// must never be imported into client components. All engine writes go through
// this. (Standalone scripts build their own client from .env.local instead of
// importing this module, to avoid the `server-only` guard outside Next.)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
}
if (!serviceRoleKey) {
  throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
}

export const db = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
