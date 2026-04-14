import type { CreateExplorerSavedViewRequest } from "@flcbi/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { ExplorerQueryDto } from "../aging/aging.dto.js";

export class CreateExplorerSavedViewDto implements CreateExplorerSavedViewRequest {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ExplorerQueryDto)
  query!: ExplorerQueryDto;
}
