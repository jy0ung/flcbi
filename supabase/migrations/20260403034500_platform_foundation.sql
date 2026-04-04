create extension if not exists pgcrypto;
create extension if not exists pgmq;
create extension if not exists pg_cron;

create schema if not exists app;
create schema if not exists raw;
create schema if not exists mart;

grant usage on schema app, raw, mart to service_role;
grant all privileges on all tables in schema app, raw, mart to service_role;
grant all privileges on all sequences in schema app, raw, mart to service_role;
grant all privileges on all functions in schema app, raw, mart to service_role;

alter default privileges in schema app grant all privileges on tables to service_role;
alter default privileges in schema app grant all privileges on sequences to service_role;
alter default privileges in schema app grant all privileges on functions to service_role;

alter default privileges in schema raw grant all privileges on tables to service_role;
alter default privileges in schema raw grant all privileges on sequences to service_role;
alter default privileges in schema raw grant all privileges on functions to service_role;

alter default privileges in schema mart grant all privileges on tables to service_role;
alter default privileges in schema mart grant all privileges on sequences to service_role;
alter default privileges in schema mart grant all privileges on functions to service_role;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function app.current_company_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid;
$$;

create or replace function app.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'app_role', 'authenticated');
$$;

create or replace function app.current_branch_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array(
      select branches.value::uuid
      from jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'branch_ids', '[]'::jsonb)
      ) as branches(value)
    ),
    array[]::uuid[]
  );
$$;

create or replace function app.has_company_access(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select target_company_id is not null
    and target_company_id = app.current_company_id();
$$;

create or replace function app.has_branch_access(target_branch_id uuid)
returns boolean
language sql
stable
as $$
  select
    app.current_app_role() in ('super_admin', 'company_admin', 'director', 'analyst')
    or target_branch_id = any(app.current_branch_ids());
$$;

create table if not exists app.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, code)
);

create table if not exists app.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  primary_branch_id uuid references app.branches(id) on delete set null,
  email text not null unique,
  display_name text not null,
  app_role text not null default 'manager',
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.user_branch_access (
  user_id uuid not null references app.user_profiles(id) on delete cascade,
  branch_id uuid not null references app.branches(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, branch_id)
);

create table if not exists app.sla_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  kpi_id text not null,
  label text not null,
  sla_days integer not null check (sla_days >= 0),
  updated_by uuid references app.user_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, kpi_id)
);

create table if not exists app.import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  uploaded_by uuid references app.user_profiles(id) on delete set null,
  file_name text not null,
  storage_path text not null,
  status text not null default 'uploaded',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  preview_available boolean not null default false,
  dataset_version_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  import_job_id uuid references app.import_jobs(id) on delete set null,
  status text not null default 'draft',
  published_by uuid references app.user_profiles(id) on delete set null,
  published_at timestamptz,
  rollback_of uuid references app.dataset_versions(id) on delete set null,
  data_quality_score numeric(5,2),
  freshness_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists raw.vehicle_import_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  import_job_id uuid not null references app.import_jobs(id) on delete cascade,
  dataset_version_id uuid references app.dataset_versions(id) on delete set null,
  branch_id uuid references app.branches(id) on delete set null,
  source_row_number integer not null,
  chassis_no text not null,
  model text,
  payment_method text,
  salesman_name text,
  customer_name text,
  is_d2d boolean not null default false,
  bg_date date,
  shipment_etd_pkg date,
  shipment_eta date,
  date_received_by_outlet date,
  delivery_date date,
  disb_date date,
  raw_payload jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.vehicle_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  branch_id uuid references app.branches(id) on delete set null,
  dataset_version_id uuid not null references app.dataset_versions(id) on delete cascade,
  import_job_id uuid not null references app.import_jobs(id) on delete cascade,
  source_row_id uuid references raw.vehicle_import_rows(id) on delete set null,
  chassis_no text not null,
  model text,
  payment_method text,
  salesman_name text,
  customer_name text,
  is_d2d boolean not null default false,
  bg_date date,
  shipment_etd_pkg date,
  shipment_eta date,
  date_received_by_outlet date,
  delivery_date date,
  disb_date date,
  bg_to_delivery integer,
  bg_to_shipment_etd integer,
  etd_to_eta integer,
  eta_to_outlet_received integer,
  outlet_received_to_delivery integer,
  bg_to_disb integer,
  delivery_to_disb integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, chassis_no)
);

