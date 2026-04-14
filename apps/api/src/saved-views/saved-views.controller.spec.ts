// @vitest-environment node
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import type { ExplorerQuery, ExplorerSavedView, User } from "@flcbi/contracts";
import { describe, expect, it, vi } from "vitest";
import { ExplorerQueryDto } from "../aging/aging.dto.js";
import type { PlatformRepository } from "../platform/platform.repository.js";
import { CreateExplorerSavedViewDto } from "./saved-views.dto.js";
import { SavedViewsController } from "./saved-views.controller.js";

const adminUser = {
  id: "user-1",
  email: "admin@example.com",
  name: "FLC BI Administrator",
  role: "company_admin",
  companyId: "company-1",
} as User;

describe("POST /saved-views/explorer", () => {
  it("keeps the nested explorer query through validation", async () => {
    const query: ExplorerQuery = {
      search: "KK",
      branch: "KK",
      model: "ATIVA",
      payment: "CASH",
      page: 1,
      pageSize: 50,
      sortField: "bg_date",
      sortDirection: "desc",
    };

    const savedView: ExplorerSavedView = {
      id: "view-1",
      name: "KK Ativa",
      query,
      createdAt: "2026-04-14T04:44:38.638739+00:00",
      updatedAt: "2026-04-14T04:44:38.638739+00:00",
    };

    const createExplorerSavedView = vi.fn().mockResolvedValue(savedView);
    const controller = new SavedViewsController({
      createExplorerSavedView,
    } as unknown as PlatformRepository);

    const body = (await new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }).transform(
      { name: "KK Ativa", query },
      { type: "body", metatype: CreateExplorerSavedViewDto, data: "" },
    )) as CreateExplorerSavedViewDto;

    expect(body).toBeInstanceOf(CreateExplorerSavedViewDto);
    expect(body.name).toBe("KK Ativa");
    expect(body.query).toBeInstanceOf(ExplorerQueryDto);
    expect(body.query).toMatchObject(query);

    const response = await controller.createExplorerSavedView(adminUser, body);

    expect(createExplorerSavedView).toHaveBeenCalledWith(
      adminUser,
      expect.objectContaining({
        name: "KK Ativa",
        query: expect.objectContaining(query),
      }),
    );
    expect(response).toEqual({ item: savedView });
  });
});
