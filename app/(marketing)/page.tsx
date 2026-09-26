import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { ThemeToggle } from "@/components/AppHeader";
import { Chapters } from "@/components/landing/Chapters";
import { Closing } from "@/components/landing/Closing";
import { DemoSignIn } from "@/components/landing/DemoSignIn";
import { Hero } from "@/components/landing/Hero";
import { SectionIndex } from "@/components/landing/SectionIndex";

// Landing-only type: Geist (the portals move to it in their own phases).
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export default function Home() {
  return (
    <div className={`landing ${geist.variable} ${geistMono.variable} flex-1 bg-[var(--frame-ground)] p-2 sm:p-3 lg:p-4`}>
      {/* The framed sheet. overflow-hidden crops the strand at the top edge. */}
      <div className="relative overflow-hidden rounded-[1.25rem] bg-card text-foreground sm:rounded-[1.75rem]">
        <header className="relative z-20 flex items-center gap-8 px-5 py-5 sm:px-8 lg:px-16 lg:py-7">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded text-sm font-semibold tracking-[0.32em] uppercase focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Relay
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-6 text-sm sm:flex">
            <a href="#journey" className="inline-flex min-h-11 items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              Journey
            </a>
            <a href="#signin" className="inline-flex min-h-11 items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              Sign in
            </a>
          </nav>
          <div className="ml-auto">
            <ThemeToggle className="size-11 rounded-full border border-line" />
          </div>
        </header>

        <div className="grid px-5 sm:px-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10 lg:px-16">
          <aside className="hidden lg:block">
            <SectionIndex />
          </aside>
          <main className="min-w-0">
            <Hero />
            <Chapters />
            <DemoSignIn />
            <Closing />
          </main>
        </div>
      </div>
    </div>
  );
}
