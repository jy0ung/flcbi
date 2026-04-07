import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";
import type { DependencyStatus } from "@flcbi/contracts";
import { Public } from "../common/public.decorator.js";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";
import { AlertQueueService } from "../queues/alert-queue.service.js";
import { ExportQueueService } from "../queues/export-queue.service.js";
import { ImportQueueService } from "../queues/import-queue.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
    @Inject(ImportQueueService) private readonly importQueue: ImportQueueService,
    @Inject(AlertQueueService) private readonly alertQueue: AlertQueueService,
    @Inject(ExportQueueService) private readonly exportQueue: ExportQueueService,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    return this.buildHealthReport();
  }

  @Public()
  @Get("ready")
  async getReadiness() {
    const report = await this.buildHealthReport();
    if (!report.ready) {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  private async buildHealthReport() {
    const [supabase, objectStorage, queueImports, queueAlerts, queueExports] = await Promise.all([
      this.supabase.checkHealth(),
      this.objectStorage.checkHealth(),
      this.importQueue.checkHealth(),
      this.alertQueue.checkHealth(),
      this.exportQueue.checkHealth(),
    ]);

    const queue = summarizeQueueHealth([queueImports, queueAlerts, queueExports]);

    const services: Record<string, DependencyStatus> = {
      api: "up",
      objectStorage,
      queue,
      queueImports,
      queueAlerts,
      queueExports,
      supabase,
    };
    const queueReady = queue !== "down";
    const ready = objectStorage !== "down" && supabase !== "down" && queueReady;

    return {
      status: ready ? "ok" : "degraded",
      ready,
      timestamp: new Date().toISOString(),
      services,
      mode: {
        objectStorage: "dev-local",
        auth: this.supabase.isConfigured() ? "supabase" : "fallback",
      },
    };
  }
}

function summarizeQueueHealth(statuses: DependencyStatus[]): DependencyStatus {
  if (statuses.some((status) => status === "down")) {
    return "down";
  }
  if (statuses.some((status) => status === "up")) {
    return "up";
  }
  if (statuses.some((status) => status === "configured")) {
    return "configured";
  }
  return "not_configured";
}
