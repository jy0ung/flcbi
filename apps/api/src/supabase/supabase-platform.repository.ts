import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  applyVehicleCorrections,
  buildVehicleExplorerExportRows,
  buildAlertNotificationFingerprint,
  buildAgingSummary,
  compareMetricValue,
  type Branch,
  createDefaultDashboardPreferences,
  describeAlertComparator,
  type ExportJob,
  type ExportSubscription,
  filterVehiclesForExplorer,
  getExecutiveDashboardMetricOption,
  getExecutiveMetricValue,
  matchesExplorerPreset,
  navigationItems,
  normalizeExecutiveDashboardMetricIds,
  parseWorkbook,
  publishCanonical,
  queryVehicles,
  summarizeParsedWorkbook,
  type AppRole,
  type AlertRule,
  type AuditEvent,
  type DashboardPreferences,
  type DataQualityIssue,
  type ExplorerQuery,
  type ExplorerPreset,
  type ExplorerResult,
  type ImportBatch,
  type ImportPublishMode,
  type NavigationItem,
  type Notification,
  serializeCsvRows,
  type SlaPolicy,
  sortVehiclesForExplorer,
  type UpdateVehicleCorrectionsRequest,
  type User,
  type VehicleCanonical,
  type VehicleCorrection,
  VEHICLE_CORRECTION_FIELDS,
  VEHICLE_CORRECTION_FIELD_LABELS,
  type VehicleCorrectionField,
  type VehicleRaw,
} from "@flcbi/contracts";
import { randomUUID } from "node:crypto";
import { PlatformStoreService } from "../storage/platform-store.service.js";
import type {
  ExportDownload,
  ImportDetail,
  PlatformRepository,
  PlatformRoleDefinition,
  VehicleDetail,
} from "../platform/platform.repository.js";
import { AlertQueueService } from "../queues/alert-queue.service.js";
import { ExportQueueService } from "../queues/export-queue.service.js";
import { ImportQueueService } from "../queues/import-queue.service.js";
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
  metric_id: AlertRule["metricId"];
  threshold: number | string;
  comparator: AlertRule["comparator"];
  frequency: AlertRule["frequency"];
  enabled: boolean;
  channel: AlertRule["channel"];
  created_by: string | null;
  company_id: string;
}

interface NotificationRow {
  id: string;
  company_id: string;
  user_id: string;
  alert_rule_id: string | null;
  title: string;
  message: string;
  type: Notification["type"];
  read: boolean;
  fingerprint: string;
  metadata: Record<string, string | number | boolean | null> | null;
  created_at: string;
}

interface ExportRow {
  id: string;
  company_id: string;
  requested_by: string | null;
  kind: ExportJob["kind"];
  format: ExportJob["format"];
  status: ExportJob["status"];
  file_name: string;
  query_definition: ExplorerQuery | null;
  total_rows: number;
  storage_path: string | null;
  error_message: string | null;
  completed_at: string | null;
  processing_started_at: string | null;
  last_error_at: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  created_at: string;
}

interface ExportSubscriptionRow {
  id: string;
  company_id: string;
  requested_by: string;
  kind: ExportSubscription["kind"];
  schedule: ExportSubscription["schedule"];
  enabled: boolean;
  fingerprint: string;
  query_definition: ExplorerQuery | null;
  last_triggered_at: string | null;
  last_export_job_id: string | null;
  created_at: string;
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
  missing_columns: string[] | null;
  published_at: string | null;
  preview_available: boolean | null;
  dataset_version_id: string | null;
  publish_mode: ImportPublishMode | null;
  storage_path: string | null;
  processing_started_at: string | null;
  last_error_at: string | null;
  error_message: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
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

interface VehicleCorrectionRow {
  id: string;
  company_id: string;
  chassis_no: string;
  field_name: VehicleCorrectionField;
  value_text: string | null;
  reason: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
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

interface SavedViewRow {
  id: string;
  definition: { executiveMetricIds?: string[] } | null;
}

interface BranchRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
}

interface PublishVehicleRow {
  branch_id: string | null;
  chassis_no: string;
  model: string;
  payment_method: string;
  salesman_name: string;
  customer_name: string;
  is_d2d: boolean;
  bg_date: string | null;
  shipment_etd_pkg: string | null;
  shipment_eta: string | null;
  date_received_by_outlet: string | null;
  reg_date: string | null;
  delivery_date: string | null;
  disb_date: string | null;
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

interface PublishQualityIssueRow {
  branch_id: string | null;
  chassis_no: string | null;
  field: string;
  issue_type: DataQualityIssue["issueType"];
  message: string;
  severity: DataQualityIssue["severity"];
}

@Injectable()
export class SupabasePlatformRepository implements PlatformRepository {
  private readonly logger = new Logger(SupabasePlatformRepository.name);
  private readonly importPreviews = new Map<string, ImportPreview>();

  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(PlatformStoreService) private readonly fallback: PlatformStoreService,
    @Inject(AlertQueueService) private readonly alertQueue: AlertQueueService,
    @Inject(ExportQueueService) private readonly exportQueue: ExportQueueService,
    @Inject(ImportQueueService) private readonly importQueue: ImportQueueService,
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
    if (!this.supabase.isConfigured()) {
      return this.fallback.getNotifications(user);
    }

    if (!this.alertQueue.isConfigured()) {
      await this.syncAlertNotificationsSafely(user, "notifications_list");
    }
    const rows = await this.fetchNotificationRows(user);
    return rows.map((row) => this.mapNotificationRow(row));
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
      .select("id, email, display_name, app_role, company_id, primary_branch_id, status")
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

  async listBranches(user: User): Promise<Branch[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listBranches(user);
    }

    const companyId = this.requireCompanyId(user);
    return this.fetchCompanyBranches(companyId);
  }

  async createUser(
    user: User,
    input: { email: string; name: string; role: AppRole; branchId?: string | null; password: string; status?: User["status"] },
  ): Promise<User> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createUser(user, input);
    }

    const companyId = this.requireCompanyId(user);
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedName = input.name.trim();
    const targetStatus = input.status ?? "active";

    const existingProfile = await this.fetchProfileByEmail(normalizedEmail);
    if (existingProfile) {
      throw new BadRequestException("A user with that email already exists");
    }

    const existingAuthUser = await this.findAuthUserByEmail(normalizedEmail);
    if (existingAuthUser) {
      throw new BadRequestException("A Supabase user with that email already exists");
    }

    await this.ensureBranchBelongsToCompany(companyId, input.branchId ?? null);

