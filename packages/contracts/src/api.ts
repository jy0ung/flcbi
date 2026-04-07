import type {
  AppRole,
  AgingSummary,
  AlertRule,
  Branch,
  AuditEvent,
  AuthSession,
  DashboardPreferences,
  ExplorerQuery,
  ExplorerResult,
  ExportJob,
  ExportSubscription,
  FilterOptions,
  ImportBatch,
  ImportPublishMode,
  NavigationItem,
  Notification,
  SlaPolicy,
  UserStatus,
  User,
  VehicleCanonical,
  DataQualityIssue,
} from "./domain.js";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: AuthSession;
}

export interface NavigationResponse {
  items: NavigationItem[];
}

export interface MeResponse {
  session: AuthSession;
}

export interface DashboardPreferencesResponse {
  preferences: DashboardPreferences;
}

export interface UpdateDashboardPreferencesRequest {
  executiveMetricIds: DashboardPreferences["executiveMetricIds"];
}

export interface AgingSummaryResponse {
  summary: AgingSummary;
}

export type ExplorerQueryRequest = ExplorerQuery;

export interface ExplorerQueryResponse {
  result: ExplorerResult;
}

export interface VehicleDetailResponse {
  vehicle: VehicleCanonical;
  issues: DataQualityIssue[];
}

export interface QualityIssuesResponse {
  items: DataQualityIssue[];
}

export interface ImportsResponse {
  items: ImportBatch[];
}

export interface ImportDetailResponse {
  item: ImportBatch;
  previewIssues: DataQualityIssue[];
  missingColumns: string[];
  previewRows: number;
}

export interface PublishImportResponse {
  item: ImportBatch;
}

export interface PublishImportRequest {
  mode?: ImportPublishMode;
}

export interface ExportsResponse {
  items: ExportJob[];
}

export interface CreateExplorerExportRequest {
  query: ExplorerQuery;
}

export interface CreateExportResponse {
  item: ExportJob;
}

export interface RetryExportResponse {
  item: ExportJob;
}

export interface ExportSubscriptionsResponse {
  items: ExportSubscription[];
}

export interface CreateExportSubscriptionRequest {
  query: ExplorerQuery;
  schedule?: ExportSubscription["schedule"];
}

export interface CreateExportSubscriptionResponse {
  item: ExportSubscription;
}

export interface SlaPoliciesResponse {
  items: SlaPolicy[];
}

export interface AlertsResponse {
  items: AlertRule[];
}

export type CreateAlertRequest = Omit<AlertRule, "id" | "createdBy" | "companyId">;

export interface UpdateAlertRequest {
  name?: string;
  metricId?: AlertRule["metricId"];
  threshold?: number;
  comparator?: AlertRule["comparator"];
  frequency?: AlertRule["frequency"];
  enabled?: boolean;
  channel?: AlertRule["channel"];
}

export interface NotificationsResponse {
  items: Notification[];
}

export interface SuccessResponse {
  success: boolean;
}

export interface AuditResponse {
  items: AuditEvent[];
}

export interface AdminUsersResponse {
  items: User[];
}

export interface AdminRolesResponse {
  items: { role: string; description: string }[];
}

export interface AdminBranchesResponse {
  items: Branch[];
}

export interface AdminUserResponse {
  item: User;
}

export interface CreateAdminUserRequest {
  email: string;
  name: string;
  role: AppRole;
  branchId?: string | null;
  password: string;
  status?: UserStatus;
}

export interface UpdateAdminUserRequest {
  email?: string;
  name?: string;
  role?: AppRole;
  branchId?: string | null;
  password?: string;
  status?: UserStatus;
}

export interface FilterOptionsResponse {
  options: FilterOptions;
}

export type DependencyStatus = "up" | "down" | "configured" | "not_configured";

export interface PlatformHealthResponse {
  status: "ok" | "degraded";
  ready: boolean;
  timestamp: string;
  services: Record<string, DependencyStatus>;
  mode: {
    objectStorage: string;
    auth: string;
  };
}
