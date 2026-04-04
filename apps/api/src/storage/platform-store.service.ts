import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAgingSummary,
  createDefaultSlaPolicies,
  getPermissionsForUser,
  navigationItems,
  platformModules,
  publishCanonical,
  queryVehicles,
  parseWorkbook,
  type AgingSummary,
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
import { ObjectStorageService } from "./object-storage.service.js";
import type { PlatformRepository, PlatformRoleDefinition } from "../platform/platform.repository.js";

interface ImportPreview {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
}

@Injectable()
export class PlatformStoreService implements PlatformRepository {
  private readonly users: User[] = [];
  private readonly modules = [...platformModules];
  private readonly notifications: Notification[] = [];
  private readonly alerts: AlertRule[] = [];
  private readonly audits: AuditEvent[] = [];
  private readonly slasByCompany = new Map<string, SlaPolicy[]>();
  private readonly importPreviews = new Map<string, ImportPreview>();
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
    return this.notifications.filter((notification) => notification.userId === user.id);
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
      { role: "company_admin", description: "Enterprise administrators for company-level analytics governance." },
      { role: "director", description: "Leadership access to executive reporting and audit visibility." },
      { role: "manager", description: "Branch-scoped operational access with exports." },
      { role: "analyst", description: "Curated and governed explore access for analytics users." },
    ];
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
    return alert;
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
    const parsed = parseWorkbook(
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
    this.lastRefresh = new Date().toISOString();
    this.addAuditEvent({
      action: "import_published",
      entity: "import_batch",
      entityId: id,
      userId: user.id,
      userName: user.name,
      details: `Published ${canonical.length} canonical vehicles from ${item.fileName} using ${mode} mode`,
    });
    return item;
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

  getSummary(user: User, filters?: { branch?: string; model?: string }): AgingSummary {
    const visibleVehicles = this.getVisibleVehicles(user).filter((vehicle) => {
      if (filters?.branch && filters.branch !== "all" && vehicle.branch_code !== filters.branch) return false;
      if (filters?.model && filters.model !== "all" && vehicle.model !== filters.model) return false;
      return true;
    });
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.chassis_no));
    const visibleIssues = this.getVisibleQualityIssues(user).filter((issue) => visibleVehicleIds.has(issue.chassisNo));
    return buildAgingSummary(visibleVehicles, this.getCompanySlas(user.companyId), visibleIssues, this.imports, this.lastRefresh);
  }

  queryExplorer(user: User, query: ExplorerQuery): ExplorerResult {
    return queryVehicles(this.getVisibleVehicles(user), query);
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
    };
  }

  getQualityIssues(user: User) {
    return this.getVisibleQualityIssues(user);
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
      .map((vehicle) => this.maskVehicle(vehicle, user))
      .filter((vehicle): vehicle is VehicleCanonical => Boolean(vehicle));
  }

  private getVisibleQualityIssues(user: User) {
    const visibleVehicles = new Set(this.getVisibleVehicles(user).map((vehicle) => vehicle.chassis_no));
    return this.qualityIssues.filter((issue) => visibleVehicles.has(issue.chassisNo));
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
