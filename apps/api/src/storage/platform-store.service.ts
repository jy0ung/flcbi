import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  applyVehicleCorrections,
  type AppRole,
  buildAgingSummary,
  buildVehicleExplorerExportRows,
  compareMetricValue,
  describeExplorerQuery,
  type Branch,
  createDefaultDashboardPreferences,
  createDefaultSlaPolicies,
  type ExportJob,
  type ExportSubscription,
  filterVehiclesForExplorer,
  getExecutiveDashboardMetricOption,
  getExecutiveMetricValue,
  getPermissionsForUser,
  matchesExplorerPreset,
  navigationItems,
  normalizeExecutiveDashboardMetricIds,
  normalizeExplorerQuery,
  platformModules,
  publishCanonical,
  queryVehicles,
  parseWorkbook,
  VEHICLE_CORRECTION_EDITOR_ROLES,
  type AgingSummary,
  type AlertRule,
  type AuditEvent,
  type DashboardPreferences,
  type DataQualityIssue,
  type ExplorerQuery,
  type ExplorerPreset,
  type ExplorerSavedView,
  type ExplorerResult,
  type ExplorerMappingsResponse,
  type ImportBatch,
  type ImportPublishMode,
  type NavigationItem,
  type Notification,
  serializeCsvRows,
  type SlaPolicy,
  sortVehiclesForExplorer,
  type UpdateVehicleCorrectionsRequest,
  type UpdateExplorerMappingsRequest,
  type User,
  type VehicleCanonical,
  type VehicleCorrection,
  type WorkbookExplorerRow,
  VEHICLE_CORRECTION_FIELDS,
  VEHICLE_CORRECTION_FIELD_LABELS,
  type VehicleCorrectionField,
  type VehicleRaw,
} from "@flcbi/contracts";
import { ObjectStorageService } from "./object-storage.service.js";
import type {
  ExportDownload,
  PlatformRepository,
  PlatformRoleDefinition,
} from "../platform/platform.repository.js";

interface ImportPreview {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
}

interface ExportRecord {
  userId: string;
  item: ExportJob;
  content: Buffer;
}

interface ExportSubscriptionRecord {
  userId: string;
  fingerprint: string;
  item: ExportSubscription;
}

interface VehicleCorrectionRecord {
  companyId: string;
  item: VehicleCorrection;
}

interface ExplorerBranchMappingRecord {
  rawValue: string;
  branchId: string;
  approved: boolean;
  updatedAt: string;
}

interface ExplorerPaymentMappingRecord {
  rawValue: string;
  canonicalValue: string;
  approved: boolean;
  updatedAt: string;
}

@Injectable()
export class PlatformStoreService implements PlatformRepository {
  private readonly users: User[] = [];
  private readonly modules = [...platformModules];
  private readonly notifications: Notification[] = [];
  private readonly notificationFingerprints = new Set<string>();
  private readonly alerts: AlertRule[] = [];
  private readonly audits: AuditEvent[] = [];
  private readonly slasByCompany = new Map<string, SlaPolicy[]>();
  private readonly dashboardPreferencesByUser = new Map<string, DashboardPreferences>();
  private readonly explorerSavedViewsByUser = new Map<string, ExplorerSavedView[]>();
  private readonly importPreviews = new Map<string, ImportPreview>();
  private readonly exports = new Map<string, ExportRecord>();
  private readonly exportSubscriptions = new Map<string, ExportSubscriptionRecord>();
  private readonly vehicleCorrections = new Map<string, VehicleCorrectionRecord>();
  private readonly explorerBranchMappingsByCompany = new Map<string, ExplorerBranchMappingRecord[]>();
  private readonly explorerPaymentMappingsByCompany = new Map<string, ExplorerPaymentMappingRecord[]>();
  private readonly branches: Branch[] = [];
  private vehicles: VehicleCanonical[] = [];
  private imports: ImportBatch[] = [];
  private qualityIssues: DataQualityIssue[] = [];
  private lastRefresh = new Date().toISOString();

  constructor(@Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService) {}

  findUserByEmail(email: string) {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string) {
    return this.users.find((user) => user.id === id);
  }

  getNavigation(user: User): NavigationItem[] {
    return navigationItems.filter((item) => !item.roles || item.roles.includes(user.role));
  }

  getModules() {
    return this.modules;
  }

