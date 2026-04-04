import { chromium } from "../node_modules/playwright/index.mjs";

const email = process.env.FLCBI_SMOKE_EMAIL ?? "admin@flcbi.local";
const password = process.env.FLCBI_SMOKE_PASSWORD ?? "fIxqgKfaeUbQhXsCvUZHdznc";
const baseUrl = process.env.FLCBI_SMOKE_BASE_URL ?? "http://127.0.0.1:18133";

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
  await page.waitForTimeout(1200);

  const restoredMetricIds = new Set(await readMetricCardIds(page));
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

  console.log(JSON.stringify({
    status: "ok",
    chosenBranch,
    chosenPayment,
    initialCardCount,
    dashboardUrl: dashboardUrl.toString(),
    explorerUrl: explorerUrl.toString(),
  }, null, 2));
} finally {
  if (initialMetricIds.length > 0) {
    console.log("step: restore-board");
    await restoreMetricBoard(page, initialMetricIds);
  }
  await browser.close();
}
