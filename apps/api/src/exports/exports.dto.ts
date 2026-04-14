import type {
  CreateExplorerExportRequest,
  CreateExportSubscriptionRequest,
  ExportSubscription,
} from "@flcbi/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsOptional, ValidateNested } from "class-validator";
import { ExplorerQueryDto } from "../aging/aging.dto.js";

export class CreateExplorerExportDto implements CreateExplorerExportRequest {
  @ApiProperty()
  @ValidateNested()
  @Type(() => ExplorerQueryDto)
  query!: ExplorerQueryDto;
}

export class CreateExportSubscriptionDto implements CreateExportSubscriptionRequest {
  @ApiProperty()
  @ValidateNested()
  @Type(() => ExplorerQueryDto)
  query!: ExplorerQueryDto;

  @ApiPropertyOptional({ enum: ["daily"] })
  @IsOptional()
  @IsIn(["daily"])
  schedule?: ExportSubscription["schedule"];
}
