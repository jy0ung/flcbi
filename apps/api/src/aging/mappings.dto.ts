import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

export class UpdateExplorerBranchMappingDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  rawValue!: string;

  @ApiProperty({ description: "Target canonical branch id." })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class UpdateExplorerPaymentMappingDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  rawValue!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  canonicalValue!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class UpdateExplorerMappingsDto {
  @ApiPropertyOptional({ type: [UpdateExplorerBranchMappingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateExplorerBranchMappingDto)
  branches?: UpdateExplorerBranchMappingDto[];

  @ApiPropertyOptional({ type: [UpdateExplorerPaymentMappingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateExplorerPaymentMappingDto)
  payments?: UpdateExplorerPaymentMappingDto[];
}
