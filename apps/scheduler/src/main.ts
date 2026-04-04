import cron from "node-cron";
import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.log("FLC BI scheduler scaffold started without REDIS_URL. Scheduled queues are disabled in local scaffold mode.");
  process.exit(0);
}

const connection = { url: redisUrl };
const alertsQueue = new Queue("alerts", { connection });
const exportsQueue = new Queue("exports", { connection });

cron.schedule("0 * * * *", async () => {
  await alertsQueue.add("evaluate-alerts", { triggeredAt: new Date().toISOString() });
  console.log("Enqueued hourly alert evaluation");
});

cron.schedule("0 6 * * *", async () => {
  await exportsQueue.add("daily-subscriptions", { triggeredAt: new Date().toISOString() });
  console.log("Enqueued daily export subscriptions");
});

console.log("FLC BI scheduler running");
