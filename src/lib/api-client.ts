import type {
  AdminRolesResponse,
  AdminUsersResponse,
  AgingSummaryResponse,
  AlertsResponse,
  AuditResponse,
  DashboardPreferencesResponse,
  ExecutiveDashboardMetricId,
  ExplorerQueryRequest,
  ExplorerQueryResponse,
  ImportDetailResponse,
  ImportsResponse,
  MeResponse,
  NavigationResponse,
  NotificationsResponse,
  PublishImportRequest,
  PublishImportResponse,
  QualityIssuesResponse,
  SlaPoliciesResponse,
  VehicleDetailResponse,
} from "@flcbi/contracts";
import { getSupabaseAccessToken } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSupabaseAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(", ");
      else if (body.message) message = body.message;
    } catch {
      // Keep default message when body is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  me() {
    return request<MeResponse>("/me");
  },
  logout() {
    return request<{ success: boolean }>("/auth/logout", { method: "POST" });
  },
  getNavigation() {
    return request<NavigationResponse>("/navigation");
  },
  getAgingSummary(query?: { branch?: string; model?: string; payment?: string; preset?: string }) {
    const params = new URLSearchParams();
    if (query?.branch) params.set("branch", query.branch);
    if (query?.model) params.set("model", query.model);
    if (query?.payment) params.set("payment", query.payment);
    if (query?.preset) params.set("preset", query.preset);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<AgingSummaryResponse>(`/aging/summary${suffix}`);
  },
  queryExplorer(input: ExplorerQueryRequest) {
    return request<ExplorerQueryResponse>("/aging/explorer/query", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getVehicle(chassisNo: string) {
    return request<VehicleDetailResponse>(`/aging/vehicles/${encodeURIComponent(chassisNo)}`);
  },
  getQualityIssues() {
    return request<QualityIssuesResponse>("/aging/quality");
  },
  getSlaPolicies() {
    return request<SlaPoliciesResponse>("/aging/slas");
  },
  updateSla(id: string, slaDays: number) {
    return request<SlaPoliciesResponse>(`/aging/slas/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ slaDays }),
    });
  },
  getImports() {
    return request<ImportsResponse>("/imports");
  },
  getImport(id: string) {
    return request<ImportDetailResponse>(`/imports/${id}`);
  },
  createImport(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImportDetailResponse>("/imports", {
      method: "POST",
      body: formData,
    });
  },
  publishImport(id: string, mode: PublishImportRequest["mode"] = "replace") {
    return request<PublishImportResponse>(`/imports/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  },
  getAlerts() {
    return request<AlertsResponse>("/alerts");
  },
  createAlert(input: {
    name: string;
    metricId: string;
    threshold: number;
    comparator: "gt" | "gte" | "lt" | "lte";
    frequency: "hourly" | "daily" | "weekly";
    enabled: boolean;
    channel: "email" | "in_app";
  }) {
    return request<AlertsResponse>("/alerts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getNotifications() {
    return request<NotificationsResponse>("/notifications");
  },
  getAuditEvents() {
    return request<AuditResponse>("/audit");
  },
  getExecutiveDashboardPreferences() {
    return request<DashboardPreferencesResponse>("/preferences/executive-dashboard");
  },
  updateExecutiveDashboardPreferences(executiveMetricIds: ExecutiveDashboardMetricId[]) {
    return request<DashboardPreferencesResponse>("/preferences/executive-dashboard", {
      method: "PUT",
      body: JSON.stringify({ executiveMetricIds }),
    });
  },
  getAdminUsers() {
    return request<AdminUsersResponse>("/admin/users");
  },
  getAdminRoles() {
    return request<AdminRolesResponse>("/admin/roles");
  },
};
