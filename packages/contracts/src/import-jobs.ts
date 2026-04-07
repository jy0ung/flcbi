export const IMPORT_QUEUE_NAME = "imports";
export const IMPORT_PREVIEW_JOB_NAME = "generate-preview";
export const IMPORT_PUBLISH_JOB_NAME = "publish-import";
export const ALERT_QUEUE_NAME = "alerts";
export const ALERT_EVALUATION_JOB_NAME = "evaluate-alerts";
export const EXPORT_QUEUE_NAME = "exports";
export const EXPORT_GENERATE_JOB_NAME = "generate-export";
export const EXPORT_DAILY_SUBSCRIPTIONS_JOB_NAME = "daily-subscriptions";

export interface ImportPreviewJobPayload {
  importId: string;
}

export interface ImportPublishJobPayload {
  importId: string;
  companyId: string;
  publishMode: "replace" | "merge";
  requestedByUserId: string;
  requestedByUserName: string;
}

export interface AlertEvaluationJobPayload {
  triggeredAt: string;
  companyId?: string;
  reason?: string;
}

export interface ExportGenerateJobPayload {
  exportId: string;
}

export interface ExportDailySubscriptionsJobPayload {
  triggeredAt: string;
}
