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

export interface SlaPoliciesResponse {
  items: SlaPolicy[];
}

export interface AlertsResponse {
  items: AlertRule[];
}

export interface NotificationsResponse {
  items: Notification[];
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
