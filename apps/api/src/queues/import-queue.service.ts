import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  IMPORT_PUBLISH_JOB_NAME,
  IMPORT_PREVIEW_JOB_NAME,
  IMPORT_QUEUE_NAME,
  type ImportPublishJobPayload,
  type ImportPreviewJobPayload,
} from "@flcbi/contracts";

@Injectable()
export class ImportQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImportQueueService.name);
  private queue?: Queue<ImportPreviewJobPayload | ImportPublishJobPayload>;

  isConfigured() {
    return Boolean(process.env.REDIS_URL);
  }

  async checkHealth() {
    if (!this.isConfigured()) {
      return "not_configured" as const;
    }

    try {
      const client = await this.getQueue().client;
      const response = await client.ping();
      return response === "PONG" ? "up" as const : "down" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Import queue health check failed: ${message}`);
      return "down" as const;
    }
  }

  async enqueueImportPreview(payload: ImportPreviewJobPayload) {
    if (!this.isConfigured()) {
      return false;
    }

    await this.getQueue().add(IMPORT_PREVIEW_JOB_NAME, payload, {
      jobId: `import-preview-${payload.importId}`,
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

    await this.getQueue().add(IMPORT_PUBLISH_JOB_NAME, payload, {
      jobId: `import-publish-${payload.importId}`,
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
}
