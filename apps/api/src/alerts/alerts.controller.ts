import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AlertsResponse, User } from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { CreateAlertDto } from "./alerts.dto.js";

@ApiTags("alerts")
@ApiBearerAuth()
@Controller("alerts")
export class AlertsController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  async listAlerts(@CurrentUser() user: User): Promise<AlertsResponse> {
    return { items: await this.store.listAlerts(user) };
  }

  @Post()
  async createAlert(@CurrentUser() user: User, @Body() body: CreateAlertDto): Promise<AlertsResponse> {
    await this.store.createAlert(user, body);
    return { items: await this.store.listAlerts(user) };
  }
}
