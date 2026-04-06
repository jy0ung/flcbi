import type {
  AdminBranchesResponse,
  AdminRolesResponse,
  AdminUserResponse,
  AdminUsersResponse,
  AgingSummaryResponse,
  AlertsResponse,
  AuditResponse,
  CreateAlertRequest,
  CreateAdminUserRequest,
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
  SuccessResponse,
  UpdateAlertRequest,
  UpdateAdminUserRequest,
  VehicleDetailResponse,
} from "@flcbi/contracts";
import { getSupabaseAccessToken } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/v1";
const DEFAULT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);

export type ApiErrorCode = "http" | "network" | "timeout" | "aborted";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode = "http",
  ) {
    super(message);
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  get isRetryable() {
    return this.code !== "http" || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

function createTimeoutSignal(timeoutMs: number, initSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  if (initSignal) {
    if (initSignal.aborted) {
      controller.abort();
    } else {
      initSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      initSignal?.removeEventListener("abort", abortFromCaller);
    },
    wasCallerAborted() {
      return Boolean(initSignal?.aborted);
    },
  };
}

export function isApiAuthError(error: unknown) {
  return error instanceof ApiError && error.isAuthError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSupabaseAccessToken();
  const requestTimeoutMs =
    typeof init?.signal === "object" && init?.signal?.aborted
      ? 0
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const timeout = createTimeoutSignal(requestTimeoutMs, init?.signal);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: timeout.signal,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    timeout.cleanup();
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      if (timeout.wasCallerAborted()) {
        throw new ApiError("Request was cancelled", 0, "aborted");
      }
      throw new ApiError(
        `Request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS / 1000} seconds`,
        0,
        "timeout",
      );
    }
    throw new ApiError("Could not reach the API. Check your connection and try again.", 0, "network");
  }
  timeout.cleanup();

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(", ");
      else if (body.message) message = body.message;
    } catch {
      // Keep default message when body is not JSON.
    }
    throw new ApiError(message, response.status, "http");
  }

  if (response.status === 204) {
    return undefined as T;
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
  createAlert(input: CreateAlertRequest) {
    return request<AlertsResponse>("/alerts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateAlert(id: string, input: UpdateAlertRequest) {
    return request<AlertsResponse>(`/alerts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteAlert(id: string) {
    return request<AlertsResponse>(`/alerts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  getNotifications() {
    return request<NotificationsResponse>("/notifications");
  },
  markNotificationRead(id: string) {
    return request<SuccessResponse>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
    });
  },
  markAllNotificationsRead() {
    return request<SuccessResponse>("/notifications/read-all", {
      method: "POST",
    });
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
  getAdminBranches() {
    return request<AdminBranchesResponse>("/admin/branches");
  },
  getAdminRoles() {
    return request<AdminRolesResponse>("/admin/roles");
  },
  createAdminUser(input: CreateAdminUserRequest) {
    return request<AdminUserResponse>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateAdminUser(id: string, input: UpdateAdminUserRequest) {
    return request<AdminUserResponse>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteAdminUser(id: string) {
    return request<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
