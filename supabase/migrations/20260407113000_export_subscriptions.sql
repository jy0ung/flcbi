create table if not exists app.export_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  requested_by uuid not null references app.user_profiles(id) on delete cascade,
  kind text not null default 'vehicle_explorer_csv',
  schedule text not null default 'daily',
  enabled boolean not null default true,
  fingerprint text not null,
  query_definition jsonb not null default '{}'::jsonb,
  last_triggered_at timestamptz,
  last_export_job_id uuid references app.export_jobs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_export_subscriptions_company_id
  on app.export_subscriptions(company_id);

create index if not exists idx_export_subscriptions_requested_by
  on app.export_subscriptions(requested_by);

create index if not exists idx_export_subscriptions_enabled
  on app.export_subscriptions(company_id, enabled, schedule);

create unique index if not exists idx_export_subscriptions_fingerprint
  on app.export_subscriptions(company_id, requested_by, fingerprint);

drop trigger if exists trg_export_subscriptions_updated_at on app.export_subscriptions;
create trigger trg_export_subscriptions_updated_at
before update on app.export_subscriptions
for each row execute function app.touch_updated_at();

alter table app.export_subscriptions enable row level security;

drop policy if exists "export_subscriptions_select_requestor" on app.export_subscriptions;
create policy "export_subscriptions_select_requestor"
on app.export_subscriptions
for select
to authenticated
using (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

drop policy if exists "export_subscriptions_insert_requestor" on app.export_subscriptions;
create policy "export_subscriptions_insert_requestor"
on app.export_subscriptions
for insert
to authenticated
with check (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

drop policy if exists "export_subscriptions_update_requestor" on app.export_subscriptions;
create policy "export_subscriptions_update_requestor"
on app.export_subscriptions
for update
to authenticated
using (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
)
with check (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

drop policy if exists "export_subscriptions_delete_requestor" on app.export_subscriptions;
create policy "export_subscriptions_delete_requestor"
on app.export_subscriptions
for delete
to authenticated
using (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

alter table app.export_jobs
  add column if not exists subscription_id uuid references app.export_subscriptions(id) on delete set null,
  add column if not exists scheduled_run_key text;

create index if not exists idx_export_jobs_subscription_id
  on app.export_jobs(subscription_id);

create unique index if not exists idx_export_jobs_subscription_run_key
  on app.export_jobs(subscription_id, scheduled_run_key);
