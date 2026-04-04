alter table if exists raw.vehicle_import_rows
  add column if not exists reg_date date;

alter table if exists app.vehicle_records
  add column if not exists reg_date date;

alter table if exists app.vehicle_records
  add column if not exists etd_to_outlet_received integer;

alter table if exists app.vehicle_records
  add column if not exists outlet_received_to_reg integer;

alter table if exists app.vehicle_records
  add column if not exists reg_to_delivery integer;

update raw.vehicle_import_rows
set reg_date = nullif(raw_payload ->> 'reg_date', '')::date
where reg_date is null
  and nullif(raw_payload ->> 'reg_date', '') is not null;

with raw_reg_dates as (
  select
    company_id,
    import_job_id,
    chassis_no,
    max(reg_date) as reg_date
  from raw.vehicle_import_rows
  where reg_date is not null
  group by company_id, import_job_id, chassis_no
)
update app.vehicle_records as vehicle_records
set reg_date = coalesce(vehicle_records.reg_date, raw_reg_dates.reg_date)
from raw_reg_dates
where vehicle_records.company_id = raw_reg_dates.company_id
  and vehicle_records.import_job_id = raw_reg_dates.import_job_id
  and vehicle_records.chassis_no = raw_reg_dates.chassis_no
  and vehicle_records.reg_date is null;

update app.vehicle_records
set
  etd_to_outlet_received = case
    when shipment_etd_pkg is not null and date_received_by_outlet is not null
      then date_received_by_outlet - shipment_etd_pkg
    else null
  end,
  outlet_received_to_reg = case
    when date_received_by_outlet is not null and reg_date is not null
      then reg_date - date_received_by_outlet
    else null
  end,
  reg_to_delivery = case
    when reg_date is not null and delivery_date is not null
      then delivery_date - reg_date
    else null
  end;

with legacy_sla as (
  select
    companies.id as company_id,
    max(case when sla_policies.kpi_id = 'etd_to_eta' then sla_policies.sla_days end) as etd_to_eta_days,
    max(case when sla_policies.kpi_id = 'eta_to_outlet' then sla_policies.sla_days end) as eta_to_outlet_days,
    max(case when sla_policies.kpi_id = 'outlet_to_delivery' then sla_policies.sla_days end) as outlet_to_delivery_days
  from app.companies as companies
  left join app.sla_policies as sla_policies on sla_policies.company_id = companies.id
  group by companies.id
),
split_sla as (
  select
    company_id,
    coalesce(etd_to_eta_days, 21) + coalesce(eta_to_outlet_days, 7) as etd_to_outlet_days,
    greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer) as outlet_to_reg_days,
    greatest(
      1,
      coalesce(outlet_to_delivery_days, 14) - greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer)
    ) as reg_to_delivery_days
  from legacy_sla
)
insert into app.sla_policies (company_id, kpi_id, label, sla_days)
select
  company_id,
  'etd_to_outlet',
  'Shipment ETD PKG to Date Received by Outlet',
  etd_to_outlet_days
from split_sla
on conflict (company_id, kpi_id) do update
set label = excluded.label,
    sla_days = excluded.sla_days;

with legacy_sla as (
  select
    companies.id as company_id,
    max(case when sla_policies.kpi_id = 'outlet_to_delivery' then sla_policies.sla_days end) as outlet_to_delivery_days
  from app.companies as companies
  left join app.sla_policies as sla_policies on sla_policies.company_id = companies.id
  group by companies.id
),
split_sla as (
  select
    company_id,
    greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer) as outlet_to_reg_days,
    greatest(
      1,
      coalesce(outlet_to_delivery_days, 14) - greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer)
    ) as reg_to_delivery_days
  from legacy_sla
)
insert into app.sla_policies (company_id, kpi_id, label, sla_days)
select
  company_id,
  'outlet_to_reg',
  'Date Received by Outlet to Register Date',
  outlet_to_reg_days
from split_sla
on conflict (company_id, kpi_id) do update
set label = excluded.label,
    sla_days = excluded.sla_days;

with legacy_sla as (
  select
    companies.id as company_id,
    max(case when sla_policies.kpi_id = 'outlet_to_delivery' then sla_policies.sla_days end) as outlet_to_delivery_days
  from app.companies as companies
  left join app.sla_policies as sla_policies on sla_policies.company_id = companies.id
  group by companies.id
),
split_sla as (
  select
    company_id,
    greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer) as outlet_to_reg_days,
    greatest(
      1,
      coalesce(outlet_to_delivery_days, 14) - greatest(1, floor(coalesce(outlet_to_delivery_days, 14) / 2.0)::integer)
    ) as reg_to_delivery_days
  from legacy_sla
)
insert into app.sla_policies (company_id, kpi_id, label, sla_days)
select
  company_id,
  'reg_to_delivery',
  'Register Date to Delivery Date',
  reg_to_delivery_days
from split_sla
on conflict (company_id, kpi_id) do update
set label = excluded.label,
    sla_days = excluded.sla_days;

delete from app.sla_policies
where kpi_id in ('etd_to_eta', 'eta_to_outlet', 'outlet_to_delivery');

drop view if exists mart.aging_summary;
drop view if exists mart.vehicle_aging;

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
  vehicle_records.reg_date,
  vehicle_records.delivery_date,
  vehicle_records.disb_date,
  vehicle_records.bg_to_delivery,
  vehicle_records.bg_to_shipment_etd,
  vehicle_records.etd_to_outlet_received,
  vehicle_records.outlet_received_to_reg,
  vehicle_records.reg_to_delivery,
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
  avg(vehicle_records.etd_to_outlet_received)::numeric(10,2) as avg_etd_to_outlet,
  avg(vehicle_records.outlet_received_to_reg)::numeric(10,2) as avg_outlet_to_reg,
  avg(vehicle_records.reg_to_delivery)::numeric(10,2) as avg_reg_to_delivery,
  avg(vehicle_records.etd_to_eta)::numeric(10,2) as avg_etd_to_eta,
  avg(vehicle_records.outlet_received_to_delivery)::numeric(10,2) as avg_outlet_to_delivery,
  max(dataset_versions.published_at) as last_refresh_at
from app.vehicle_records as vehicle_records
left join app.branches as branches on branches.id = vehicle_records.branch_id
left join app.dataset_versions as dataset_versions on dataset_versions.id = vehicle_records.dataset_version_id
group by vehicle_records.company_id, vehicle_records.branch_id, branches.code;
