import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import { Providers } from "@/components/Providers";
import { BRAND } from "@/components/brand";
import { echoFonts } from "./fonts";
import "./globals.css";

// Echo type everywhere (Figtree Light + Inter + Anton, see ./fonts); JetBrains
// Mono stays for code/tabular labels.
const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.full} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.full}`,
  },
  description:
    BRAND.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`echo ${echoFonts} ${code.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
