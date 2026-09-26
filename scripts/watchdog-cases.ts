import assert from "node:assert/strict";
import { bridgeCliff, deliveryAction, sustainableAccess } from "../lib/agents/watchdogRules";
import { calculateMetrics, countInitialPaDrafts, daysUncovered, deliveryOf, type MetricsRows } from "../lib/pharma/metrics";
import { operationId } from "../lib/db/identity";

const shipment = { status: "shipped", expectedDay: 2, day: 0, held: false };
assert.equal(deliveryAction(shipment), "none");
assert.equal(deliveryAction({ ...shipment, day: 2 }), "deliver");
assert.equal(deliveryAction({ ...shipment, day: 24 }), "deliver");
assert.equal(deliveryAction({ ...shipment, day: 24, status: "delivered" }), "none");
assert.equal(deliveryAction({ ...shipment, day: 24, status: "created" }), "none");
assert.equal(deliveryAction({ ...shipment, day: 24, expectedDay: null }), "none");
assert.equal(deliveryAction({ ...shipment, day: 3, held: true }), "none");
assert.equal(deliveryAction({ ...shipment, day: 4, held: true }), "no_pickup");
const bridge = { program: "bridge", status: "active", endDay: 30 };
assert.equal(bridgeCliff(bridge, 22, false), false);
assert.equal(bridgeCliff(bridge, 23, false), true);
assert.equal(bridgeCliff(bridge, 24, true), false);
assert.equal(bridgeCliff({ ...bridge, status: "ended" }, 24, false), false);
assert.equal(sustainableAccess("bridge", false, false), false);
assert.equal(sustainableAccess("cash_pay", false, false), false);
assert.equal(sustainableAccess("cash_pay", true, false), true);
assert.equal(sustainableAccess("bridge", false, true), true);
assert.equal(operationId("alert", "rx1", "pa_denied"), operationId("alert", "rx1", "pa_denied"));
assert.notEqual(operationId("alert", "rx1", "pa_denied"), operationId("alert", "rx1", "bridge_cliff"));
console.log("PASS: delivery, hold, cliff boundaries, payment/coverage eligibility, stable alert identity");

const rows: MetricsRows = {
  prescriptions: [{ id: "rx1", status: "at_risk", created_at: "2026-09-26", is_seed: false }],
  patients: [{ rural: true }, { rural: false }],
  alerts: [{ rx_id: "rx1", kind: "bridge_cliff", created_at: "2026-09-27" }],
  enrollments: [{ rx_id: "rx1", program: "bridge", start_day: 0, end_day: 30 }, { rx_id: "rx1", program: "cash_pay", start_day: 24, end_day: null }],
  events: [{ rx_id: "rx1", agent: "intake", status: "done", created_at: "2026-09-26", data: { day: 0 } }],
};
assert.equal(calculateMetrics(rows).scriptsRescued, 0);
rows.prescriptions[0].status = "on_therapy";
rows.events.push(
  { rx_id: "rx1", agent: "watchdog", status: "done", created_at: "2026-09-26T02", data: { day: 2, orderId: "o1", program: "bridge", delivered: true } },
  { rx_id: "rx1", agent: "watchdog", status: "done", created_at: "2026-09-28T01", data: { day: 26, orderId: "o2", program: "cash_pay", delivered: true } },
  { rx_id: "rx1", agent: "watchdog", status: "done", created_at: "2026-09-28T02", data: { day: 26, onTherapy: true, rescued: true } },
);
const metrics = calculateMetrics(rows);
assert.equal(metrics.scriptsRescued, 1);
assert.equal(metrics.medianDaysToTherapy, 2, "first dose = Bridge delivery on day 2");
assert.equal(metrics.daysWithoutMedication, 0, "Bridge covers days 2-29; Cash Pay arrives day 26");
assert.equal(metrics.pctUnderserved, 50);
assert.deepEqual(metrics.rescuedSeries, [{ day: 26, count: 1 }]);
assert.equal(metrics.sample, false);
rows.events.push({ ...rows.events[3] });
assert.equal(calculateMetrics(rows).scriptsRescued, 1);
console.log("PASS: no rescue before delivery, simulated duration, unique rescued scripts, rural percentage");

// PA hours saved: unique initial drafts only, 20 min each (AMA-derived estimate).
const pa = (rx: string, status: string, data: Record<string, unknown>) =>
  ({ rx_id: rx, agent: "paDrafter", status, created_at: "2026-09-26", data });
assert.equal(calculateMetrics(rows).paHoursSaved, 0);
const drafts: MetricsRows["events"] = [
  pa("rx1", "running", {}),
  pa("rx1", "approved", { paRequestId: "pa1", appeal: false }),
  pa("rx1", "needs_approval", { paRequestId: "pa2", appeal: true }),
  pa("rx1", "needs_approval", { paRequestId: "pa3", appeal: false }),
  pa("rx2", "blocked", {}),
  pa("rx3", "needs_approval", { paRequestId: "pa4" }),
  pa("rx4", "rejected", { paRequestId: "pa5", appeal: false }),
];
assert.equal(countInitialPaDrafts(drafts), 3);
assert.equal(countInitialPaDrafts([pa("rx1", "needs_approval", { paRequestId: "pa2", appeal: true })]), 0);
assert.equal(calculateMetrics({ ...rows, events: [...rows.events, ...drafts] }).paHoursSaved, 1);
assert.equal(calculateMetrics({ ...rows, events: [...rows.events, drafts[1]] }).paHoursSaved, 0.3);
console.log("PASS: PA hours count unique initial drafts at 20 min, exclude appeals and unfinished steps");

// First dose and supply gaps.
const held = { rx_id: "rx1", agent: "watchdog", status: "done", created_at: "x", data: { day: 3, orderId: "o1", deliveryHeld: true } };
assert.equal(deliveryOf(held), null, "a held shipment is not medicine in hand");
assert.deepEqual(deliveryOf({ ...held, data: { day: 2, orderId: "o1", program: "bridge" } }), { day: 2, program: "bridge" }, "legacy delivery rows still count");
const bridgeEnds20 = [{ rx_id: "rx1", program: "bridge", start_day: 0, end_day: 20 }];
const twoDeliveries = [{ day: 2, program: "bridge" }, { day: 26, program: "cash_pay" }];
assert.equal(daysUncovered(twoDeliveries, bridgeEnds20, 2, 26), 6, "days 20-25 had no supply");
assert.equal(daysUncovered([{ day: 2, program: "bridge" }], [{ ...bridgeEnds20[0], end_day: 30 }], 2, 26), 0);
const gapRows = { ...rows, enrollments: [{ ...rows.enrollments[0], end_day: 20 }, rows.enrollments[1]] };
assert.equal(calculateMetrics(gapRows).daysWithoutMedication, 6);
const unrescued = { ...rows, events: rows.events.filter((e) => !e.data.onTherapy) };
assert.equal(calculateMetrics(unrescued).daysWithoutMedication, 0, "only rescued prescriptions count toward gaps");
assert.equal(calculateMetrics(unrescued).medianDaysToTherapy, 2, "first dose counts even before rescue");
console.log("PASS: first dose includes Bridge supply, held shipments excluded, supply gaps counted for rescued scripts");
