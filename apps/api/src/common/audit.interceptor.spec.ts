// @vitest-environment node

import { describe, expect, it } from "vitest";
import { shouldSkipGenericAudit } from "./audit.interceptor.js";

describe("shouldSkipGenericAudit", () => {
  it("skips the generic HTTP audit for correction saves", () => {
    expect(shouldSkipGenericAudit("PATCH", "/v1/aging/vehicles/PMK123456A/corrections")).toBe(true);
    expect(shouldSkipGenericAudit("PATCH", "/aging/vehicles/PMK123456A/corrections")).toBe(true);
  });

  it("keeps generic HTTP audit entries for other writes", () => {
    expect(shouldSkipGenericAudit("PATCH", "/v1/aging/slas/policy-1")).toBe(false);
    expect(shouldSkipGenericAudit("POST", "/v1/aging/vehicles/PMK123456A/corrections")).toBe(false);
  });
});
