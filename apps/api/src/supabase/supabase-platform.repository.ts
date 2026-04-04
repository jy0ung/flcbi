import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  buildAgingSummary,
  navigationItems,
  parseWorkbook,
  publishCanonical,
  queryVehicles,
  type AlertRule,
  type AuditEvent,
  type DataQualityIssue,
  type ExplorerQuery,
  type ExplorerResult,
  type ImportBatch,
  type ImportPublishMode,
  type NavigationItem,
  type Notification,
  type SlaPolicy,
  type User,
  type VehicleCanonical,
  type VehicleRaw,
} from "@flcbi/contracts";
import { randomUUID } from "node:crypto";
import { PlatformStoreService } from "../storage/platform-store.service.js";
import type {
  ImportDetail,
  PlatformRepository,
  PlatformRoleDefinition,
  VehicleDetail,
} from "../platform/platform.repository.js";
import { SupabaseAdminService } from "./supabase-admin.service.js";
import {
  toContractUser,
  type SupabaseProfileRow,
} from "./supabase.mappers.js";

interface ImportPreview {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
}

interface AlertRow {
  id: string;
  name: string;
  metric_id: string;
  threshold: number;
  comparator: AlertRule["comparator"];
  frequency: AlertRule["frequency"];
  enabled: boolean;
  channel: AlertRule["channel"];
  created_by: string | null;
  company_id: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  user_id: string | null;
  details: string | null;
  metadata: { userName?: string } | null;
  created_at: string;
}

interface ImportJobRow {
  id: string;
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
  status: ImportBatch["status"];
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  published_at: string | null;
  preview_available: boolean | null;
  dataset_version_id: string | null;
  publish_mode: ImportPublishMode | null;
  storage_path: string | null;
}

interface QualityIssueRow {
  id: string;
  chassis_no: string | null;
  field: string;
  issue_type: DataQualityIssue["issueType"];
  message: string;
  severity: DataQualityIssue["severity"];
  import_job_id: string;
  branch_id: string | null;
}

interface SlaRow {
  id: string;
  kpi_id: string;
  label: string;
  sla_days: number;
  company_id: string;
}

interface VehicleRow {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_code: string | null;
  import_job_id: string;
  source_row_id: string | null;
  chassis_no: string;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
  model: string | null;
  payment_method: string | null;
  salesman_name: string | null;
  customer_name: string | null;
  is_d2d: boolean;
  bg_to_delivery: number | null;
  bg_to_shipment_etd: number | null;
  etd_to_outlet_received: number | null;
  outlet_received_to_reg: number | null;
  reg_to_delivery: number | null;
  etd_to_eta: number | null;
  eta_to_outlet_received: number | null;
  outlet_received_to_delivery: number | null;
  bg_to_disb: number | null;
  delivery_to_disb: number | null;
}

interface RawImportRow {
  id: string;
  company_id: string;
  import_job_id: string;
  branch_id: string | null;
  source_row_number: number;
  chassis_no: string;
  model: string | null;
  payment_method: string | null;
  salesman_name: string | null;
  customer_name: string | null;
  is_d2d: boolean;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
  raw_payload: VehicleRaw | null;
}

