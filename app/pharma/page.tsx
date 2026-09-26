import type { Metadata } from "next";

import { PharmaDashboard } from "@/components/pharma/PharmaDashboard";

export const metadata: Metadata = { title: "Pharma dashboard" };

export default function PharmaPage() {
  return <PharmaDashboard />;
}
