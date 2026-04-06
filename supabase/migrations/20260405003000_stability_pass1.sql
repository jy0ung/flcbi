create table if not exists app.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  user_id uuid not null references app.user_profiles(id) on delete cascade,
  alert_rule_id uuid references app.alert_rules(id) on delete set null,
  title text not null,
  message text not null,
  type text not null,
  read boolean not null default false,
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notifications_company_user_created
  on app.notifications(company_id, user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on app.notifications(user_id, read, created_at desc);

create unique index if not exists idx_notifications_user_fingerprint
  on app.notifications(user_id, fingerprint);

drop trigger if exists trg_notifications_updated_at on app.notifications;
create trigger trg_notifications_updated_at
before update on app.notifications
for each row execute function app.touch_updated_at();

alter table app.notifications enable row level security;

drop policy if exists "notifications_select_own" on app.notifications;
create policy "notifications_select_own"
on app.notifications
for select
to authenticated
using (
  app.has_company_access(company_id)
  and user_id = auth.uid()
);

drop policy if exists "notifications_update_own" on app.notifications;
create policy "notifications_update_own"
on app.notifications
for update
to authenticated
using (
  app.has_company_access(company_id)
  and user_id = auth.uid()
)
with check (
  app.has_company_access(company_id)
  and user_id = auth.uid()
);

create or replace function app.publish_import_atomic(
  p_company_id uuid,
  p_import_job_id uuid,
  p_published_by uuid,
  p_published_at timestamptz,
  p_publish_mode text,
  p_vehicle_rows jsonb,
  p_quality_issues jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_dataset_version_id uuid := gen_random_uuid();
  v_import_status text;
begin
  if p_publish_mode not in ('replace', 'merge') then
    raise exception 'Unsupported publish mode: %', p_publish_mode;
  end if;

  if coalesce(jsonb_typeof(p_vehicle_rows), 'array') <> 'array' then
    raise exception 'Vehicle payload must be a JSON array';
  end if;

  if coalesce(jsonb_typeof(p_quality_issues), 'array') <> 'array' then
    raise exception 'Quality issue payload must be a JSON array';
  end if;

  if coalesce(jsonb_array_length(p_vehicle_rows), 0) = 0 then
    raise exception 'No canonical vehicle rows were provided for publish';
  end if;

  select import_jobs.status
  into v_import_status
  from app.import_jobs as import_jobs
  where import_jobs.company_id = p_company_id
    and import_jobs.id = p_import_job_id
  for update;

  if not found then
    raise exception 'Import % not found', p_import_job_id;
  end if;

  if v_import_status = 'failed' then
    raise exception 'Import validation failed. Upload a corrected workbook before publishing.';
  end if;

  if v_import_status = 'published' then
    raise exception 'Import % has already been published', p_import_job_id;
  end if;

  if v_import_status = 'publish_in_progress' then
    raise exception 'Import % is already being published', p_import_job_id;
  end if;

  if v_import_status not in ('validated', 'normalization_complete') then
    raise exception 'Import % is not ready for publish from status %', p_import_job_id, v_import_status;
  end if;

  update app.import_jobs
  set status = 'publish_in_progress'
  where company_id = p_company_id
    and id = p_import_job_id;

  if p_publish_mode = 'replace' then
    update app.dataset_versions
    set status = 'superseded'
    where company_id = p_company_id
      and status = 'active';

    delete from app.vehicle_records
    where company_id = p_company_id;
  end if;

  insert into app.dataset_versions (
    id,
    company_id,
    import_job_id,
    status,
    published_by,
    published_at,
    freshness_at
  )
  values (
    v_dataset_version_id,
    p_company_id,
    p_import_job_id,
    'active',
    p_published_by,
    p_published_at,
    p_published_at
  );

  insert into app.vehicle_records (
    company_id,
    branch_id,
    dataset_version_id,
    import_job_id,
    source_row_id,
    chassis_no,
    model,
    payment_method,
    salesman_name,
    customer_name,
    is_d2d,
    bg_date,
    shipment_etd_pkg,
    shipment_eta,
    date_received_by_outlet,
    reg_date,
    delivery_date,
    disb_date,
    bg_to_delivery,
    bg_to_shipment_etd,
    etd_to_outlet_received,
    outlet_received_to_reg,
    reg_to_delivery,
    etd_to_eta,
    eta_to_outlet_received,
    outlet_received_to_delivery,
    bg_to_disb,
    delivery_to_disb
  )
  select
    p_company_id,
    vehicle_rows.branch_id,
    v_dataset_version_id,
    p_import_job_id,
    null::uuid,
    vehicle_rows.chassis_no,
    vehicle_rows.model,
    vehicle_rows.payment_method,
    vehicle_rows.salesman_name,
    vehicle_rows.customer_name,
    coalesce(vehicle_rows.is_d2d, false),
    vehicle_rows.bg_date,
    vehicle_rows.shipment_etd_pkg,
    vehicle_rows.shipment_eta,
    vehicle_rows.date_received_by_outlet,
    vehicle_rows.reg_date,
    vehicle_rows.delivery_date,
    vehicle_rows.disb_date,
    vehicle_rows.bg_to_delivery,
    vehicle_rows.bg_to_shipment_etd,
    vehicle_rows.etd_to_outlet_received,
    vehicle_rows.outlet_received_to_reg,
    vehicle_rows.reg_to_delivery,
    vehicle_rows.etd_to_eta,
    vehicle_rows.eta_to_outlet_received,
    vehicle_rows.outlet_received_to_delivery,
    vehicle_rows.bg_to_disb,
    vehicle_rows.delivery_to_disb
  from jsonb_to_recordset(coalesce(p_vehicle_rows, '[]'::jsonb)) as vehicle_rows(
    branch_id uuid,
    chassis_no text,
    model text,
    payment_method text,
    salesman_name text,
    customer_name text,
    is_d2d boolean,
    bg_date date,
    shipment_etd_pkg date,
    shipment_eta date,
    date_received_by_outlet date,
    reg_date date,
    delivery_date date,
    disb_date date,
    bg_to_delivery integer,
    bg_to_shipment_etd integer,
    etd_to_outlet_received integer,
    outlet_received_to_reg integer,
    reg_to_delivery integer,
    etd_to_eta integer,
    eta_to_outlet_received integer,
    outlet_received_to_delivery integer,
    bg_to_disb integer,
    delivery_to_disb integer
  )
  on conflict (company_id, chassis_no) do update
  set
    branch_id = excluded.branch_id,
    dataset_version_id = excluded.dataset_version_id,
    import_job_id = excluded.import_job_id,
    source_row_id = excluded.source_row_id,
    model = excluded.model,
    payment_method = excluded.payment_method,
    salesman_name = excluded.salesman_name,
    customer_name = excluded.customer_name,
    is_d2d = excluded.is_d2d,
    bg_date = excluded.bg_date,
    shipment_etd_pkg = excluded.shipment_etd_pkg,
    shipment_eta = excluded.shipment_eta,
    date_received_by_outlet = excluded.date_received_by_outlet,
    reg_date = excluded.reg_date,
    delivery_date = excluded.delivery_date,
    disb_date = excluded.disb_date,
    bg_to_delivery = excluded.bg_to_delivery,
    bg_to_shipment_etd = excluded.bg_to_shipment_etd,
    etd_to_outlet_received = excluded.etd_to_outlet_received,
    outlet_received_to_reg = excluded.outlet_received_to_reg,
    reg_to_delivery = excluded.reg_to_delivery,
    etd_to_eta = excluded.etd_to_eta,
    eta_to_outlet_received = excluded.eta_to_outlet_received,
    outlet_received_to_delivery = excluded.outlet_received_to_delivery,
    bg_to_disb = excluded.bg_to_disb,
    delivery_to_disb = excluded.delivery_to_disb;

  delete from app.quality_issues
  where company_id = p_company_id
    and import_job_id = p_import_job_id;

  insert into app.quality_issues (
    company_id,
    branch_id,
    import_job_id,
    dataset_version_id,
    source_row_id,
    chassis_no,
    field,
    issue_type,
    message,
    severity
  )
  select
    p_company_id,
    issue_rows.branch_id,
    p_import_job_id,
    v_dataset_version_id,
    null::uuid,
    issue_rows.chassis_no,
    issue_rows.field,
    issue_rows.issue_type,
    issue_rows.message,
    issue_rows.severity
  from jsonb_to_recordset(coalesce(p_quality_issues, '[]'::jsonb)) as issue_rows(
    branch_id uuid,
    chassis_no text,
    field text,
    issue_type text,
    message text,
    severity text
  );

  update app.import_jobs
  set
    status = 'published',
    published_at = p_published_at,
    dataset_version_id = v_dataset_version_id,
    publish_mode = p_publish_mode,
    preview_available = false
  where company_id = p_company_id
    and id = p_import_job_id;

  return v_dataset_version_id;
end;
$$;