create table if not exists app.quality_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  branch_id uuid references app.branches(id) on delete set null,
  import_job_id uuid not null references app.import_jobs(id) on delete cascade,
  dataset_version_id uuid references app.dataset_versions(id) on delete set null,
  source_row_id uuid references raw.vehicle_import_rows(id) on delete set null,
  chassis_no text,
  field text not null,
  issue_type text not null,
  message text not null,
  severity text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.alert_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  created_by uuid references app.user_profiles(id) on delete set null,
  name text not null,
  metric_id text not null,
  threshold numeric(12,2) not null,
  comparator text not null,
  frequency text not null,
  channel text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  created_by uuid references app.user_profiles(id) on delete set null,
  module text not null,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references app.companies(id) on delete set null,
  user_id uuid references app.user_profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_branches_company_id on app.branches(company_id);
create index if not exists idx_user_profiles_company_id on app.user_profiles(company_id);
create index if not exists idx_user_branch_access_branch_id on app.user_branch_access(branch_id);
create index if not exists idx_import_jobs_company_id on app.import_jobs(company_id);
create index if not exists idx_import_jobs_status on app.import_jobs(status);
create index if not exists idx_dataset_versions_company_id on app.dataset_versions(company_id);
create index if not exists idx_vehicle_records_company_branch on app.vehicle_records(company_id, branch_id);
create index if not exists idx_vehicle_records_import_job on app.vehicle_records(import_job_id);
create index if not exists idx_vehicle_records_dataset on app.vehicle_records(dataset_version_id);
create index if not exists idx_vehicle_records_model on app.vehicle_records(model);
create index if not exists idx_quality_issues_company_branch on app.quality_issues(company_id, branch_id);
create index if not exists idx_raw_vehicle_import_rows_company_job on raw.vehicle_import_rows(company_id, import_job_id);
create index if not exists idx_raw_vehicle_import_rows_branch_id on raw.vehicle_import_rows(branch_id);

drop trigger if exists trg_companies_updated_at on app.companies;
create trigger trg_companies_updated_at
before update on app.companies
for each row execute function app.touch_updated_at();

drop trigger if exists trg_branches_updated_at on app.branches;
create trigger trg_branches_updated_at
before update on app.branches
for each row execute function app.touch_updated_at();

drop trigger if exists trg_user_profiles_updated_at on app.user_profiles;
create trigger trg_user_profiles_updated_at
before update on app.user_profiles
for each row execute function app.touch_updated_at();

drop trigger if exists trg_sla_policies_updated_at on app.sla_policies;
create trigger trg_sla_policies_updated_at
before update on app.sla_policies
for each row execute function app.touch_updated_at();

drop trigger if exists trg_import_jobs_updated_at on app.import_jobs;
create trigger trg_import_jobs_updated_at
before update on app.import_jobs
for each row execute function app.touch_updated_at();

drop trigger if exists trg_dataset_versions_updated_at on app.dataset_versions;
create trigger trg_dataset_versions_updated_at
before update on app.dataset_versions
for each row execute function app.touch_updated_at();

drop trigger if exists trg_vehicle_records_updated_at on app.vehicle_records;
create trigger trg_vehicle_records_updated_at
before update on app.vehicle_records
for each row execute function app.touch_updated_at();

drop trigger if exists trg_alert_rules_updated_at on app.alert_rules;
create trigger trg_alert_rules_updated_at
before update on app.alert_rules
for each row execute function app.touch_updated_at();

drop trigger if exists trg_saved_views_updated_at on app.saved_views;
create trigger trg_saved_views_updated_at
before update on app.saved_views
for each row execute function app.touch_updated_at();

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  insert into app.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  profile record;
  branch_ids jsonb;
