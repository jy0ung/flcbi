import React from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/api/use-platform";

export default function Notifications() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { data, error, isError, isLoading, refetch } = useNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const notifications = data?.items ?? [];
  const unreadCount = notifications.filter((item) => !item.read).length;
  const canManageAlerts = hasRole(["company_admin", "super_admin", "director"]);

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await markNotificationRead.mutateAsync(id);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Could not mark notification as read");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead.mutateAsync();
      toast.success("All notifications marked as read");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Could not mark all notifications as read");
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading notifications...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Notifications"
          description="System alerts and updates"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Platform" }, { label: "Notifications" }]}
        />
        <QueryErrorState
          title="Could not load notifications"
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Notifications"
        description="System alerts, import updates, and triggered rule activity"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Platform" }, { label: "Notifications" }]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canManageAlerts && (
              <Button variant="outline" size="sm" onClick={() => navigate("/alerts")}>
                Manage Alerts
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0 || markAllNotificationsRead.isPending}
            >
              {markAllNotificationsRead.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark All Read
            </Button>
          </div>
        )}
      />

      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{unreadCount} unread notifications</p>
          <p className="text-xs text-muted-foreground">
            New alert triggers and import lifecycle updates will appear here.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {notifications.length} total notifications
        </div>
      </div>

      <div className="space-y-2">
        {notifications.length === 0 && (
          <div className="glass-panel p-6 text-sm text-muted-foreground">
            No notifications yet. Alerts and import updates will appear here once the platform is active.
          </div>
        )}
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`glass-panel flex items-start gap-3 p-4 ${!notification.read ? "border-l-2 border-primary" : ""}`}
          >
            <div className="flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{notification.title}</span>
                <StatusBadge status={notification.type} />
                {!notification.read && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Unread
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{notification.message}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {new Date(notification.createdAt).toLocaleString()}
              </p>
            </div>

            {!notification.read && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleMarkNotificationRead(notification.id)}
                disabled={markNotificationRead.isPending}
              >
                {markNotificationRead.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark Read
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