@Injectable()
export class SupabasePlatformRepository implements PlatformRepository {
  private readonly importPreviews = new Map<string, ImportPreview>();

  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(PlatformStoreService) private readonly fallback: PlatformStoreService,
  ) {}

  async findUserByEmail(email: string) {
    if (!this.supabase.isConfigured()) {
      return this.fallback.findUserByEmail(email);
    }

    const row = await this.fetchProfileByEmail(email);
    return row ? toContractUser(row) : undefined;
  }

  async findUserById(id: string) {
    if (!this.supabase.isConfigured()) {
      return this.fallback.findUserById(id);
    }

    const row = await this.fetchProfileByDbId(id);
    return row ? toContractUser(row) : undefined;
  }

  getNavigation(user: User): NavigationItem[] {
    return navigationItems.filter((item) => !item.roles || item.roles.includes(user.role));
  }

  async getNotifications(user: User): Promise<Notification[]> {
    return this.fallback.getNotifications(user);
  }

  async listAuditEvents(user: User): Promise<AuditEvent[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listAuditEvents(user);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("audit_events")
      .select("id, action, entity, entity_id, user_id, details, metadata, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as AuditRow[];
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id ?? row.id,
      userId: row.user_id ?? "system",
      userName: row.metadata?.userName ?? row.user_id ?? "System",
      details: row.details ?? "",
      createdAt: row.created_at,
    }));
  }

  async addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt">): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.fallback.addAuditEvent(event);
      return;
    }

    const client = this.supabase.getAdminClient();
    const dbUserId = await this.resolveDbUserId(event.userId);
    const companyId = dbUserId ? (await this.fetchProfileByDbId(dbUserId))?.company_id ?? null : null;
    const { error } = await client
      .schema("app")
      .from("audit_events")
      .insert({
        company_id: companyId,
        user_id: dbUserId,
        action: event.action,
        entity: event.entity,
        entity_id: event.entityId,
        details: event.details,
        metadata: { userName: event.userName },
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async listUsers(user: User): Promise<User[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listUsers(user);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, email, display_name, app_role, company_id, primary_branch_id")
      .eq("company_id", companyId)
      .order("email", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as SupabaseProfileRow[]).map(toContractUser);
  }

  listRoles(): PlatformRoleDefinition[] {
    return this.fallback.listRoles();
  }

  async listAlerts(user: User): Promise<AlertRule[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listAlerts(user);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("alert_rules")
      .select("id, name, metric_id, threshold, comparator, frequency, enabled, channel, created_by, company_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as AlertRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      metricId: row.metric_id,
      threshold: Number(row.threshold),
      comparator: row.comparator,
      frequency: row.frequency,
      enabled: row.enabled,
      channel: row.channel,
      createdBy: row.created_by ?? "system",
      companyId: row.company_id,
    }));
  }

  async createAlert(user: User, input: Omit<AlertRule, "id" | "createdBy" | "companyId">): Promise<AlertRule> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createAlert(user, input);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const { data, error } = await client
      .schema("app")
      .from("alert_rules")
      .insert({
        company_id: companyId,
        created_by: dbUserId,
        name: input.name,
        metric_id: input.metricId,
        threshold: input.threshold,
        comparator: input.comparator,
        frequency: input.frequency,
        enabled: input.enabled,
        channel: input.channel,
      })
      .select("id, name, metric_id, threshold, comparator, frequency, enabled, channel, created_by, company_id")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to create alert");
    }

    return {
      id: data.id,
      name: data.name,
      metricId: data.metric_id,
      threshold: Number(data.threshold),
      comparator: data.comparator,
      frequency: data.frequency,
      enabled: data.enabled,
      channel: data.channel,
      createdBy: user.id,
      companyId,
    };
  }

  async listImports(user: User): Promise<ImportBatch[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listImports(user);
    }

    const rows = await this.fetchImportRows(user);
    return this.mapImportRows(rows);
  }

  async getImportById(user: User, id: string): Promise<ImportDetail> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getImportById(user, id);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException(`Import ${id} not found`);
    }

    const preview = this.importPreviews.get(id);
    const previewIssues = preview?.issues ?? await this.fetchQualityIssuesByImportId(user, id);
    const [item] = await this.mapImportRows([data as ImportJobRow]);
    return {
      item,
      previewIssues,
      missingColumns: preview?.missingColumns ?? [],
      previewRows: preview?.rows.length ?? item.totalRows,
    };
  }

  async createImportPreview(user: User, fileName: string, fileBuffer: Buffer): Promise<ImportDetail> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createImportPreview(user, fileName, fileBuffer);
    }

    const client = this.supabase.getAdminClient();
    const companyId = this.requireCompanyId(user);
    const branchIdByCode = await this.fetchBranchIdByCode(companyId);
    const parsed = parseWorkbook(
      fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      ),
    );

    const id = randomUUID();
    const storagePath = `${companyId}/imports/${id}/${fileName}`;
    const uploadResult = await client.storage
      .from(this.supabase.getImportBucket())
      .upload(storagePath, fileBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (uploadResult.error) {
      throw new InternalServerErrorException(uploadResult.error.message);
    }

    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .insert({
        id,
        company_id: companyId,
        uploaded_by: dbUserId,
        file_name: fileName,
        storage_path: storagePath,
        status: parsed.missingColumns.length > 0 ? "failed" : "validated",
        total_rows: parsed.rows.length,
        valid_rows: parsed.rows.length - parsed.issues.filter((issue) => issue.severity === "error").length,
        error_rows: parsed.issues.filter((issue) => issue.severity === "error").length,
        duplicate_rows: parsed.issues.filter((issue) => issue.issueType === "duplicate").length,
        preview_available: true,
      })
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to create import job");
    }

    await this.persistRawImportRows(companyId, id, parsed.rows, branchIdByCode);
    await this.replaceImportIssues(companyId, id, parsed.issues, branchIdByCode, parsed.rows, null);

    this.importPreviews.set(id, parsed);
    await this.addAuditEvent({
      action: "import_uploaded",
      entity: "import_batch",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Uploaded ${fileName} with ${parsed.rows.length} parsed rows`,
    });

    const [item] = await this.mapImportRows([data as ImportJobRow]);
    return {
      item,
      previewIssues: parsed.issues,
      missingColumns: parsed.missingColumns,
      previewRows: parsed.rows.length,
    };
  }

  async publishImport(user: User, id: string, mode: ImportPublishMode = "replace"): Promise<ImportBatch> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.publishImport(user, id, mode);
    }

    const client = this.supabase.getAdminClient();
    const datasetVersionId = randomUUID();
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const companyId = this.requireCompanyId(user);
    const now = new Date().toISOString();
    const branchIdByCode = await this.fetchBranchIdByCode(companyId);
    const { data: importJob, error: importJobError } = await client
      .schema("app")
      .from("import_jobs")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (importJobError) {
      throw new InternalServerErrorException(importJobError.message);
    }
    if (!importJob) {
      throw new NotFoundException(`Import ${id} not found`);
    }
    if (importJob.status === "failed") {
      throw new BadRequestException("Import validation failed. Upload a corrected workbook before publishing.");
    }

    const preview = this.importPreviews.get(id);
    const previewRows = preview?.rows ?? await this.fetchPersistedRawRows(companyId, id);
    const previewIssues = preview?.issues ?? await this.fetchPersistedIssues(companyId, id);

    if (previewRows.length === 0) {
      throw new NotFoundException(`Import ${id} preview is no longer available`);
    }

    const { error: datasetError } = await client
      .schema("app")
      .from("dataset_versions")
      .insert({
        id: datasetVersionId,
        company_id: companyId,
        import_job_id: id,
        status: "active",
        published_by: dbUserId,
        published_at: now,
        freshness_at: now,
      });

    if (datasetError) {
      throw new InternalServerErrorException(datasetError.message);
    }

    const { canonical, issues } = publishCanonical(
      previewRows.map((row) => ({ ...row, import_batch_id: id })),
    );
    if (canonical.length === 0) {
      throw new BadRequestException("No canonical vehicle rows were produced from this import");
    }
    const branchIdByChassis = new Map(
      canonical.map((vehicle) => [vehicle.chassis_no, branchIdByCode.get(vehicle.branch_code) ?? null]),
    );

    const vehiclePayload = canonical.map((vehicle) => ({
      company_id: companyId,
      branch_id: branchIdByCode.get(vehicle.branch_code) ?? null,
      dataset_version_id: datasetVersionId,
      import_job_id: id,
      source_row_id: null,
      chassis_no: vehicle.chassis_no,
      model: vehicle.model,
      payment_method: vehicle.payment_method,
      salesman_name: vehicle.salesman_name,
      customer_name: vehicle.customer_name,
      is_d2d: vehicle.is_d2d,
      bg_date: vehicle.bg_date ?? null,
      shipment_etd_pkg: vehicle.shipment_etd_pkg ?? null,
      shipment_eta: vehicle.shipment_eta_kk_twu_sdk ?? null,
      date_received_by_outlet: vehicle.date_received_by_outlet ?? null,
      reg_date: vehicle.reg_date ?? null,
      delivery_date: vehicle.delivery_date ?? null,
      disb_date: vehicle.disb_date ?? null,
      bg_to_delivery: vehicle.bg_to_delivery ?? null,
      bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
      etd_to_outlet_received: vehicle.etd_to_outlet_received ?? null,
      outlet_received_to_reg: vehicle.outlet_received_to_reg ?? null,
      reg_to_delivery: vehicle.reg_to_delivery ?? null,
      etd_to_eta: vehicle.etd_to_eta ?? null,
      eta_to_outlet_received: vehicle.eta_to_outlet_received ?? null,
      outlet_received_to_delivery: vehicle.outlet_received_to_delivery ?? null,
      bg_to_disb: vehicle.bg_to_disb ?? null,
      delivery_to_disb: vehicle.delivery_to_disb ?? null,
    }));

    if (vehiclePayload.length > 0) {
      for (const chunk of chunkArray(vehiclePayload, 500)) {
        const { error: vehicleError } = await client
          .schema("app")
          .from("vehicle_records")
          .upsert(chunk, { onConflict: "company_id,chassis_no" });

        if (vehicleError) {
          throw new InternalServerErrorException(vehicleError.message);
        }
      }
    }

    if (mode === "replace") {
      const { error: deleteStaleError } = await client
        .schema("app")
        .from("vehicle_records")
        .delete()
        .eq("company_id", companyId)
        .neq("dataset_version_id", datasetVersionId);

      if (deleteStaleError) {
        throw new InternalServerErrorException(deleteStaleError.message);
      }

      const { error: supersedeError } = await client
        .schema("app")
        .from("dataset_versions")
        .update({ status: "superseded" })
        .eq("company_id", companyId)
        .neq("id", datasetVersionId)
        .eq("status", "active");

      if (supersedeError) {
        throw new InternalServerErrorException(supersedeError.message);
      }
    }

    await this.replaceImportIssues(
      companyId,
      id,
      [...previewIssues, ...issues],
      branchIdByCode,
      previewRows,
      datasetVersionId,
      branchIdByChassis,
    );

    const { data: importRow, error: importError } = await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: "published",
        published_at: now,
        dataset_version_id: datasetVersionId,
        publish_mode: mode,
        preview_available: false,
      })
      .eq("id", id)
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
      .single();

    if (importError || !importRow) {
      throw new InternalServerErrorException(importError?.message ?? "Failed to publish import");
    }

    await this.addAuditEvent({
      action: "import_published",
      entity: "import_batch",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Published ${canonical.length} canonical vehicles from ${importRow.file_name} using ${mode} mode`,
    });

    this.importPreviews.delete(id);
    const [item] = await this.mapImportRows([importRow as ImportJobRow]);
    return item;
  }

  async listSlas(user: User): Promise<SlaPolicy[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listSlas(user);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("sla_policies")
      .select("id, kpi_id, label, sla_days, company_id")
      .eq("company_id", companyId)
      .order("kpi_id", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as SlaRow[]).map((row) => ({
      id: row.id,
      kpiId: row.kpi_id,
      label: row.label,
      slaDays: row.sla_days,
      companyId: row.company_id,
    }));
  }

  async updateSla(user: User, id: string, slaDays: number): Promise<SlaPolicy> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.updateSla(user, id, slaDays);
    }

    const client = this.supabase.getAdminClient();
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const { data, error } = await client
      .schema("app")
      .from("sla_policies")
      .update({
        sla_days: slaDays,
        updated_by: dbUserId,
      })
      .eq("id", id)
      .select("id, kpi_id, label, sla_days, company_id")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to update SLA");
    }

    await this.addAuditEvent({
      action: "sla_updated",
      entity: "sla_policy",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Updated ${data.label} to ${slaDays} days`,
    });

    return {
      id: data.id,
      kpiId: data.kpi_id,
      label: data.label,
      slaDays: data.sla_days,
      companyId: data.company_id,
    };
  }

  async getSummary(user: User, filters?: { branch?: string; model?: string }) {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getSummary(user, filters);
    }

    const visibleVehicles = await this.fetchVisibleVehicles(user, filters);
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.chassis_no));
    const visibleIssues = (await this.getQualityIssues(user))
      .filter((issue) => visibleVehicleIds.has(issue.chassisNo));
    const imports = await this.listImports(user);
    const slas = await this.listSlas(user);
    const lastRefresh = imports.find((item) => item.publishedAt)?.publishedAt ?? new Date().toISOString();
    return buildAgingSummary(visibleVehicles, slas, visibleIssues, imports, lastRefresh);
  }

  async queryExplorer(user: User, query: ExplorerQuery): Promise<ExplorerResult> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.queryExplorer(user, query);
    }

    const visibleVehicles = await this.fetchVisibleVehicles(user, {
      branch: query.branch,
      model: query.model,
    });
    return queryVehicles(visibleVehicles, query);
  }

  async getVehicle(user: User, chassisNo: string): Promise<VehicleDetail> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getVehicle(user, chassisNo);
    }

    const visibleVehicles = await this.fetchVisibleVehicles(user);
    const vehicle = visibleVehicles.find((item) => item.chassis_no === chassisNo);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${chassisNo} not found`);
    }

    const issues = (await this.getQualityIssues(user)).filter((issue) => issue.chassisNo === chassisNo);
    return { vehicle, issues };
  }

  async getQualityIssues(user: User): Promise<DataQualityIssue[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getQualityIssues(user);
    }

    const rows = await this.fetchQualityRows(user);
    return rows.map((row) => ({
      id: row.id,
      chassisNo: row.chassis_no ?? "",
      field: row.field,
      issueType: row.issue_type,
      message: row.message,
      severity: row.severity,
      importBatchId: row.import_job_id,
    }));
  }

  private async fetchProfileByEmail(email: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, email, display_name, app_role, company_id, primary_branch_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data as SupabaseProfileRow | null;
  }

  private async fetchProfileByDbId(id: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, email, display_name, app_role, company_id, primary_branch_id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data as SupabaseProfileRow | null;
  }

  private async resolveDbUserId(contractUserId: string) {
    const profileById = await this.fetchProfileByDbId(contractUserId);
    return profileById?.id ?? null;
  }

  private async resolveDbUserIdFromUser(user: User) {
    const profile = await this.fetchProfileByEmail(user.email);
    return profile?.id ?? null;
  }

  private async fetchImportRows(user: User) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []) as ImportJobRow[];
  }

  private async mapImportRows(rows: ImportJobRow[]): Promise<ImportBatch[]> {
    const userIds = [...new Set(rows.map((row) => row.uploaded_by).filter((value): value is string => Boolean(value)))];
    const nameMap = await this.fetchProfileNameMap(userIds);

    return rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      uploadedBy: row.uploaded_by ? (nameMap.get(row.uploaded_by) ?? row.uploaded_by) : "Unknown User",
      uploadedAt: row.created_at,
      status: row.status,
      totalRows: row.total_rows,
      validRows: row.valid_rows,
      errorRows: row.error_rows,
      duplicateRows: row.duplicate_rows,
      publishedAt: row.published_at ?? undefined,
      previewAvailable: row.preview_available ?? false,
      storageKey: row.storage_path ?? undefined,
      datasetVersionId: row.dataset_version_id ?? undefined,
      publishMode: row.publish_mode ?? undefined,
    }));
  }

  private async fetchProfileNameMap(userIds: string[]) {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) {
      map.set(row.id, row.display_name);
    }
    return map;
  }

  private async fetchQualityIssuesByImportId(user: User, importId: string) {
    const rows = await this.fetchQualityRows(user, importId);
    return rows.map((row) => ({
      id: row.id,
      chassisNo: row.chassis_no ?? "",
      field: row.field,
      issueType: row.issue_type,
      message: row.message,
      severity: row.severity,
      importBatchId: row.import_job_id,
    }));
  }

  private async fetchQualityRows(user: User, importId?: string) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("quality_issues")
      .select("id, chassis_no, field, issue_type, message, severity, import_job_id, branch_id")
      .eq("company_id", companyId);

    const visibleBranchId = user.branchId ?? null;
    if (visibleBranchId && ["manager", "sales", "accounts"].includes(user.role)) {
      query = query.eq("branch_id", visibleBranchId);
    }
    if (importId) {
      query = query.eq("import_job_id", importId);
    } else {
      const activeDatasetVersionIds = await this.fetchActiveDatasetVersionIds(companyId);
      if (activeDatasetVersionIds.length === 0) {
        return [];
      }
      query = query.in("dataset_version_id", activeDatasetVersionIds);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as QualityIssueRow[];
  }

  private async fetchPersistedIssues(companyId: string, importId: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("quality_issues")
      .select("id, chassis_no, field, issue_type, message, severity, import_job_id")
      .eq("company_id", companyId)
      .eq("import_job_id", importId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as QualityIssueRow[]).map((row) => ({
      id: row.id,
      chassisNo: row.chassis_no ?? "",
      field: row.field,
      issueType: row.issue_type,
      message: row.message,
      severity: row.severity,
      importBatchId: row.import_job_id,
    }));
  }

  private async fetchActiveDatasetVersionIds(companyId: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("dataset_versions")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active");

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  }

  private async fetchPersistedRawRows(companyId: string, importId: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("raw")
      .from("vehicle_import_rows")
      .select("id, company_id, import_job_id, branch_id, source_row_number, chassis_no, model, payment_method, salesman_name, customer_name, is_d2d, bg_date, shipment_etd_pkg, shipment_eta, date_received_by_outlet, reg_date, delivery_date, disb_date, raw_payload")
      .eq("company_id", companyId)
      .eq("import_job_id", importId)
      .order("source_row_number", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as RawImportRow[]).map((row) => this.mapRawImportRow(row));
  }

  private async fetchVisibleVehicles(user: User, filters?: { branch?: string; model?: string }) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("mart")
      .from("vehicle_aging")
      .select("id, company_id, branch_id, branch_code, import_job_id, source_row_id, chassis_no, bg_date, shipment_etd_pkg, shipment_eta, date_received_by_outlet, reg_date, delivery_date, disb_date, model, payment_method, salesman_name, customer_name, is_d2d, bg_to_delivery, bg_to_shipment_etd, etd_to_outlet_received, outlet_received_to_reg, reg_to_delivery, etd_to_eta, eta_to_outlet_received, outlet_received_to_delivery, bg_to_disb, delivery_to_disb")
      .eq("company_id", companyId);

    const visibleBranchId = user.branchId ?? null;
    if (visibleBranchId && ["manager", "sales", "accounts"].includes(user.role)) {
      query = query.eq("branch_id", visibleBranchId);
    }
    if (filters?.branch && filters.branch !== "all") {
      query = query.eq("branch_code", filters.branch);
    }
    if (filters?.model && filters.model !== "all") {
      query = query.eq("model", filters.model);
    }

    const { data, error } = await query.order("bg_date", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as VehicleRow[]).map((row) => this.mapVehicleRow(row));
  }

  private mapVehicleRow(row: VehicleRow): VehicleCanonical {
    return {
      id: row.id,
      chassis_no: row.chassis_no,
      bg_date: row.bg_date ?? undefined,
      shipment_etd_pkg: row.shipment_etd_pkg ?? undefined,
      shipment_eta_kk_twu_sdk: row.shipment_eta ?? undefined,
      date_received_by_outlet: row.date_received_by_outlet ?? undefined,
      reg_date: row.reg_date ?? undefined,
      delivery_date: row.delivery_date ?? undefined,
      disb_date: row.disb_date ?? undefined,
      branch_code: row.branch_code ?? "UNKNOWN",
      model: row.model ?? "Unknown",
      payment_method: row.payment_method ?? "Unknown",
      salesman_name: row.salesman_name ?? "Unknown",
      customer_name: row.customer_name ?? "Unknown",
      is_d2d: row.is_d2d,
      import_batch_id: row.import_job_id,
      source_row_id: row.source_row_id ?? row.id,
      bg_to_delivery: row.bg_to_delivery,
      bg_to_shipment_etd: row.bg_to_shipment_etd,
      etd_to_outlet_received: row.etd_to_outlet_received,
      outlet_received_to_reg: row.outlet_received_to_reg,
      reg_to_delivery: row.reg_to_delivery,
      etd_to_eta: row.etd_to_eta,
      eta_to_outlet_received: row.eta_to_outlet_received,
      outlet_received_to_delivery: row.outlet_received_to_delivery,
      bg_to_disb: row.bg_to_disb,
      delivery_to_disb: row.delivery_to_disb,
    };
  }

  private requireCompanyId(user: User) {
    if (!user.companyId) {
      throw new UnauthorizedException("User profile is not assigned to a company");
    }
    return user.companyId;
  }

  private async fetchBranchIdByCode(companyId: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("branches")
      .select("id, code")
      .eq("company_id", companyId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return new Map(
      ((data ?? []) as Array<{ id: string; code: string }>).map((row) => [row.code, row.id]),
    );
  }

  private mapRawImportRow(row: RawImportRow): VehicleRaw {
    const payload = row.raw_payload ?? ({} as VehicleRaw);
    return {
      id: payload.id ?? row.id,
      import_batch_id: payload.import_batch_id ?? row.import_job_id,
      row_number: payload.row_number ?? row.source_row_number,
      chassis_no: payload.chassis_no ?? row.chassis_no,
      bg_date: payload.bg_date ?? row.bg_date ?? undefined,
      shipment_etd_pkg: payload.shipment_etd_pkg ?? row.shipment_etd_pkg ?? undefined,
      shipment_eta_kk_twu_sdk: payload.shipment_eta_kk_twu_sdk ?? row.shipment_eta ?? undefined,
      date_received_by_outlet: payload.date_received_by_outlet ?? row.date_received_by_outlet ?? undefined,
      reg_date: payload.reg_date ?? row.reg_date ?? undefined,
      delivery_date: payload.delivery_date ?? row.delivery_date ?? undefined,
      disb_date: payload.disb_date ?? row.disb_date ?? undefined,
      branch_code: payload.branch_code,
      model: payload.model ?? row.model ?? undefined,
      payment_method: payload.payment_method ?? row.payment_method ?? undefined,
      salesman_name: payload.salesman_name ?? row.salesman_name ?? undefined,
      customer_name: payload.customer_name ?? row.customer_name ?? undefined,
      remark: payload.remark,
      vaa_date: payload.vaa_date,
      full_payment_date: payload.full_payment_date,
      is_d2d: payload.is_d2d ?? row.is_d2d,
      source_row_no: payload.source_row_no,
      variant: payload.variant,
      dealer_transfer_price: payload.dealer_transfer_price,
      full_payment_type: payload.full_payment_type,
      shipment_name: payload.shipment_name,
      lou: payload.lou,
      contra_sola: payload.contra_sola,
      reg_no: payload.reg_no,
      invoice_no: payload.invoice_no,
      obr: payload.obr,
    };
  }

  private async persistRawImportRows(
    companyId: string,
    importId: string,
    rows: VehicleRaw[],
    branchIdByCode: Map<string, string>,
  ) {
    const persistedRows = rows.filter((row) => row.chassis_no);
    if (persistedRows.length === 0) {
      return;
    }

    const client = this.supabase.getAdminClient();
    const payload = persistedRows.map((row) => ({
      company_id: companyId,
      import_job_id: importId,
      branch_id: row.branch_code ? (branchIdByCode.get(row.branch_code) ?? null) : null,
      source_row_number: row.row_number,
      chassis_no: row.chassis_no,
      model: row.model ?? null,
      payment_method: row.payment_method ?? null,
      salesman_name: row.salesman_name ?? null,
      customer_name: row.customer_name ?? null,
      is_d2d: row.is_d2d ?? false,
      bg_date: row.bg_date ?? null,
      shipment_etd_pkg: row.shipment_etd_pkg ?? null,
      shipment_eta: row.shipment_eta_kk_twu_sdk ?? null,
      date_received_by_outlet: row.date_received_by_outlet ?? null,
      reg_date: row.reg_date ?? null,
      delivery_date: row.delivery_date ?? null,
      disb_date: row.disb_date ?? null,
      raw_payload: row,
    }));

    for (const chunk of chunkArray(payload, 500)) {
      const { error } = await client.schema("raw").from("vehicle_import_rows").insert(chunk);
      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  private async replaceImportIssues(
    companyId: string,
    importId: string,
    issues: DataQualityIssue[],
    branchIdByCode: Map<string, string>,
    rows: VehicleRaw[],
    datasetVersionId: string | null,
    branchIdByChassis?: Map<string, string | null>,
  ) {
    const client = this.supabase.getAdminClient();
    const { error: deleteError } = await client
      .schema("app")
      .from("quality_issues")
      .delete()
      .eq("company_id", companyId)
      .eq("import_job_id", importId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    if (issues.length === 0) {
      return;
    }

    const derivedBranchIdByChassis =
      branchIdByChassis ??
      new Map(
        rows
          .filter((row) => row.chassis_no)
          .map((row) => [row.chassis_no, row.branch_code ? (branchIdByCode.get(row.branch_code) ?? null) : null]),
      );

    const payload = issues.map((issue) => ({
      company_id: companyId,
      branch_id: derivedBranchIdByChassis.get(issue.chassisNo) ?? null,
      import_job_id: importId,
      dataset_version_id: datasetVersionId,
      source_row_id: null,
      chassis_no: issue.chassisNo || null,
      field: issue.field,
      issue_type: issue.issueType,
      message: issue.message,
      severity: issue.severity,
    }));

    for (const chunk of chunkArray(payload, 500)) {
      const { error } = await client.schema("app").from("quality_issues").insert(chunk);
      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }
  }
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
