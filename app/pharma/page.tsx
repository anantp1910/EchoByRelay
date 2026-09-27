import type { Metadata } from "next";

import { PharmaDashboard } from "@/components/pharma/PharmaDashboard";

export const metadata: Metadata = { title: "Pharma dashboard" };

export default function PharmaPage() {
  return (
    <div className="echo-portal flex flex-1 flex-col">
      <PharmaDashboard />
    </div>
  );
}
