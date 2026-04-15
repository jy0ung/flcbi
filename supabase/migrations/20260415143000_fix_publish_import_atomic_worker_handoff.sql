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
set search_path = app, raw, public
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

  if v_import_status not in ('validated', 'normalization_complete', 'publish_in_progress') then
    raise exception 'Import % is not ready for publish from status %', p_import_job_id, v_import_status;
  end if;

  if v_import_status <> 'publish_in_progress' then
    update app.import_jobs
    set status = 'publish_in_progress'
    where company_id = p_company_id
      and id = p_import_job_id;
  end if;

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
    records.branch_id,
    v_dataset_version_id,
    p_import_job_id,
    records.source_row_id,
    records.chassis_no,
    records.model,
    records.payment_method,
    records.salesman_name,
    records.customer_name,
    coalesce(records.is_d2d, false),
    records.bg_date,
    records.shipment_etd_pkg,
    records.shipment_eta,
    records.date_received_by_outlet,
    records.reg_date,
    records.delivery_date,
    records.disb_date,
    records.bg_to_delivery,
    records.bg_to_shipment_etd,
    records.etd_to_outlet_received,
    records.outlet_received_to_reg,
    records.reg_to_delivery,
    records.etd_to_eta,
    records.eta_to_outlet_received,
    records.outlet_received_to_delivery,
    records.bg_to_disb,
    records.delivery_to_disb
  from jsonb_to_recordset(p_vehicle_rows) as records(
    branch_id uuid,
    source_row_id uuid,
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
  );

  delete from app.quality_issues
  where company_id = p_company_id
    and import_job_id = p_import_job_id;

  insert into app.quality_issues (
    company_id,
    branch_id,
    import_job_id,
    source_row_id,
    chassis_no,
    field,
    issue_type,
    message,
    severity
  )
  select
    p_company_id,
    issues.branch_id,
    p_import_job_id,
    issues.source_row_id,
    issues.chassis_no,
    issues.field,
    issues.issue_type,
    issues.message,
    issues.severity
  from jsonb_to_recordset(p_quality_issues) as issues(
    branch_id uuid,
    source_row_id uuid,
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
    preview_available = false,
    dataset_version_id = v_dataset_version_id,
    publish_mode = p_publish_mode,
    processing_started_at = null,
    last_error_at = null,
    error_message = null
  where company_id = p_company_id
    and id = p_import_job_id;

  return v_dataset_version_id;
end;
$$;

grant execute on function app.publish_import_atomic(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb) to service_role;
