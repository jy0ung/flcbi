import type { ExecutiveDashboardMetricId, UpdateDashboardPreferencesRequest } from "@flcbi/contracts";
import {
  EXECUTIVE_DASHBOARD_METRIC_IDS,
  MAX_EXECUTIVE_DASHBOARD_METRICS,
} from "@flcbi/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsIn } from "class-validator";

export class UpdateDashboardPreferencesDto implements UpdateDashboardPreferencesRequest {
  @ApiProperty({ isArray: true, enum: EXECUTIVE_DASHBOARD_METRIC_IDS })
  @IsArray()
  @ArrayMaxSize(MAX_EXECUTIVE_DASHBOARD_METRICS)
  @IsIn(EXECUTIVE_DASHBOARD_METRIC_IDS, { each: true })
  executiveMetricIds!: ExecutiveDashboardMetricId[];
}
