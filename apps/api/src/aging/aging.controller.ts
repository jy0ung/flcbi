import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  VEHICLE_CORRECTION_EDITOR_ROLES,
  type AgingSummaryResponse,
  type ExplorerMappingsResponse,
  type ExplorerQueryResponse,
  type QualityIssuesResponse,
  type SlaPoliciesResponse,
  type User,
  type VehicleDetailResponse,
} from "@flcbi/contracts";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PLATFORM_REPOSITORY, type PlatformRepository } from "../platform/platform.repository.js";
import { ExplorerQueryDto, UpdateSlaDto, UpdateVehicleCorrectionsDto } from "./aging.dto.js";
import { UpdateExplorerMappingsDto } from "./mappings.dto.js";
import { Roles } from "../common/roles.decorator.js";
import { AgingSummaryQueryDto } from "./aging-summary.dto.js";

@ApiTags("aging")
@ApiBearerAuth()
@Controller("aging")
export class AgingController {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly store: PlatformRepository) {}

  @Get("summary")
  async getSummary(
    @CurrentUser() user: User,
    @Query() query: AgingSummaryQueryDto,
  ): Promise<AgingSummaryResponse> {
    return { summary: await this.store.getSummary(user, query) };
  }

  @Post("explorer/query")
  async queryExplorer(
    @CurrentUser() user: User,
    @Body() body: ExplorerQueryDto,
  ): Promise<ExplorerQueryResponse> {
    return { result: await this.store.queryExplorer(user, body) };
  }

  @Get("vehicles/:chassisNo")
  async getVehicle(
    @CurrentUser() user: User,
    @Param("chassisNo") chassisNo: string,
  ): Promise<VehicleDetailResponse> {
    return await this.store.getVehicle(user, chassisNo);
  }

  @Roles(...VEHICLE_CORRECTION_EDITOR_ROLES)
  @Patch("vehicles/:chassisNo/corrections")
  async updateVehicleCorrections(
    @CurrentUser() user: User,
    @Param("chassisNo") chassisNo: string,
    @Body() body: UpdateVehicleCorrectionsDto,
  ): Promise<VehicleDetailResponse> {
    return await this.store.updateVehicleCorrections(user, chassisNo, body);
  }

  @Get("quality")
  async getQualityIssues(@CurrentUser() user: User): Promise<QualityIssuesResponse> {
    return { items: await this.store.getQualityIssues(user) };
  }

  @Get("slas")
  async getSlas(@CurrentUser() user: User): Promise<SlaPoliciesResponse> {
    return { items: await this.store.listSlas(user) };
  }

  @Roles("company_admin", "super_admin")
  @Patch("slas/:id")
  async updateSla(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: UpdateSlaDto,
  ): Promise<SlaPoliciesResponse> {
    await this.store.updateSla(user, id, body.slaDays);
    return { items: await this.store.listSlas(user) };
  }

  @Get("mappings")
  async listExplorerMappings(@CurrentUser() user: User): Promise<ExplorerMappingsResponse> {
    return await this.store.listExplorerMappings(user);
  }

  @Roles("company_admin", "super_admin")
  @Patch("mappings")
  async saveExplorerMappings(
    @CurrentUser() user: User,
    @Body() body: UpdateExplorerMappingsDto,
  ): Promise<ExplorerMappingsResponse> {
    return await this.store.saveExplorerMappings(user, body);
  }
}
