import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  Bricolage_Grotesque,
  JetBrains_Mono,
} from "next/font/google";

import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

// Atkinson Hyperlegible is not a variable font, so weights are explicit.
const body = Atkinson_Hyperlegible({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Relay — every prescription, all the way to the patient",
    template: "%s · Relay",
  },
  description:
    "Relay carries a prescription from the doctor's decision to the patient's hands.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
