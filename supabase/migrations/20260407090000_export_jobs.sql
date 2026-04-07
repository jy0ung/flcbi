create table if not exists app.export_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  requested_by uuid references app.user_profiles(id) on delete set null,
  kind text not null default 'vehicle_explorer_csv',
  format text not null default 'csv',
  status text not null default 'queued',
  file_name text not null,
  query_definition jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  storage_path text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_export_jobs_company_id on app.export_jobs(company_id);
create index if not exists idx_export_jobs_requested_by on app.export_jobs(requested_by);
create index if not exists idx_export_jobs_status on app.export_jobs(status);

drop trigger if exists trg_export_jobs_updated_at on app.export_jobs;
create trigger trg_export_jobs_updated_at
before update on app.export_jobs
for each row execute function app.touch_updated_at();

alter table app.export_jobs enable row level security;

drop policy if exists "export_jobs_select_requestor" on app.export_jobs;
create policy "export_jobs_select_requestor"
on app.export_jobs
for select
to authenticated
using (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

drop policy if exists "export_jobs_insert_requestor" on app.export_jobs;
create policy "export_jobs_insert_requestor"
on app.export_jobs
for insert
to authenticated
with check (
  app.has_company_access(company_id)
  and requested_by = auth.uid()
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'analyst')
);

drop policy if exists "export_jobs_update_requestor" on app.export_jobs;
create policy "export_jobs_update_requestor"
on app.export_jobs
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
