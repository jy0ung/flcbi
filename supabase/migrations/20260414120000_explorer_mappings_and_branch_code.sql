alter table if exists app.vehicle_record_corrections
  drop constraint if exists vehicle_record_corrections_field_name_check;

alter table if exists app.vehicle_record_corrections
  add constraint vehicle_record_corrections_field_name_check check (
    field_name in (
      'bg_date',
      'shipment_etd_pkg',
      'date_received_by_outlet',
      'reg_date',
      'delivery_date',
      'disb_date',
      'branch_code',
      'payment_method',
      'salesman_name',
      'customer_name',
      'remark'
    )
  );

create table if not exists app.explorer_branch_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  raw_value text not null,
  branch_id uuid not null references app.branches(id) on delete cascade,
  approved boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, raw_value)
);

create table if not exists app.explorer_payment_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  raw_value text not null,
  canonical_value text not null,
  approved boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, raw_value)
);

create unique index if not exists idx_explorer_branch_mappings_company_raw_lower
  on app.explorer_branch_mappings (company_id, lower(raw_value));

create unique index if not exists idx_explorer_payment_mappings_company_raw_lower
  on app.explorer_payment_mappings (company_id, lower(raw_value));

drop trigger if exists trg_explorer_branch_mappings_updated_at on app.explorer_branch_mappings;
create trigger trg_explorer_branch_mappings_updated_at
before update on app.explorer_branch_mappings
for each row execute function app.touch_updated_at();

drop trigger if exists trg_explorer_payment_mappings_updated_at on app.explorer_payment_mappings;
create trigger trg_explorer_payment_mappings_updated_at
before update on app.explorer_payment_mappings
for each row execute function app.touch_updated_at();

alter table app.explorer_branch_mappings enable row level security;
alter table app.explorer_payment_mappings enable row level security;

drop policy if exists "explorer_branch_mappings_select_admins" on app.explorer_branch_mappings;
create policy "explorer_branch_mappings_select_admins"
on app.explorer_branch_mappings
for select
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
);

drop policy if exists "explorer_branch_mappings_mutate_admins" on app.explorer_branch_mappings;
create policy "explorer_branch_mappings_mutate_admins"
on app.explorer_branch_mappings
for all
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
)
with check (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
);

drop policy if exists "explorer_payment_mappings_select_admins" on app.explorer_payment_mappings;
create policy "explorer_payment_mappings_select_admins"
on app.explorer_payment_mappings
for select
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
);

drop policy if exists "explorer_payment_mappings_mutate_admins" on app.explorer_payment_mappings;
create policy "explorer_payment_mappings_mutate_admins"
on app.explorer_payment_mappings
for all
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
)
with check (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin')
);
