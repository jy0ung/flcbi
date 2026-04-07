import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import type { ExplorerQuery, UpdateVehicleCorrectionsRequest, VehicleCanonical } from "@flcbi/contracts";

export class ExplorerQueryDto implements ExplorerQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @ApiPropertyOptional()
  @IsOptional()
  sortField?: keyof VehicleCanonical;

  @ApiPropertyOptional({ default: "desc" })
  @IsOptional()
  sortDirection?: "asc" | "desc" = "desc";
}

export class UpdateSlaDto {
  @ApiPropertyOptional({ default: 45 })
  @IsInt()
  @Min(1)
  @Max(365)
  slaDays = 45;
}

export class UpdateVehicleCorrectionsDto implements UpdateVehicleCorrectionsRequest {
  @ApiProperty({ description: "Why this manual correction is needed." })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason = "";

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bg_date?: string;

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  shipment_etd_pkg?: string;

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  date_received_by_outlet?: string;

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  reg_date?: string;

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  delivery_date?: string;

  @ApiPropertyOptional({ description: "ISO date in YYYY-MM-DD format. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  disb_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  payment_method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  salesman_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customer_name?: string;

  @ApiPropertyOptional({ description: "Free-form operational note. Send an empty string to clear." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
