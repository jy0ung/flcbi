import type {
  AgingSummary,
  AlertRule,
  AppRole,
  AuditEvent,
  Branch,
  DashboardPreferences,
  DataQualityIssue,
  ExplorerQuery,
  ExplorerPreset,
  ExplorerResult,
  ImportBatch,
  ImportPublishMode,
  NavigationItem,
  Notification,
  SlaPolicy,
  User,
  VehicleCanonical,
} from "@flcbi/contracts";

type Awaitable<T> = T | Promise<T>;

export const PLATFORM_REPOSITORY = Symbol("PLATFORM_REPOSITORY");

export interface PlatformRoleDefinition {
  role: AppRole;
  description: string;
}

export interface ImportDetail {
  item: ImportBatch;
  previewIssues: DataQualityIssue[];
  missingColumns: string[];
  previewRows: number;
}

export interface VehicleDetail {
  vehicle: VehicleCanonical;
  issues: DataQualityIssue[];
}

export interface PlatformRepository {
  findUserByEmail(email: string): Awaitable<User | undefined>;
  findUserById(id: string): Awaitable<User | undefined>;
  getNavigation(user: User): Awaitable<NavigationItem[]>;
  getNotifications(user: User): Awaitable<Notification[]>;
  listAuditEvents(user: User): Awaitable<AuditEvent[]>;
  addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt">): Awaitable<void>;
  listUsers(user: User): Awaitable<User[]>;
  listRoles(): Awaitable<PlatformRoleDefinition[]>;
  listBranches(user: User): Awaitable<Branch[]>;
  createUser(
    user: User,
    input: { email: string; name: string; role: AppRole; branchId?: string | null; password: string; status?: User["status"] },
  ): Awaitable<User>;
  updateUser(
    user: User,
    targetUserId: string,
    input: { email?: string; name?: string; role?: AppRole; branchId?: string | null; password?: string; status?: User["status"] },
  ): Awaitable<User>;
  deleteUser(user: User, targetUserId: string): Awaitable<void>;
  listAlerts(user: User): Awaitable<AlertRule[]>;
  createAlert(user: User, input: Omit<AlertRule, "id" | "createdBy" | "companyId">): Awaitable<AlertRule>;
  updateAlert(
    user: User,
    alertId: string,
    input: Partial<Omit<AlertRule, "id" | "createdBy" | "companyId">>,
  ): Awaitable<AlertRule>;
  deleteAlert(user: User, alertId: string): Awaitable<void>;
  listImports(user: User): Awaitable<ImportBatch[]>;
  getImportById(user: User, id: string): Awaitable<ImportDetail>;
  createImportPreview(user: User, fileName: string, fileBuffer: Buffer): Awaitable<ImportDetail>;
  publishImport(user: User, id: string, mode?: ImportPublishMode): Awaitable<ImportBatch>;
  getDashboardPreferences(user: User): Awaitable<DashboardPreferences>;
  saveDashboardPreferences(user: User, preferences: DashboardPreferences): Awaitable<DashboardPreferences>;
  listSlas(user: User): Awaitable<SlaPolicy[]>;
  updateSla(user: User, id: string, slaDays: number): Awaitable<SlaPolicy>;
  getSummary(
    user: User,
    filters?: { branch?: string; model?: string; payment?: string; preset?: ExplorerPreset },
  ): Awaitable<AgingSummary>;
  queryExplorer(user: User, query: ExplorerQuery): Awaitable<ExplorerResult>;
  getVehicle(user: User, chassisNo: string): Awaitable<VehicleDetail>;
  getQualityIssues(user: User): Awaitable<DataQualityIssue[]>;
  markNotificationRead(user: User, notificationId: string): Awaitable<void>;
  markAllNotificationsRead(user: User): Awaitable<void>;
}
