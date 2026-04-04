import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { NavigationResponse, User } from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";

@ApiTags("navigation")
@ApiBearerAuth()
@Controller("navigation")
export class NavigationController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  async getNavigation(@CurrentUser() user: User): Promise<NavigationResponse> {
    return { items: await this.store.getNavigation(user) };
  }
}
