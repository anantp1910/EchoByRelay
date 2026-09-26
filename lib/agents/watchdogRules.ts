/** Pure decisions separated from database effects for clock-boundary checks. */
export function deliveryAction(input: {
  status: string; expectedDay: number | null; day: number; held: boolean;
}): "deliver" | "no_pickup" | "none" {
  if (input.status !== "shipped" || input.expectedDay === null || input.expectedDay > input.day) return "none";
  if (input.held) return input.expectedDay <= input.day - 2 ? "no_pickup" : "none";
  return "deliver";
}

export function sustainableAccess(program: string | undefined, paid: boolean, paApproved: boolean): boolean {
  return paApproved || program === "pap" || (program === "cash_pay" && paid);
}

export function bridgeCliff(input: { program: string; status: string; endDay: number | null }, day: number, paApproved: boolean): boolean {
  return !paApproved && ["bridge", "quick_start"].includes(input.program) && input.status === "active"
    && input.endDay !== null && input.endDay <= day + 7;
}
