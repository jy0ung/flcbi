import type { AlertRule } from "./domain.js";

export function describeAlertComparator(comparator: AlertRule["comparator"]) {
  switch (comparator) {
    case "gt":
      return "above";
    case "gte":
      return "at or above";
    case "lt":
      return "below";
    case "lte":
      return "at or below";
    default:
      return comparator;
  }
}

export function getAlertFrequencyWindow(
  frequency: AlertRule["frequency"],
  triggeredAt: string | Date,
) {
  const date = typeof triggeredAt === "string" ? new Date(triggeredAt) : triggeredAt;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");

  switch (frequency) {
    case "hourly":
      return `${year}-${month}-${day}T${hour}`;
    case "daily":
      return `${year}-${month}-${day}`;
    case "weekly":
      return formatIsoWeek(date);
    default:
      return `${year}-${month}-${day}`;
  }
}

export function buildAlertNotificationFingerprint(input: {
  alertId: string;
  frequency: AlertRule["frequency"];
  triggeredAt: string | Date;
  summaryScope: string;
  threshold: number;
  comparator: AlertRule["comparator"];
  value: number;
}) {
  return [
    "alert",
    input.alertId,
    getAlertFrequencyWindow(input.frequency, input.triggeredAt),
    input.summaryScope,
    input.threshold,
    input.comparator,
    input.value,
  ].join(":");
}

function formatIsoWeek(date: Date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
