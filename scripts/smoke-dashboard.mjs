import { chromium } from "../node_modules/playwright/index.mjs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const entries = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }

  return entries;
}

const smokeEnv = {
  ...parseEnvFile(resolve(rootDir, ".env.test-server")),
  ...parseEnvFile(resolve(rootDir, ".env.test-server.local")),
  ...process.env,
};

const email = process.env.FLCBI_SMOKE_EMAIL ?? smokeEnv.BOOTSTRAP_ADMIN_EMAIL ?? "admin@flcbi.local";
const password = process.env.FLCBI_SMOKE_PASSWORD ?? smokeEnv.BOOTSTRAP_ADMIN_PASSWORD ?? "fladmin123";
const baseUrl =
  process.env.FLCBI_SMOKE_BASE_URL ??
  `http://127.0.0.1:${smokeEnv.VITE_PORT ?? "18133"}`;
const explorerLoadTimeout = 40000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readMetricCardIds(page) {
  const cards = page.locator('[data-testid^="executive-metric-card-"]');
  const count = await cards.count();
  const metricIds = [];

  for (let index = 0; index < count; index += 1) {
    const testId = await cards.nth(index).getAttribute("data-testid");
    if (testId?.startsWith("executive-metric-card-")) {
      metricIds.push(testId.replace("executive-metric-card-", ""));
    }
  }

  return metricIds;
}

async function restoreMetricBoard(page, metricIds) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByText("My KPI Board").waitFor({ timeout: 20000 });
  await page.getByTestId("executive-customize-button").click();
  await page.getByText("Customize My KPI Board").waitFor();

  const targetMetricIds = new Set(metricIds);
  const options = page.locator('[data-testid^="executive-metric-option-"]');
  const optionCount = await options.count();
  const optionStates = [];

  for (let index = 0; index < optionCount; index += 1) {
    const option = options.nth(index);
    const testId = await option.getAttribute("data-testid");
    if (!testId?.startsWith("executive-metric-option-")) {
      continue;
    }

    const metricId = testId.replace("executive-metric-option-", "");
    const isChecked = (await option.locator('button[role="checkbox"][data-state="checked"]').count()) > 0;
    optionStates.push({ index, metricId, isChecked });
  }

  for (const optionState of optionStates) {
    if (!optionState.isChecked || targetMetricIds.has(optionState.metricId)) {
      continue;
    }

    await options.nth(optionState.index).click();
  }

  await page.waitForTimeout(300);

  for (const optionState of optionStates) {
    if (optionState.isChecked || !targetMetricIds.has(optionState.metricId)) {
      continue;
    }

    await options.nth(optionState.index).click();
  }

  await page.getByRole("button", { name: "Save Board" }).click();
  let restoredMetricIds = new Set();
  const restoreDeadline = Date.now() + 20000;
  while (Date.now() < restoreDeadline) {
    await page.waitForTimeout(500);
    restoredMetricIds = new Set(await readMetricCardIds(page));
    if (
      restoredMetricIds.size === targetMetricIds.size &&
      [...targetMetricIds].every((metricId) => restoredMetricIds.has(metricId))
    ) {
      return;
    }
  }

  assert(restoredMetricIds.size === targetMetricIds.size, "Metric board restore changed the card count");
  for (const metricId of targetMetricIds) {
    assert(restoredMetricIds.has(metricId), `Metric board restore missed ${metricId}`);
  }
}

async function findExplorerRowSample(page) {
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    await page.getByTestId("vehicle-explorer-row").first().waitFor({ timeout: explorerLoadTimeout });

    const rows = page.getByTestId("vehicle-explorer-row");
    const count = await rows.count();

    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const editable = await row.getAttribute("data-editable-row");
      if (editable !== "true") {
        continue;
      }

      const chassisValue = (await row.getByTestId("vehicle-explorer-cell-chassis-no").textContent())?.trim();
      const paymentValue = (await row.getByTestId("vehicle-explorer-cell-payment-method").textContent())?.trim();
      const dateValue = (await row.getByTestId("vehicle-explorer-cell-bg-date").textContent())?.trim();
      const d2dValue = (await row.getByTestId("vehicle-explorer-cell-is-d2d").textContent())?.trim();

      if (chassisValue && paymentValue && dateValue && d2dValue && chassisValue !== "—" && paymentValue !== "—" && dateValue !== "—" && d2dValue !== "—") {
        return {
          chassisNo: chassisValue,
          paymentMethod: paymentValue,
          bgDate: dateValue,
          isD2D: d2dValue,
        };
      }
    }

    const nextPage = page.getByTestId("vehicle-explorer-next-page");
    if (await nextPage.isDisabled()) {
      break;
    }

    const summaryBefore = await page.getByTestId("vehicle-explorer-pagination-summary").innerText();
    await nextPage.click();
    await page.waitForFunction(
      (previous) => document.querySelector('[data-testid="vehicle-explorer-pagination-summary"]')?.textContent !== previous,
      summaryBefore,
      { timeout: explorerLoadTimeout },
    );
  }

  throw new Error("Could not find an editable explorer row with sample values for chassis, payment, date, and D2D columns");
}

