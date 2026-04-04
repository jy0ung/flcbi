import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  AdminBranchesResponse,
  AdminRolesResponse,
  AdminUserResponse,
  AdminUsersResponse,
  User,
} from "@flcbi/contracts";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { Roles } from "../common/roles.decorator.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { CreateAdminUserDto, UpdateAdminUserDto } from "./admin-users.dto.js";

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

  @Get("branches")
  async listBranches(@CurrentUser() user: User): Promise<AdminBranchesResponse> {
    return { items: await this.store.listBranches(user) };
  }

  @Get("roles")
  async listRoles(): Promise<AdminRolesResponse> {
    return { items: await this.store.listRoles() };
  }

  @Post("users")
  async createUser(
    @CurrentUser() user: User,
    @Body() body: CreateAdminUserDto,
  ): Promise<AdminUserResponse> {
    return { item: await this.store.createUser(user, body) };
  }

  @Patch("users/:id")
  async updateUser(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: UpdateAdminUserDto,
  ): Promise<AdminUserResponse> {
    return { item: await this.store.updateUser(user, id, body) };
  }

  @Delete("users/:id")
  async deleteUser(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<{ success: boolean }> {
    await this.store.deleteUser(user, id);
    return { success: true };
  }
}
