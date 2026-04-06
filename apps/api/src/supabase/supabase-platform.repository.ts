import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  buildAlertNotificationFingerprint,
  buildAgingSummary,
  compareMetricValue,
  type Branch,
  createDefaultDashboardPreferences,
  describeAlertComparator,
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
import { AlertQueueService } from "../queues/alert-queue.service.js";
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
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
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
      })
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
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

    const processed = await this.processUploadedImportPreview(companyId, id, fileBuffer);
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
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
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

    const visibleVehicles = (await this.fetchVisibleVehicles(user, filters)).filter((vehicle) =>
      filters?.preset ? matchesExplorerPreset(vehicle, filters.preset) : true,
    );
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
      payment: query.payment,
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
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
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

  private async processUploadedImportPreview(companyId: string, importId: string, fileBuffer: Buffer) {
    const branchIdByCode = await this.fetchBranchIdByCode(companyId);
    const parsed = parseWorkbook(
      fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      ),
    );

    try {
      await this.clearImportPreviewArtifacts(companyId, importId);
      await this.persistRawImportRows(companyId, importId, parsed.rows, branchIdByCode);
      await this.replaceImportIssues(companyId, importId, parsed.issues, branchIdByCode, parsed.rows, null);
      const importRow = await this.updateImportPreviewJob(companyId, importId, parsed);
      return { parsed, importRow };
    } catch (error) {
      await this.runBestEffort(`import_preview_cleanup:${importId}`, async () => {
        await this.clearImportPreviewArtifacts(companyId, importId);
      });
      await this.runBestEffort(`import_preview_mark_failed:${importId}`, async () => {
        await this.markImportPreviewFailed(companyId, importId);
      });
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
      })
      .eq("company_id", companyId)
      .eq("id", importJob.id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async fetchVisibleVehicles(
    user: User,
    filters?: { branch?: string; model?: string; payment?: string; preset?: ExplorerPreset },
  ) {
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
    if (filters?.payment && filters.payment !== "all") {
      query = query.eq("payment_method", filters.payment);
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
      })
      .eq("company_id", companyId)
      .eq("id", importId)
      .select("id, file_name, uploaded_by, created_at, status, total_rows, valid_rows, error_rows, duplicate_rows, missing_columns, published_at, preview_available, dataset_version_id, publish_mode, storage_path")
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? "Failed to update import preview");
    }

    return data as ImportJobRow;
  }

  private async markImportPreviewFailed(companyId: string, importId: string) {
    const client = this.supabase.getAdminClient();
    const { error } = await client
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
      })
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
