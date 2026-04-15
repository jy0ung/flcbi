import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  ImportDetailResponse,
  ImportsResponse,
  PublishImportResponse,
  User,
} from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { Roles } from "../common/roles.decorator.js";
import { PublishImportDto } from "./imports.dto.js";

const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@ApiTags("imports")
@ApiBearerAuth()
@Controller("imports")
export class ImportsController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get()
  async listImports(@CurrentUser() user: User): Promise<ImportsResponse> {
    return { items: await this.store.listImports(user) };
  }

  @Get(":id")
  async getImport(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ImportDetailResponse> {
    return await this.store.getImportById(user, id);
  }

  @Roles("company_admin", "super_admin", "director")
  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async createImport(
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportDetailResponse> {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new BadRequestException("Only .xlsx workbooks are supported");
    }
    return this.store.createImportPreview(user, file.originalname, file.buffer);
  }

  @Roles("company_admin", "super_admin", "director")
  @Post(":id/publish")
  async publishImport(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body?: PublishImportDto,
  ): Promise<PublishImportResponse> {
    return { item: await this.store.publishImport(user, id, body?.mode) };
  }
}
