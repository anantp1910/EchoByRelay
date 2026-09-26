// STUB — replaced in A2..A6.
//
// GET /api/pa/[rxId] -> { status, letterMd, citations[] }
//
// Returns a realistic draft PA letter for Jardiance (empagliflozin) 10 mg daily
// with numbered citations to the FDA label, so B's PA drawer looks right. In
// A4 this is replaced by paDrafter output grounded in the real openFDA label.
// Next.js 16: the dynamic `params` is a Promise and must be awaited.

import { PaResSchema, Uuid, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

const LETTER_MD = `## Prior Authorization Request

**Patient:** Maria González  **DOB:** [redacted — synthetic]
**Medication:** Jardiance (empagliflozin) 10 mg tablet — 1 tablet by mouth once daily
**Diagnosis:** Type 2 diabetes mellitus with established heart failure

Dear Utilization Review,

I am requesting prior authorization for **Jardiance (empagliflozin) 10 mg once daily** for the above patient. Empagliflozin is indicated to reduce the risk of cardiovascular death in adults with type 2 diabetes mellitus and established cardiovascular disease, and to reduce the risk of cardiovascular death and hospitalization for heart failure in adults with heart failure [1]. The requested **10 mg once daily** dose is the recommended starting dose per the FDA label [2].

This patient has type 2 diabetes with heart failure and meets the population studied in the EMPA-REG OUTCOME trial, in which empagliflozin significantly reduced cardiovascular death versus placebo [3]. Given the established cardiovascular and renal benefit, empagliflozin is clinically appropriate and I respectfully request approval.

Sincerely,
Prescribing Physician`;

const CITATIONS = [
  {
    n: 1,
    section: "1 INDICATIONS AND USAGE",
    quote:
      "JARDIANCE is indicated to reduce the risk of cardiovascular death in adults with type 2 diabetes mellitus and established cardiovascular disease, and to reduce the risk of cardiovascular death and hospitalization for heart failure in adults with heart failure.",
    url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/204629s042lbl.pdf",
  },
  {
    n: 2,
    section: "2.1 Recommended Dosage",
    quote:
      "The recommended starting dose of JARDIANCE is 10 mg once daily in the morning, taken with or without food.",
    url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/204629s042lbl.pdf",
  },
  {
    n: 3,
    section: "14.2 Cardiovascular Outcomes in Type 2 Diabetes (EMPA-REG OUTCOME)",
    quote:
      "In EMPA-REG OUTCOME, JARDIANCE significantly reduced the risk of cardiovascular death compared with placebo in adults with type 2 diabetes and established cardiovascular disease.",
    url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/204629s042lbl.pdf",
  },
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rxId: string }> }
): Promise<Response> {
  const { rxId } = await params;

  if (!Uuid.safeParse(rxId).success) {
    return errorResponse("validation_error", "rxId must be a valid UUID");
  }

  const body = {
    status: "draft" as const,
    letterMd: LETTER_MD,
    citations: CITATIONS,
  };

  // Guarantees the stub itself honours the contract.
  const check = PaResSchema.safeParse(body);
  if (!check.success) {
    return errorResponse("internal", "PA stub failed its own schema");
  }

  return jsonResponse(check.data);
}
