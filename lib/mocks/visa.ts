// Simulated Visa Intelligent Commerce flow. Shapes mirror the real API so a
// real integration is a small swap. The checkout agent wraps each call in a
// ctx.step; these functions have no side effects and do not emit.
//
// If USE_VISA_SANDBOX=true, the same signatures would call the Visa sandbox via
// the MCP starter code — not implemented yet (no credentials). See TODOs.

function sandboxEnabled(): boolean {
  return process.env.USE_VISA_SANDBOX === "true";
}

function ref(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export interface PurchaseInstructionInput {
  token: string;
  rxId: string;
  merchant: "Medvantx";
  capUsd: number;
  recurring: boolean;
}

/** Enroll the payer's card, returning a network token. */
export function enrollCard(memberId: string): string {
  if (sandboxEnabled()) {
    // TODO: call Visa sandbox card enrollment (needs sandbox credentials).
    throw new Error("USE_VISA_SANDBOX=true but the Visa sandbox is not configured yet");
  }
  void memberId;
  return ref("vtok");
}

/** Create a purchase instruction (mandate) with the spending cap + recurring flag. */
export function createPurchaseInstruction(input: PurchaseInstructionInput): string {
  if (sandboxEnabled()) {
    // TODO: call Visa sandbox purchase-instruction creation.
    throw new Error("USE_VISA_SANDBOX=true but the Visa sandbox is not configured yet");
  }
  void input;
  return ref("vinst");
}

/** Retrieve one-time payment credentials for the instruction. */
export function retrieveCredentials(instructionId: string): string {
  if (sandboxEnabled()) {
    // TODO: call Visa sandbox credential retrieval.
    throw new Error("USE_VISA_SANDBOX=true but the Visa sandbox is not configured yet");
  }
  void instructionId;
  return ref("vcred");
}

/** Execute the payment, returning a Visa reference. */
export function pay(credential: string, orderId: string, amountUsd: number): string {
  if (sandboxEnabled()) {
    // TODO: call Visa sandbox payment execution.
    throw new Error("USE_VISA_SANDBOX=true but the Visa sandbox is not configured yet");
  }
  void credential;
  void orderId;
  void amountUsd;
  return ref("VISA");
}

/** Confirm the outcome back to the network. */
export function confirmOutcome(instructionId: string, visaRef: string): { confirmed: true } {
  if (sandboxEnabled()) {
    // TODO: call Visa sandbox outcome confirmation.
    throw new Error("USE_VISA_SANDBOX=true but the Visa sandbox is not configured yet");
  }
  void instructionId;
  void visaRef;
  return { confirmed: true };
}
