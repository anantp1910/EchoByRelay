import type { Metadata } from "next";

import { DoctorConsole } from "@/components/doctor/DoctorConsole";

export const metadata: Metadata = { title: "Doctor" };

export default function DoctorPage() {
  return <DoctorConsole />;
}
