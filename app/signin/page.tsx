import type { Metadata } from "next";

import { echoFonts } from "@/app/fonts";
import { SignIn } from "@/components/signin/SignIn";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className={`echo ${echoFonts} flex flex-1 flex-col bg-[var(--slate-pale)] text-foreground`}>
      <SignIn />
    </div>
  );
}