    const client = this.supabase.getAdminClient();
    const { data, error } = await client.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: normalizedName },
      app_metadata: { provider: "email" },
      ban_duration: targetStatus === "active" ? "none" : "876000h",
    });

    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? "Failed to create user");
    }

    await this.upsertUserProfileRow({
      id: data.user.id,
      companyId,
      branchId: input.branchId ?? null,
      email: normalizedEmail,
      displayName: normalizedName,
      role: input.role,
      status: targetStatus,
    });
    await this.replaceUserBranchAccess(companyId, data.user.id, input.branchId ?? null);

    await this.addAuditEvent({
      action: "user_created",
      entity: "user",
      entityId: data.user.id,
      userId: user.id,
      userName: user.name,
      details: `Created ${normalizedEmail} with role ${input.role}`,
    });

    const createdProfile = await this.fetchProfileByDbId(data.user.id);
    if (!createdProfile) {
      throw new InternalServerErrorException("User profile was not created");
    }

    return toContractUser(createdProfile);
  }

  async updateUser(
    user: User,
    targetUserId: string,
    input: { email?: string; name?: string; role?: AppRole; branchId?: string | null; password?: string; status?: User["status"] },
  ): Promise<User> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.updateUser(user, targetUserId, input);
    }

    const companyId = this.requireCompanyId(user);
    const existingProfile = await this.fetchProfileByDbId(targetUserId);
    if (!existingProfile || existingProfile.company_id !== companyId) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    if (targetUserId === user.id) {
      if (input.role && input.role !== user.role) {
        throw new BadRequestException("You cannot change your own role");
      }
      if (input.status && input.status !== "active") {
        throw new BadRequestException("You cannot deactivate your own account");
      }
    }

    const nextEmail = input.email ? input.email.trim().toLowerCase() : existingProfile.email;
    const nextName = input.name?.trim() || existingProfile.display_name;
    const nextRole = input.role ?? toContractUser(existingProfile).role;
    const nextBranchId = input.branchId !== undefined ? input.branchId : existingProfile.primary_branch_id;
    const nextStatus = input.status ?? (existingProfile.status ?? "pending");

    const duplicateProfile = nextEmail !== existingProfile.email
      ? await this.fetchProfileByEmail(nextEmail)
      : null;
    if (duplicateProfile && duplicateProfile.id !== targetUserId) {
      throw new BadRequestException("A user with that email already exists");
    }

    await this.ensureBranchBelongsToCompany(companyId, nextBranchId ?? null);

    const client = this.supabase.getAdminClient();
    const { error: authError } = await client.auth.admin.updateUserById(targetUserId, {
      email: nextEmail !== existingProfile.email ? nextEmail : undefined,
      password: input.password || undefined,
      user_metadata: { name: nextName },
      ban_duration: nextStatus === "active" ? "none" : "876000h",
    });

    if (authError) {
      throw new BadRequestException(authError.message);
    }

    await this.upsertUserProfileRow({
      id: targetUserId,
      companyId,
      branchId: nextBranchId ?? null,
      email: nextEmail,
      displayName: nextName,
      role: nextRole,
      status: nextStatus,
    });
    if (input.branchId !== undefined) {
      await this.replaceUserBranchAccess(companyId, targetUserId, nextBranchId ?? null);
    }

    await this.addAuditEvent({
      action: "user_updated",
      entity: "user",
      entityId: targetUserId,
      userId: user.id,
      userName: user.name,
      details: `Updated ${nextEmail}`,
    });

    const updatedProfile = await this.fetchProfileByDbId(targetUserId);
    if (!updatedProfile) {
      throw new InternalServerErrorException("User profile was not found after update");
    }

    return toContractUser(updatedProfile);
  }

  async deleteUser(user: User, targetUserId: string): Promise<void> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.deleteUser(user, targetUserId);
    }

    const companyId = this.requireCompanyId(user);
    const existingProfile = await this.fetchProfileByDbId(targetUserId);
    if (!existingProfile || existingProfile.company_id !== companyId) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }
    if (targetUserId === user.id) {
      throw new BadRequestException("You cannot deactivate your own account");
    }

    const client = this.supabase.getAdminClient();
    const { error: authError } = await client.auth.admin.updateUserById(targetUserId, {
      ban_duration: "876000h",
    });

    if (authError) {
      throw new BadRequestException(authError.message);
    }

    const { error: profileError } = await client
      .schema("app")
      .from("user_profiles")
      .update({ status: "disabled" })
      .eq("id", targetUserId)
      .eq("company_id", companyId);

    if (profileError) {
      throw new InternalServerErrorException(profileError.message);
    }

    await this.addAuditEvent({
      action: "user_deactivated",
      entity: "user",
      entityId: targetUserId,
      userId: user.id,
      userName: user.name,
      details: `Deactivated ${existingProfile.email}`,
    });
  }

  async listAlerts(user: User): Promise<AlertRule[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listAlerts(user);
    }

    const rows = await this.fetchAlertRows(this.requireCompanyId(user));
    return rows.map((row) => this.mapAlertRow(row));
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
        name: input.name.trim(),
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

    await this.addAuditEvent({
      action: "alert_created",
      entity: "alert_rule",
      entityId: data.id,
      userId: user.id,
      userName: user.name,
      details: `Created alert ${data.name}`,
    });
    await this.triggerAlertEvaluation(user, companyId, "alert_create");
    return this.mapAlertRow(data as AlertRow);
  }

  async updateAlert(
    user: User,
    alertId: string,
    input: Partial<Omit<AlertRule, "id" | "createdBy" | "companyId">>,
  ): Promise<AlertRule> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.updateAlert(user, alertId, input);
    }

    const companyId = this.requireCompanyId(user);
    const existing = await this.fetchAlertRow(companyId, alertId);
    if (!existing) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    const updatePayload = {
      name: input.name !== undefined ? input.name.trim() : existing.name,
      metric_id: input.metricId ?? existing.metric_id,
      threshold: input.threshold ?? existing.threshold,
      comparator: input.comparator ?? existing.comparator,
      frequency: input.frequency ?? existing.frequency,
      enabled: input.enabled ?? existing.enabled,
      channel: input.channel ?? existing.channel,
    };

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("alert_rules")
      .update(updatePayload)
      .eq("id", alertId)
      .eq("company_id", companyId)
      .select("id, name, metric_id, threshold, comparator, frequency, enabled, channel, created_by, company_id")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to update alert");
    }

    await this.addAuditEvent({
      action: "alert_updated",
      entity: "alert_rule",
      entityId: alertId,
      userId: user.id,
      userName: user.name,
      details: `Updated alert ${data.name}`,
    });
    await this.triggerAlertEvaluation(user, companyId, "alert_update");
    return this.mapAlertRow(data as AlertRow);
  }

  async deleteAlert(user: User, alertId: string): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.fallback.deleteAlert(user, alertId);
      return;
    }

    const companyId = this.requireCompanyId(user);
    const existing = await this.fetchAlertRow(companyId, alertId);
    if (!existing) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("alert_rules")
      .delete()
      .eq("id", alertId)
      .eq("company_id", companyId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.addAuditEvent({
      action: "alert_deleted",
      entity: "alert_rule",
      entityId: alertId,
      userId: user.id,
      userName: user.name,
      details: `Deleted alert ${existing.name}`,
    });
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
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
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
      missingColumns: preview?.missingColumns ?? (data?.missing_columns ?? []),
      previewRows: preview?.rows.length ?? item.totalRows,
    };
  }

  async createImportPreview(user: User, fileName: string, fileBuffer: Buffer): Promise<ImportDetail> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createImportPreview(user, fileName, fileBuffer);
    }

    const client = this.supabase.getAdminClient();
    const companyId = this.requireCompanyId(user);
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
        status: "uploaded",
        missing_columns: [],
        preview_available: false,
        attempt_count: 0,
        max_attempts: this.importQueue.isConfigured() ? 3 : 1,
      })
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to create import job");
    }

    await this.addAuditEvent({
      action: "import_uploaded",
      entity: "import_batch",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Uploaded ${fileName}`,
    });

    if (this.importQueue.isConfigured()) {
      try {
        await this.importQueue.enqueueImportPreview({ importId: id });
        const [item] = await this.mapImportRows([data as ImportJobRow]);
        return {
          item,
          previewIssues: [],
          missingColumns: [],
          previewRows: 0,
        };
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError);
        this.logger.warn(`Import queue enqueue failed for ${id}, falling back to inline validation: ${message}`);
      }
    }

    const processed = await this.processUploadedImportPreview(user, companyId, id, fileBuffer);
    this.importPreviews.set(id, processed.parsed);

    const [item] = await this.mapImportRows([processed.importRow]);
    return {
      item,
      previewIssues: processed.parsed.issues,
      missingColumns: processed.parsed.missingColumns,
      previewRows: processed.parsed.rows.length,
    };
  }

  async publishImport(user: User, id: string, mode: ImportPublishMode = "replace"): Promise<ImportBatch> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.publishImport(user, id, mode);
    }

    const client = this.supabase.getAdminClient();
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const companyId = this.requireCompanyId(user);
    const { data: importJob, error: importJobError } = await client
      .schema("app")
      .from("import_jobs")
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (importJobError) {
      throw new InternalServerErrorException(importJobError.message);
    }
    if (!importJob) {
      throw new NotFoundException(`Import ${id} not found`);
    }

    const importJobRow = importJob as ImportJobRow;
    this.assertImportReadyForPublish(importJobRow);

    if (this.importQueue.isConfigured()) {
      await this.markImportQueuedForPublish(companyId, id, mode);
      try {
        await this.importQueue.enqueueImportPublish({
          importId: id,
          companyId,
          publishMode: mode,
          requestedByUserId: dbUserId ?? user.id,
          requestedByUserName: user.name,
        });
      } catch (error) {
        await this.runBestEffort(`import_publish_queue_restore:${id}`, async () => {
          await this.restoreQueuedImportPublishState(companyId, importJobRow);
        });
        const message = error instanceof Error ? error.message : String(error);
        throw new InternalServerErrorException(message);
      }

      const [item] = await this.mapImportRows([{
        ...importJobRow,
        status: "publish_in_progress",
        published_at: null,
        dataset_version_id: null,
        publish_mode: mode,
        processing_started_at: null,
        last_error_at: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: this.importQueue.isConfigured() ? 3 : 1,
      }]);
      return item;
    }

    const now = new Date().toISOString();
    const branchIdByCode = await this.fetchBranchIdByCode(companyId);
    const preview = this.importPreviews.get(id);
    const previewRows = preview?.rows ?? await this.fetchPersistedRawRows(companyId, id);
    const previewIssues = preview?.issues ?? await this.fetchPersistedIssues(companyId, id);

    if (previewRows.length === 0) {
      throw new NotFoundException(`Import ${id} preview is no longer available`);
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
    const vehiclePayload = this.buildPublishVehicleRows(canonical, branchIdByCode);
    const qualityIssuePayload = this.buildPublishQualityIssueRows(
      [...previewIssues, ...issues],
      branchIdByChassis,
    );

    const { data: datasetVersionId, error: publishError } = await client
      .schema("app")
      .rpc("publish_import_atomic", {
        p_company_id: companyId,
        p_import_job_id: id,
        p_published_by: dbUserId,
        p_published_at: now,
        p_publish_mode: mode,
        p_vehicle_rows: vehiclePayload,
        p_quality_issues: qualityIssuePayload,
      });

    if (publishError || !datasetVersionId) {
      throw this.mapPublishImportError(publishError);
    }

    const importRow: ImportJobRow = {
      ...(importJob as ImportJobRow),
      status: "published",
      published_at: now,
      dataset_version_id: String(datasetVersionId),
      publish_mode: mode,
      preview_available: false,
      last_error_at: null,
      error_message: null,
    };

    this.importPreviews.delete(id);

    await this.runBestEffort("import_publish_audit", async () => {
      await this.addAuditEvent({
        action: "import_published",
        entity: "import_batch",
        entityId: id,
        userId: user.id,
        userName: user.name,
        details: `Published ${canonical.length} canonical vehicles from ${importRow.file_name} using ${mode} mode`,
      });
    });

    if (dbUserId) {
      await this.runBestEffort("import_publish_notification", async () => {
        await this.createNotification({
          companyId,
          userId: dbUserId,
          title: `Import published: ${importRow.file_name}`,
          message: `${canonical.length} vehicles are now live in ${mode} mode.`,
          type: "success",
          fingerprint: `import-published:${id}:${mode}`,
          metadata: {
            importId: id,
            datasetVersionId: String(datasetVersionId),
            publishMode: mode,
            canonicalCount: canonical.length,
          },
        });
      });
    }
    await this.triggerAlertEvaluation(user, companyId, "import_publish");

    const [item] = await this.mapImportRows([importRow]);
    return item;
  }

  async listExports(user: User): Promise<ExportJob[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listExports(user);
    }

    const rows = await this.fetchExportRows(user);
    return this.mapExportRows(rows);
  }

  async listExportSubscriptions(user: User): Promise<ExportSubscription[]> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.listExportSubscriptions(user);
    }

    const rows = await this.fetchExportSubscriptionRows(user);
    return this.mapExportSubscriptionRows(rows);
  }

  async createExplorerExport(user: User, query: ExplorerQuery): Promise<ExportJob> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createExplorerExport(user, query);
    }

    const client = this.supabase.getAdminClient();
    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    const exportId = randomUUID();
    const requestedAt = new Date().toISOString();
    const normalizedQuery = normalizeExportQuery(query);
    const fileName = buildExportFileName(requestedAt);
    const requestedBy = dbUserId ?? user.id;
    const { data, error } = await client
      .schema("app")
      .from("export_jobs")
      .insert({
        id: exportId,
        company_id: companyId,
        requested_by: requestedBy,
        kind: "vehicle_explorer_csv",
        format: "csv",
        status: "queued",
        file_name: fileName,
        query_definition: normalizedQuery,
        attempt_count: 0,
        max_attempts: this.exportQueue.isConfigured() ? 3 : 1,
      })
      .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to create export job");
    }

    await this.runBestEffort(`export_request_audit:${exportId}`, async () => {
      await this.addAuditEvent({
        action: "export_requested",
        entity: "export_job",
        entityId: exportId,
        userId: user.id,
        userName: user.name,
        details: `Requested ${fileName}`,
      });
    });

    if (this.exportQueue.isConfigured()) {
      try {
        await this.exportQueue.enqueueExplorerExport({ exportId });
        const [item] = await this.mapExportRows([data as ExportRow]);
        return item;
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError);
        this.logger.warn(`Export queue enqueue failed for ${exportId}, falling back to inline generation: ${message}`);
      }
    }

    return this.generateExplorerExportInline(user, data as ExportRow);
  }

  async createExportSubscription(user: User, query: ExplorerQuery): Promise<ExportSubscription> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.createExportSubscription(user, query);
    }

    const client = this.supabase.getAdminClient();
    const companyId = this.requireCompanyId(user);
    const requestedBy = (await this.resolveDbUserIdFromUser(user)) ?? user.id;
    const normalizedQuery = normalizeExportQuery(query);
    const fingerprint = buildExportSubscriptionFingerprint(normalizedQuery);

    const { data, error } = await client
      .schema("app")
      .from("export_subscriptions")
      .insert({
        company_id: companyId,
        requested_by: requestedBy,
        kind: "vehicle_explorer_csv",
        schedule: "daily",
        enabled: true,
        fingerprint,
        query_definition: normalizedQuery,
      })
      .select("id, company_id, requested_by, kind, schedule, enabled, fingerprint, query_definition, last_triggered_at, last_export_job_id, created_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new BadRequestException("A matching daily export subscription already exists");
      }
      throw new InternalServerErrorException(error?.message ?? "Failed to create export subscription");
    }

    await this.runBestEffort(`export_subscription_create_audit:${(data as ExportSubscriptionRow).id}`, async () => {
      await this.addAuditEvent({
        action: "export_subscription_created",
        entity: "export_subscription",
        entityId: (data as ExportSubscriptionRow).id,
        userId: user.id,
        userName: user.name,
        details: `Created daily export subscription for ${describeExportQuery(normalizedQuery)}`,
      });
    });

    const [item] = await this.mapExportSubscriptionRows([data as ExportSubscriptionRow]);
    return item;
  }

  async retryExport(user: User, exportId: string): Promise<ExportJob> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.retryExport(user, exportId);
    }

    const companyId = this.requireCompanyId(user);
    const exportRow = await this.fetchExportRowForUser(user, exportId);
    if (!exportRow) {
      throw new NotFoundException(`Export ${exportId} not found`);
    }
    if (exportRow.status !== "failed") {
      throw new BadRequestException("Only failed exports can be retried");
    }

    const client = this.supabase.getAdminClient();
    const updatedAt = new Date().toISOString();
    const { data, error } = await client
      .schema("app")
      .from("export_jobs")
      .update({
        status: "queued",
        total_rows: 0,
        storage_path: null,
        completed_at: null,
        processing_started_at: null,
        last_error_at: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: this.exportQueue.isConfigured() ? 3 : 1,
      })
      .eq("company_id", companyId)
      .eq("id", exportId)
      .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to retry export");
    }

    await this.runBestEffort(`export_retry_audit:${exportId}`, async () => {
      await this.addAuditEvent({
        action: "export_retry_requested",
        entity: "export_job",
        entityId: exportId,
        userId: user.id,
        userName: user.name,
        details: `Queued retry for ${(data as ExportRow).file_name} at ${updatedAt}`,
      });
    });

    if (this.exportQueue.isConfigured()) {
      try {
        await this.exportQueue.enqueueExplorerExport({ exportId });
        const [item] = await this.mapExportRows([data as ExportRow]);
        return item;
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError);
        this.logger.warn(`Export retry enqueue failed for ${exportId}, falling back to inline generation: ${message}`);
      }
    }

    const owner = await this.resolveUserFromDbId((data as ExportRow).requested_by);
    if (!owner) {
      throw new NotFoundException("The export owner could not be resolved");
    }
    return this.generateExplorerExportInline(owner, data as ExportRow);
  }

  async deleteExportSubscription(user: User, subscriptionId: string): Promise<void> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.deleteExportSubscription(user, subscriptionId);
    }

    const companyId = this.requireCompanyId(user);
    const subscription = await this.fetchExportSubscriptionRowForUser(user, subscriptionId);
    if (!subscription) {
      throw new NotFoundException(`Export subscription ${subscriptionId} not found`);
    }

    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("export_subscriptions")
      .delete()
      .eq("company_id", companyId)
      .eq("id", subscriptionId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.runBestEffort(`export_subscription_delete_audit:${subscriptionId}`, async () => {
      await this.addAuditEvent({
        action: "export_subscription_deleted",
        entity: "export_subscription",
        entityId: subscriptionId,
        userId: user.id,
        userName: user.name,
        details: `Deleted daily export subscription for ${describeExportQuery(normalizeExportQuery(subscription.query_definition ?? defaultExportQuery()))}`,
      });
    });
  }

  async getExportDownload(user: User, exportId: string): Promise<ExportDownload> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getExportDownload(user, exportId);
    }

    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("export_jobs")
      .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
      .eq("company_id", companyId)
      .eq("id", exportId);

    if (!canViewCompanyWideExports(user)) {
      const dbUserId = await this.resolveDbUserIdFromUser(user);
      query = query.eq("requested_by", dbUserId ?? user.id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException(`Export ${exportId} not found`);
    }
    if (data.status !== "completed" || !data.storage_path) {
      throw new BadRequestException("This export is not ready to download yet");
    }

    const download = await client.storage
      .from(this.supabase.getExportBucket())
      .download(data.storage_path);

    if (download.error || !download.data) {
      throw new InternalServerErrorException(download.error?.message ?? "Failed to download export");
    }

    return {
      fileName: data.file_name,
      contentType: "text/csv; charset=utf-8",
      content: Buffer.from(await download.data.arrayBuffer()),
    };
  }

  async getDashboardPreferences(user: User): Promise<DashboardPreferences> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getDashboardPreferences(user);
    }

    const savedView = await this.fetchDashboardPreferencesRow(user);
    return {
      executiveMetricIds: normalizeExecutiveDashboardMetricIds(savedView?.definition?.executiveMetricIds),
    };
  }

  async saveDashboardPreferences(
    user: User,
    preferences: DashboardPreferences,
  ): Promise<DashboardPreferences> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.saveDashboardPreferences(user, preferences);
    }

    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      return createDefaultDashboardPreferences();
    }

    const normalized = {
      executiveMetricIds: normalizeExecutiveDashboardMetricIds(preferences.executiveMetricIds),
    };
    const client = this.supabase.getAdminClient();
    const existing = await this.fetchDashboardPreferencesRow(user);

    if (existing) {
      const { error } = await client
        .schema("app")
        .from("saved_views")
        .update({ definition: normalized })
        .eq("id", existing.id);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    } else {
      const { error } = await client
        .schema("app")
        .from("saved_views")
        .insert({
          company_id: companyId,
          created_by: dbUserId,
          module: "executive_dashboard",
          name: "metric_board",
          definition: normalized,
        });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    await this.addAuditEvent({
      action: "dashboard_preferences_updated",
      entity: "dashboard_preferences",
      entityId: dbUserId,
      userId: user.id,
      userName: user.name,
      details: `Saved ${normalized.executiveMetricIds.length} executive dashboard metrics`,
    });

    return normalized;
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

  async getSummary(
    user: User,
    filters?: { branch?: string; model?: string; payment?: string; preset?: ExplorerPreset },
  ) {
    if (!this.supabase.isConfigured()) {
      return this.fallback.getSummary(user, filters);
    }

    const visibleVehicles = (await this.fetchVisibleVehicles(user)).filter((vehicle) => {
      if (filters?.branch && filters.branch !== "all" && vehicle.branch_code !== filters.branch) {
        return false;
      }
      if (filters?.model && filters.model !== "all" && vehicle.model !== filters.model) {
        return false;
      }
      if (filters?.payment && filters.payment !== "all" && vehicle.payment_method !== filters.payment) {
        return false;
      }
      if (filters?.preset && !matchesExplorerPreset(vehicle, filters.preset)) {
        return false;
      }
      return true;
    });
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

    const visibleVehicles = await this.fetchVisibleVehicles(user);
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
    const corrections = await this.fetchVehicleCorrections(this.requireCompanyId(user), [chassisNo]);
    return {
      vehicle,
      issues,
      corrections: corrections.get(chassisNo) ?? [],
    };
  }

  async updateVehicleCorrections(
    user: User,
    chassisNo: string,
    input: UpdateVehicleCorrectionsRequest,
  ): Promise<VehicleDetail> {
    if (!this.supabase.isConfigured()) {
      return this.fallback.updateVehicleCorrections(user, chassisNo, input);
    }
    if (!canManageVehicleCorrections(user)) {
      throw new ForbiddenException("You do not have permission to edit vehicle corrections");
    }

    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      throw new NotFoundException("The editing user could not be resolved");
    }

    const baseRows = await this.fetchVisibleVehicleRows(user);
    const baseRow = baseRows.find((item) => item.chassis_no === chassisNo);
    if (!baseRow) {
      throw new NotFoundException(`Vehicle ${chassisNo} not found`);
    }

    const baseVehicle = this.mapVehicleRow(baseRow);
    const existingCorrections = await this.fetchVehicleCorrections(companyId, [chassisNo]);
    const existingByField = new Map(
      (existingCorrections.get(chassisNo) ?? []).map((item) => [item.field, item.value]),
    );
    const patch = this.normalizeVehicleCorrectionInput(input);
    const changedFields = Object.keys(patch) as VehicleCorrectionField[];
    if (changedFields.length === 0) {
      throw new BadRequestException("No correction fields were provided");
    }

    for (const field of changedFields) {
      const nextValue = patch[field] ?? null;
      const baseValue = normalizeCorrectionComparableValue(field, baseVehicle[field]);
      if (nextValue === baseValue) {
        existingByField.delete(field);
      } else {
        existingByField.set(field, nextValue);
      }
    }

    const effectiveVehicle = applyVehicleCorrections(
      baseVehicle,
      Array.from(existingByField.entries()).map(([field, value]) => ({ field, value })),
    );
    validateVehicleCorrectionChronology(effectiveVehicle, changedFields);

    const upsertRows = changedFields
      .map((field) => {
        const nextValue = patch[field] ?? null;
        const baseValue = normalizeCorrectionComparableValue(field, baseVehicle[field]);
        if (nextValue === baseValue) {
          return null;
        }
        return {
          company_id: companyId,
          chassis_no: chassisNo,
          field_name: field,
          value_text: nextValue,
          reason: input.reason.trim(),
          updated_by: dbUserId,
        };
      })
      .filter((item): item is {
        company_id: string;
        chassis_no: string;
        field_name: VehicleCorrectionField;
        value_text: string | null;
        reason: string;
        updated_by: string;
      } => Boolean(item));
    const deleteFields = changedFields.filter((field) => {
      const nextValue = patch[field] ?? null;
      const baseValue = normalizeCorrectionComparableValue(field, baseVehicle[field]);
      return nextValue === baseValue;
    });

    const client = this.supabase.getAdminClient();
    if (upsertRows.length > 0) {
      const { error } = await client
        .schema("app")
        .from("vehicle_record_corrections")
        .upsert(upsertRows, {
          onConflict: "company_id,chassis_no,field_name",
        });
      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    if (deleteFields.length > 0) {
      const { error } = await client
        .schema("app")
        .from("vehicle_record_corrections")
        .delete()
        .eq("company_id", companyId)
        .eq("chassis_no", chassisNo)
        .in("field_name", deleteFields);
      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    await this.addAuditEvent({
      action: "vehicle_corrections_updated",
      entity: "vehicle_record_correction",
      entityId: chassisNo,
      userId: user.id,
      userName: user.name,
      details: `Updated ${changedFields.map((field) => VEHICLE_CORRECTION_FIELD_LABELS[field]).join(", ")} for ${chassisNo}. Reason: ${input.reason.trim()}`,
    });

    return this.getVehicle(user, chassisNo);
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

  async markNotificationRead(user: User, notificationId: string): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.fallback.markNotificationRead(user, notificationId);
      return;
    }

    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("company_id", companyId)
      .eq("user_id", dbUserId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }
  }

  async markAllNotificationsRead(user: User): Promise<void> {
    if (!this.supabase.isConfigured()) {
      this.fallback.markAllNotificationsRead(user);
      return;
    }

    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      return;
    }

    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("notifications")
      .update({ read: true })
      .eq("company_id", companyId)
      .eq("user_id", dbUserId)
      .eq("read", false);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async fetchProfileByEmail(email: string) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, email, display_name, app_role, company_id, primary_branch_id, status")
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
      .select("id, email, display_name, app_role, company_id, primary_branch_id, status")
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

  private async resolveUserFromDbId(id: string | null) {
    if (!id) {
      return null;
    }

    const profile = await this.fetchProfileByDbId(id);
    return profile ? toContractUser(profile) : null;
  }

  private async findAuthUserByEmail(email: string) {
    const client = this.supabase.getAdminClient();
    let page = 1;

    while (true) {
      const { data, error } = await client.auth.admin.listUsers({
        page,
        perPage: 200,
      });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        return found;
      }

      if (data.users.length < 200) {
        return null;
      }

      page += 1;
    }
  }

  private async fetchCompanyBranches(companyId: string): Promise<Branch[]> {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("branches")
      .select("id, company_id, code, name")
      .eq("company_id", companyId)
      .order("code", { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as BranchRow[]).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      code: row.code,
      name: row.name,
    }));
  }

  private async ensureBranchBelongsToCompany(companyId: string, branchId: string | null) {
    if (!branchId) {
      return;
    }

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", branchId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new BadRequestException("Selected branch does not belong to this company");
    }
  }

  private async replaceUserBranchAccess(companyId: string, userId: string, branchId: string | null) {
    const branches = await this.fetchCompanyBranches(companyId);
    const nextBranchIds = branchId
      ? [branchId]
      : branches.map((branch) => branch.id);

    const client = this.supabase.getAdminClient();
    const { error: deleteError } = await client
      .schema("app")
      .from("user_branch_access")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    if (nextBranchIds.length === 0) {
      return;
    }

    const { error: insertError } = await client
      .schema("app")
      .from("user_branch_access")
      .insert(nextBranchIds.map((nextBranchId) => ({
        user_id: userId,
        branch_id: nextBranchId,
      })));

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  private async upsertUserProfileRow(input: {
    id: string;
    companyId: string;
    branchId: string | null;
    email: string;
    displayName: string;
    role: AppRole;
    status: NonNullable<User["status"]>;
  }) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("user_profiles")
      .upsert({
        id: input.id,
        company_id: input.companyId,
        primary_branch_id: input.branchId,
        email: input.email,
        display_name: input.displayName,
        app_role: input.role,
        status: input.status,
      }, { onConflict: "id" });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async fetchImportRows(user: User) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []) as ImportJobRow[];
  }

  private async fetchExportRows(user: User) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("export_jobs")
      .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!canViewCompanyWideExports(user)) {
      const requestedBy = (await this.resolveDbUserIdFromUser(user)) ?? user.id;
      query = query.eq("requested_by", requestedBy);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []) as ExportRow[];
  }

  private async fetchExportSubscriptionRows(user: User) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("export_subscriptions")
      .select("id, company_id, requested_by, kind, schedule, enabled, fingerprint, query_definition, last_triggered_at, last_export_job_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!canViewCompanyWideExports(user)) {
      const requestedBy = (await this.resolveDbUserIdFromUser(user)) ?? user.id;
      query = query.eq("requested_by", requestedBy);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []) as ExportSubscriptionRow[];
  }

  private async fetchExportRowForUser(user: User, exportId: string) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("export_jobs")
      .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
      .eq("company_id", companyId)
      .eq("id", exportId);

    if (!canViewCompanyWideExports(user)) {
      const requestedBy = (await this.resolveDbUserIdFromUser(user)) ?? user.id;
      query = query.eq("requested_by", requestedBy);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data as ExportRow | null) ?? null;
  }

  private async fetchExportSubscriptionRowForUser(user: User, subscriptionId: string) {
    const companyId = this.requireCompanyId(user);
    const client = this.supabase.getAdminClient();
    let query = client
      .schema("app")
      .from("export_subscriptions")
      .select("id, company_id, requested_by, kind, schedule, enabled, fingerprint, query_definition, last_triggered_at, last_export_job_id, created_at")
      .eq("company_id", companyId)
      .eq("id", subscriptionId);

    if (!canViewCompanyWideExports(user)) {
      const requestedBy = (await this.resolveDbUserIdFromUser(user)) ?? user.id;
      query = query.eq("requested_by", requestedBy);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data as ExportSubscriptionRow | null) ?? null;
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
      processingStartedAt: row.processing_started_at ?? undefined,
      lastErrorAt: row.last_error_at ?? undefined,
      errorMessage: row.error_message ?? undefined,
      attemptCount: row.attempt_count ?? 0,
      maxAttempts: row.max_attempts ?? 3,
      canRetryPublish: this.isRetryablePublishFailure(row),
    }));
  }

  private async mapExportRows(rows: ExportRow[]): Promise<ExportJob[]> {
    const userIds = [...new Set(rows.map((row) => row.requested_by).filter((value): value is string => Boolean(value)))];
    const nameMap = await this.fetchProfileNameMap(userIds);

    return rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      requestedBy: row.requested_by ? (nameMap.get(row.requested_by) ?? row.requested_by) : "Unknown User",
      requestedAt: row.created_at,
      status: row.status,
      format: row.format,
      kind: row.kind,
      totalRows: row.total_rows,
      query: normalizeExportQuery(row.query_definition ?? defaultExportQuery()),
      storageKey: row.storage_path ?? undefined,
      completedAt: row.completed_at ?? undefined,
      processingStartedAt: row.processing_started_at ?? undefined,
      lastErrorAt: row.last_error_at ?? undefined,
      errorMessage: row.error_message ?? undefined,
      attemptCount: row.attempt_count ?? 0,
      maxAttempts: row.max_attempts ?? 3,
      canRetry: row.status === "failed",
    }));
  }

  private async mapExportSubscriptionRows(rows: ExportSubscriptionRow[]): Promise<ExportSubscription[]> {
    const userIds = [...new Set(rows.map((row) => row.requested_by).filter((value): value is string => Boolean(value)))];
    const nameMap = await this.fetchProfileNameMap(userIds);

    return rows.map((row) => ({
      id: row.id,
      requestedBy: nameMap.get(row.requested_by) ?? row.requested_by,
      createdAt: row.created_at,
      schedule: row.schedule,
      kind: row.kind,
      enabled: row.enabled,
      query: normalizeExportQuery(row.query_definition ?? defaultExportQuery()),
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      lastExportJobId: row.last_export_job_id ?? undefined,
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

  private async processUploadedImportPreview(user: User, companyId: string, importId: string, fileBuffer: Buffer) {
    const branchIdByCode = await this.fetchBranchIdByCode(companyId);
    const startedAt = new Date().toISOString();
    await this.setImportAttemptMetadata(companyId, importId, {
      status: "validating",
      processing_started_at: startedAt,
      last_error_at: null,
      error_message: null,
      attempt_count: 1,
      max_attempts: 1,
    });

    try {
      const parsed = parseWorkbook(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
      await this.clearImportPreviewArtifacts(companyId, importId);
      await this.persistRawImportRows(companyId, importId, parsed.rows, branchIdByCode);
      await this.replaceImportIssues(companyId, importId, parsed.issues, branchIdByCode, parsed.rows, null);
      const importRow = await this.updateImportPreviewJob(companyId, importId, parsed);
      if (importRow.status === "failed" && importRow.uploaded_by) {
        await this.runBestEffort(`import_preview_failure_audit:${importId}`, async () => {
          await this.addAuditEvent({
            action: "import_validation_failed",
            entity: "import_batch",
            entityId: importId,
            userId: user.id,
            userName: user.name,
            details: `Validation failed for ${importRow.file_name}: missing columns ${parsed.missingColumns.join(", ")}`,
          });
        });
        await this.runBestEffort(`import_preview_failure_notification:${importId}`, async () => {
          await this.createNotification({
            companyId,
            userId: importRow.uploaded_by!,
            title: `Import validation failed: ${importRow.file_name}`,
            message: this.buildImportValidationFailureMessage(parsed.missingColumns),
            type: "warning",
            fingerprint: `import-validation-failed:${importId}`,
            metadata: {
              importId,
              missingColumns: parsed.missingColumns.join(","),
            },
          });
        });
      }
      return { parsed, importRow };
    } catch (error) {
      await this.runBestEffort(`import_preview_cleanup:${importId}`, async () => {
        await this.clearImportPreviewArtifacts(companyId, importId);
      });
      let failedImportRow: Pick<ImportJobRow, "file_name" | "uploaded_by"> | null = null;
      try {
        failedImportRow = await this.markImportPreviewFailed(
          companyId,
          importId,
          error instanceof Error ? error.message : String(error),
          1,
          1,
        );
      } catch (markFailedError) {
        const message = markFailedError instanceof Error ? markFailedError.message : String(markFailedError);
        this.logger.warn(`import_preview_mark_failed:${importId} failed: ${message}`);
      }
      const failedImportUploadedBy = failedImportRow?.uploaded_by ?? null;
      const failedImportFileName = failedImportRow?.file_name ?? "import workbook";
      if (failedImportUploadedBy) {
        await this.runBestEffort(`import_preview_processing_failure_audit:${importId}`, async () => {
          await this.addAuditEvent({
            action: "import_validation_failed",
            entity: "import_batch",
            entityId: importId,
            userId: user.id,
            userName: user.name,
            details: `Validation failed for ${failedImportFileName}: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
        await this.runBestEffort(`import_preview_processing_failure_notification:${importId}`, async () => {
          await this.createNotification({
            companyId,
            userId: failedImportUploadedBy,
            title: `Import validation failed: ${failedImportFileName}`,
            message: "The workbook could not be validated. Check the file format and upload a corrected workbook.",
            type: "error",
            fingerprint: `import-validation-failed:${importId}`,
            metadata: {
              importId,
            },
          });
        });
      }
      throw error;
    }
  }

  private async generateExplorerExportInline(user: User, exportRow: ExportRow): Promise<ExportJob> {
    const client = this.supabase.getAdminClient();
    const companyId = this.requireCompanyId(user);
    const normalizedQuery = normalizeExportQuery(exportRow.query_definition ?? defaultExportQuery());

    try {
      const startedAt = new Date().toISOString();
      await client
        .schema("app")
        .from("export_jobs")
        .update({
          status: "generation_in_progress",
          processing_started_at: startedAt,
          error_message: null,
          last_error_at: null,
          attempt_count: 1,
          max_attempts: 1,
        })
        .eq("company_id", companyId)
        .eq("id", exportRow.id)
        .throwOnError();

      const vehicles = sortVehiclesForExplorer(
        filterVehiclesForExplorer(await this.fetchVisibleVehicles(user), normalizedQuery),
        normalizedQuery,
      );
      const csv = serializeCsvRows(buildVehicleExplorerExportRows(vehicles));
      const storagePath = `${companyId}/exports/${exportRow.id}/${exportRow.file_name}`;
      const upload = await client.storage
        .from(this.supabase.getExportBucket())
        .upload(storagePath, Buffer.from(csv, "utf8"), {
          contentType: "text/csv",
          upsert: true,
        });

      if (upload.error) {
        throw new InternalServerErrorException(upload.error.message);
      }

      const completedAt = new Date().toISOString();
      const { data, error } = await client
        .schema("app")
        .from("export_jobs")
        .update({
          status: "completed",
          total_rows: vehicles.length,
          storage_path: storagePath,
          completed_at: completedAt,
          error_message: null,
          last_error_at: null,
          attempt_count: 1,
          max_attempts: 1,
        })
        .eq("company_id", companyId)
        .eq("id", exportRow.id)
        .select("id, company_id, requested_by, kind, format, status, file_name, query_definition, total_rows, storage_path, error_message, completed_at, processing_started_at, last_error_at, attempt_count, max_attempts, created_at")
        .single();

      if (error || !data) {
        throw new InternalServerErrorException(error?.message ?? "Failed to update export job");
      }

      await this.runBestEffort(`export_complete_audit:${exportRow.id}`, async () => {
        await this.addAuditEvent({
          action: "export_completed",
          entity: "export_job",
          entityId: exportRow.id,
          userId: user.id,
          userName: user.name,
          details: `Generated ${exportRow.file_name} with ${vehicles.length} vehicle rows`,
        });
      });

      if (exportRow.requested_by) {
        await this.runBestEffort(`export_complete_notification:${exportRow.id}`, async () => {
          await this.createNotification({
            companyId,
            userId: exportRow.requested_by!,
            title: `Export ready: ${exportRow.file_name}`,
            message: `${vehicles.length} vehicles were prepared for download.`,
            type: "success",
            fingerprint: `export-complete:${exportRow.id}`,
            metadata: {
              exportId: exportRow.id,
              totalRows: vehicles.length,
            },
          });
        });
      }

      const [item] = await this.mapExportRows([data as ExportRow]);
      return item;
    } catch (error) {
      await this.runBestEffort(`export_mark_failed:${exportRow.id}`, async () => {
        await client
          .schema("app")
          .from("export_jobs")
          .update({
            status: "failed",
            last_error_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : String(error),
            attempt_count: 1,
            max_attempts: 1,
          })
          .eq("company_id", companyId)
          .eq("id", exportRow.id)
          .throwOnError();
      });
      await this.runBestEffort(`export_failure_audit:${exportRow.id}`, async () => {
        await this.addAuditEvent({
          action: "export_failed",
          entity: "export_job",
          entityId: exportRow.id,
          userId: user.id,
          userName: user.name,
          details: `Export generation failed for ${exportRow.file_name}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      if (exportRow.requested_by) {
        await this.runBestEffort(`export_failure_notification:${exportRow.id}`, async () => {
          await this.createNotification({
            companyId,
            userId: exportRow.requested_by!,
            title: `Export failed: ${exportRow.file_name}`,
            message: "The queued export did not finish. Please retry the export request.",
            type: "error",
            fingerprint: `export-failed:${exportRow.id}`,
            metadata: {
              exportId: exportRow.id,
            },
          });
        });
      }
      throw error;
    }
  }

  private async fetchDashboardPreferencesRow(user: User) {
    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      return null;
    }

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("saved_views")
      .select("id, definition")
      .eq("company_id", companyId)
      .eq("created_by", dbUserId)
      .eq("module", "executive_dashboard")
      .eq("name", "metric_board")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as SavedViewRow | null) ?? null;
  }

  private async fetchNotificationRows(user: User): Promise<NotificationRow[]> {
    const companyId = this.requireCompanyId(user);
    const dbUserId = await this.resolveDbUserIdFromUser(user);
    if (!dbUserId) {
      return [];
    }

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("notifications")
      .select("id, company_id, user_id, alert_rule_id, title, message, type, read, fingerprint, metadata, created_at")
      .eq("company_id", companyId)
      .eq("user_id", dbUserId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as NotificationRow[];
  }

  private mapNotificationRow(row: NotificationRow): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.read,
      createdAt: row.created_at,
    };
  }

  private async fetchAlertRows(companyId: string): Promise<AlertRow[]> {
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

    return (data ?? []) as AlertRow[];
  }

  private async fetchAlertRow(companyId: string, alertId: string): Promise<AlertRow | null> {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("alert_rules")
      .select("id, name, metric_id, threshold, comparator, frequency, enabled, channel, created_by, company_id")
      .eq("company_id", companyId)
      .eq("id", alertId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as AlertRow | null) ?? null;
  }

  private mapAlertRow(row: AlertRow): AlertRule {
    return {
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
    };
  }

  private buildPublishVehicleRows(
    canonical: VehicleCanonical[],
    branchIdByCode: Map<string, string>,
  ): PublishVehicleRow[] {
    return canonical.map((vehicle) => ({
      branch_id: branchIdByCode.get(vehicle.branch_code) ?? null,
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
  }

  private buildPublishQualityIssueRows(
    issues: DataQualityIssue[],
    branchIdByChassis: Map<string, string | null>,
  ): PublishQualityIssueRow[] {
    return issues.map((issue) => ({
      branch_id: branchIdByChassis.get(issue.chassisNo) ?? null,
      chassis_no: issue.chassisNo || null,
      field: issue.field,
      issue_type: issue.issueType,
      message: issue.message,
      severity: issue.severity,
    }));
  }

  private mapPublishImportError(error: { message: string } | null): Error {
    if (!error) {
      return new InternalServerErrorException("Failed to publish import");
    }

    const message = error.message || "Failed to publish import";
    if (message.includes("not found")) {
      return new NotFoundException(message);
    }
    if (
      message.includes("already") ||
      message.includes("validation failed") ||
      message.includes("not ready") ||
      message.includes("Unsupported publish mode") ||
      message.includes("No canonical vehicle rows")
    ) {
      return new BadRequestException(message);
    }
    return new InternalServerErrorException(message);
  }

  private assertImportReadyForPublish(importJob: ImportJobRow) {
    if (importJob.status === "published") {
      throw new BadRequestException(`Import ${importJob.id} has already been published`);
    }

    if (importJob.status === "publish_in_progress") {
      throw new BadRequestException(`Import ${importJob.id} is already being published`);
    }

    if (importJob.status === "failed" && !this.isRetryablePublishFailure(importJob)) {
      throw new BadRequestException("Import validation failed. Upload a corrected workbook before publishing.");
    }

    if (
      importJob.status !== "validated" &&
      importJob.status !== "normalization_complete" &&
      !this.isRetryablePublishFailure(importJob)
    ) {
      throw new BadRequestException(`Import ${importJob.id} is not ready for publish from status ${importJob.status}`);
    }
  }

  private isRetryablePublishFailure(importJob: ImportJobRow) {
    return importJob.status === "failed"
      && (importJob.preview_available ?? false)
      && (importJob.missing_columns?.length ?? 0) === 0;
  }

  private async markImportQueuedForPublish(
    companyId: string,
    importId: string,
    mode: ImportPublishMode,
  ) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: "publish_in_progress",
        published_at: null,
        dataset_version_id: null,
        publish_mode: mode,
        processing_started_at: null,
        last_error_at: null,
        error_message: null,
        attempt_count: 0,
        max_attempts: this.importQueue.isConfigured() ? 3 : 1,
      })
      .eq("company_id", companyId)
      .eq("id", importId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async restoreQueuedImportPublishState(companyId: string, importJob: ImportJobRow) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: importJob.status,
        published_at: importJob.published_at,
        dataset_version_id: importJob.dataset_version_id,
        publish_mode: importJob.publish_mode,
        preview_available: importJob.preview_available ?? false,
        processing_started_at: importJob.processing_started_at,
        last_error_at: importJob.last_error_at,
        error_message: importJob.error_message,
        attempt_count: importJob.attempt_count ?? 0,
        max_attempts: importJob.max_attempts ?? 3,
      })
      .eq("company_id", companyId)
      .eq("id", importJob.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async fetchVisibleVehicles(user: User) {
    const rows = await this.fetchVisibleVehicleRows(user);
    const correctionsByChassis = await this.fetchVehicleCorrections(
      this.requireCompanyId(user),
      rows.map((row) => row.chassis_no),
    );

    return rows.map((row) => applyVehicleCorrections(
      this.mapVehicleRow(row),
      correctionsByChassis.get(row.chassis_no) ?? [],
    ));
  }

  private normalizeVehicleCorrectionInput(input: UpdateVehicleCorrectionsRequest) {
    const patch: Partial<Record<VehicleCorrectionField, string | null>> = {};

    for (const field of VEHICLE_CORRECTION_FIELDS) {
      const rawValue = input[field];
      if (rawValue === undefined) {
        continue;
      }

      patch[field] = normalizeVehicleCorrectionValue(field, rawValue);
    }

    return patch;
  }

  private async fetchVisibleVehicleRows(user: User) {
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

    const { data, error } = await query.order("bg_date", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as VehicleRow[];
  }

  private async fetchVehicleCorrections(companyId: string, chassisNos: string[]) {
    const correctionsByChassis = new Map<string, VehicleCorrection[]>();
    if (chassisNos.length === 0) {
      return correctionsByChassis;
    }

    const client = this.supabase.getAdminClient();
    const uniqueChassisNos = [...new Set(chassisNos)];
    let query = client
      .schema("app")
      .from("vehicle_record_corrections")
      .select("id, company_id, chassis_no, field_name, value_text, reason, updated_by, created_at, updated_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (uniqueChassisNos.length <= 100) {
      query = query.in("chassis_no", uniqueChassisNos);
    }

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as VehicleCorrectionRow[];
    const userNamesById = await this.fetchProfileDisplayNames(
      rows
        .map((row) => row.updated_by)
        .filter((value): value is string => Boolean(value)),
    );

    for (const row of rows) {
      const items = correctionsByChassis.get(row.chassis_no) ?? [];
      items.push({
        id: row.id,
        chassisNo: row.chassis_no,
        field: row.field_name,
        value: row.value_text,
        reason: row.reason,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        updatedBy: row.updated_by,
        updatedByName: row.updated_by ? userNamesById.get(row.updated_by) ?? row.updated_by : null,
      });
      correctionsByChassis.set(row.chassis_no, items);
    }

    return correctionsByChassis;
  }

  private async fetchProfileDisplayNames(userIds: string[]) {
    const names = new Map<string, string>();
    if (userIds.length === 0) {
      return names;
    }

    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("user_profiles")
      .select("id, display_name")
      .in("id", [...new Set(userIds)]);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      names.set(row.id, row.display_name ?? row.id);
    }

    return names;
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

  private async clearImportPreviewArtifacts(companyId: string, importId: string) {
    const client = this.supabase.getAdminClient();
    const { error: deleteRawError } = await client
      .schema("raw")
      .from("vehicle_import_rows")
      .delete()
      .eq("company_id", companyId)
      .eq("import_job_id", importId);

    if (deleteRawError) {
      throw new InternalServerErrorException(deleteRawError.message);
    }

    const { error: deleteIssuesError } = await client
      .schema("app")
      .from("quality_issues")
      .delete()
      .eq("company_id", companyId)
      .eq("import_job_id", importId);

    if (deleteIssuesError) {
      throw new InternalServerErrorException(deleteIssuesError.message);
    }
  }

  private async updateImportPreviewJob(companyId: string, importId: string, parsed: ImportPreview) {
    const summary = summarizeParsedWorkbook(parsed);
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: summary.status,
        total_rows: summary.totalRows,
        valid_rows: summary.validRows,
        error_rows: summary.errorRows,
        duplicate_rows: summary.duplicateRows,
        missing_columns: parsed.missingColumns,
        preview_available: true,
        last_error_at: null,
        error_message: null,
      })
      .eq("company_id", companyId)
      .eq("id", importId)
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path, processing_started_at, last_error_at, error_message, attempt_count, max_attempts")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to update import preview");
    }

    return data as ImportJobRow;
  }

  private async markImportPreviewFailed(
    companyId: string,
    importId: string,
    errorMessage: string,
    attemptCount: number,
    maxAttempts: number,
  ) {
    const client = this.supabase.getAdminClient();
    const { data, error } = await client
      .schema("app")
      .from("import_jobs")
      .update({
        status: "failed",
        total_rows: 0,
        valid_rows: 0,
        error_rows: 0,
        duplicate_rows: 0,
        preview_available: false,
        missing_columns: [],
        last_error_at: new Date().toISOString(),
        error_message: errorMessage,
        attempt_count: attemptCount,
        max_attempts: maxAttempts,
      })
      .eq("company_id", companyId)
      .eq("id", importId)
      .select("file_name, uploaded_by")
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Pick<ImportJobRow, "file_name" | "uploaded_by">;
  }

  private async setImportAttemptMetadata(
    companyId: string,
    importId: string,
    input: Record<string, string | number | null>,
  ) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("import_jobs")
      .update(input)
      .eq("company_id", companyId)
      .eq("id", importId);

    if (error) {
      throw new InternalServerErrorException(error.message);
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

  private async createNotification(input: {
    companyId: string;
    userId: string;
    title: string;
    message: string;
    type: Notification["type"];
    fingerprint: string;
    metadata?: Record<string, string | number | boolean | null>;
    alertRuleId?: string | null;
  }) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .schema("app")
      .from("notifications")
      .upsert({
        company_id: input.companyId,
        user_id: input.userId,
        alert_rule_id: input.alertRuleId ?? null,
        title: input.title,
        message: input.message,
        type: input.type,
        read: false,
        fingerprint: input.fingerprint,
        metadata: input.metadata ?? {},
      }, {
        onConflict: "user_id,fingerprint",
        ignoreDuplicates: true,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private buildImportValidationFailureMessage(missingColumns: string[]) {
    if (missingColumns.length === 0) {
      return "The workbook has blocking validation issues. Review the preview issues and upload a corrected workbook.";
    }

    return `Missing required columns: ${missingColumns.join(", ")}. Upload a corrected workbook to continue.`;
  }

  private async syncAlertNotifications(user: User) {
    const companyId = this.requireCompanyId(user);
    const alertRows = await this.fetchAlertRows(companyId);
    const enabledAlerts = alertRows
      .map((row) => this.mapAlertRow(row))
      .filter((alert) => alert.enabled);

    if (enabledAlerts.length === 0) {
      return;
    }

    const summary = await this.getSummary(user);
    const summaryScope = summary.latestImport?.datasetVersionId ?? summary.latestImport?.id ?? summary.lastRefresh;
    const triggeredAt = new Date().toISOString();

    for (const alert of enabledAlerts) {
      if (!alert.createdBy || alert.createdBy === "system") {
        continue;
      }

      const value = getExecutiveMetricValue(summary, alert.metricId);
      if (!compareMetricValue(value, alert.comparator, alert.threshold)) {
        continue;
      }

      const metric = getExecutiveDashboardMetricOption(alert.metricId);
      await this.createNotification({
        companyId,
        userId: alert.createdBy,
        title: `${alert.name} triggered`,
        message: `${metric?.label ?? alert.metricId} is ${value} (${describeAlertComparator(alert.comparator)} ${alert.threshold}).`,
        type: "warning",
        fingerprint: buildAlertNotificationFingerprint({
          alertId: alert.id,
          frequency: alert.frequency,
          triggeredAt,
          summaryScope,
          threshold: alert.threshold,
          comparator: alert.comparator,
          value,
        }),
        alertRuleId: alert.id,
        metadata: {
          metricId: alert.metricId,
          value,
          threshold: alert.threshold,
        },
      });
    }
  }

  private async syncAlertNotificationsSafely(user: User, reason: string) {
    await this.runBestEffort(`alert_notification_sync:${reason}`, async () => {
      await this.syncAlertNotifications(user);
    });
  }

  private async triggerAlertEvaluation(user: User, companyId: string, reason: string) {
    if (this.alertQueue.isConfigured()) {
      await this.runBestEffort(`alert_evaluation_enqueue:${reason}`, async () => {
        await this.alertQueue.enqueueAlertEvaluation({
          companyId,
          triggeredAt: new Date().toISOString(),
          reason,
        });
      });
      return;
    }

    await this.syncAlertNotificationsSafely(user, reason);
  }

  private async runBestEffort(label: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${label} failed: ${message}`);
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

function defaultExportQuery(): ExplorerQuery {
  return {
    branch: "all",
    model: "all",
    payment: "all",
    page: 1,
    pageSize: 100,
    sortField: "bg_to_delivery",
    sortDirection: "desc",
  };
}

function normalizeExportQuery(query: ExplorerQuery): ExplorerQuery {
  return {
    search: query.search?.trim() || undefined,
    branch: query.branch ?? "all",
    model: query.model ?? "all",
    payment: query.payment ?? "all",
    preset: query.preset,
    page: 1,
    pageSize: 100,
    sortField: query.sortField ?? "bg_to_delivery",
    sortDirection: query.sortDirection ?? "desc",
  };
}

function buildExportFileName(timestamp: string) {
  const compact = timestamp.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `vehicle-explorer-${compact}.csv`;
}

function buildExportSubscriptionFingerprint(query: ExplorerQuery) {
  return `daily:${JSON.stringify(normalizeExportQuery(query))}`;
}

function describeExportQuery(query: ExplorerQuery) {
  const parts = [
    query.search ? `search=${query.search}` : null,
    query.branch && query.branch !== "all" ? `branch=${query.branch}` : null,
    query.model && query.model !== "all" ? `model=${query.model}` : null,
    query.payment && query.payment !== "all" ? `payment=${query.payment}` : null,
    query.preset ? `preset=${query.preset}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "all vehicles";
}

function canViewCompanyWideExports(user: User) {
  return ["super_admin", "company_admin", "director"].includes(user.role);
}

function canManageVehicleCorrections(user: User) {
  return ["super_admin", "company_admin", "director"].includes(user.role);
}

function normalizeCorrectionComparableValue(field: VehicleCorrectionField, value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return String(value);
  }
  return normalizeVehicleCorrectionValue(field, value);
}

function normalizeVehicleCorrectionValue(field: VehicleCorrectionField, value: string) {
  const normalized = value.trim();
  if (field === "remark") {
    return normalized.length > 0 ? normalized : null;
  }
  if (field === "payment_method" || field === "salesman_name" || field === "customer_name") {
    if (!normalized) {
      throw new BadRequestException(`${VEHICLE_CORRECTION_FIELD_LABELS[field]} cannot be blank`);
    }
    return normalized;
  }
  if (!normalized) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException(`${VEHICLE_CORRECTION_FIELD_LABELS[field]} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new BadRequestException(`${VEHICLE_CORRECTION_FIELD_LABELS[field]} is not a valid calendar date`);
  }

  return normalized;
}

function validateVehicleCorrectionChronology(vehicle: VehicleCanonical, changedFields: VehicleCorrectionField[]) {
  const changedDateFields = new Set(
    changedFields.filter((field) => (
      field === "bg_date" ||
      field === "shipment_etd_pkg" ||
      field === "date_received_by_outlet" ||
      field === "reg_date" ||
      field === "delivery_date" ||
      field === "disb_date"
    )),
  );
  if (changedDateFields.size === 0) {
    return;
  }

  const orderedMilestones = [
    { field: "bg_date", label: "BG Date", value: vehicle.bg_date },
    { field: "shipment_etd_pkg", label: "Shipment ETD", value: vehicle.shipment_etd_pkg },
    { field: "date_received_by_outlet", label: "Outlet Received", value: vehicle.date_received_by_outlet },
    { field: "reg_date", label: "Registration Date", value: vehicle.reg_date },
    { field: "delivery_date", label: "Delivery Date", value: vehicle.delivery_date },
    { field: "disb_date", label: "Disbursement Date", value: vehicle.disb_date },
  ] as const;

  for (let index = 1; index < orderedMilestones.length; index += 1) {
    const previous = orderedMilestones[index - 1];
    const current = orderedMilestones[index];
    if (!previous.value || !current.value) {
      continue;
    }
    if (current.value < previous.value && (changedDateFields.has(previous.field) || changedDateFields.has(current.field))) {
      throw new BadRequestException(`${current.label} cannot be earlier than ${previous.label}`);
    }
  }
}
