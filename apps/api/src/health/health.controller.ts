import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../common/public.decorator.js";
import { SupabaseAdminService } from "../supabase/supabase-admin.service.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService) {}

  @Public()
  @Get()
  getHealth() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        api: "up",
        objectStorage: "dev-local",
        queue: process.env.REDIS_URL ? "configured" : "not_configured",
        supabase: this.supabase.isConfigured() ? "configured" : "not_configured",
      },
    };
  }
}
