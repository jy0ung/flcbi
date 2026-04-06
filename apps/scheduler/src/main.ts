import cron from "node-cron";
import { Queue } from "bullmq";
import {
  ALERT_EVALUATION_JOB_NAME,
  ALERT_QUEUE_NAME,
  EXPORT_DAILY_SUBSCRIPTIONS_JOB_NAME,
  EXPORT_QUEUE_NAME,
} from "@flcbi/contracts";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.log("FLC BI scheduler scaffold started without REDIS_URL. Scheduled queues are disabled in local scaffold mode.");
  process.exit(0);
}

const connection = { url: redisUrl };
const alertsQueue = new Queue(ALERT_QUEUE_NAME, { connection });
const exportsQueue = new Queue(EXPORT_QUEUE_NAME, { connection });

cron.schedule("0 * * * *", async () => {
  await alertsQueue.add(ALERT_EVALUATION_JOB_NAME, { triggeredAt: new Date().toISOString() });
  console.log("Enqueued hourly alert evaluation");
});

cron.schedule("0 6 * * *", async () => {
  await exportsQueue.add(EXPORT_DAILY_SUBSCRIPTIONS_JOB_NAME, { triggeredAt: new Date().toISOString() });
  console.log("Enqueued daily export subscriptions");
});

console.log("FLC BI scheduler running");
