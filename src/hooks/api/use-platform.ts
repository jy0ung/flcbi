import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAlertRequest,
  ExecutiveDashboardMetricId,
  ExplorerPreset,
  ExplorerQueryRequest,
  ImportBatch,
  ImportDetailResponse,
  NotificationsResponse,
  UpdateAlertRequest,
} from "@flcbi/contracts";
import { apiClient } from "@/lib/api-client";

function isImportPending(status?: ImportBatch["status"]) {
  return status === "uploaded" || status === "validating" || status === "normalization_in_progress" || status === "publish_in_progress";
}

export function useNavigationItems(enabled = true) {
  return useQuery({
    queryKey: ["navigation"],
    queryFn: () => apiClient.getNavigation(),
    enabled,
  });
}

export function useAgingSummary(
  filters?: { branch?: string; model?: string; payment?: string; preset?: ExplorerPreset },
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "aging",
      "summary",
      filters?.branch ?? "all",
      filters?.model ?? "all",
      filters?.payment ?? "all",
      filters?.preset ?? "all",
    ],
    queryFn: () => apiClient.getAgingSummary(filters),
    enabled,
  });
}

export function useExplorer(query: ExplorerQueryRequest, enabled = true) {
  return useQuery({
    queryKey: [
      "aging",
      "explorer",
      query.search ?? "",
      query.branch ?? "all",
      query.model ?? "all",
      query.payment ?? "all",
      query.preset ?? "all",
      query.page,
      query.pageSize,
      query.sortField ?? "bg_to_delivery",
      query.sortDirection ?? "desc",
    ],
    queryFn: () => apiClient.queryExplorer(query),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useVehicleDetail(chassisNo?: string, enabled = true) {
  return useQuery({
    queryKey: ["aging", "vehicle", chassisNo],
    queryFn: () => apiClient.getVehicle(chassisNo!),
    enabled: enabled && Boolean(chassisNo),
  });
}

export function useQualityIssues(enabled = true) {
  return useQuery({
    queryKey: ["aging", "quality"],
    queryFn: () => apiClient.getQualityIssues(),
    enabled,
  });
}

export function useSlaPolicies(enabled = true) {
  return useQuery({
    queryKey: ["aging", "slas"],
    queryFn: () => apiClient.getSlaPolicies(),
    enabled,
  });
}

export function useUpdateSla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, slaDays }: { id: string; slaDays: number }) => apiClient.updateSla(id, slaDays),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["aging", "slas"] });
      void queryClient.invalidateQueries({ queryKey: ["aging", "summary"] });
    },
  });
}

export function useImports(enabled = true) {
  return useQuery({
    queryKey: ["imports"],
    queryFn: () => apiClient.getImports(),
    enabled,
    refetchInterval: (query) => {
      const imports = query.state.data?.items ?? [];
      return imports.some((item) => isImportPending(item.status)) ? 1500 : false;
    },
  });
}

export function useImport(importId?: string, enabled = true) {
  return useQuery({
    queryKey: ["imports", importId],
    queryFn: () => apiClient.getImport(importId!),
    enabled: enabled && Boolean(importId),
    refetchInterval: (query) => {
      const detail = query.state.data as ImportDetailResponse | undefined;
      return isImportPending(detail?.item.status) ? 1500 : false;
    },
  });
}

export function useCreateImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiClient.createImport(file),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.setQueryData(["imports", response.item.id], response);
    },
  });
}

export function usePublishImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: "replace" | "merge" }) => apiClient.publishImport(id, mode),
    onSuccess: (response, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      void queryClient.invalidateQueries({ queryKey: ["imports", variables.id] });
      if (!isImportPending(response.item.status)) {
        void queryClient.invalidateQueries({ queryKey: ["aging", "summary"] });
        void queryClient.invalidateQueries({ queryKey: ["aging", "quality"] });
        void queryClient.invalidateQueries({ queryKey: ["aging", "explorer"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      queryClient.setQueryData<ImportDetailResponse | undefined>(["imports", variables.id], (current) => (
        current
          ? { ...current, item: response.item }
          : current
      ));
    },
  });
}

export function useAlerts(enabled = true) {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiClient.getAlerts(),
    enabled,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertRequest) => apiClient.createAlert(input),
    onSuccess: (response) => {
      queryClient.setQueryData(["alerts"], response);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAlertRequest }) => apiClient.updateAlert(id, input),
    onSuccess: (response) => {
      queryClient.setQueryData(["alerts"], response);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAlert(id),
    onSuccess: (response) => {
      queryClient.setQueryData(["alerts"], response);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiClient.getNotifications(),
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.markNotificationRead(id),
    onSuccess: (_response, id) => {
      queryClient.setQueryData<NotificationsResponse | undefined>(["notifications"], (current) => {
        if (!current) {
          return current;
        }

        return {
          items: current.items.map((item) => (
            item.id === id
              ? { ...item, read: true }
              : item
          )),
        };
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.setQueryData<NotificationsResponse | undefined>(["notifications"], (current) => {
        if (!current) {
          return current;
        }

        return {
          items: current.items.map((item) => ({ ...item, read: true })),
        };
      });
    },
  });
}

export function useAuditEvents(enabled = true) {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => apiClient.getAuditEvents(),
    enabled,
  });
}

export function useExecutiveDashboardPreferences(enabled = true) {
  return useQuery({
    queryKey: ["preferences", "executive-dashboard"],
    queryFn: () => apiClient.getExecutiveDashboardPreferences(),
    enabled,
  });
}

export function useUpdateExecutiveDashboardPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executiveMetricIds: ExecutiveDashboardMetricId[]) =>
      apiClient.updateExecutiveDashboardPreferences(executiveMetricIds),
    onSuccess: (response) => {
      queryClient.setQueryData(["preferences", "executive-dashboard"], response);
      void queryClient.invalidateQueries({ queryKey: ["preferences", "executive-dashboard"] });
    },
  });
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiClient.getAdminUsers(),
    enabled,
  });
}

export function useAdminBranches(enabled = true) {
  return useQuery({
    queryKey: ["admin", "branches"],
    queryFn: () => apiClient.getAdminBranches(),
    enabled,
  });
}

export function useAdminRoles(enabled = true) {
  return useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => apiClient.getAdminRoles(),
    enabled,
  });
}

export function useCreateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof apiClient.updateAdminUser>[1] }) =>
      apiClient.updateAdminUser(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAdminUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
