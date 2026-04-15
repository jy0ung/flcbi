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

  if v_import_status = 'publish_in_progress' then
    raise exception 'Import % is already being published', p_import_job_id;
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
    vehicle_rows.branch_id,
    v_dataset_version_id,
    p_import_job_id,
    vehicle_rows.source_row_id,
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
    issue_rows.source_row_id,
    issue_rows.chassis_no,
    issue_rows.field,
    issue_rows.issue_type,
    issue_rows.message,
    issue_rows.severity
  from jsonb_to_recordset(coalesce(p_quality_issues, '[]'::jsonb)) as issue_rows(
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
    dataset_version_id = v_dataset_version_id,
    publish_mode = p_publish_mode,
    preview_available = false
  where company_id = p_company_id
    and id = p_import_job_id;

  return v_dataset_version_id;
end;
$$;

create or replace function app.apply_explorer_mappings(
  p_company_id uuid,
  p_branch_changes jsonb default '[]'::jsonb,
  p_payment_changes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, raw, public
as $$
declare
  v_branch_change record;
  v_payment_change record;
  v_missing_branch_id uuid;
  v_branch_rows_updated integer := 0;
  v_payment_rows_updated integer := 0;
  v_vehicle_rows_updated integer := 0;
  v_quality_rows_updated integer := 0;
  v_count integer := 0;
begin
  if coalesce(jsonb_typeof(p_branch_changes), 'array') <> 'array' then
    raise exception 'Branch mapping payload must be a JSON array';
  end if;

  if coalesce(jsonb_typeof(p_payment_changes), 'array') <> 'array' then
    raise exception 'Payment mapping payload must be a JSON array';
  end if;

  select branch_rows.branch_id
  into v_missing_branch_id
  from jsonb_to_recordset(coalesce(p_branch_changes, '[]'::jsonb)) as branch_rows(
    raw_value text,
    branch_id uuid,
    approved boolean
  )
  left join app.branches as branches
    on branches.id = branch_rows.branch_id
   and branches.company_id = p_company_id
  where nullif(trim(branch_rows.raw_value), '') is null
     or branch_rows.branch_id is null
     or branches.id is null
  limit 1;

  if found then
    raise exception 'Branch mapping payload contains an invalid branch assignment';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payment_changes, '[]'::jsonb)) as payment_rows(
      raw_value text,
      canonical_value text,
      approved boolean
    )
    where nullif(trim(payment_rows.raw_value), '') is null
       or nullif(trim(payment_rows.canonical_value), '') is null
  ) then
    raise exception 'Payment mapping payload contains blank values';
  end if;

  insert into app.explorer_branch_mappings (
    company_id,
    raw_value,
    branch_id,
    approved
  )
  select
    p_company_id,
    trim(branch_rows.raw_value),
    branch_rows.branch_id,
    coalesce(branch_rows.approved, true)
  from jsonb_to_recordset(coalesce(p_branch_changes, '[]'::jsonb)) as branch_rows(
    raw_value text,
    branch_id uuid,
    approved boolean
  )
  on conflict (company_id, raw_value) do update
  set
    branch_id = excluded.branch_id,
    approved = excluded.approved,
    updated_at = timezone('utc', now());

  insert into app.explorer_payment_mappings (
    company_id,
    raw_value,
    canonical_value,
    approved
  )
  select
    p_company_id,
    trim(payment_rows.raw_value),
    trim(payment_rows.canonical_value),
    coalesce(payment_rows.approved, true)
  from jsonb_to_recordset(coalesce(p_payment_changes, '[]'::jsonb)) as payment_rows(
    raw_value text,
    canonical_value text,
    approved boolean
  )
  on conflict (company_id, raw_value) do update
  set
    canonical_value = excluded.canonical_value,
    approved = excluded.approved,
    updated_at = timezone('utc', now());

  for v_branch_change in
    select
      trim(branch_rows.raw_value) as raw_value,
      branch_rows.branch_id,
      coalesce(branch_rows.approved, true) as approved
    from jsonb_to_recordset(coalesce(p_branch_changes, '[]'::jsonb)) as branch_rows(
      raw_value text,
      branch_id uuid,
      approved boolean
    )
  loop
    if not v_branch_change.approved then
      continue;
    end if;

    with matching_rows as (
      select id, chassis_no
      from raw.vehicle_import_rows
      where company_id = p_company_id
        and lower(coalesce(raw_payload ->> 'branch_code', '')) = lower(v_branch_change.raw_value)
    )
    update raw.vehicle_import_rows as rows
    set branch_id = v_branch_change.branch_id
    where rows.id in (select id from matching_rows);
    get diagnostics v_count = row_count;
    v_branch_rows_updated := v_branch_rows_updated + v_count;

    with matching_rows as (
      select id, chassis_no
      from raw.vehicle_import_rows
      where company_id = p_company_id
        and lower(coalesce(raw_payload ->> 'branch_code', '')) = lower(v_branch_change.raw_value)
    )
    update app.vehicle_records as records
    set branch_id = v_branch_change.branch_id
    where records.company_id = p_company_id
      and (
        records.source_row_id in (select id from matching_rows)
        or (records.source_row_id is null and records.chassis_no in (select chassis_no from matching_rows))
      );
    get diagnostics v_count = row_count;
    v_vehicle_rows_updated := v_vehicle_rows_updated + v_count;

    with matching_rows as (
      select id, chassis_no
      from raw.vehicle_import_rows
      where company_id = p_company_id
        and lower(coalesce(raw_payload ->> 'branch_code', '')) = lower(v_branch_change.raw_value)
    )
    update app.quality_issues as issues
    set branch_id = v_branch_change.branch_id
    where issues.company_id = p_company_id
      and (
        issues.source_row_id in (select id from matching_rows)
        or (issues.source_row_id is null and issues.chassis_no in (select chassis_no from matching_rows))
      );
    get diagnostics v_count = row_count;
    v_quality_rows_updated := v_quality_rows_updated + v_count;
  end loop;

  for v_payment_change in
    select
      trim(payment_rows.raw_value) as raw_value,
      trim(payment_rows.canonical_value) as canonical_value,
      coalesce(payment_rows.approved, true) as approved
    from jsonb_to_recordset(coalesce(p_payment_changes, '[]'::jsonb)) as payment_rows(
      raw_value text,
      canonical_value text,
      approved boolean
    )
  loop
    if not v_payment_change.approved then
      continue;
    end if;

    with matching_rows as (
      select id, chassis_no
      from raw.vehicle_import_rows
      where company_id = p_company_id
        and lower(coalesce(raw_payload ->> 'payment_method', coalesce(payment_method, ''))) = lower(v_payment_change.raw_value)
    )
    update raw.vehicle_import_rows as rows
    set payment_method = v_payment_change.canonical_value
    where rows.id in (select id from matching_rows);
    get diagnostics v_count = row_count;
    v_payment_rows_updated := v_payment_rows_updated + v_count;

    with matching_rows as (
      select id, chassis_no
      from raw.vehicle_import_rows
      where company_id = p_company_id
        and lower(coalesce(raw_payload ->> 'payment_method', coalesce(payment_method, ''))) = lower(v_payment_change.raw_value)
    )
    update app.vehicle_records as records
    set payment_method = v_payment_change.canonical_value
    where records.company_id = p_company_id
      and (
        records.source_row_id in (select id from matching_rows)
        or (records.source_row_id is null and records.chassis_no in (select chassis_no from matching_rows))
      );
    get diagnostics v_count = row_count;
    v_vehicle_rows_updated := v_vehicle_rows_updated + v_count;
  end loop;

  return jsonb_build_object(
    'branch_rows_updated', v_branch_rows_updated,
    'payment_rows_updated', v_payment_rows_updated,
    'vehicle_rows_updated', v_vehicle_rows_updated,
    'quality_rows_updated', v_quality_rows_updated
  );
end;
$$;

grant execute on function app.publish_import_atomic(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb) to service_role;
grant execute on function app.apply_explorer_mappings(uuid, jsonb, jsonb) to service_role;