  getNotifications(user: User): Notification[] {
    this.syncAlertNotifications(user);
    return this.notifications
      .filter((notification) => notification.userId === user.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listAuditEvents(_user: User) {
    return [...this.audits].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt">) {
    this.audits.unshift({
      id: `audit-${this.audits.length + 1}`,
      createdAt: new Date().toISOString(),
      ...event,
    });
  }

  listUsers(user: User) {
    return this.users.filter((candidate) => candidate.companyId === user.companyId);
  }

  listRoles(): PlatformRoleDefinition[] {
    return [
      { role: "super_admin", description: "Platform-wide administrators for all tenants and controls." },
      { role: "company_admin", description: "Enterprise administrators for company-level analytics governance." },
      { role: "director", description: "Leadership access to executive reporting and audit visibility." },
      { role: "general_manager", description: "Cross-branch operators with broad read and action access." },
      { role: "manager", description: "Branch-scoped operational access with exports." },
      { role: "sales", description: "Sales users with branch-scoped operational visibility." },
      { role: "accounts", description: "Accounts users focused on finance and disbursement flow." },
      { role: "analyst", description: "Curated and governed explore access for analytics users." },
    ];
  }

  listBranches(user: User) {
    return this.branches.filter((branch) => branch.companyId === user.companyId);
  }

  createUser(
    user: User,
    input: { email: string; name: string; role: AppRole; branchId?: string | null; password: string; status?: User["status"] },
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (this.users.some((candidate) => candidate.email.toLowerCase() === normalizedEmail)) {
      throw new BadRequestException("A user with that email already exists");
    }

    const created: User = {
      id: randomUUID(),
      email: normalizedEmail,
      name: input.name.trim(),
      role: input.role,
      companyId: user.companyId,
      branchId: input.branchId ?? undefined,
      status: input.status ?? "active",
    };

    this.users.push(created);
    this.addAuditEvent({
      action: "user_created",
      entity: "user",
      entityId: created.id,
      userId: user.id,
      userName: user.name,
      details: `Created ${created.email} with role ${created.role}`,
    });
    return created;
  }

  updateUser(
    user: User,
    targetUserId: string,
    input: { email?: string; name?: string; role?: AppRole; branchId?: string | null; password?: string; status?: User["status"] },
  ) {
    const existing = this.users.find((candidate) => candidate.id === targetUserId && candidate.companyId === user.companyId);
    if (!existing) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    if (input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const duplicate = this.users.find((candidate) => candidate.id !== targetUserId && candidate.email.toLowerCase() === normalizedEmail);
      if (duplicate) {
        throw new BadRequestException("A user with that email already exists");
      }
      existing.email = normalizedEmail;
    }
    if (input.name) existing.name = input.name.trim();
    if (input.role) existing.role = input.role;
    if (input.branchId !== undefined) existing.branchId = input.branchId ?? undefined;
    if (input.status) existing.status = input.status;

    this.addAuditEvent({
      action: "user_updated",
      entity: "user",
      entityId: existing.id,
      userId: user.id,
      userName: user.name,
      details: `Updated ${existing.email}`,
    });
    return existing;
  }

  deleteUser(user: User, targetUserId: string) {
    const existing = this.users.find((candidate) => candidate.id === targetUserId && candidate.companyId === user.companyId);
    if (!existing) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    existing.status = "disabled";
    this.addAuditEvent({
      action: "user_deactivated",
      entity: "user",
      entityId: existing.id,
      userId: user.id,
      userName: user.name,
      details: `Deactivated ${existing.email}`,
    });
  }

  listAlerts(user: User) {
    return this.alerts.filter((alert) => alert.companyId === user.companyId);
  }

  createAlert(user: User, input: Omit<AlertRule, "id" | "createdBy" | "companyId">) {
    const alert: AlertRule = {
      id: `alert-${this.alerts.length + 1}`,
      createdBy: user.id,
      companyId: user.companyId,
      ...input,
    };
    this.alerts.unshift(alert);
    this.addAuditEvent({
      action: "alert_created",
      entity: "alert_rule",
      entityId: alert.id,
      userId: user.id,
      userName: user.name,
      details: `Created alert ${alert.name}`,
    });
    this.syncAlertNotifications(user);
    return alert;
  }

  updateAlert(
    user: User,
    alertId: string,
    input: Partial<Omit<AlertRule, "id" | "createdBy" | "companyId">>,
  ) {
    const alert = this.alerts.find((candidate) => candidate.id === alertId && candidate.companyId === user.companyId);
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    Object.assign(alert, input);
    this.addAuditEvent({
      action: "alert_updated",
      entity: "alert_rule",
      entityId: alert.id,
      userId: user.id,
      userName: user.name,
      details: `Updated alert ${alert.name}`,
    });
    this.syncAlertNotifications(user);
    return alert;
  }

  deleteAlert(user: User, alertId: string) {
    const alertIndex = this.alerts.findIndex((candidate) => candidate.id === alertId && candidate.companyId === user.companyId);
    if (alertIndex < 0) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    const [alert] = this.alerts.splice(alertIndex, 1);
    this.addAuditEvent({
      action: "alert_deleted",
      entity: "alert_rule",
      entityId: alert.id,
      userId: user.id,
      userName: user.name,
      details: `Deleted alert ${alert.name}`,
    });
  }

  listImports(_user: User) {
    return [...this.imports].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  }

  getImportById(_user: User, id: string) {
    const item = this.imports.find((record) => record.id === id);
    if (!item) {
      throw new NotFoundException(`Import ${id} not found`);
    }

    const preview = this.importPreviews.get(id);
    return {
      item,
      previewIssues: preview?.issues ?? [],
      missingColumns: preview?.missingColumns ?? [],
      previewRows: preview?.rows.length ?? item.totalRows,
    };
  }

  async createImportPreview(user: User, fileName: string, fileBuffer: Buffer) {
      const parsed = await parseWorkbook(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
    const id = `batch-${Date.now()}`;
    const storageKey = `imports/${id}/${fileName}`;
    await this.objectStorage.putObject(storageKey, fileBuffer);

    const item: ImportBatch = {
      id,
      fileName,
      uploadedBy: user.name,
      uploadedAt: new Date().toISOString(),
      status: parsed.missingColumns.length > 0 ? "failed" : "validated",
      totalRows: parsed.rows.length,
      validRows: parsed.rows.length - parsed.issues.filter((issue) => issue.severity === "error").length,
      errorRows: parsed.issues.filter((issue) => issue.severity === "error").length,
      duplicateRows: parsed.issues.filter((issue) => issue.issueType === "duplicate").length,
      previewAvailable: true,
      storageKey,
      processingStartedAt: new Date().toISOString(),
      attemptCount: 1,
      maxAttempts: 1,
      canRetryPublish: false,
    };

    this.imports.unshift(item);
    this.importPreviews.set(id, parsed);
    return this.getImportById(user, id);
  }

  publishImport(user: User, id: string, mode: ImportPublishMode = "replace") {
    const item = this.imports.find((record) => record.id === id);
    const preview = this.importPreviews.get(id);
    if (!item || !preview) {
      throw new NotFoundException(`Import ${id} not found`);
    }

    const { canonical, issues } = publishCanonical(
      preview.rows.map((row) => ({ ...row, import_batch_id: id })),
    );
    if (canonical.length === 0) {
      throw new BadRequestException("No canonical vehicle rows were produced from this import");
    }

    if (mode === "replace") {
      this.vehicles = canonical;
      this.qualityIssues = [...issues, ...preview.issues];
    } else {
      const canonicalIds = new Set(canonical.map((vehicle) => vehicle.chassis_no));
      this.vehicles = [...canonical, ...this.vehicles.filter((vehicle) => !canonicalIds.has(vehicle.chassis_no))];
      this.qualityIssues = [...issues, ...preview.issues, ...this.qualityIssues];
    }
    item.status = "published";
    item.publishedAt = new Date().toISOString();
    item.datasetVersionId = `dataset-${Date.now()}`;
    item.publishMode = mode;
    item.attemptCount = 1;
    item.maxAttempts = 1;
    item.canRetryPublish = false;
    this.lastRefresh = new Date().toISOString();
    this.addAuditEvent({
      action: "import_published",
      entity: "import_batch",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Published ${canonical.length} canonical vehicles from ${item.fileName} using ${mode} mode`,
    });
    this.addNotification(
      user.id,
      `Import published: ${item.fileName}`,
      `${canonical.length} vehicles are now live in ${mode} mode.`,
      "success",
      `import-published:${id}`,
    );
    this.syncAlertNotifications(user);
    return item;
  }

  listExports(user: User) {
    return [...this.exports.values()]
      .filter((record) => canViewCompanyWideExports(user) || record.userId === user.id)
      .map((record) => record.item)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  listExportSubscriptions(user: User) {
    return [...this.exportSubscriptions.values()]
      .filter((record) => canViewCompanyWideExports(user) || record.userId === user.id)
      .map((record) => record.item)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createExplorerExport(user: User, query: ExplorerQuery) {
    const exportId = randomUUID();
    const record = await this.generateExplorerExportRecord(user, exportId, normalizeExportQuery(query));
    this.exports.set(exportId, record);
    this.addAuditEvent({
      action: "export_requested",
      entity: "export_job",
      entityId: exportId,
      userId: user.id,
      userName: user.name,
      details: `Generated ${record.item.fileName} with ${record.item.totalRows} vehicle rows`,
    });
    this.addNotification(
      user.id,
      `Export ready: ${record.item.fileName}`,
      `${record.item.totalRows} vehicles were prepared for download.`,
      "success",
      `export-complete:${exportId}`,
    );
    return record.item;
  }

  createExportSubscription(user: User, query: ExplorerQuery) {
    const normalizedQuery = normalizeExportQuery(query);
    const fingerprint = buildExportSubscriptionFingerprint(normalizedQuery);
    const duplicate = [...this.exportSubscriptions.values()].find((record) => (
      record.userId === user.id && record.fingerprint === fingerprint
    ));
    if (duplicate) {
      throw new BadRequestException("A matching daily export subscription already exists");
    }

    const subscriptionId = randomUUID();
    const createdAt = new Date().toISOString();
    const item: ExportSubscription = {
      id: subscriptionId,
      requestedBy: user.name,
      createdAt,
      schedule: "daily",
      kind: "vehicle_explorer_csv",
      enabled: true,
      query: normalizedQuery,
    };

    this.exportSubscriptions.set(subscriptionId, {
      userId: user.id,
      fingerprint,
      item,
    });
    this.addAuditEvent({
      action: "export_subscription_created",
      entity: "export_subscription",
      entityId: subscriptionId,
      userId: user.id,
      userName: user.name,
      details: `Created daily export subscription for ${describeExplorerQuery(normalizedQuery)}`,
    });
    return item;
  }

  deleteExportSubscription(user: User, subscriptionId: string) {
    const record = this.exportSubscriptions.get(subscriptionId);
    if (!record || (!canViewCompanyWideExports(user) && record.userId !== user.id)) {
      throw new NotFoundException(`Export subscription ${subscriptionId} not found`);
    }

    this.exportSubscriptions.delete(subscriptionId);
    this.addAuditEvent({
      action: "export_subscription_deleted",
      entity: "export_subscription",
      entityId: subscriptionId,
      userId: user.id,
      userName: user.name,
      details: `Deleted daily export subscription for ${describeExplorerQuery(record.item.query)}`,
    });
  }

  async retryExport(user: User, exportId: string) {
    const record = this.exports.get(exportId);
    if (!record || (!canViewCompanyWideExports(user) && record.userId !== user.id)) {
      throw new NotFoundException(`Export ${exportId} not found`);
    }
    if (record.item.status !== "failed") {
      throw new BadRequestException("Only failed exports can be retried");
    }

    const owner = this.findUserById(record.userId);
    if (!owner) {
      throw new NotFoundException(`User ${record.userId} not found`);
    }

    const nextRecord = await this.generateExplorerExportRecord(owner, exportId, record.item.query);
    this.exports.set(exportId, nextRecord);
    this.addAuditEvent({
      action: "export_retry_requested",
      entity: "export_job",
      entityId: exportId,
      userId: user.id,
      userName: user.name,
      details: `Retried ${nextRecord.item.fileName}`,
    });
    this.addNotification(
      owner.id,
      `Export ready: ${nextRecord.item.fileName}`,
      `${nextRecord.item.totalRows} vehicles were prepared for download.`,
      "success",
      `export-complete:${exportId}`,
    );
    return nextRecord.item;
  }

  async getExportDownload(user: User, exportId: string): Promise<ExportDownload> {
    const record = this.exports.get(exportId);
    if (!record || (!canViewCompanyWideExports(user) && record.userId !== user.id)) {
      throw new NotFoundException(`Export ${exportId} not found`);
    }
    if (record.item.status !== "completed" || !record.item.storageKey) {
      throw new BadRequestException("This export is not ready to download yet");
    }

    const content = await this.objectStorage.getObject(record.item.storageKey);
    return {
      fileName: record.item.fileName,
      contentType: "text/csv; charset=utf-8",
      content,
    };
  }

  private async generateExplorerExportRecord(user: User, exportId: string, query: ExplorerQuery): Promise<ExportRecord> {
    const normalizedQuery = normalizeExportQuery(query);
    const explorer = this.queryExplorer(user, normalizedQuery);
    const rows = buildVehicleExplorerExportRows(explorer.items, explorer.columns);
    const content = Buffer.from(serializeCsvRows(rows), "utf8");
    const requestedAt = new Date().toISOString();
    const fileName = buildExportFileName(requestedAt);
    const storageKey = `exports/${user.companyId}/${exportId}/${fileName}`;
    await this.objectStorage.putObject(storageKey, content);

    return {
      userId: user.id,
      content,
      item: {
        id: exportId,
        fileName,
        requestedBy: user.name,
        requestedAt,
        status: "completed",
        format: "csv",
        kind: "vehicle_explorer_csv",
        totalRows: explorer.total,
        query: normalizedQuery,
        storageKey,
        completedAt: requestedAt,
        processingStartedAt: requestedAt,
        attemptCount: 1,
        maxAttempts: 1,
        canRetry: false,
      },
    };
  }

  getDashboardPreferences(user: User) {
    const existing = this.dashboardPreferencesByUser.get(user.id);
    if (!existing) {
      return createDefaultDashboardPreferences();
    }

    return {
      executiveMetricIds: normalizeExecutiveDashboardMetricIds(existing.executiveMetricIds),
    };
  }

  saveDashboardPreferences(user: User, preferences: DashboardPreferences) {
    const normalized = {
      executiveMetricIds: normalizeExecutiveDashboardMetricIds(preferences.executiveMetricIds),
    };

    this.dashboardPreferencesByUser.set(user.id, normalized);
    this.addAuditEvent({
      action: "dashboard_preferences_updated",
      entity: "dashboard_preferences",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      details: `Saved ${normalized.executiveMetricIds.length} executive dashboard metrics`,
    });
    return normalized;
  }

  listExplorerSavedViews(user: User) {
    return [...(this.explorerSavedViewsByUser.get(user.id) ?? [])]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createExplorerSavedView(user: User, input: { name: string; query: ExplorerQuery }) {
    const normalizedName = input.name.trim();
    if (!normalizedName) {
      throw new BadRequestException("Saved view name is required");
    }

    const normalizedQuery = normalizeExplorerSavedViewQuery(input.query);
    const views = [...(this.explorerSavedViewsByUser.get(user.id) ?? [])];
    const existing = views.find((view) => view.name.toLowerCase() === normalizedName.toLowerCase());
    const timestamp = new Date().toISOString();

    const savedView: ExplorerSavedView = existing
      ? {
          ...existing,
          name: normalizedName,
          query: normalizedQuery,
          updatedAt: timestamp,
        }
      : {
          id: randomUUID(),
          name: normalizedName,
          query: normalizedQuery,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

    const nextViews = existing
      ? views.map((view) => (view.id === existing.id ? savedView : view))
      : [savedView, ...views];

    this.explorerSavedViewsByUser.set(user.id, nextViews);
    this.addAuditEvent({
      action: existing ? "saved_view_updated" : "saved_view_created",
      entity: "saved_view",
      entityId: savedView.id,
      userId: user.id,
      userName: user.name,
      details: `${existing ? "Updated" : "Saved"} explorer view ${savedView.name}`,
    });
    return savedView;
  }

  deleteExplorerSavedView(user: User, savedViewId: string) {
    const views = this.explorerSavedViewsByUser.get(user.id) ?? [];
    const existing = views.find((view) => view.id === savedViewId);
    if (!existing) {
      throw new NotFoundException(`Saved view ${savedViewId} not found`);
    }

    this.explorerSavedViewsByUser.set(
      user.id,
      views.filter((view) => view.id !== savedViewId),
    );
    this.addAuditEvent({
      action: "saved_view_deleted",
      entity: "saved_view",
      entityId: savedViewId,
      userId: user.id,
      userName: user.name,
      details: `Deleted explorer view ${existing.name}`,
    });
  }

  listExplorerMappings(user: User): ExplorerMappingsResponse {
    return this.buildExplorerMappings(user.companyId);
  }

  saveExplorerMappings(user: User, input: UpdateExplorerMappingsRequest): ExplorerMappingsResponse {
    if (!canManageExplorerMappings(user)) {
      throw new ForbiddenException("You do not have permission to manage mappings");
    }

    const timestamp = new Date().toISOString();
    const branchChanges = input.branches ?? [];
    const paymentChanges = input.payments ?? [];

    if (branchChanges.length === 0 && paymentChanges.length === 0) {
      return this.buildExplorerMappings(user.companyId);
    }

    if (branchChanges.length > 0) {
      const records = this.explorerBranchMappingsByCompany.get(user.companyId) ?? [];
      for (const change of branchChanges) {
        const existing = records.find((record) => record.rawValue.toLowerCase() === change.rawValue.trim().toLowerCase());
        const nextRecord: ExplorerBranchMappingRecord = {
          rawValue: change.rawValue.trim(),
          branchId: change.branchId,
          approved: change.approved ?? true,
          updatedAt: timestamp,
        };
        if (existing) {
          Object.assign(existing, nextRecord);
        } else {
          records.push(nextRecord);
        }
        this.backfillBranchMapping(user.companyId, nextRecord.rawValue, nextRecord.branchId);
      }
      this.explorerBranchMappingsByCompany.set(user.companyId, records);
    }

    if (paymentChanges.length > 0) {
      const records = this.explorerPaymentMappingsByCompany.get(user.companyId) ?? [];
      for (const change of paymentChanges) {
        const existing = records.find((record) => record.rawValue.toLowerCase() === change.rawValue.trim().toLowerCase());
        const nextRecord: ExplorerPaymentMappingRecord = {
          rawValue: change.rawValue.trim(),
          canonicalValue: change.canonicalValue.trim(),
          approved: change.approved ?? true,
          updatedAt: timestamp,
        };
        if (existing) {
          Object.assign(existing, nextRecord);
        } else {
          records.push(nextRecord);
        }
        this.backfillPaymentMapping(user.companyId, nextRecord.rawValue, nextRecord.canonicalValue);
      }
      this.explorerPaymentMappingsByCompany.set(user.companyId, records);
    }

    this.addAuditEvent({
      action: "explorer_mappings_updated",
      entity: "mapping_rule",
      entityId: user.companyId,
      userId: user.id,
      userName: user.name,
      details: `Updated ${branchChanges.length} branch and ${paymentChanges.length} payment mappings`,
    });

    return this.buildExplorerMappings(user.companyId);
  }

  private buildExplorerMappings(companyId: string): ExplorerMappingsResponse {
    const branches = this.branches
      .filter((branch) => branch.companyId === companyId)
      .sort((left, right) => left.code.localeCompare(right.code));
    const branchOptions = branches.map((branch) => ({
      value: branch.id,
      label: `${branch.code} - ${branch.name}`,
    }));
    const paymentOptions = this.buildExplorerPaymentOptions(companyId);
    const observedBranchCounts = this.collectExplorerMappingCounts("branch_code");
    const observedPaymentCounts = this.collectExplorerMappingCounts("payment_method");
    const branchRecords = this.explorerBranchMappingsByCompany.get(companyId) ?? [];
    const paymentRecords = this.explorerPaymentMappingsByCompany.get(companyId) ?? [];

    const branchRecordsByRaw = new Map(branchRecords.map((record) => [record.rawValue.toLowerCase(), record]));
    const paymentRecordsByRaw = new Map(paymentRecords.map((record) => [record.rawValue.toLowerCase(), record]));

    const branchValues = new Set([
      ...observedBranchCounts.keys(),
      ...branchRecords.map((record) => record.rawValue),
    ]);
    const paymentValues = new Set([
      ...observedPaymentCounts.keys(),
      ...paymentRecords.map((record) => record.rawValue),
    ]);

    return {
      branches: [...branchValues]
        .sort((left, right) => left.localeCompare(right))
        .map((rawValue) => {
          const record = branchRecordsByRaw.get(rawValue.toLowerCase());
          const suggestedBranchId = this.suggestBranchId(companyId, rawValue);
          const branch = branches.find((item) => item.id === (record?.branchId ?? suggestedBranchId));
          return {
            rawValue,
            branchId: record?.branchId ?? suggestedBranchId ?? branchOptions[0]?.value ?? "",
            branchCode: branch?.code ?? "",
            branchName: branch?.name ?? "",
            approved: record?.approved ?? false,
            sourceCount: observedBranchCounts.get(rawValue) ?? 0,
            suggestedBranchId,
          };
        }),
      payments: [...paymentValues]
        .sort((left, right) => left.localeCompare(right))
        .map((rawValue) => {
          const record = paymentRecordsByRaw.get(rawValue.toLowerCase());
          const suggestedCanonicalValue = this.suggestPaymentValue(rawValue, paymentOptions);
          return {
            rawValue,
            canonicalValue: record?.canonicalValue ?? suggestedCanonicalValue ?? paymentOptions[0]?.value ?? "",
            approved: record?.approved ?? false,
            sourceCount: observedPaymentCounts.get(rawValue) ?? 0,
            suggestedCanonicalValue,
          };
        }),
      branchOptions,
      paymentOptions,
    };
  }

  private collectExplorerMappingCounts(field: "branch_code" | "payment_method") {
    const counts = new Map<string, number>();
    for (const preview of this.importPreviews.values()) {
      for (const row of preview.rows) {
        const rawValue = field === "branch_code" ? row.branch_code : row.payment_method;
        const normalized = rawValue?.trim();
        if (!normalized) {
          continue;
        }
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }
    return counts;
  }

  private buildExplorerPaymentOptions(companyId: string) {
    const observedValues = new Set<string>();
    for (const vehicle of this.vehicles) {
      const value = vehicle.payment_method?.trim();
      if (value) {
        observedValues.add(value);
      }
    }
    for (const record of this.explorerPaymentMappingsByCompany.get(companyId) ?? []) {
      const value = record.canonicalValue.trim();
      if (value) {
        observedValues.add(value);
      }
    }

    return [...observedValues]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ value, label: value }));
  }

  private suggestBranchId(companyId: string, rawValue: string) {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const branch = this.branches.find(
      (candidate) =>
        candidate.companyId === companyId &&
        (candidate.code.toLowerCase() === normalized || candidate.name.toLowerCase() === normalized),
    );
    return branch?.id;
  }

  private suggestPaymentValue(rawValue: string, paymentOptions: Array<{ value: string; label: string }>) {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const exact = paymentOptions.find((option) => option.value.toLowerCase() === normalized);
    if (exact) {
      return exact.value;
    }

    const titleCase = rawValue
      .trim()
      .toLowerCase()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return titleCase || undefined;
  }

  private backfillBranchMapping(companyId: string, rawValue: string, branchId: string) {
    const branch = this.branches.find((candidate) => candidate.id === branchId && candidate.companyId === companyId);
    if (!branch) {
      throw new BadRequestException(`Branch ${branchId} not found`);
    }

    const normalizedRaw = rawValue.trim().toLowerCase();
    for (const vehicle of this.vehicles) {
      if ((vehicle.branch_code ?? "").trim().toLowerCase() === normalizedRaw) {
        vehicle.branch_code = branch.code;
      }
    }
  }

  private backfillPaymentMapping(_companyId: string, rawValue: string, canonicalValue: string) {
    const normalizedRaw = rawValue.trim().toLowerCase();
    const normalizedCanonical = canonicalValue.trim();
    for (const vehicle of this.vehicles) {
      if ((vehicle.payment_method ?? "").trim().toLowerCase() === normalizedRaw) {
        vehicle.payment_method = normalizedCanonical;
      }
    }
  }

  listSlas(user: User) {
    return [...this.getCompanySlas(user.companyId)];
  }

  updateSla(user: User, id: string, slaDays: number) {
    const slas = this.getCompanySlas(user.companyId);
    const sla = slas.find((item) => item.id === id);
    if (!sla) {
      throw new NotFoundException(`SLA ${id} not found`);
    }
    sla.slaDays = slaDays;
    this.lastRefresh = new Date().toISOString();
    this.addAuditEvent({
      action: "sla_updated",
      entity: "sla_policy",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Updated ${sla.label} to ${slaDays} days`,
    });
    return sla;
  }

  getSummary(
    user: User,
    filters?: { branch?: string; model?: string; payment?: string; preset?: ExplorerPreset },
  ): AgingSummary {
    const visibleVehicles = this.getVisibleVehicles(user).filter((vehicle) => {
      if (filters?.branch && filters.branch !== "all" && vehicle.branch_code !== filters.branch) return false;
      if (filters?.model && filters.model !== "all" && vehicle.model !== filters.model) return false;
      if (filters?.payment && filters.payment !== "all" && vehicle.payment_method !== filters.payment) return false;
      if (filters?.preset && !matchesExplorerPreset(vehicle, filters.preset)) return false;
      return true;
    });
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.chassis_no));
    const visibleIssues = this.getVisibleQualityIssues(user).filter((issue) => visibleVehicleIds.has(issue.chassisNo));
    return buildAgingSummary(visibleVehicles, this.getCompanySlas(user.companyId), visibleIssues, this.imports, this.lastRefresh);
  }

  queryExplorer(user: User, query: ExplorerQuery): ExplorerResult {
    return queryVehicles(this.getVisibleWorkbookRows(user), query);
  }

  getVehicle(user: User, chassisNo: string) {
    const vehicle = this.maskVehicle(
      this.getVisibleVehicles(user).find((item) => item.chassis_no === chassisNo),
      user,
    );
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${chassisNo} not found`);
    }
    return {
      vehicle,
      issues: this.getVisibleQualityIssues(user).filter((issue) => issue.chassisNo === chassisNo),
      corrections: this.listVehicleCorrections(user.companyId, chassisNo),
    };
  }

  updateVehicleCorrections(user: User, chassisNo: string, input: UpdateVehicleCorrectionsRequest) {
    if (!canManageVehicleCorrections(user)) {
      throw new ForbiddenException("You do not have permission to edit vehicle corrections");
    }

    const baseVehicle = this.vehicles.find((item) => item.chassis_no === chassisNo);
    if (!baseVehicle || !baseVehicle.import_batch_id) {
      throw new NotFoundException(`Vehicle ${chassisNo} not found`);
    }

    const patch = this.normalizeVehicleCorrectionInput(input);
    const changedFields = Object.keys(patch) as VehicleCorrectionField[];
    if (changedFields.length === 0) {
      throw new BadRequestException("No correction fields were provided");
    }

    const effectiveVehicle = applyVehicleCorrections(
      baseVehicle,
      changedFields.map((field) => ({ field, value: patch[field] ?? null })),
    );
    validateVehicleCorrectionChronology(effectiveVehicle, changedFields);

    for (const field of changedFields) {
      const key = buildVehicleCorrectionKey(user.companyId, chassisNo, field);
      const normalizedValue = patch[field] ?? null;
      const baseValue = normalizeCorrectionComparableValue(field, baseVehicle[field]);
      if (normalizedValue === baseValue) {
        this.vehicleCorrections.delete(key);
        continue;
      }

      const existing = this.vehicleCorrections.get(key);
      this.vehicleCorrections.set(key, {
        companyId: user.companyId,
        item: {
          id: existing?.item.id ?? randomUUID(),
          chassisNo,
          field,
          value: normalizedValue,
          reason: input.reason.trim(),
          createdAt: existing?.item.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: user.id,
          updatedByName: user.name,
        },
      });
    }

    this.lastRefresh = new Date().toISOString();
    this.addAuditEvent({
      action: "vehicle_corrections_updated",
      entity: "vehicle_record_correction",
      entityId: chassisNo,
      userId: user.id,
      userName: user.name,
      details: `Updated ${changedFields.map((field) => VEHICLE_CORRECTION_FIELD_LABELS[field]).join(", ")} for ${chassisNo}. Reason: ${input.reason.trim()}`,
    });

    return this.getVehicle(user, chassisNo);
  }

  getQualityIssues(user: User) {
    return this.getVisibleQualityIssues(user);
  }

  markNotificationRead(user: User, notificationId: string) {
    const notification = this.notifications.find(
      (candidate) => candidate.id === notificationId && candidate.userId === user.id,
    );
    if (!notification) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }
    notification.read = true;
  }

  markAllNotificationsRead(user: User) {
    this.notifications.forEach((notification) => {
      if (notification.userId === user.id) {
        notification.read = true;
      }
    });
  }

  getPermissionsForUser(user: User) {
    return getPermissionsForUser(user);
  }

  private getCompanySlas(companyId: string) {
    const existing = this.slasByCompany.get(companyId);
    if (existing) {
      return existing;
    }

    const created = createDefaultSlaPolicies(companyId);
    this.slasByCompany.set(companyId, created);
    return created;
  }

  private getVisibleVehicles(user: User): VehicleCanonical[] {
    return this.vehicles
      .filter((vehicle) => vehicle.import_batch_id)
      .filter((vehicle) => {
        if (user.role === "super_admin" || user.role === "company_admin" || user.role === "director" || user.role === "analyst") {
          return true;
        }
        if (user.branchId) {
          return vehicle.branch_code === user.branchId;
        }
        return true;
      })
      .map((vehicle) => applyVehicleCorrections(vehicle, this.listVehicleCorrections(user.companyId, vehicle.chassis_no)))
      .map((vehicle) => this.maskVehicle(vehicle, user))
      .filter((vehicle): vehicle is VehicleCanonical => Boolean(vehicle));
  }

  private getVisibleWorkbookRows(user: User): WorkbookExplorerRow[] {
    const previewRows = this.imports.flatMap((item) => this.importPreviews.get(item.id)?.rows ?? []);
    const editableChassisNos = new Set(this.vehicles.map((vehicle) => vehicle.chassis_no));
    const correctionsByChassis = new Map<string, VehicleCorrection[]>();
    for (const row of previewRows) {
      correctionsByChassis.set(row.chassis_no, this.listVehicleCorrections(user.companyId, row.chassis_no));
    }

    const visibleRows = previewRows
      .map((row) => {
        const workbookRow = this.mapWorkbookRow(row);
        return {
          ...(applyVehicleCorrections(workbookRow, correctionsByChassis.get(row.chassis_no) ?? []) as WorkbookExplorerRow),
          canEditCorrections: editableChassisNos.has(workbookRow.chassis_no),
        };
      })
      .filter((row) => {
        if (user.role === "super_admin" || user.role === "company_admin" || user.role === "director" || user.role === "analyst") {
          return true;
        }
        if (user.branchId) {
          return row.branch_code === user.branchId;
        }
        return true;
      });

    return visibleRows;
  }

  private mapWorkbookRow(row: VehicleRaw): WorkbookExplorerRow {
    const workbookRow: WorkbookExplorerRow = {
      id: row.id,
      row_number: row.row_number,
      chassis_no: row.chassis_no,
      bg_date: row.bg_date,
      shipment_etd_pkg: row.shipment_etd_pkg,
      shipment_eta_kk_twu_sdk: row.shipment_eta_kk_twu_sdk,
      date_received_by_outlet: row.date_received_by_outlet,
      reg_date: row.reg_date,
      delivery_date: row.delivery_date,
      disb_date: row.disb_date,
      branch_code: row.branch_code ?? "UNKNOWN",
      model: row.model ?? "Unknown",
      payment_method: row.payment_method ?? "Unknown",
      salesman_name: row.salesman_name ?? "Unknown",
      customer_name: row.customer_name ?? "Unknown",
      remark: row.remark,
      vaa_date: row.vaa_date,
      full_payment_date: row.full_payment_date,
      is_d2d: row.is_d2d ?? false,
      import_batch_id: row.import_batch_id,
      source_row_id: row.id,
      variant: row.variant,
      dealer_transfer_price: row.dealer_transfer_price,
      full_payment_type: row.full_payment_type,
      shipment_name: row.shipment_name,
      lou: row.lou,
      contra_sola: row.contra_sola,
      reg_no: row.reg_no,
      invoice_no: row.invoice_no,
      obr: row.obr,
      source_headers: row.source_headers,
      source_values: row.source_values,
    };

    return workbookRow;
  }

  private listVehicleCorrections(companyId: string, chassisNo: string) {
    return [...this.vehicleCorrections.values()]
      .filter((record) => record.companyId === companyId && record.item.chassisNo === chassisNo)
      .map((record) => record.item)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

  private getVisibleQualityIssues(user: User) {
    const visibleVehicles = new Set(this.getVisibleVehicles(user).map((vehicle) => vehicle.chassis_no));
    return this.qualityIssues.filter((issue) => visibleVehicles.has(issue.chassisNo));
  }

  private syncAlertNotifications(user: User) {
    const enabledAlerts = this.alerts.filter((alert) => alert.companyId === user.companyId && alert.enabled);
    if (enabledAlerts.length === 0) {
      return;
    }

    const visibleVehicles = this.getVisibleVehicles(user);
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.chassis_no));
    const visibleIssues = this.qualityIssues.filter((issue) => visibleVehicleIds.has(issue.chassisNo));
    const summary = buildAgingSummary(
      visibleVehicles,
      this.getCompanySlas(user.companyId),
      visibleIssues,
      this.imports,
      this.lastRefresh,
    );
    const summaryScope = summary.latestImport?.datasetVersionId ?? summary.latestImport?.id ?? summary.lastRefresh;

    enabledAlerts.forEach((alert) => {
      const value = getExecutiveMetricValue(summary, alert.metricId);
      if (!compareMetricValue(value, alert.comparator, alert.threshold)) {
        return;
      }

      const metric = getExecutiveDashboardMetricOption(alert.metricId);
      this.addNotification(
        alert.createdBy,
        `${alert.name} triggered`,
        `${metric?.label ?? alert.metricId} is ${value} (${describeComparator(alert.comparator)} ${alert.threshold}).`,
        "warning",
        ["alert", alert.id, summaryScope, alert.threshold, alert.comparator, value].join(":"),
      );
    });
  }

  private addNotification(
    userId: string,
    title: string,
    message: string,
    type: Notification["type"],
    fingerprint: string,
  ) {
    const dedupeKey = `${userId}:${fingerprint}`;
    if (this.notificationFingerprints.has(dedupeKey)) {
      return;
    }

    this.notifications.unshift({
      id: randomUUID(),
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    });
    this.notificationFingerprints.add(dedupeKey);
  }

  private maskVehicle(vehicle: VehicleCanonical | undefined, user: User): VehicleCanonical | undefined {
    if (!vehicle) return undefined;
    if (["super_admin", "company_admin", "director", "analyst", "manager"].includes(user.role)) {
      return vehicle;
    }
    return {
      ...vehicle,
      customer_name: vehicle.customer_name ? `${vehicle.customer_name.charAt(0)}***` : "Restricted",
    };
  }
}

function describeComparator(comparator: AlertRule["comparator"]) {
  switch (comparator) {
    case "gt":
      return "above";
    case "gte":
      return "at or above";
    case "lt":
      return "below";
    case "lte":
      return "at or below";
    default:
      return comparator;
  }
}

function normalizeExportQuery(query: ExplorerQuery): ExplorerQuery {
  const normalized = normalizeExplorerQuery(query);
  return {
    ...normalized,
    page: 1,
    pageSize: 100,
  };
}

function buildExportFileName(timestamp: string) {
  const compact = timestamp.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `vehicle-explorer-${compact}.csv`;
}

function buildExportSubscriptionFingerprint(query: ExplorerQuery) {
  return `daily:${JSON.stringify(normalizeExportQuery(query))}`;
}

function canViewCompanyWideExports(user: User) {
  return ["super_admin", "company_admin", "director"].includes(user.role);
}

function canManageVehicleCorrections(user: User) {
  return VEHICLE_CORRECTION_EDITOR_ROLES.includes(user.role);
}

function canManageExplorerMappings(user: User) {
  return ["super_admin", "company_admin"].includes(user.role);
}

function normalizeExplorerSavedViewQuery(query: ExplorerQuery): ExplorerQuery {
  const normalized = normalizeExplorerQuery(query);
  return {
    ...normalized,
    page: 1,
    pageSize: query.pageSize ? Math.min(Math.max(query.pageSize, 1), 100) : 50,
  };
}

function buildVehicleCorrectionKey(companyId: string, chassisNo: string, field: VehicleCorrectionField) {
  return `${companyId}:${chassisNo}:${field}`;
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
  if (field === "branch_code" || field === "payment_method" || field === "salesman_name" || field === "customer_name") {
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
