import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { computeKpiSummaries } from '@/data/demo-data';
import { supabase } from '@/integrations/supabase/client';

interface DataContextType {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
  kpiSummaries: KpiSummary[];
  lastRefresh: string;
  loading: boolean;
  setVehicles: (v: VehicleCanonical[]) => void;
  addImportBatch: (b: ImportBatch) => void;
  updateImportBatch: (id: string, updates: Partial<ImportBatch>) => void;
  addQualityIssues: (issues: DataQualityIssue[]) => void;
  updateSla: (id: string, slaDays: number) => void;
  refreshKpis: () => void;
  reloadFromDb: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

function mapDbVehicle(row: Record<string, unknown>): VehicleCanonical {
  return {
    id: String(row.id),
    chassis_no: String(row.chassis_no),
    bg_date: row.bg_date ? String(row.bg_date) : undefined,
    shipment_etd_pkg: row.shipment_etd_pkg ? String(row.shipment_etd_pkg) : undefined,
    shipment_eta_kk_twu_sdk: row.shipment_eta_kk_twu_sdk ? String(row.shipment_eta_kk_twu_sdk) : undefined,
    date_received_by_outlet: row.date_received_by_outlet ? String(row.date_received_by_outlet) : undefined,
    reg_date: row.reg_date ? String(row.reg_date) : undefined,
    delivery_date: row.delivery_date ? String(row.delivery_date) : undefined,
    disb_date: row.disb_date ? String(row.disb_date) : undefined,
    branch_code: String(row.branch_code ?? 'Unknown'),
    model: String(row.model ?? 'Unknown'),
    payment_method: String(row.payment_method ?? 'Unknown'),
    salesman_name: String(row.salesman_name ?? 'Unknown'),
    customer_name: String(row.customer_name ?? 'Unknown'),
    remark: row.remark ? String(row.remark) : undefined,
    vaa_date: row.vaa_date ? String(row.vaa_date) : undefined,
    full_payment_date: row.full_payment_date ? String(row.full_payment_date) : undefined,
    is_d2d: Boolean(row.is_d2d),
    import_batch_id: String(row.import_batch_id ?? ''),
    source_row_id: String(row.source_row_id ?? ''),
    variant: row.variant ? String(row.variant) : undefined,
    dealer_transfer_price: row.dealer_transfer_price ? String(row.dealer_transfer_price) : undefined,
    full_payment_type: row.full_payment_type ? String(row.full_payment_type) : undefined,
    shipment_name: row.shipment_name ? String(row.shipment_name) : undefined,
    lou: row.lou ? String(row.lou) : undefined,
    contra_sola: row.contra_sola ? String(row.contra_sola) : undefined,
    reg_no: row.reg_no ? String(row.reg_no) : undefined,
    invoice_no: row.invoice_no ? String(row.invoice_no) : undefined,
    obr: row.obr ? String(row.obr) : undefined,
    bg_to_delivery: row.bg_to_delivery as number | null,
    bg_to_shipment_etd: row.bg_to_shipment_etd as number | null,
    etd_to_outlet: row.etd_to_outlet as number | null,
    outlet_to_reg: row.outlet_to_reg as number | null,
    reg_to_delivery: row.reg_to_delivery as number | null,
    bg_to_disb: row.bg_to_disb as number | null,
    delivery_to_disb: row.delivery_to_disb as number | null,
  };
}

function mapDbBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    uploadedBy: String(row.uploaded_by),
    uploadedAt: String(row.uploaded_at),
    status: String(row.status) as ImportBatch['status'],
    totalRows: Number(row.total_rows),
    validRows: Number(row.valid_rows),
    errorRows: Number(row.error_rows),
    duplicateRows: Number(row.duplicate_rows),
    publishedAt: row.published_at ? String(row.published_at) : undefined,
  };
}

function mapDbIssue(row: Record<string, unknown>): DataQualityIssue {
  return {
    id: String(row.id),
    chassisNo: String(row.chassis_no),
    field: String(row.field),
    issueType: String(row.issue_type) as DataQualityIssue['issueType'],
    message: String(row.message),
    severity: String(row.severity) as DataQualityIssue['severity'],
    importBatchId: String(row.import_batch_id),
  };
}

