import { Worker } from "bullmq";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.log("FLC BI worker scaffold started without REDIS_URL. Queue workers are disabled in local scaffold mode.");
  process.exit(0);
}

const connection = { url: redisUrl };

const workers = [
  new Worker(
    "imports",
    async (job) => {
      console.log(`Processing import job ${job.id}`, job.data);
      return { ok: true };
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
