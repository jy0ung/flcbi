// @vitest-environment node
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import type { ExplorerQuery, ExportSubscription, User } from "@flcbi/contracts";
import { describe, expect, it, vi } from "vitest";
import { ExplorerQueryDto } from "../aging/aging.dto.js";
import type { PlatformRepository } from "../platform/platform.repository.js";
import { ExportsController } from "./exports.controller.js";
import { CreateExportSubscriptionDto } from "./exports.dto.js";

const adminUser = {
  id: "user-1",
  email: "admin@example.com",
  name: "FLC BI Administrator",
  role: "company_admin",
  companyId: "company-1",
} as User;

describe("POST /exports/subscriptions", () => {
  it("keeps the nested explorer query and daily schedule through validation", async () => {
    const query: ExplorerQuery = {
      search: "SCHED-PROBE",
      branch: "all",
      model: "all",
      payment: "all",
      page: 1,
      pageSize: 50,
      sortField: "bg_date",
      sortDirection: "desc",
    };

    const subscription: ExportSubscription = {
      id: "sub-1",
      requestedBy: "FLC BI Administrator",
      createdAt: "2026-04-14T04:44:38.638739+00:00",
      schedule: "daily",
      kind: "vehicle_explorer_csv",
      enabled: true,
      query: {
        ...query,
        pageSize: 100,
      },
    };

    const createExportSubscription = vi.fn().mockResolvedValue(subscription);
    const controller = new ExportsController({
      createExportSubscription,
    } as unknown as PlatformRepository);

    const body = (await new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }).transform(
      { query, schedule: "daily" },
      { type: "body", metatype: CreateExportSubscriptionDto, data: "" },
    )) as CreateExportSubscriptionDto;

    expect(body).toBeInstanceOf(CreateExportSubscriptionDto);
    expect(body.schedule).toBe("daily");
    expect(body.query).toBeInstanceOf(ExplorerQueryDto);
    expect(body.query).toMatchObject(query);

    const response = await controller.createExportSubscription(adminUser, body);

    expect(createExportSubscription).toHaveBeenCalledWith(adminUser, expect.objectContaining(query));
    expect(response).toEqual({ item: subscription });
  });
});
