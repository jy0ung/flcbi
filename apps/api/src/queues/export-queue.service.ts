import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  EXPORT_GENERATE_JOB_NAME,
  EXPORT_QUEUE_NAME,
  type ExportGenerateJobPayload,
} from "@flcbi/contracts";

@Injectable()
export class ExportQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(ExportQueueService.name);
  private queue?: Queue<ExportGenerateJobPayload>;

  isConfigured() {
    return Boolean(process.env.REDIS_URL);
  }

  async enqueueExplorerExport(payload: ExportGenerateJobPayload) {
    if (!this.isConfigured()) {
      return false;
    }

    const queue = this.getQueue();
    const jobId = `export-generate-${payload.exportId}`;
    await this.removeRetainedJob(queue, jobId);

    await queue.add(EXPORT_GENERATE_JOB_NAME, payload, {
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

      this.queue = new Queue<ExportGenerateJobPayload>(EXPORT_QUEUE_NAME, {
        connection: { url: redisUrl },
      });
      this.queue.on("error", (error) => {
        this.logger.warn(`Export queue connection error: ${error.message}`);
      });
    }

    return this.queue;
  }

  private async removeRetainedJob(
    queue: Queue<ExportGenerateJobPayload>,
    jobId: string,
  ) {
    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      return;
    }

    const state = await existingJob.getState();
    if (state === "active") {
      this.logger.warn(`Skipping cleanup for active export queue job ${jobId}`);
      return;
    }

    await existingJob.remove();
  }
}
