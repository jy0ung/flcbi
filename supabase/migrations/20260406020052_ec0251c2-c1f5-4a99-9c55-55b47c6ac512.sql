
-- Vehicles canonical table
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chassis_no TEXT NOT NULL,
  bg_date DATE,
  shipment_etd_pkg DATE,
  shipment_eta_kk_twu_sdk DATE,
  date_received_by_outlet DATE,
  reg_date DATE,
  delivery_date DATE,
  disb_date DATE,
  branch_code TEXT NOT NULL DEFAULT 'Unknown',
  model TEXT NOT NULL DEFAULT 'Unknown',
  payment_method TEXT NOT NULL DEFAULT 'Unknown',
  salesman_name TEXT NOT NULL DEFAULT 'Unknown',
  customer_name TEXT NOT NULL DEFAULT 'Unknown',
  remark TEXT,
  vaa_date DATE,
  full_payment_date DATE,
  is_d2d BOOLEAN NOT NULL DEFAULT false,
  import_batch_id UUID,
  source_row_id TEXT,
  variant TEXT,
  dealer_transfer_price TEXT,
  full_payment_type TEXT,
  shipment_name TEXT,
  lou TEXT,
  contra_sola TEXT,
  reg_no TEXT,
  invoice_no TEXT,
  obr TEXT,
  -- Computed KPIs
  bg_to_delivery INTEGER,
  bg_to_shipment_etd INTEGER,
  etd_to_outlet INTEGER,
  outlet_to_reg INTEGER,
  reg_to_delivery INTEGER,
  bg_to_disb INTEGER,
  delivery_to_disb INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_vehicles_chassis_no ON public.vehicles (chassis_no);
CREATE INDEX idx_vehicles_branch_code ON public.vehicles (branch_code);
CREATE INDEX idx_vehicles_model ON public.vehicles (model);
CREATE INDEX idx_vehicles_import_batch_id ON public.vehicles (import_batch_id);
CREATE INDEX idx_vehicles_bg_to_delivery ON public.vehicles (bg_to_delivery);

-- Import batches table
CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'uploaded',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quality issues table
CREATE TABLE public.quality_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chassis_no TEXT NOT NULL,
  field TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_issues_batch ON public.quality_issues (import_batch_id);

-- SLA policies table
CREATE TABLE public.sla_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sla_days INTEGER NOT NULL,
  company_id TEXT NOT NULL DEFAULT 'c1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sla_policies_kpi ON public.sla_policies (kpi_id, company_id);

-- Dashboard preferences table for KPI customization
CREATE TABLE public.dashboard_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  selected_kpis TEXT[] NOT NULL DEFAULT ARRAY['bg_to_delivery','bg_to_shipment_etd','etd_to_outlet','outlet_to_reg','reg_to_delivery','bg_to_disb','delivery_to_disb'],
  show_advanced_kpis BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dashboard_prefs_user ON public.dashboard_preferences (user_id);

-- Enable RLS on all tables
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- For now, allow all authenticated users to read/write (enterprise multi-tenant RLS can be added later)
CREATE POLICY "Allow all read on vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all insert on vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all delete on vehicles" ON public.vehicles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow all read on import_batches" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all insert on import_batches" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on import_batches" ON public.import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all read on quality_issues" ON public.quality_issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all insert on quality_issues" ON public.quality_issues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow all delete on quality_issues" ON public.quality_issues FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow all read on sla_policies" ON public.sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all insert on sla_policies" ON public.sla_policies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on sla_policies" ON public.sla_policies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all read on dashboard_preferences" ON public.dashboard_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all insert on dashboard_preferences" ON public.dashboard_preferences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on dashboard_preferences" ON public.dashboard_preferences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon access for now since auth is demo-mode
CREATE POLICY "Allow anon read on vehicles" ON public.vehicles FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on vehicles" ON public.vehicles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on vehicles" ON public.vehicles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on vehicles" ON public.vehicles FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon read on import_batches" ON public.import_batches FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on import_batches" ON public.import_batches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on import_batches" ON public.import_batches FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read on quality_issues" ON public.quality_issues FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on quality_issues" ON public.quality_issues FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete on quality_issues" ON public.quality_issues FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon read on sla_policies" ON public.sla_policies FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on sla_policies" ON public.sla_policies FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on sla_policies" ON public.sla_policies FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read on dashboard_preferences" ON public.dashboard_preferences FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on dashboard_preferences" ON public.dashboard_preferences FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on dashboard_preferences" ON public.dashboard_preferences FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Insert default SLA policies
INSERT INTO public.sla_policies (kpi_id, label, sla_days, company_id) VALUES
  ('bg_to_delivery', 'BG → Delivery', 45, 'c1'),
  ('bg_to_shipment_etd', 'BG → ETD', 14, 'c1'),
  ('etd_to_outlet', 'ETD → Outlet', 28, 'c1'),
  ('outlet_to_reg', 'Outlet → Reg', 7, 'c1'),
  ('reg_to_delivery', 'Reg → Delivery', 14, 'c1'),
  ('bg_to_disb', 'BG → Disb', 60, 'c1'),
  ('delivery_to_disb', 'Delivery → Disb', 14, 'c1');
