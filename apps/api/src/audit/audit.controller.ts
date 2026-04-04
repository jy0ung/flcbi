import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuditResponse, User } from "@flcbi/contracts";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { Roles } from "../common/roles.decorator.js";
import { CurrentUser } from "../common/current-user.decorator.js";

@ApiTags("audit")
@ApiBearerAuth()
@Roles("company_admin", "super_admin", "director")
@Controller("audit")
export class AuditController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  async listAudit(@CurrentUser() user: User): Promise<AuditResponse> {
    return { items: await this.store.listAuditEvents(user) };
  }
}
