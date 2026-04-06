import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";
import { Public } from "../common/public.decorator.js";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";
import { ImportQueueService } from "../queues/import-queue.service.js";

type DependencyStatus = "up" | "down" | "configured" | "not_configured";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
    @Inject(ImportQueueService) private readonly importQueue: ImportQueueService,
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
    const [supabase, objectStorage, queue] = await Promise.all([
      this.supabase.checkHealth(),
      this.objectStorage.checkHealth(),
      this.importQueue.checkHealth(),
    ]);

    const services: Record<string, DependencyStatus> = {
      api: "up",
      objectStorage,
      queue,
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
