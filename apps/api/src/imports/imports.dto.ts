import type { ImportPublishMode, PublishImportRequest } from "@flcbi/contracts";
import { IsIn, IsOptional } from "class-validator";

export class PublishImportDto implements PublishImportRequest {
  @IsOptional()
  @IsIn(["replace", "merge"])
  mode?: ImportPublishMode;
}
