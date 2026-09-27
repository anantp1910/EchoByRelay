import type { Metadata } from "next";

import { PatientPortal } from "@/components/patient/PatientPortal";

export const metadata: Metadata = { title: "My medicine" };

// Next 16: params is a Promise.
export default async function PatientPage(props: PageProps<"/patient/[id]">) {
  const { id } = await props.params;
  return (
    <div className="echo-portal flex flex-1 flex-col">
      <PatientPortal patientId={id} />
    </div>
  );
}
