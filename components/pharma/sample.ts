// GET /api/pharma/metrics still returns fixed stub numbers (real queries land in
// Anant's Phase 8). While true, metric-backed panels show a "Sample data" badge.
// Flip to false (or delete the badge) once the route returns live numbers.
export const METRICS_ARE_SAMPLE = true;

// Assumption behind the "PA hours saved" KPI (computed on the page, not in the
// metrics contract): staff time for one manual prior authorization.
export const HOURS_PER_MANUAL_PA = 2;
