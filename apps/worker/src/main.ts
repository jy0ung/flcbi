import { Worker } from "bullmq";
import {
  IMPORT_PREVIEW_JOB_NAME,
  IMPORT_QUEUE_NAME,
} from "@flcbi/contracts";
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
      return { ok: true, skipped: true, reason: `unsupported job ${job.name}` };
    },
    { connection },
  ),
  new Worker(
    "alerts",
    async (job) => {
      console.log(`Processing alert job ${job.id}`, job.data);
      return { ok: true };
    },
    { connection },
  ),
  new Worker(
    "exports",
    async (job) => {
      console.log(`Processing export job ${job.id}`, job.data);
      return { ok: true };
    },
    { connection },
  ),
];

console.log(`FLC BI worker running with ${workers.length} queue processors`);
