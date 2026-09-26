// POST /api/checkins doesn't exist yet (and isn't in lib/api/contracts.ts).
// Until it does, any non-2xx or network error means "keep it locally".

import type { CheckIn } from "./types";

export type CheckInDraft = Omit<CheckIn, "id" | "created_at" | "is_seed">;

/** True if the server stored it; false means "not synced yet". */
export async function postCheckIn(draft: CheckInDraft): Promise<boolean> {
  try {
    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    return res.ok;
  } catch {
    return false;
  }
}
