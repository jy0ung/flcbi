import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import type { DependencyStatus } from "@flcbi/contracts";
import {
  ALERT_EVALUATION_JOB_NAME,
  ALERT_QUEUE_NAME,
  type AlertEvaluationJobPayload,
} from "@flcbi/contracts";
import {
  createEmptyQueueMetricsSnapshot,
  QUEUE_COUNT_STATES,
  type QueueMetricsSnapshot,
} from "./queue.types.js";

@Injectable()
export class AlertQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(AlertQueueService.name);
  private queue?: Queue<AlertEvaluationJobPayload>;

  isConfigured() {
    return Boolean(process.env.REDIS_URL);
  }

  async checkHealth() {
    return (await this.getMetricsSnapshot()).health;
  }

  async getMetricsSnapshot(): Promise<QueueMetricsSnapshot> {
    if (!this.isConfigured()) {
      return createEmptyQueueMetricsSnapshot();
    }

    try {
      const queue = this.getQueue();
      const client = await queue.client;
      const response = await client.ping();
      const counts = await queue.getJobCounts(...QUEUE_COUNT_STATES);
      const workers = await queue.getWorkersCount();

      return {
        health: normalizeDependencyStatus(response === "PONG"),
        workers,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused: counts.paused ?? 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Alert queue metrics failed: ${message}`);
      return createEmptyQueueMetricsSnapshot("down");
    }
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

function normalizeDependencyStatus(isUp: boolean): DependencyStatus {
  return isUp ? "up" : "down";
}
