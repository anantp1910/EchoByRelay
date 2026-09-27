"use client";

import { useSyncExternalStore } from "react";

// Demo "sign-in": remembers which portal you chose, only to highlight it in
// the nav. Not authentication; nothing is sent anywhere.

export type DemoRole = "doctor" | "patient" | "pharma";
const KEY = "relay.role";
const EVENT = "relay-role";

export function setDemoRole(role: DemoRole) {
  try {
    localStorage.setItem(KEY, role);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Private mode / blocked storage: the highlight is a nicety, skip it.
  }
}

function read(): DemoRole | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "doctor" || v === "patient" || v === "pharma" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The chosen demo role (null on the server and before any choice). */
export function useDemoRole(): DemoRole | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
