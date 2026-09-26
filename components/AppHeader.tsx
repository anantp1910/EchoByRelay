"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { MARIA_ID } from "@/lib/demo/constants";
import { cn } from "@/lib/utils";

import { HAS_SUPABASE } from "./useLiveEvents";

const NAV = [
  { href: "/doctor", label: "Doctor" },
  { href: `/patient/${MARIA_ID}`, label: "Patient" },
  { href: "/pharma", label: "Pharma" },
] as const;

export function RelayMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-md font-heading text-lg font-bold", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-primary">
        <circle cx="5" cy="12" r="3" fill="currentColor" />
        <circle cx="19" cy="12" r="3" fill="currentColor" />
        <path d="M8 12h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M13 8.5 16.5 12 13 15.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Relay
    </Link>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
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
  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur", className)}>
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
        <RelayMark />
        <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
        <span className="hidden text-sm font-medium text-muted-foreground sm:inline">{portal}</span>
        <FixtureBadge />
        <div className="ml-auto flex items-center gap-1">
          {children}
          <nav aria-label="Portals" className="hidden items-center gap-1 md:flex">
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
                    "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                    active && "bg-accent font-medium text-accent-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