async function openHeaderFilter(page, columnKey) {
  await page.getByTestId(`vehicle-explorer-filter-trigger-${columnKey}`).click();
  await page.getByTestId(`vehicle-explorer-filter-popover-${columnKey}`).waitFor({ timeout: 15000 });
}

async function waitForExplorerReady(page) {
  const waitForExplorer = async () => {
    await page.getByRole("heading", { name: "Vehicle Explorer" }).waitFor({ timeout: explorerLoadTimeout });
    await page.getByTestId("vehicle-explorer-toolbar").waitFor({ timeout: explorerLoadTimeout });
    await page.getByTestId("vehicle-explorer-pagination-summary").waitFor({ timeout: explorerLoadTimeout });
  };

  try {
    await waitForExplorer();
  } catch (error) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForExplorer();
  }
}

function parseExplorerFiltersFromUrl(url) {
  const filters = url.searchParams.get("filters");
  if (!filters) {
    return null;
  }

  try {
    return JSON.parse(filters);
  } catch {
    return null;
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl });
const page = await context.newPage();
let initialMetricIds = [];

try {
  console.log("step: goto-login");
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign In" }).click();

  console.log("step: wait-dashboard");
  await page.waitForURL("**/", { timeout: 20000 });
  await page.getByText("My KPI Board").waitFor({ timeout: 20000 });

  const initialCards = page.locator('[data-testid^="executive-metric-card-"]');
  const initialCardCount = await initialCards.count();
  assert(initialCardCount >= 1 && initialCardCount <= 6, `Unexpected initial KPI board count: ${initialCardCount}`);
  initialMetricIds = await readMetricCardIds(page);

  console.log("step: open-customize");
  await page.getByTestId("executive-customize-button").click();
  await page.getByText("Customize My KPI Board").waitFor();

  const qualityOption = page.getByTestId("executive-metric-option-quality_issues");
  const aged90Option = page.getByTestId("executive-metric-option-aged_90_plus");
  const qualityChecked = await qualityOption.locator('button[role="checkbox"][data-state="checked"]').count();
  if (qualityChecked > 0) {
    await qualityOption.click();
  }

  const aged90Checked = await aged90Option.locator('button[role="checkbox"][data-state="checked"]').count();
  if (aged90Checked === 0) {
    await aged90Option.click();
  }

  console.log("step: save-board");
  await page.getByRole("button", { name: "Save Board" }).click();
  await page.getByTestId("executive-metric-card-aged_90_plus").waitFor({ timeout: 15000 });

  const riskSection = page.locator("div.glass-panel").filter({
    has: page.getByText("Stock Aging Risk"),
  }).first();
  await riskSection.waitFor();
  const riskLabels = await riskSection.locator("button p.text-xs").allTextContents();
  assert(!riskLabels.includes("90+ Days Open"), "Pinned metric still appears in Stock Aging Risk section");

  console.log("step: reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("executive-metric-card-aged_90_plus").waitFor({ timeout: 20000 });

  console.log("step: apply-filters");
  const branchSelect = page.getByTestId("executive-filter-branch");
  const branchOptions = await branchSelect.locator("option").allTextContents();
  const chosenBranch = branchOptions.find((value) => value !== "All Branches");
  assert(Boolean(chosenBranch), "No branch filter options found");

  await branchSelect.selectOption({ label: chosenBranch });
  await page.waitForTimeout(800);

  const paymentSelect = page.getByTestId("executive-filter-payment");
  const paymentOptions = await paymentSelect.locator("option").allTextContents();
  const chosenPayment = paymentOptions.find((value) => value !== "All Payments") ?? null;
  if (chosenPayment) {
    await paymentSelect.selectOption({ label: chosenPayment });
    await page.waitForTimeout(800);
  }

  const presetSelect = page.getByTestId("executive-filter-preset");
  await presetSelect.selectOption("registered_pending_delivery");
  await page.waitForTimeout(1500);

  const dashboardUrl = new URL(page.url());
  assert(dashboardUrl.searchParams.get("branch") === chosenBranch, "Branch filter did not persist in URL");
  if (chosenPayment) {
    assert(dashboardUrl.searchParams.get("payment") === chosenPayment, "Payment filter did not persist in URL");
  }
  assert(dashboardUrl.searchParams.get("preset") === "registered_pending_delivery", "Preset filter did not persist in URL");

  console.log("step: drilldown");
  await page.getByTestId("executive-metric-card-registered_pending_delivery").click();
  await page.waitForURL("**/auto-aging/vehicles**", { timeout: 15000 });

  const explorerUrl = new URL(page.url());
  assert(explorerUrl.searchParams.get("branch") === chosenBranch, "Branch filter not carried into explorer");
  if (chosenPayment) {
    assert(explorerUrl.searchParams.get("payment") === chosenPayment, "Payment filter not carried into explorer");
  }
  assert(explorerUrl.searchParams.get("preset") === "registered_pending_delivery", "Preset not carried into explorer");
  await waitForExplorerReady(page);
  await page.getByTestId("vehicle-explorer-pagination-bottom").waitFor({ timeout: explorerLoadTimeout });
  await page.getByTestId("vehicle-explorer-page-size").selectOption("25");
  await page.waitForURL("**pageSize=25**", { timeout: 15000 });
  await page.getByTestId("vehicle-explorer-pagination-summary").waitFor({ timeout: explorerLoadTimeout });

  console.log("step: auto-aging-drilldown");
  await page.goto("/auto-aging", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Auto Aging Dashboard" }).waitFor({ timeout: 15000 });

  const autoAgingBranchSelect = page.locator("select").first();
  await page.waitForFunction(() => {
    const select = document.querySelector("select");
    return Boolean(select && select.options.length > 1);
  }, undefined, { timeout: explorerLoadTimeout });
  const autoAgingBranchOptions = await autoAgingBranchSelect.locator("option").evaluateAll((options) => options.map((option) => ({
    label: option.textContent?.trim() ?? "",
    value: option.value,
  })));
  const autoAgingModelSelect = page.locator("select").nth(1);
  const autoAgingBranchChoices = autoAgingBranchOptions.filter((option) => option.value !== "all");
  let autoAgingBranchChoice = null;
  let autoAgingModelChoice = null;

  for (const branchChoice of autoAgingBranchChoices) {
    await autoAgingBranchSelect.selectOption(branchChoice.value);
    await page.waitForTimeout(1200);

    const autoAgingModelOptions = await autoAgingModelSelect.locator("option").evaluateAll((options) => options.map((option) => ({
      label: option.textContent?.trim() ?? "",
      value: option.value,
    })));
    const modelChoice = autoAgingModelOptions.find((option) => option.value !== "all");
    if (modelChoice) {
      autoAgingBranchChoice = branchChoice.label;
      autoAgingModelChoice = modelChoice.label;
      break;
    }
  }

  assert(Boolean(autoAgingBranchChoice), "No auto-aging branch/model combination found");
  assert(Boolean(autoAgingModelChoice), "No auto-aging model filter options found");

  await autoAgingModelSelect.selectOption({ label: autoAgingModelChoice });
  await page.waitForTimeout(800);

  await page.locator(".kpi-card").first().click();
  await page.waitForURL("**/auto-aging/vehicles**", { timeout: 15000 });
  await page.getByRole("heading", { name: "Vehicle Explorer" }).waitFor({ timeout: explorerLoadTimeout });

  const autoAgingExplorerUrl = new URL(page.url());
  assert(autoAgingExplorerUrl.searchParams.get("branch") === autoAgingBranchChoice, "Auto-aging branch filter not carried into explorer");
  assert(autoAgingExplorerUrl.searchParams.get("model") === autoAgingModelChoice, "Auto-aging model filter not carried into explorer");

  console.log("step: saved-view");
  const savedViewName = `Smoke Saved View ${Date.now()}`;
  await page.getByTestId("explorer-saved-views-trigger").click();
  await page.getByTestId("explorer-save-view-button").click();
  await page.getByTestId("explorer-save-view-name").fill(savedViewName);
  await page.getByTestId("explorer-save-view-submit").click();
  await page.getByTestId("explorer-saved-views-trigger").filter({ hasText: savedViewName }).waitFor({ timeout: explorerLoadTimeout });
  await page.goto("/auto-aging/vehicles?pageSize=100", { waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);
  await page.getByTestId("explorer-saved-views-trigger").click();
  const savedViewRow = page.getByTestId("explorer-saved-view-row").filter({ hasText: savedViewName }).first();
  await savedViewRow.waitFor({ timeout: explorerLoadTimeout });

  await savedViewRow.click();
  await page.waitForURL((url) => (
    url.searchParams.get("branch") === autoAgingBranchChoice &&
    url.searchParams.get("model") === autoAgingModelChoice
  ), { timeout: 15000 });
  await waitForExplorerReady(page);

  const savedViewUrl = new URL(page.url());
  assert(savedViewUrl.searchParams.get("branch") === autoAgingBranchChoice, "Saved view did not restore branch");
  assert(savedViewUrl.searchParams.get("model") === autoAgingModelChoice, "Saved view did not restore model");

  await page.getByTestId("explorer-saved-views-trigger").click();
  await savedViewRow.getByTestId("explorer-saved-view-delete").click();
  await page.getByTestId("explorer-saved-view-delete-confirm").click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);
  await page.getByTestId("explorer-saved-views-trigger").click();
  assert(
    (await page.getByTestId("explorer-saved-view-row").filter({ hasText: savedViewName }).count()) === 0,
    "Saved view row still visible after delete",
  );

  await page.goto("/auto-aging/vehicles?pageSize=100", { waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);

  console.log("step: header-filter-text");
  const explorerRows = page.getByTestId("vehicle-explorer-row");
  await explorerRows.first().waitFor({ timeout: 15000 });
  const explorerRowCount = await explorerRows.count();
  const sampleRow = await findExplorerRowSample(page);

  await openHeaderFilter(page, "chassis-no");
  await page.getByTestId("vehicle-explorer-filter-chassis-no-input").fill(sampleRow.chassisNo);
  await page.getByTestId("vehicle-explorer-filter-chassis-no-apply").click();
  await page.waitForURL((url) => {
    const filters = url.searchParams.get("filters");
    return Boolean(filters && filters.includes(sampleRow.chassisNo));
  }, { timeout: 15000 });

  const textFilterRows = page.getByTestId("vehicle-explorer-row");
  const textFilterRowCount = await textFilterRows.count();
  assert(textFilterRowCount >= 1 && textFilterRowCount <= explorerRowCount, `Unexpected chassis filter row count (${textFilterRowCount})`);
  let chassisMatchFound = false;
  for (let index = 0; index < textFilterRowCount; index += 1) {
    const filteredChassisValue = (await textFilterRows.nth(index).getByTestId("vehicle-explorer-cell-chassis-no").textContent())?.trim();
    if (filteredChassisValue?.includes(sampleRow.chassisNo)) {
      chassisMatchFound = true;
      break;
    }
  }
  assert(chassisMatchFound, "Chassis filter did not surface the expected row");

  const textFilterUrl = new URL(page.url());
  const textFilterState = parseExplorerFiltersFromUrl(textFilterUrl);
  assert(textFilterState?.columnFilters?.chassis_no === sampleRow.chassisNo, "Text filter did not persist in URL");

  await openHeaderFilter(page, "chassis-no");
  await page.getByTestId("vehicle-explorer-filter-chassis-no-clear").click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length === expected, explorerRowCount, { timeout: 15000 });

  const clearedRows = page.getByTestId("vehicle-explorer-row");
  const clearedRowCount = await clearedRows.count();
  assert(clearedRowCount === explorerRowCount, `Chassis filter clear did not restore the original row count (${clearedRowCount} vs ${explorerRowCount})`);

  const clearedFilterState = parseExplorerFiltersFromUrl(new URL(page.url()));
  assert(!clearedFilterState?.columnFilters?.chassis_no, "Chassis filter remained in URL after clear");

  console.log("step: header-filter-date");
  await openHeaderFilter(page, "bg-date");
  await page.getByTestId("vehicle-explorer-filter-bg-date-from").fill(sampleRow.bgDate);
  await page.getByTestId("vehicle-explorer-filter-bg-date-to").fill(sampleRow.bgDate);
  await page.getByTestId("vehicle-explorer-filter-bg-date-apply").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length >= 1, undefined, { timeout: 15000 });

  const dateFilterUrl = new URL(page.url());
  const dateFilterState = parseExplorerFiltersFromUrl(dateFilterUrl);
  assert(dateFilterState?.columnFilters?.bg_date?.from === sampleRow.bgDate, "Date filter start did not persist in URL");
  assert(dateFilterState?.columnFilters?.bg_date?.to === sampleRow.bgDate, "Date filter end did not persist in URL");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);
  const dateReloadRows = await page.getByTestId("vehicle-explorer-row").count();
  assert(dateReloadRows >= 1, "Date range filter did not survive reload");

  await openHeaderFilter(page, "bg-date");
  await page.getByTestId("vehicle-explorer-filter-bg-date-clear").click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length === expected, explorerRowCount, { timeout: 15000 });

  console.log("step: header-filter-select");
  await openHeaderFilter(page, "payment-method");
  await page.getByTestId("vehicle-explorer-filter-payment-method-select").selectOption({ label: sampleRow.paymentMethod });
  await page.getByTestId("vehicle-explorer-filter-payment-method-apply").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length >= 1, undefined, { timeout: 15000 });

  const selectFilterUrl = new URL(page.url());
  const selectFilterState = parseExplorerFiltersFromUrl(selectFilterUrl);
  assert(selectFilterState?.columnFilters?.payment_method === sampleRow.paymentMethod, "Select filter did not persist in URL");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);
  const selectReloadRows = await page.getByTestId("vehicle-explorer-row").count();
  assert(selectReloadRows >= 1, "Select filter did not survive reload");

  await openHeaderFilter(page, "payment-method");
  await page.getByTestId("vehicle-explorer-filter-payment-method-clear").click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length === expected, explorerRowCount, { timeout: 15000 });

  console.log("step: header-filter-boolean");
  await openHeaderFilter(page, "is-d2d");
  await page.getByTestId("vehicle-explorer-filter-is-d2d-select").selectOption({ label: sampleRow.isD2D });
  await page.getByTestId("vehicle-explorer-filter-is-d2d-apply").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length >= 1, undefined, { timeout: 15000 });

  const booleanFilterUrl = new URL(page.url());
  const booleanFilterState = parseExplorerFiltersFromUrl(booleanFilterUrl);
  assert(booleanFilterState?.columnFilters?.is_d2d === (sampleRow.isD2D === "Yes"), "Boolean filter did not persist in URL");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForExplorerReady(page);
  const booleanReloadRows = await page.getByTestId("vehicle-explorer-row").count();
  assert(booleanReloadRows >= 1, "Boolean filter did not survive reload");

  await openHeaderFilter(page, "is-d2d");
  await page.getByTestId("vehicle-explorer-filter-is-d2d-clear").click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="vehicle-explorer-row"]').length === expected, explorerRowCount, { timeout: 15000 });

  console.log("step: inline-edit");
  await openHeaderFilter(page, "chassis-no");
  await page.getByTestId("vehicle-explorer-filter-chassis-no-input").fill(sampleRow.chassisNo);
  await page.getByTestId("vehicle-explorer-filter-chassis-no-apply").click();
  await page.waitForURL((url) => {
    const filters = url.searchParams.get("filters");
    return Boolean(filters && filters.includes(sampleRow.chassisNo));
  }, { timeout: 15000 });

  const inlineEditRow = page.getByTestId("vehicle-explorer-row").first();
  const updatedRemark = `Smoke inline edit ${Date.now()}`;
  await inlineEditRow.getByTestId("vehicle-explorer-cell-remark").click();
  await inlineEditRow.getByTestId("vehicle-explorer-edit-input-remark").fill(updatedRemark);
  await page.getByTestId("vehicle-explorer-inline-reason-input").fill("Smoke test inline remark update");
  await inlineEditRow.getByTestId("vehicle-explorer-inline-save-button").click();
  await page.getByTestId("vehicle-explorer-inline-reason-input").waitFor({ state: "detached", timeout: 15000 });

  const inlineEditUrl = new URL(page.url());
  const inlineEditState = parseExplorerFiltersFromUrl(inlineEditUrl);
  assert(inlineEditState?.columnFilters?.chassis_no === sampleRow.chassisNo, "Inline edit filter state was lost");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(updatedRemark, { exact: true }).waitFor({ timeout: 15000 });

  await page.goto(`/auto-aging/vehicles/${sampleRow.chassisNo}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Vehicle Information").waitFor({ timeout: 15000 });
  await page.getByText(updatedRemark, { exact: true }).waitFor({ timeout: 15000 });

  console.log("step: quality-issues");
  await page.goto("/auto-aging/quality", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Data Quality" }).waitFor({ timeout: 15000 });
  await page.getByTestId("quality-issues-table").waitFor({ timeout: 15000 });

  const qualityRows = page.getByTestId("quality-issue-row");
  const qualityRowCount = await qualityRows.count();
  if (qualityRowCount > 0) {
    const typeSelect = page.getByTestId("quality-filter-type");
    const typeOptions = await typeSelect.locator("option").allTextContents();
    const filterType = typeOptions.find((value) => value !== "All Types");
    if (filterType) {
      await typeSelect.selectOption({ label: filterType });
      await page.waitForTimeout(500);
      const filteredRowCount = await qualityRows.count();
      assert(filteredRowCount <= qualityRowCount, "Quality type filter did not narrow the table");
      await page.getByTestId("quality-filter-clear").click();
      await page.waitForTimeout(500);
      const resetRowCount = await qualityRows.count();
      assert(resetRowCount === qualityRowCount, "Quality filters did not reset cleanly");
    }

    await qualityRows.first().click();
    await page.waitForURL("**/auto-aging/vehicles/**", { timeout: 15000 });
    await page.getByText("Vehicle Information").waitFor({ timeout: 15000 });
  } else {
    await page.getByText("No data quality issues detected yet.").waitFor({ timeout: 15000 });
  }

  console.log("step: mapping-console");
  await page.goto("/auto-aging/mappings", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mapping Console" }).waitFor({ timeout: 15000 });
  await page.getByTestId("mapping-admin-save").waitFor({ timeout: 15000 });
  await page.getByText("System suggestions are ready to review").waitFor({ timeout: 15000 });

  console.log("step: import-history");
  await page.goto("/auto-aging/history", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Import History" }).waitFor({ timeout: 15000 });
  await page.getByTestId("import-history-table").waitFor({ timeout: 15000 });
  const importHistoryRows = page.getByTestId("import-history-row");
  assert(await importHistoryRows.count() >= 1, "Import history did not render any rows");

  console.log("step: notifications");
  await page.goto("/notifications", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Notifications" }).waitFor({ timeout: 15000 });
  const notificationsList = page.getByTestId("notifications-list");
  await notificationsList.waitFor({ timeout: 15000 });
  const notificationItems = page.getByTestId("notification-item");
  const emptyState = page.getByTestId("notifications-empty");
  const totalNotifications = await notificationItems.count();
  const hasEmptyState = await emptyState.count();
  assert(totalNotifications > 0 || hasEmptyState > 0, "Notifications page rendered neither items nor empty state");

  console.log("step: exports");
  await page.goto("/auto-aging/exports", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Exports" }).waitFor({ timeout: 15000 });
  await page.getByTestId("exports-table").waitFor({ timeout: 15000 });
  const exportRows = page.getByTestId("exports-row");
  const exportEmptyState = page.getByTestId("exports-empty");
  const renderedExports = await exportRows.count();
  const hasExportEmptyState = await exportEmptyState.count();
  assert(renderedExports > 0 || hasExportEmptyState > 0, "Exports page rendered neither rows nor empty state");

  console.log("step: operations");
  await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Operations" }).waitFor({ timeout: 15000 });
  await page.getByTestId("operations-operational-alerts").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-queue-imports").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-queue-alerts").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-queue-exports").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-metric-vehicle-records").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-imports-table").waitFor({ timeout: 15000 });
  await page.getByTestId("operations-exports-table").waitFor({ timeout: 15000 });

  console.log(JSON.stringify({
    status: "ok",
    chosenBranch,
    chosenPayment,
    initialCardCount,
    dashboardUrl: dashboardUrl.toString(),
    explorerUrl: explorerUrl.toString(),
    autoAgingExplorerUrl: autoAgingExplorerUrl.toString(),
    savedViewName,
    qualityRowCount,
    importHistoryRows: await importHistoryRows.count(),
    notificationsRendered: totalNotifications,
    exportsRendered: renderedExports,
    operationsVisible: true,
  }, null, 2));
} finally {
  if (initialMetricIds.length > 0) {
    console.log("step: restore-board");
    try {
      await restoreMetricBoard(page, initialMetricIds);
    } catch (error) {
      console.warn("step: restore-board-warning", error instanceof Error ? error.message : String(error));
    }
  }
  await browser.close();
}
