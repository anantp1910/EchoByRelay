// npm run demo:reset
// Calls the reset_demo() SQL function via the service role: deletes all
// non-seed rows and sets demo_state.day = 0. Requires .env.local with
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await db.rpc("reset_demo");
  if (error) {
    console.error(`reset_demo() failed: ${error.message}`);
    process.exit(1);
  }

  console.log("Demo reset: non-seed rows deleted, demo_state.day = 0.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
