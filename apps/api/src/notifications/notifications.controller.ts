import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { NotificationsResponse, User } from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  async listNotifications(@CurrentUser() user: User): Promise<NotificationsResponse> {
    return { items: await this.store.getNotifications(user) };
  }
}
