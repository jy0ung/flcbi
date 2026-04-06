import { Worker } from "bullmq";
import {
  ALERT_EVALUATION_JOB_NAME,
  ALERT_QUEUE_NAME,
  EXPORT_QUEUE_NAME,
  IMPORT_PUBLISH_JOB_NAME,
  IMPORT_PREVIEW_JOB_NAME,
  IMPORT_QUEUE_NAME,
} from "@flcbi/contracts";
import { processAlertEvaluationJob } from "./alert-evaluation.processor.js";
import { processImportPublishJob } from "./import-publish.processor.js";
import { processImportPreviewJob } from "./import-preview.processor.js";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.log("FLC BI worker scaffold started without REDIS_URL. Queue workers are disabled in local scaffold mode.");
  process.exit(0);
}

const connection = { url: redisUrl };

const workers = [
  new Worker(
    IMPORT_QUEUE_NAME,
    async (job) => {
      console.log(`Processing import job ${job.id}`, job.data);
      if (job.name === IMPORT_PREVIEW_JOB_NAME) {
        return processImportPreviewJob(job);
      }
      if (job.name === IMPORT_PUBLISH_JOB_NAME) {
        return processImportPublishJob(job);
      }
      return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
    },
    { connection },
  ),
  new Worker(
    ALERT_QUEUE_NAME,
    async (job) => {
      console.log(`Processing alert job ${job.id}`, job.data);
      if (job.name === ALERT_EVALUATION_JOB_NAME) {
        return processAlertEvaluationJob(job);
      }
      return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
    },
    { connection },
  ),
  new Worker(
    EXPORT_QUEUE_NAME,
    async (job) => {
      console.log(`Processing export job ${job.id}`, job.data);
      return { ok: true };
    },
    { connection },
  ),
];

console.log(`FLC BI worker running with ${workers.length} queue processors`);
