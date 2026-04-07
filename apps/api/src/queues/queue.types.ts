import type { DependencyStatus } from "@flcbi/contracts";

export const QUEUE_COUNT_STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
] as const;

export type QueueCountState = (typeof QUEUE_COUNT_STATES)[number];

export interface QueueMetricsSnapshot {
  health: DependencyStatus;
  workers: number;
  counts: Record<QueueCountState, number>;
}

export function createEmptyQueueMetricsSnapshot(
  health: DependencyStatus = "not_configured",
): QueueMetricsSnapshot {
  return {
    health,
    workers: 0,
    counts: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    },
  };
}
