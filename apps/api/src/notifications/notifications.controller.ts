import { Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { NotificationsResponse, SuccessResponse, User } from "@flcbi/contracts";
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

  @Post(":id/read")
  async markNotificationRead(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<SuccessResponse> {
    await this.store.markNotificationRead(user, id);
    return { success: true };
  }

  @Post("read-all")
  async markAllNotificationsRead(@CurrentUser() user: User): Promise<SuccessResponse> {
    await this.store.markAllNotificationsRead(user);
    return { success: true };
  }
}