begin
  select
    user_profiles.company_id,
    user_profiles.app_role,
    user_profiles.status
  into profile
  from app.user_profiles
  where user_profiles.id = (event ->> 'user_id')::uuid;

  select coalesce(jsonb_agg(user_branch_access.branch_id), '[]'::jsonb)
  into branch_ids
  from app.user_branch_access
  where user_branch_access.user_id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if profile.company_id is not null then
    claims := jsonb_set(claims, '{app_metadata,company_id}', to_jsonb(profile.company_id::text), true);
    claims := jsonb_set(claims, '{app_metadata,app_role}', to_jsonb(profile.app_role), true);
    claims := jsonb_set(claims, '{app_metadata,status}', to_jsonb(profile.status), true);
    claims := jsonb_set(claims, '{app_metadata,branch_ids}', branch_ids, true);
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant usage on schema app to supabase_auth_admin;
grant select on table app.user_profiles to supabase_auth_admin;
grant select on table app.user_branch_access to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb) from anon;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated;
revoke execute on function public.custom_access_token_hook(jsonb) from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('flcbi-imports', 'flcbi-imports', false, 52428800, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('flcbi-exports', 'flcbi-exports', false, 52428800, array['text/csv', 'application/json'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table app.companies enable row level security;
alter table app.branches enable row level security;
alter table app.user_profiles enable row level security;
alter table app.user_branch_access enable row level security;
alter table app.sla_policies enable row level security;
alter table app.import_jobs enable row level security;
alter table app.dataset_versions enable row level security;
alter table raw.vehicle_import_rows enable row level security;
alter table app.vehicle_records enable row level security;
alter table app.quality_issues enable row level security;
alter table app.alert_rules enable row level security;
alter table app.saved_views enable row level security;
alter table app.audit_events enable row level security;

drop policy if exists "companies_select_same_company" on app.companies;
create policy "companies_select_same_company"
on app.companies
for select
to authenticated
using (app.has_company_access(id));

drop policy if exists "branches_select_permitted" on app.branches;
create policy "branches_select_permitted"
on app.branches
for select
to authenticated
using (app.has_company_access(company_id) and app.has_branch_access(id));

drop policy if exists "user_profiles_select_same_company" on app.user_profiles;
create policy "user_profiles_select_same_company"
on app.user_profiles
for select
to authenticated
using (app.has_company_access(company_id) or id = auth.uid());

drop policy if exists "user_profiles_select_auth_admin" on app.user_profiles;
create policy "user_profiles_select_auth_admin"
on app.user_profiles
for select
to supabase_auth_admin
using (true);

drop policy if exists "user_branch_access_select_self" on app.user_branch_access;
create policy "user_branch_access_select_self"
on app.user_branch_access
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_branch_access_select_auth_admin" on app.user_branch_access;
create policy "user_branch_access_select_auth_admin"
on app.user_branch_access
for select
to supabase_auth_admin
using (true);

drop policy if exists "sla_policies_select_same_company" on app.sla_policies;
create policy "sla_policies_select_same_company"
on app.sla_policies
for select
to authenticated
using (app.has_company_access(company_id));

drop policy if exists "import_jobs_select_same_company" on app.import_jobs;
create policy "import_jobs_select_same_company"
on app.import_jobs
for select
to authenticated
using (app.has_company_access(company_id));

drop policy if exists "dataset_versions_select_same_company" on app.dataset_versions;
create policy "dataset_versions_select_same_company"
on app.dataset_versions
for select
to authenticated
using (app.has_company_access(company_id));

drop policy if exists "raw_vehicle_rows_select_permitted" on raw.vehicle_import_rows;
create policy "raw_vehicle_rows_select_permitted"
on raw.vehicle_import_rows
for select
to authenticated
using (
  app.has_company_access(company_id)
  and (branch_id is null or app.has_branch_access(branch_id))
);

drop policy if exists "vehicle_records_select_permitted" on app.vehicle_records;
create policy "vehicle_records_select_permitted"
on app.vehicle_records
for select
to authenticated
using (
  app.has_company_access(company_id)
  and (branch_id is null or app.has_branch_access(branch_id))
);

drop policy if exists "quality_issues_select_permitted" on app.quality_issues;
create policy "quality_issues_select_permitted"
on app.quality_issues
for select
to authenticated
using (
  app.has_company_access(company_id)
  and (branch_id is null or app.has_branch_access(branch_id))
);

drop policy if exists "alert_rules_select_same_company" on app.alert_rules;
create policy "alert_rules_select_same_company"
on app.alert_rules
for select
to authenticated
using (app.has_company_access(company_id));

drop policy if exists "saved_views_select_same_company" on app.saved_views;
create policy "saved_views_select_same_company"
on app.saved_views
for select
to authenticated
using (app.has_company_access(company_id));

drop policy if exists "audit_events_select_admins" on app.audit_events;
create policy "audit_events_select_admins"
on app.audit_events
for select
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin', 'director')
);

drop policy if exists "storage_imports_read_same_company" on storage.objects;
create policy "storage_imports_read_same_company"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('flcbi-imports', 'flcbi-exports')
  and (storage.foldername(name))[1] = coalesce(app.current_company_id()::text, '')
);

drop policy if exists "storage_imports_write_admins" on storage.objects;
create policy "storage_imports_write_admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('flcbi-imports', 'flcbi-exports')
  and app.current_app_role() in ('super_admin', 'company_admin', 'director', 'manager', 'analyst')
  and (storage.foldername(name))[1] = coalesce(app.current_company_id()::text, '')
);

