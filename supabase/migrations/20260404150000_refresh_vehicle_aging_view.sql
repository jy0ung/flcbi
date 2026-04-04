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
