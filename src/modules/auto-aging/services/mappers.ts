import { DataQualityIssue, ImportBatch, SlaPolicy, VehicleCanonical } from '@/types';

export function mapDbVehicle(row: Record<string, unknown>): VehicleCanonical {
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

export function mapDbBatch(row: Record<string, unknown>): ImportBatch {
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

export function mapDbIssue(row: Record<string, unknown>): DataQualityIssue {
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

export function mapDbSla(row: Record<string, unknown>): SlaPolicy {
  return {
    id: String(row.id),
    kpiId: String(row.kpi_id),
    label: String(row.label),
    slaDays: Number(row.sla_days),
    companyId: String(row.company_id),
  };
}
