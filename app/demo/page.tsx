import type { Metadata } from "next";

import { DemoPanel } from "@/components/demo/DemoPanel";

export const metadata: Metadata = {
  title: "Demo control",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoPanel />;
}
