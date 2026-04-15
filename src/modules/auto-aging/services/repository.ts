import { supabase } from '@/integrations/supabase/client';
import { DataQualityIssue, ImportBatch, SlaPolicy, VehicleCanonical } from '@/types';
import { mapDbBatch, mapDbIssue, mapDbSla, mapDbVehicle } from '@/modules/auto-aging/services/mappers';

export interface AutoAgingSnapshot {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
}

export async function fetchAutoAgingSnapshot(): Promise<AutoAgingSnapshot> {
  const [vehiclesRes, batchesRes, issuesRes, slasRes] = await Promise.all([
    supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
    supabase.from('import_batches').select('*').order('created_at', { ascending: false }),
    supabase.from('quality_issues').select('*').order('created_at', { ascending: false }),
    supabase.from('sla_policies').select('*'),
  ]);

  return {
    vehicles: (vehiclesRes.data || []).map(r => mapDbVehicle(r as Record<string, unknown>)),
    importBatches: (batchesRes.data || []).map(r => mapDbBatch(r as Record<string, unknown>)),
    qualityIssues: (issuesRes.data || []).map(r => mapDbIssue(r as Record<string, unknown>)),
    slas: (slasRes.data || []).map(r => mapDbSla(r as Record<string, unknown>)),
  };
}

export async function upsertVehicles(vehicles: VehicleCanonical[], companyId: string) {
  const rows = vehicles.map(vehicle => ({
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
    import_batch_id: null,
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
    company_id: companyId,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from('vehicles').upsert(chunk as any, { onConflict: 'chassis_no' });
    if (error) console.error('Vehicle upsert error:', error);
  }
}

export async function insertImportBatch(batch: ImportBatch, companyId: string) {
  const { error } = await supabase.from('import_batches').insert({
    file_name: batch.fileName,
    uploaded_by: batch.uploadedBy,
    uploaded_at: batch.uploadedAt,
    status: batch.status,
    total_rows: batch.totalRows,
    valid_rows: batch.validRows,
    error_rows: batch.errorRows,
    duplicate_rows: batch.duplicateRows,
    company_id: companyId,
  } as any);
  if (error) console.error('Import batch insert error:', error);
}

export async function patchImportBatch(id: string, updates: Partial<ImportBatch>) {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.publishedAt) dbUpdates.published_at = updates.publishedAt;
  if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
  if (updates.validRows !== undefined) dbUpdates.valid_rows = updates.validRows;
  if (updates.errorRows !== undefined) dbUpdates.error_rows = updates.errorRows;
  await supabase.from('import_batches').update(dbUpdates as any).eq('id', id);
}

export async function insertQualityIssues(issues: DataQualityIssue[], companyId: string) {
  if (issues.length === 0) return;
  const rows = issues.map(issue => ({
    chassis_no: issue.chassisNo,
    field: issue.field,
    issue_type: issue.issueType,
    message: issue.message,
    severity: issue.severity,
    import_batch_id: null,
    company_id: companyId,
  }));

  for (let idx = 0; idx < rows.length; idx += 500) {
    const chunk = rows.slice(idx, idx + 500);
    await supabase.from('quality_issues').insert(chunk as any);
  }
}

export async function patchSla(id: string, slaDays: number) {
  await supabase.from('sla_policies').update({ sla_days: slaDays } as any).eq('id', id);
}
