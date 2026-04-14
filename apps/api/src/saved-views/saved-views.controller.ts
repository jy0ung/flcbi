import { Body, Controller, Delete, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  CreateExplorerSavedViewResponse,
  ExplorerSavedViewsResponse,
  SuccessResponse,
  User,
} from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { CreateExplorerSavedViewDto } from "./saved-views.dto.js";

@ApiTags("saved-views")
@ApiBearerAuth()
@Controller("saved-views")
export class SavedViewsController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get("explorer")
  async listExplorerSavedViews(@CurrentUser() user: User): Promise<ExplorerSavedViewsResponse> {
    return { items: await this.store.listExplorerSavedViews(user) };
  }

  @Post("explorer")
  async createExplorerSavedView(
    @CurrentUser() user: User,
    @Body() body: CreateExplorerSavedViewDto,
  ): Promise<CreateExplorerSavedViewResponse> {
    return { item: await this.store.createExplorerSavedView(user, body) };
  }

  @Delete("explorer/:id")
  async deleteExplorerSavedView(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<SuccessResponse> {
    await this.store.deleteExplorerSavedView(user, id);
    return { success: true };
  }
}
