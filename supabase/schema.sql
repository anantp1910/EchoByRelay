-- Relay — database schema (Person A / Engine owns this file).
--
-- Idempotent: safe to paste into the Supabase SQL editor and re-run.
--   * create table if not exists / create index if not exists
--   * drop policy if exists before create policy
--   * create or replace function
--   * realtime publication adds are guarded
--
-- Decision B (see BUILD_PLAN discussion): schema + seed are applied by hand in
-- the SQL editor. There is no `npm run seed`. `npm run demo:reset` calls
-- reset_demo() via the service role; `npm run db:check` verifies state.
--
-- Hard rules honoured here:
--   * All status / program / kind / band values are CHECK constraints (fail loud).
--   * RLS on every table: anon may SELECT (data is synthetic); no anon writes.
--     All writes go through server routes using the service role key.
--   * Every table the demo writes to has is_seed (default false). reset_demo()
--     deletes is_seed = false rows and resets demo_state.day to 0.

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists patients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  language       text not null default 'en' check (language in ('es', 'en')),
  zip            text,
  rural          boolean not null default false,
  insured        boolean not null default false,
  plan_id        uuid,
  income_band    text check (income_band in ('low', 'mid', 'above_pap')),
  on_drug_before boolean not null default false,
  conditions     text[] not null default '{}',
  is_seed        boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists care_circle (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  name       text not null,
  relation   text,
  can_pay    boolean not null default false,
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists prescriptions (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references patients(id) on delete cascade,
  drug                  text not null,
  dose                  text,
  frequency             text,
  indication            text,
  status                text not null default 'new'
                          check (status in ('new', 'routing', 'bridge', 'pa_pending',
                                            'on_therapy', 'at_risk', 'abandoned')),
  program               text
                          check (program in ('bridge', 'quick_start', 'pap',
                                             'cash_pay', 'retail_copay_card')),
  expected_delivery_day int,
  is_seed               boolean not null default false,
  created_at            timestamptz not null default now()
);

create table if not exists coverage_checks (
  id          uuid primary key default gen_random_uuid(),
  rx_id       uuid not null references prescriptions(id) on delete cascade,
  pa_required boolean not null default false,
  copay_usd   numeric(10, 2),
  tier        int,
  is_seed     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists pa_requests (
  id         uuid primary key default gen_random_uuid(),
  rx_id      uuid not null references prescriptions(id) on delete cascade,
  letter_md  text,
  citations  jsonb not null default '[]',
  status     text not null default 'draft'
               check (status in ('draft', 'submitted', 'approved', 'denied')),
  decided_at timestamptz,
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists enrollments (
  id         uuid primary key default gen_random_uuid(),
  rx_id      uuid not null references prescriptions(id) on delete cascade,
  program    text not null
               check (program in ('bridge', 'quick_start', 'pap',
                                  'cash_pay', 'retail_copay_card')),
  start_day  int,
  end_day    int,
  status     text not null default 'active'
               check (status in ('active', 'ended', 'cancelled')),
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  rx_id         uuid not null references prescriptions(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  amount_usd    numeric(10, 2),
  status        text not null default 'created'
                  check (status in ('created', 'paid', 'shipped', 'delivered')),
  is_seed       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists payment_mandates (
  id               uuid primary key default gen_random_uuid(),
  payer_member_id  text,
  rx_id            uuid references prescriptions(id) on delete cascade,
  merchant         text,
  cap_usd          numeric(10, 2),
  recurring        boolean not null default false,
  passkey_verified boolean not null default false,
  is_seed          boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),
  mandate_id uuid references payment_mandates(id) on delete cascade,
  order_id   uuid references orders(id) on delete cascade,
  amount_usd numeric(10, 2),
  visa_ref   text,
  status     text not null default 'created'
               check (status in ('created', 'succeeded', 'failed')),
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id         uuid primary key default gen_random_uuid(),
  rx_id      uuid references prescriptions(id) on delete cascade,
  kind       text not null
               check (kind in ('bridge_cliff', 'pa_denied', 'no_pickup', 'escalation')),
  severity   text not null default 'warning'
               check (severity in ('info', 'warning', 'critical')),
  resolved   boolean not null default false,
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  sender     text,
  lang       text not null default 'en' check (lang in ('es', 'en')),
  body       text not null,
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

-- agent_events columns match lib/db/types.ts AgentEvent exactly.
-- rx_id is nullable (some events precede a prescription); patient_id is required.
create table if not exists agent_events (
  id         uuid primary key default gen_random_uuid(),
  rx_id      uuid references prescriptions(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  agent      text not null,
  status     text not null
               check (status in ('running', 'done', 'blocked',
                                 'needs_approval', 'approved', 'rejected')),
  title      text not null,
  detail     text,
  simulated  boolean not null default false,
  data       jsonb not null default '{}',
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text,
  action     text not null,
  payload    jsonb not null default '{}',
  is_seed    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Singleton demo clock. No is_seed: reset_demo() sets day = 0 rather than deleting.
create table if not exists demo_state (
  id         int primary key default 1,
  day        int not null default 0,
  created_at timestamptz not null default now(),
  constraint demo_state_singleton check (id = 1)
);

-- ============================================================================
-- Migrations for existing databases (idempotent; new installs already match).
-- ============================================================================

-- A3: patients.conditions (used to backfill a prescription's indication from
-- the patient's real diagnoses — never invented by the LLM).
alter table patients add column if not exists conditions text[] not null default '{}';

-- A3: allow the 'escalation' alert kind (router "escalate" -> doctor inbox).
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check
  check (kind in ('bridge_cliff', 'pa_denied', 'no_pickup', 'escalation'));

-- A3.1: one row per step (running -> done|blocked|needs_approval). Realtime now
-- delivers UPDATEs, not just INSERTs. REPLICA IDENTITY FULL makes the full row
-- available so RLS can be evaluated for anon subscribers on UPDATE/DELETE and
-- the complete new row is delivered in the change payload. Applied to every
-- table in the supabase_realtime publication (idempotent — re-running is a no-op).
do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_events', 'prescriptions', 'alerts', 'messages',
    'orders', 'enrollments', 'pa_requests', 'payments', 'demo_state'
  ]
  loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_care_circle_patient   on care_circle(patient_id);
create index if not exists idx_prescriptions_patient  on prescriptions(patient_id);
create index if not exists idx_prescriptions_status   on prescriptions(status);
create index if not exists idx_coverage_rx            on coverage_checks(rx_id);
create index if not exists idx_pa_requests_rx         on pa_requests(rx_id);
create index if not exists idx_enrollments_rx         on enrollments(rx_id);
create index if not exists idx_orders_rx              on orders(rx_id);
create index if not exists idx_payment_mandates_rx    on payment_mandates(rx_id);
create index if not exists idx_payments_order         on payments(order_id);
create index if not exists idx_alerts_rx              on alerts(rx_id);
create index if not exists idx_messages_patient       on messages(patient_id);
create index if not exists idx_agent_events_rx        on agent_events(rx_id);
create index if not exists idx_agent_events_patient   on agent_events(patient_id, created_at);

-- ============================================================================
-- Row Level Security
--   anon + authenticated: SELECT only (all data is synthetic).
--   No insert/update/delete policies -> only the service role (which bypasses
--   RLS) can write. reset_demo() is the sole exception, guarded by grants.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'care_circle', 'prescriptions', 'coverage_checks', 'pa_requests',
    'enrollments', 'orders', 'payment_mandates', 'payments', 'alerts', 'messages',
    'agent_events', 'audit_log', 'demo_state'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'anon_read_' || t, t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      'anon_read_' || t, t
    );
  end loop;
end $$;

-- ============================================================================
-- Realtime publication (guarded so re-running does not error)
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_events', 'prescriptions', 'alerts', 'messages',
    'orders', 'enrollments', 'pa_requests', 'payments', 'demo_state'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- reset_demo(): deletes non-seed rows (children before parents) and zeroes the
-- clock. security definer so it can bypass RLS; locked down to service_role so
-- the browser can never reset the demo. Seeded rows (is_seed = true) are never
-- mutated by the demo, so no restore is needed here.
-- ============================================================================

create or replace function reset_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from payments         where is_seed = false;
  delete from payment_mandates where is_seed = false;
  delete from orders           where is_seed = false;
  delete from enrollments      where is_seed = false;
  delete from pa_requests      where is_seed = false;
  delete from coverage_checks  where is_seed = false;
  delete from messages         where is_seed = false;
  delete from alerts           where is_seed = false;
  delete from agent_events     where is_seed = false;
  delete from audit_log        where is_seed = false;
  delete from prescriptions    where is_seed = false;
  delete from care_circle      where is_seed = false;
  delete from patients         where is_seed = false;
  update demo_state set day = 0 where id = 1;
end;
$$;

revoke execute on function reset_demo() from public, anon, authenticated;
grant execute on function reset_demo() to service_role;
