import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import type {
  ExplorerColumnFilterSet,
  ExplorerDateRangeFilter,
  ExplorerFilterSet,
  ExplorerNumberRangeFilter,
  ExplorerQuery,
  UpdateVehicleCorrectionsRequest,
} from "@flcbi/contracts";

export class ExplorerDateRangeDto implements ExplorerDateRangeFilter {
  @ApiPropertyOptional({ description: "Lower bound in YYYY-MM-DD format." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @ApiPropertyOptional({ description: "Upper bound in YYYY-MM-DD format." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

export class ExplorerNumberRangeDto implements ExplorerNumberRangeFilter {
  @ApiPropertyOptional({ description: "Inclusive lower bound." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  min?: number;

  @ApiPropertyOptional({ description: "Inclusive upper bound." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  max?: number;
}

export class ExplorerFilterSetDto implements ExplorerFilterSet {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  chassisNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  salesmanName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isD2D?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  bgDate?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  shipmentEtdPkg?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  dateReceivedByOutlet?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  regDate?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  deliveryDate?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerDateRangeDto)
  disbDate?: ExplorerDateRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  bgToDelivery?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  bgToShipmentEtd?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  etdToOutletReceived?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  outletReceivedToReg?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  regToDelivery?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  bgToDisb?: ExplorerNumberRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerNumberRangeDto)
  deliveryToDisb?: ExplorerNumberRangeDto;

  @ApiPropertyOptional({ description: "Arbitrary per-column filters keyed by explorer column name." })
  @IsOptional()
  @IsObject()
  columnFilters?: ExplorerColumnFilterSet;
}

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
  @IsString()
  @MaxLength(120)
  sortField?: string;

  @ApiPropertyOptional({ default: "desc" })
  @IsOptional()
  sortDirection?: "asc" | "desc" = "desc";

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorerFilterSetDto)
  filters?: ExplorerFilterSetDto;
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
  @MaxLength(40)
  branch_code?: string;

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
