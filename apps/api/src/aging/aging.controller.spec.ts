// @vitest-environment node
import "reflect-metadata";

import { describe, expect, it } from "vitest";
import { VEHICLE_CORRECTION_EDITOR_ROLES } from "@flcbi/contracts";
import { ROLES_KEY } from "../common/roles.decorator.js";
import { AgingController } from "./aging.controller.js";

describe("AgingController permissions", () => {
  it("keeps vehicle correction editor roles aligned with the shared contract", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AgingController.prototype.updateVehicleCorrections),
    ).toEqual(VEHICLE_CORRECTION_EDITOR_ROLES);
  });
});
