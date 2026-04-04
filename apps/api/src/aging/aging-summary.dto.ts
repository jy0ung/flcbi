import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import type { ExplorerPreset } from "@flcbi/contracts";

export class AgingSummaryQueryDto {
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

  @ApiPropertyOptional({ enum: [
    "open_stock",
    "pending_shipment",
    "in_transit",
    "at_outlet",
    "registered_pending_delivery",
    "pending_disbursement",
    "disbursed",
    "aged_30_plus",
    "aged_60_plus",
    "aged_90_plus",
    "d2d_open",
  ] })
  @IsOptional()
  @IsString()
  preset?: ExplorerPreset;
}
