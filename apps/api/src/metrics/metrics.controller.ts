import { Controller, Get, Inject, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { PlatformMetricsSummaryResponse } from "@flcbi/contracts";
import type { Response } from "express";
import { Public } from "../common/public.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { PlatformMetricsService } from "./platform-metrics.service.js";

@ApiTags("observability")
@ApiBearerAuth()
@Controller("metrics")
export class MetricsController {
  constructor(
    @Inject(PlatformMetricsService) private readonly metrics: PlatformMetricsService,
  ) {}

  @Public()
  @Get()
  @ApiProduces("text/plain")
  async getMetrics(@Res() response: Response) {
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.send(await this.metrics.renderPrometheusMetrics());
  }

  @Get("summary")
  @Roles("company_admin", "super_admin", "director")
  async getMetricsSummary(): Promise<PlatformMetricsSummaryResponse> {
    return this.metrics.getMetricsSummary();
  }
}
