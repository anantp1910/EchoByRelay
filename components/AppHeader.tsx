"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { useDemoRole } from "./role";
import { BRAND } from "./brand";
import { HAS_SUPABASE } from "./useLiveEvents";
import { useMounted } from "./useMounted";

const NAV = [
  { href: "/doctor", label: "Doctor", role: "doctor" },
  { href: `/patient/${MARIA_ID}`, label: "Patient", role: "patient" },
  { href: "/pharma", label: "Pharma", role: "pharma" },
] as const;

/** Echo wordmark (landing style): pill mark + condensed ECHO + "by Relay". */
export function RelayMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local logo mark */}
      <img src="/echo-logo.png" alt="" aria-hidden className="size-8 object-contain" draggable={false} />
      <span className="font-wordmark text-2xl leading-none tracking-wide">{BRAND.name.toUpperCase()}</span>{" "}
      <span className="text-xs text-muted-foreground">by {BRAND.maker}</span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={className}
      aria-label={mounted ? (dark ? "Switch to light mode" : "Switch to dark mode") : "Toggle color theme"}
    >
      {/* Icons swap via the .dark class, so their markup is identical on server and client. */}
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </Button>
  );
}

/** Shows when pages run on fixtures (no Supabase keys) so nobody mistakes it for live data. */
export function FixtureBadge() {
  if (HAS_SUPABASE) return null;
  return (
    <span
      title="Supabase keys are not set; showing demo fixtures"
      className="rounded-full border border-line px-2 py-0.5 text-xs text-muted-foreground"
    >
      Offline fixtures
    </span>
  );
}

interface AppHeaderProps {
  portal: string;
  children?: React.ReactNode;
  className?: string;
}

/** Top bar for the doctor and pharma portals. */
export function AppHeader({ portal, children, className }: AppHeaderProps) {
  const pathname = usePathname();
  const role = useDemoRole(); // demo sign-in choice: highlight only, not auth
  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-md", className)}>
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-8">
        <RelayMark />
        <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
        <span className="hidden text-sm text-muted-foreground sm:inline">{portal}</span>
        <FixtureBadge />
        <div className="ml-auto flex items-center gap-2">
          {children}
          {/* Segmented pill, as on the landing. */}
          <nav aria-label="Portals" className="hidden items-center gap-1 rounded-2xl border border-line bg-card/70 p-1 md:flex">
            {NAV.map((item) => {
              // Match by first segment, so /patient/<any id> highlights "Patient".
              const section = item.href.split("/")[1];
              const active = pathname.split("/")[1] === section;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-xl px-4 text-sm transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                    active ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-accent"
                  )}
                >
                  {item.role === role && (
                    <span
                      aria-hidden
                      className="relay-glow mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-[var(--echo-accent)]"
                      title="Your demo role"
                    />
                  )}
                  {item.label}
                  {item.role === role && <span className="sr-only"> (your demo role)</span>}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle className="size-11 rounded-full border border-line" />
        </div>
      </div>
    </header>
  );
}
