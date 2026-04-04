import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { ExplorerQuery, VehicleCanonical } from "@flcbi/contracts";

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
