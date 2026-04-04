import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AdminRolesResponse, AdminUsersResponse, User } from "@flcbi/contracts";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { Roles } from "../common/roles.decorator.js";
import { CurrentUser } from "../common/current-user.decorator.js";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("company_admin", "super_admin")
@Controller("admin")
export class AdminController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get("users")
  async listUsers(@CurrentUser() user: User): Promise<AdminUsersResponse> {
    return { items: await this.store.listUsers(user) };
  }

  @Get("roles")
  async listRoles(): Promise<AdminRolesResponse> {
    return { items: await this.store.listRoles() };
  }
}