create or replace view mart.vehicle_aging as
select
  vehicle_records.id,
  vehicle_records.company_id,
  vehicle_records.branch_id,
  branches.code as branch_code,
  branches.name as branch_name,
  vehicle_records.dataset_version_id,
  vehicle_records.import_job_id,
  vehicle_records.source_row_id,
  vehicle_records.chassis_no,
  vehicle_records.model,
  vehicle_records.payment_method,
  vehicle_records.salesman_name,
  vehicle_records.customer_name,
  vehicle_records.is_d2d,
  vehicle_records.bg_date,
  vehicle_records.shipment_etd_pkg,
  vehicle_records.shipment_eta,
  vehicle_records.date_received_by_outlet,
  vehicle_records.delivery_date,
  vehicle_records.disb_date,
  vehicle_records.bg_to_delivery,
  vehicle_records.bg_to_shipment_etd,
  vehicle_records.etd_to_eta,
  vehicle_records.eta_to_outlet_received,
  vehicle_records.outlet_received_to_delivery,
  vehicle_records.bg_to_disb,
  vehicle_records.delivery_to_disb,
  vehicle_records.created_at,
  vehicle_records.updated_at
from app.vehicle_records as vehicle_records
left join app.branches as branches on branches.id = vehicle_records.branch_id;

create or replace view mart.aging_summary as
select
  vehicle_records.company_id,
  vehicle_records.branch_id,
  branches.code as branch_code,
  count(*) as total_vehicles,
  count(*) filter (where coalesce(vehicle_records.bg_to_delivery, 0) > 45) as total_overdue_bg_to_delivery,
  avg(vehicle_records.bg_to_delivery)::numeric(10,2) as avg_bg_to_delivery,
  avg(vehicle_records.etd_to_eta)::numeric(10,2) as avg_etd_to_eta,
  avg(vehicle_records.outlet_received_to_delivery)::numeric(10,2) as avg_outlet_to_delivery,
  max(dataset_versions.published_at) as last_refresh_at
from app.vehicle_records as vehicle_records
left join app.branches as branches on branches.id = vehicle_records.branch_id
left join app.dataset_versions as dataset_versions on dataset_versions.id = vehicle_records.dataset_version_id
group by vehicle_records.company_id, vehicle_records.branch_id, branches.code;

do $$
begin
  perform pgmq.create('imports');
exception when others then
  null;
end;
$$;

do $$
begin
  perform pgmq.create('alerts');
exception when others then
  null;
end;
$$;

do $$
begin
  perform pgmq.create('exports');
exception when others then
  null;
end;
$$;
