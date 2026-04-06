import { ApiProperty } from "@nestjs/swagger";
import {
  EXECUTIVE_DASHBOARD_METRIC_IDS,
  type AlertRule,
} from "@flcbi/contracts";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateAlertDto implements Omit<AlertRule, "id" | "createdBy" | "companyId"> {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: EXECUTIVE_DASHBOARD_METRIC_IDS })
  @IsIn(EXECUTIVE_DASHBOARD_METRIC_IDS)
  metricId!: AlertRule["metricId"];

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1000000)
  threshold!: number;

  @ApiProperty({ enum: ["gt", "gte", "lt", "lte"] })
  @IsIn(["gt", "gte", "lt", "lte"])
  comparator!: "gt" | "gte" | "lt" | "lte";

  @ApiProperty({ enum: ["hourly", "daily", "weekly"] })
  @IsIn(["hourly", "daily", "weekly"])
  frequency!: "hourly" | "daily" | "weekly";

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ enum: ["email", "in_app"] })
  @IsIn(["email", "in_app"])
  channel!: "email" | "in_app";
}

export class UpdateAlertDto implements Partial<Omit<AlertRule, "id" | "createdBy" | "companyId">> {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: EXECUTIVE_DASHBOARD_METRIC_IDS, required: false })
  @IsOptional()
  @IsIn(EXECUTIVE_DASHBOARD_METRIC_IDS)
  metricId?: AlertRule["metricId"];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  threshold?: number;

  @ApiProperty({ enum: ["gt", "gte", "lt", "lte"], required: false })
  @IsOptional()
  @IsIn(["gt", "gte", "lt", "lte"])
  comparator?: AlertRule["comparator"];

  @ApiProperty({ enum: ["hourly", "daily", "weekly"], required: false })
  @IsOptional()
  @IsIn(["hourly", "daily", "weekly"])
  frequency?: AlertRule["frequency"];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: ["email", "in_app"], required: false })
  @IsOptional()
  @IsIn(["email", "in_app"])
  channel?: AlertRule["channel"];
}
