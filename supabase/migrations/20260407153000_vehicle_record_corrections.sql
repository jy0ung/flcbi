create table if not exists app.vehicle_record_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  chassis_no text not null,
  field_name text not null check (
    field_name in (
      'bg_date',
      'shipment_etd_pkg',
      'date_received_by_outlet',
      'reg_date',
      'delivery_date',
      'disb_date',
      'payment_method',
      'salesman_name',
      'customer_name',
      'remark'
    )
  ),
  value_text text,
  reason text not null,
  updated_by uuid references app.user_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_id, chassis_no, field_name)
);

create index if not exists idx_vehicle_record_corrections_company_chassis
  on app.vehicle_record_corrections(company_id, chassis_no);

drop trigger if exists trg_vehicle_record_corrections_updated_at on app.vehicle_record_corrections;
create trigger trg_vehicle_record_corrections_updated_at
before update on app.vehicle_record_corrections
for each row execute function app.touch_updated_at();

alter table app.vehicle_record_corrections enable row level security;

drop policy if exists "vehicle_record_corrections_select_admins" on app.vehicle_record_corrections;
create policy "vehicle_record_corrections_select_admins"
on app.vehicle_record_corrections
for select
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin', 'director')
);

drop policy if exists "vehicle_record_corrections_mutate_admins" on app.vehicle_record_corrections;
create policy "vehicle_record_corrections_mutate_admins"
on app.vehicle_record_corrections
for all
to authenticated
using (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin', 'director')
)
with check (
  app.has_company_access(company_id)
  and app.current_app_role() in ('super_admin', 'company_admin', 'director')
);
