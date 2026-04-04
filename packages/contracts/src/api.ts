import type {
  AgingSummary,
  AlertRule,
  AuditEvent,
  AuthSession,
  ExplorerQuery,
  ExplorerResult,
  FilterOptions,
  ImportBatch,
  ImportPublishMode,
  NavigationItem,
  Notification,
  SlaPolicy,
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

export interface FilterOptionsResponse {
  options: FilterOptions;
}
