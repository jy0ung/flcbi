import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  ALERT_EVALUATION_JOB_NAME,
  ALERT_QUEUE_NAME,
  type AlertEvaluationJobPayload,
} from "@flcbi/contracts";

@Injectable()
export class AlertQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(AlertQueueService.name);
  private queue?: Queue<AlertEvaluationJobPayload>;

  isConfigured() {
    return Boolean(process.env.REDIS_URL);
  }

  async enqueueAlertEvaluation(payload: AlertEvaluationJobPayload) {
    if (!this.isConfigured()) {
      return false;
    }

    await this.getQueue().add(ALERT_EVALUATION_JOB_NAME, payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 500,
      },
    });

    return true;
  }

  async onApplicationShutdown() {
    if (this.queue) {
      await this.queue.close();
    }
  }

  private getQueue() {
    if (!this.queue) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
      }

      this.queue = new Queue<AlertEvaluationJobPayload>(ALERT_QUEUE_NAME, {
        connection: { url: redisUrl },
      });
      this.queue.on("error", (error) => {
        this.logger.warn(`Alert queue connection error: ${error.message}`);
      });
    }

    return this.queue;
  }
}
