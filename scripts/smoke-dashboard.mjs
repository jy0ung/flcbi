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
  const chosenPayment = paymentOptions.find((value) => value !== "All Payments");
  assert(Boolean(chosenPayment), "No payment filter options found after branch selection");

  await paymentSelect.selectOption({ label: chosenPayment });
  await page.waitForTimeout(800);

  const presetSelect = page.getByTestId("executive-filter-preset");
  await presetSelect.selectOption("registered_pending_delivery");
  await page.waitForTimeout(1500);

  const dashboardUrl = new URL(page.url());
  assert(dashboardUrl.searchParams.get("branch") === chosenBranch, "Branch filter did not persist in URL");
  assert(dashboardUrl.searchParams.get("payment") === chosenPayment, "Payment filter did not persist in URL");
  assert(dashboardUrl.searchParams.get("preset") === "registered_pending_delivery", "Preset filter did not persist in URL");

  console.log("step: drilldown");
  await page.getByTestId("executive-metric-card-registered_pending_delivery").click();
  await page.waitForURL("**/auto-aging/vehicles**", { timeout: 15000 });

  const explorerUrl = new URL(page.url());
  assert(explorerUrl.searchParams.get("branch") === chosenBranch, "Branch filter not carried into explorer");
  assert(explorerUrl.searchParams.get("payment") === chosenPayment, "Payment filter not carried into explorer");
  assert(explorerUrl.searchParams.get("preset") === "registered_pending_delivery", "Preset not carried into explorer");
  await page.getByTestId("vehicle-explorer-pagination-top").waitFor({ timeout: 15000 });
  await page.getByTestId("vehicle-explorer-pagination-bottom").waitFor({ timeout: 15000 });
  await page.getByTestId("vehicle-explorer-page-size").selectOption("25");
  await page.waitForURL("**pageSize=25**", { timeout: 15000 });
  await page.getByTestId("vehicle-explorer-pagination-summary").waitFor({ timeout: 15000 });

  console.log("step: auto-aging-drilldown");
  await page.goto("/auto-aging", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Auto Aging Dashboard" }).waitFor({ timeout: 15000 });

  const autoAgingBranchSelect = page.locator("select").first();
  const autoAgingBranchOptions = await autoAgingBranchSelect.locator("option").allTextContents();
  const autoAgingBranchChoice = autoAgingBranchOptions.find((value) => value !== "All Branches");
  assert(Boolean(autoAgingBranchChoice), "No auto-aging branch filter options found");

  await autoAgingBranchSelect.selectOption({ label: autoAgingBranchChoice });
  await page.waitForTimeout(800);

  const autoAgingModelSelect = page.locator("select").nth(1);
  const autoAgingModelOptions = await autoAgingModelSelect.locator("option").allTextContents();
  const autoAgingModelChoice = autoAgingModelOptions.find((value) => value !== "All Models");
  assert(Boolean(autoAgingModelChoice), "No auto-aging model filter options found");

  await autoAgingModelSelect.selectOption({ label: autoAgingModelChoice });
  await page.waitForTimeout(800);

  await page.locator(".kpi-card").first().click();
  await page.waitForURL("**/auto-aging/vehicles**", { timeout: 15000 });
  await page.getByRole("heading", { name: "Vehicle Explorer" }).waitFor({ timeout: 15000 });

  const autoAgingExplorerUrl = new URL(page.url());
  assert(autoAgingExplorerUrl.searchParams.get("branch") === autoAgingBranchChoice, "Auto-aging branch filter not carried into explorer");
  assert(autoAgingExplorerUrl.searchParams.get("model") === autoAgingModelChoice, "Auto-aging model filter not carried into explorer");

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
    qualityRowCount,
    importHistoryRows: await importHistoryRows.count(),
    notificationsRendered: totalNotifications,
    exportsRendered: renderedExports,
    operationsVisible: true,
  }, null, 2));
} finally {
  if (initialMetricIds.length > 0) {
    console.log("step: restore-board");
    await restoreMetricBoard(page, initialMetricIds);
  }
  await browser.close();
}
