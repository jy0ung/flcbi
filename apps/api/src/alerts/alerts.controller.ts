import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AlertsResponse, User } from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { CreateAlertDto, UpdateAlertDto } from "./alerts.dto.js";

@ApiTags("alerts")
@ApiBearerAuth()
@Roles("company_admin", "super_admin", "director")
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

  @Patch(":id")
  async updateAlert(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: UpdateAlertDto,
  ): Promise<AlertsResponse> {
    await this.store.updateAlert(user, id, body);
    return { items: await this.store.listAlerts(user) };
  }

  @Delete(":id")
  async deleteAlert(@CurrentUser() user: User, @Param("id") id: string): Promise<AlertsResponse> {
    await this.store.deleteAlert(user, id);
    return { items: await this.store.listAlerts(user) };
  }
}
