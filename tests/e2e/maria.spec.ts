// The Maria demo, driven through the real UI (npm run test:e2e).
// Resets the shared demo data first. Screenshots: tests/e2e/screens/.
import { expect, test, type Page } from "@playwright/test";

const MARIA_ID = "11111111-1111-1111-1111-111111111111";
const SENTENCE = "Starting Maria on Jardiance, ten milligrams daily.";
const SCREENS = "tests/e2e/screens";

let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  await page.screenshot({ path: `${SCREENS}/${String(shot).padStart(2, "0")}-${name}.png`, fullPage: true });
}

async function scene(page: Page, n: number, expectDay: number) {
  await page.goto("/demo");
  const day = page.getByTestId("demo-day");
  await expect(day).not.toHaveText("Day –");
  const button = page.getByTestId(`demo-scene-${n}`);
  await expect(button).toBeEnabled();
  await button.click();
  if (n === 1) {
    await expect(button).toHaveAttribute("data-armed", "true"); // two-click confirm
    await button.click();
  }
  await expect(day).toHaveAttribute("data-day", String(expectDay), { timeout: 45_000 });
}

const card = (page: Page, agent: string, status: string, text?: string | RegExp) =>
  page.locator(`li[data-agent="${agent}"][data-status="${status}"]`, text ? { hasText: text } : undefined).first();

test("Maria: sentence to rescue, through the real screens", async ({ page }) => {
  await test.step("① reset with double confirm", async () => {
    await scene(page, 1, 0);
    await expect(page.getByTestId("demo-next-doctor")).toBeVisible();
    await snap(page, "demo-reset");
  });

  await test.step("doctor sends the sentence", async () => {
    await page.goto("/doctor");
    // The server render shows the text box until hydration swaps in the mic, so
    // wait for the hydrated "Type instead" toggle before typing.
    await page.getByRole("button", { name: "Type instead" }).click();
    const input = page.getByTestId("voice-text-input");
    await input.fill(SENTENCE);
    await page.getByTestId("voice-send").click();
    await expect(card(page, "router", "needs_approval", /Bridge/)).toBeVisible({ timeout: 45_000 });
    await snap(page, "doctor-bridge-recommended");
  });

  await test.step("approve Bridge, PA ready within 30 s", async () => {
    await card(page, "router", "needs_approval", /Bridge/).getByTestId("approve").click();
    await expect(card(page, "paDrafter", "needs_approval", "PA ready for review")).toBeVisible({ timeout: 45_000 });
    await snap(page, "doctor-pa-ready");
  });

  await test.step("open the PA drawer, check a citation, approve", async () => {
    await card(page, "paDrafter", "needs_approval", "PA ready for review").getByTestId("open-letter").click();
    const drawer = page.getByTestId("pa-drawer");
    await expect(drawer.getByTestId("pa-letter")).toBeVisible();
    await drawer.getByRole("button", { name: "Citation 1" }).first().click();
    await expect(drawer.locator("#pa-cite-1")).toContainText(/glycemic control|type 2 diabetes/i);
    await snap(page, "pa-drawer-citation");
    await drawer.getByTestId("pa-approve").click();
    await expect(page.getByText("PA submitted to insurer").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await snap(page, "doctor-pa-submitted");
  });

  await test.step("scenes ② Bridge delivered, ③ day 24", async () => {
    await scene(page, 2, 2);
    await scene(page, 3, 24);
    await snap(page, "demo-day-24");
  });

  await test.step("bridge-cliff alert reaches the doctor", async () => {
    await page.goto("/doctor");
    await expect(page.getByTestId("alert-action-bridge_cliff")).toBeVisible();
    await snap(page, "doctor-bridge-cliff-alert");
  });

  await test.step("④ insurer denies, doctor approves Cash Pay", async () => {
    await scene(page, 4, 24);
    await page.goto("/doctor");
    const cash = card(page, "router", "needs_approval", "Switch to Medvantx Cash Pay");
    await expect(cash).toBeVisible();
    await cash.getByTestId("approve").click();
    await expect(card(page, "router", "approved", "Switch to Medvantx Cash Pay")).toBeVisible();
    await expect(page.getByText("Appeal letter drafted (optional)").first()).toBeVisible();
    await snap(page, "doctor-cash-pay-approved");
  });

  await test.step("patient page shows a Spanish message", async () => {
    await page.goto(`/patient/${MARIA_ID}`);
    await expect(page.getByTestId("care-message").filter({ hasText: /\b(Su|su) (plan|medicina|inscripción|suministro)\b/ }).first()).toBeVisible();
    await snap(page, "patient-maria-spanish");
  });

  await test.step("Ana approves payment with cap + passkey", async () => {
    await page.getByTestId("viewer-member").click();
    await page.getByTestId("approve-payment").click();
    const sheet = page.getByTestId("checkout-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("checkout-cap").fill("100");
    await snap(page, "ana-checkout");
    await sheet.getByTestId("checkout-passkey").click();
    // The success screen must stay up after Realtime marks the order shipped.
    await expect(sheet.getByTestId("checkout-success")).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2_000);
    await expect(sheet.getByTestId("checkout-success")).toBeVisible();
    await snap(page, "ana-paid");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Paid. The medicine is on its way.")).toBeVisible();
  });

  await test.step("Ana asks when the medicine arrives", async () => {
    await page.getByTestId("ask-suggestion-1").click();
    const answer = page.getByTestId("ask-answer");
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await expect(answer).not.toHaveText(/can't answer right now/i);
    await snap(page, "ana-ask-answer");
  });

  await test.step("⑤ delivered on day 26", async () => {
    await scene(page, 5, 26);
    await snap(page, "demo-day-26");
  });

  await test.step("pharma: rescued 1, first dose 2, zero days without medication", async () => {
    await page.goto("/pharma");
    // Tile text runs together ("Scripts rescued1Would have…"), so anchor on the label.
    await expect(page.getByTestId("kpi-scripts-rescued")).toContainText(/Scripts rescued\s*1(?!\d)/);
    await expect(page.getByTestId("kpi-time-to-therapy")).toContainText(/first dose\s*2\.0 days/);
    await expect(page.getByTestId("kpi-days-without-medication")).toContainText(/\(rescued patients\)\s*0(?!\d)/);
    await snap(page, "pharma-rescued");
  });
});
