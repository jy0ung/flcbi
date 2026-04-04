import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsString, Max, Min } from "class-validator";
import type { AlertRule } from "@flcbi/contracts";

export class CreateAlertDto implements Omit<AlertRule, "id" | "createdBy" | "companyId"> {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  metricId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(365)
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
