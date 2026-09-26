"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

/** App-wide client providers: theme (class-based dark mode), motion prefs, toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {/* reducedMotion="user" makes every motion.* respect prefers-reduced-motion. */}
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeOut" }}>
        {children}
        <Toaster position="top-center" />
      </MotionConfig>
    </ThemeProvider>
  );
}
