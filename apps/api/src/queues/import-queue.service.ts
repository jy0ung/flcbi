import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import type { DependencyStatus } from "@flcbi/contracts";
import {
  IMPORT_PUBLISH_JOB_NAME,
  IMPORT_PREVIEW_JOB_NAME,
  IMPORT_QUEUE_NAME,
  type ImportPublishJobPayload,
  type ImportPreviewJobPayload,
} from "@flcbi/contracts";
import {
  createEmptyQueueMetricsSnapshot,
  QUEUE_COUNT_STATES,
  type QueueMetricsSnapshot,
} from "./queue.types.js";

@Injectable()
export class ImportQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImportQueueService.name);
  private queue?: Queue<ImportPreviewJobPayload | ImportPublishJobPayload>;

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
      this.logger.warn(`Import queue metrics failed: ${message}`);
      return createEmptyQueueMetricsSnapshot("down");
    }
  }

  async enqueueImportPreview(payload: ImportPreviewJobPayload) {
    if (!this.isConfigured()) {
      return false;
    }

    const queue = this.getQueue();
    const jobId = `import-preview-${payload.importId}`;

    await queue.add(IMPORT_PREVIEW_JOB_NAME, payload, {
      jobId,
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

  async enqueueImportPublish(payload: ImportPublishJobPayload) {
    if (!this.isConfigured()) {
      return false;
    }

    const queue = this.getQueue();
    const jobId = `import-publish-${payload.importId}`;
    await this.removeRetainedJob(queue, jobId);

    await queue.add(IMPORT_PUBLISH_JOB_NAME, payload, {
      jobId,
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

      this.queue = new Queue<ImportPreviewJobPayload | ImportPublishJobPayload>(IMPORT_QUEUE_NAME, {
        connection: { url: redisUrl },
      });
      this.queue.on("error", (error) => {
        this.logger.warn(`Import queue connection error: ${error.message}`);
      });
    }

    return this.queue;
  }

  private async removeRetainedJob(
    queue: Queue<ImportPreviewJobPayload | ImportPublishJobPayload>,
    jobId: string,
  ) {
    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      return;
    }

    const state = await existingJob.getState();
    if (state === "active") {
      this.logger.warn(`Skipping cleanup for active import queue job ${jobId}`);
      return;
    }

    await existingJob.remove();
  }
}

function normalizeDependencyStatus(isUp: boolean): DependencyStatus {
  return isUp ? "up" : "down";
}
