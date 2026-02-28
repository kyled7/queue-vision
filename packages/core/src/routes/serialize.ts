import type { Job } from "../adapter.js";

interface SerializedJob {
  id: string;
  name: string;
  queue: string;
  status: string;
  data: unknown;
  result?: unknown;
  error?: { message: string; stack?: string };
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt?: string;
  finishedAt?: string;
  delay?: number;
}

export function serializeJob(job: Job): SerializedJob {
  return {
    id: job.id,
    name: job.name,
    queue: job.queue,
    status: job.status,
    data: job.data,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    processedAt: job.processedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    delay: job.delay,
  };
}