function mapDbSla(row: Record<string, unknown>): SlaPolicy {
  return {
    id: String(row.id),
    kpiId: String(row.kpi_id),
    label: String(row.label),
    slaDays: Number(row.sla_days),
    companyId: String(row.company_id),
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [vehicles, setVehiclesState] = useState<VehicleCanonical[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [qualityIssues, setQualityIssues] = useState<DataQualityIssue[]>([]);
  const [slas, setSlas] = useState<SlaPolicy[]>([]);
  const [kpiSummaries, setKpiSummaries] = useState<KpiSummary[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);

  const reloadFromDb = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [vehiclesRes, batchesRes, issuesRes, slasRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
        supabase.from('import_batches').select('*').order('created_at', { ascending: false }),
        supabase.from('quality_issues').select('*').order('created_at', { ascending: false }),
        supabase.from('sla_policies').select('*'),
      ]);

      const dbVehicles = (vehiclesRes.data || []).map(r => mapDbVehicle(r as unknown as Record<string, unknown>));
      const dbBatches = (batchesRes.data || []).map(r => mapDbBatch(r as unknown as Record<string, unknown>));
      const dbIssues = (issuesRes.data || []).map(r => mapDbIssue(r as unknown as Record<string, unknown>));
      const dbSlas = (slasRes.data || []).map(r => mapDbSla(r as unknown as Record<string, unknown>));

      setVehiclesState(dbVehicles);
      setImportBatches(dbBatches);
      setQualityIssues(dbIssues);
      setSlas(dbSlas);
      setKpiSummaries(computeKpiSummaries(dbVehicles, dbSlas));
      setLastRefresh(new Date().toISOString());
    } catch (err) {
      console.error('Failed to load data from database:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reloadFromDb(); }, [reloadFromDb]);

  const setVehicles = useCallback(async (v: VehicleCanonical[]) => {
    // Upsert vehicles to database
    const dbRows = v.map(vehicle => ({
      chassis_no: vehicle.chassis_no,
      bg_date: vehicle.bg_date || null,
      shipment_etd_pkg: vehicle.shipment_etd_pkg || null,
      shipment_eta_kk_twu_sdk: vehicle.shipment_eta_kk_twu_sdk || null,
      date_received_by_outlet: vehicle.date_received_by_outlet || null,
      reg_date: vehicle.reg_date || null,
      delivery_date: vehicle.delivery_date || null,
      disb_date: vehicle.disb_date || null,
      branch_code: vehicle.branch_code,
      model: vehicle.model,
      payment_method: vehicle.payment_method,
      salesman_name: vehicle.salesman_name,
      customer_name: vehicle.customer_name,
      remark: vehicle.remark || null,
      vaa_date: vehicle.vaa_date || null,
      full_payment_date: vehicle.full_payment_date || null,
      is_d2d: vehicle.is_d2d,
      import_batch_id: null, // UUID reference — we'll handle batch linking separately
      source_row_id: vehicle.source_row_id,
      variant: vehicle.variant || null,
      dealer_transfer_price: vehicle.dealer_transfer_price || null,
      full_payment_type: vehicle.full_payment_type || null,
      shipment_name: vehicle.shipment_name || null,
      lou: vehicle.lou || null,
      contra_sola: vehicle.contra_sola || null,
      reg_no: vehicle.reg_no || null,
      invoice_no: vehicle.invoice_no || null,
      obr: vehicle.obr || null,
      bg_to_delivery: vehicle.bg_to_delivery ?? null,
      bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
      etd_to_outlet: vehicle.etd_to_outlet ?? null,
      outlet_to_reg: vehicle.outlet_to_reg ?? null,
      reg_to_delivery: vehicle.reg_to_delivery ?? null,
      bg_to_disb: vehicle.bg_to_disb ?? null,
      delivery_to_disb: vehicle.delivery_to_disb ?? null,
    }));

    // Batch upsert in chunks of 500
    for (let i = 0; i < dbRows.length; i += 500) {
      const chunk = dbRows.slice(i, i + 500);
      const { error } = await supabase
        .from('vehicles')
        .upsert(chunk as any, { onConflict: 'chassis_no' });
      if (error) console.error('Vehicle upsert error:', error);
    }

    // Reload from DB to get server-generated IDs
    await reloadFromDb();
  }, [reloadFromDb]);

  const addImportBatch = useCallback(async (b: ImportBatch) => {
    const { error } = await supabase.from('import_batches').insert({
      file_name: b.fileName,
      uploaded_by: b.uploadedBy,
      uploaded_at: b.uploadedAt,
      status: b.status,
      total_rows: b.totalRows,
      valid_rows: b.validRows,
      error_rows: b.errorRows,
      duplicate_rows: b.duplicateRows,
    } as any);
    if (error) console.error('Import batch insert error:', error);
    // Optimistic update
    setImportBatches(prev => [b, ...prev]);
  }, []);

  const updateImportBatch = useCallback(async (id: string, updates: Partial<ImportBatch>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.publishedAt) dbUpdates.published_at = updates.publishedAt;
    if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
    if (updates.validRows !== undefined) dbUpdates.valid_rows = updates.validRows;
    if (updates.errorRows !== undefined) dbUpdates.error_rows = updates.errorRows;

    await supabase.from('import_batches').update(dbUpdates as any).eq('id', id);
    setImportBatches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const addQualityIssues = useCallback(async (issues: DataQualityIssue[]) => {
    if (issues.length === 0) return;
    const dbIssues = issues.map(i => ({
      chassis_no: i.chassisNo,
      field: i.field,
      issue_type: i.issueType,
      message: i.message,
      severity: i.severity,
      import_batch_id: null, // We don't have a valid UUID batch reference from the parser
    }));

    for (let idx = 0; idx < dbIssues.length; idx += 500) {
      const chunk = dbIssues.slice(idx, idx + 500);
      await supabase.from('quality_issues').insert(chunk as any);
    }
    setQualityIssues(prev => [...issues, ...prev]);
  }, []);

  const updateSla = useCallback(async (id: string, slaDays: number) => {
    await supabase.from('sla_policies').update({ sla_days: slaDays } as any).eq('id', id);
    setSlas(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, slaDays } : s);
      setKpiSummaries(computeKpiSummaries(vehicles, updated));
      return updated;
    });
  }, [vehicles]);

  const refreshKpis = useCallback(() => {
    setKpiSummaries(computeKpiSummaries(vehicles, slas));
    setLastRefresh(new Date().toISOString());
  }, [vehicles, slas]);

  return (
    <DataContext.Provider value={{ vehicles, importBatches, qualityIssues, slas, kpiSummaries, lastRefresh, loading, setVehicles, addImportBatch, updateImportBatch, addQualityIssues, updateSla, refreshKpis, reloadFromDb }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
