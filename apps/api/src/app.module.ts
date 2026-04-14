import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { HealthController } from "./health/health.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { AgingController } from "./aging/aging.controller.js";
import { ImportsController } from "./imports/imports.controller.js";
import { AlertsController } from "./alerts/alerts.controller.js";
import { AuditController } from "./audit/audit.controller.js";
import { AdminController } from "./admin/admin.controller.js";
import { NavigationController } from "./navigation/navigation.controller.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { PreferencesController } from "./preferences/preferences.controller.js";
import { SavedViewsController } from "./saved-views/saved-views.controller.js";
import { ExportsController } from "./exports/exports.controller.js";
import { MetricsController } from "./metrics/metrics.controller.js";
import { PlatformMetricsService } from "./metrics/platform-metrics.service.js";
import { PlatformStoreService } from "./storage/platform-store.service.js";
import { PlatformAuthSessionService } from "./auth/platform-auth-session.service.js";
import { ApiAuthGuard } from "./common/api-auth.guard.js";
import { RolesGuard } from "./common/roles.guard.js";
import { AuditInterceptor } from "./common/audit.interceptor.js";
import { ObjectStorageService } from "./storage/object-storage.service.js";
import { PLATFORM_REPOSITORY } from "./platform/platform.repository.js";
import { AUTH_SESSION_SERVICE } from "./auth/auth-session.service.js";
import { SupabaseAdminService } from "./supabase/supabase-admin.service.js";
import { SupabasePlatformRepository } from "./supabase/supabase-platform.repository.js";
import { ImportQueueService } from "./queues/import-queue.service.js";
import { AlertQueueService } from "./queues/alert-queue.service.js";
import { ExportQueueService } from "./queues/export-queue.service.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    AgingController,
    ImportsController,
    AlertsController,
    AuditController,
    AdminController,
    NavigationController,
    NotificationsController,
    PreferencesController,
    SavedViewsController,
    ExportsController,
    MetricsController,
  ],
  providers: [
    PlatformStoreService,
    SupabasePlatformRepository,
    PlatformMetricsService,
    PlatformAuthSessionService,
    ObjectStorageService,
    SupabaseAdminService,
    ImportQueueService,
    AlertQueueService,
    ExportQueueService,
    { provide: PLATFORM_REPOSITORY, useExisting: SupabasePlatformRepository },
    { provide: AUTH_SESSION_SERVICE, useExisting: PlatformAuthSessionService },
    { provide: APP_GUARD, useClass: ApiAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
