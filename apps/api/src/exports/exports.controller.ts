import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiProduces, ApiTags } from "@nestjs/swagger";
import type {
  CreateExportSubscriptionResponse,
  CreateExportResponse,
  ExportsResponse,
  ExportSubscriptionsResponse,
  RetryExportResponse,
  SuccessResponse,
  User,
} from "@flcbi/contracts";
import type { Response } from "express";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { CreateExplorerExportDto, CreateExportSubscriptionDto } from "./exports.dto.js";

const EXPORT_ROLES = ["company_admin", "super_admin", "director", "general_manager", "manager", "analyst"] as const;

@ApiTags("exports")
@ApiBearerAuth()
@Controller("exports")
export class ExportsController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  @Roles(...EXPORT_ROLES)
  async listExports(@CurrentUser() user: User): Promise<ExportsResponse> {
    return { items: await this.store.listExports(user) };
  }

  @Post()
  @Roles(...EXPORT_ROLES)
  async createExplorerExport(
    @CurrentUser() user: User,
    @Body() body: CreateExplorerExportDto,
  ): Promise<CreateExportResponse> {
    if (!body?.query) {
      throw new BadRequestException("Export query is required");
    }
    return { item: await this.store.createExplorerExport(user, body.query) };
  }

  @Get("subscriptions")
  @Roles(...EXPORT_ROLES)
  async listExportSubscriptions(@CurrentUser() user: User): Promise<ExportSubscriptionsResponse> {
    return { items: await this.store.listExportSubscriptions(user) };
  }

  @Post("subscriptions")
  @Roles(...EXPORT_ROLES)
  async createExportSubscription(
    @CurrentUser() user: User,
    @Body() body: CreateExportSubscriptionDto,
  ): Promise<CreateExportSubscriptionResponse> {
    if (!body?.query) {
      throw new BadRequestException("Export query is required");
    }
    return { item: await this.store.createExportSubscription(user, body.query) };
  }

  @Post("subscriptions/:id/delete")
  @Roles(...EXPORT_ROLES)
  async deleteExportSubscription(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<SuccessResponse> {
    await this.store.deleteExportSubscription(user, id);
    return { success: true };
  }

  @Post(":id/retry")
  @Roles(...EXPORT_ROLES)
  async retryExport(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<RetryExportResponse> {
    return { item: await this.store.retryExport(user, id) };
  }

  @Get(":id/download")
  @Roles(...EXPORT_ROLES)
  @ApiProduces("text/csv")
  async downloadExport(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const download = await this.store.getExportDownload(user, id);
    response.setHeader("Content-Type", download.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${download.fileName}"`);
    response.send(download.content);
  }
}
