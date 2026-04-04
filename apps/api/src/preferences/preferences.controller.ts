import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { DashboardPreferencesResponse, User } from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { UpdateDashboardPreferencesDto } from "./preferences.dto.js";

@ApiTags("preferences")
@ApiBearerAuth()
@Controller("preferences")
export class PreferencesController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get("executive-dashboard")
  async getExecutiveDashboardPreferences(
    @CurrentUser() user: User,
  ): Promise<DashboardPreferencesResponse> {
    return { preferences: await this.store.getDashboardPreferences(user) };
  }

  @Put("executive-dashboard")
  async updateExecutiveDashboardPreferences(
    @CurrentUser() user: User,
    @Body() body: UpdateDashboardPreferencesDto,
  ): Promise<DashboardPreferencesResponse> {
    return { preferences: await this.store.saveDashboardPreferences(user, body) };
  }
}
