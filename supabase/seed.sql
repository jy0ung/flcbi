insert into app.companies (id, code, name)
values
  ('00000000-0000-0000-0000-000000000001', 'FLC', 'FLC Auto Group')
on conflict (id) do update
set code = excluded.code,
    name = excluded.name;

insert into app.branches (id, company_id, code, name)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'KK', 'Kota Kinabalu'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'LDU', 'Lahad Datu'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'MYY', 'Miri'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'SBW', 'Sibu'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'SDK', 'Sandakan'),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'TWU', 'Tawau'),
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', 'BTU', 'Bintulu')
on conflict (id) do update
set company_id = excluded.company_id,
    code = excluded.code,
    name = excluded.name;

insert into app.sla_policies (company_id, kpi_id, label, sla_days)
values
  ('00000000-0000-0000-0000-000000000001', 'bg_to_delivery', 'BG Date to Delivery Date', 45),
  ('00000000-0000-0000-0000-000000000001', 'bg_to_shipment_etd', 'BG Date to Shipment ETD PKG', 14),
  ('00000000-0000-0000-0000-000000000001', 'etd_to_outlet', 'Shipment ETD PKG to Date Received by Outlet', 28),
  ('00000000-0000-0000-0000-000000000001', 'outlet_to_reg', 'Date Received by Outlet to Register Date', 7),
  ('00000000-0000-0000-0000-000000000001', 'reg_to_delivery', 'Register Date to Delivery Date', 7),
  ('00000000-0000-0000-0000-000000000001', 'bg_to_disb', 'BG Date to Disb. Date', 60),
  ('00000000-0000-0000-0000-000000000001', 'delivery_to_disb', 'Delivery Date to Disb. Date', 14)
on conflict (company_id, kpi_id) do update
set label = excluded.label,
    sla_days = excluded.sla_days;
