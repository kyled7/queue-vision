import type { PaginationOpts, Unsubscribe } from "./types.js";

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export type JobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused";

export interface Job {
  id: string;
  name: string;
  queue: string;
  status: JobStatus;
  data: unknown;
  result?: unknown;
  error?: { message: string; stack?: string };
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  delay?: number;
}

// ---------------------------------------------------------------------------
// Queue types
// ---------------------------------------------------------------------------

export interface QueueSummary {
  name: string;
  counts: Record<JobStatus, number>;
  isPaused: boolean;
}

export interface QueueMetrics {
  throughput: { timestamp: Date; count: number }[];
  failureRate: number;
  avgProcessingTimeMs: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface JobEvent {
  type: "job:status-change" | "job:progress";
  queue: string;
  jobId: string;
  status: JobStatus;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Adapter interface — the contract every adapter must implement
// ---------------------------------------------------------------------------

export interface QueueAdapter {
  readonly name: string;
  readonly displayName: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  listQueues(): Promise<QueueSummary[]>;

  getJobs(
    queue: string,
    status: JobStatus,
    opts: PaginationOpts,
  ): Promise<Job[]>;

  getJob(queue: string, id: string): Promise<Job>;

  retryJob(queue: string, id: string): Promise<void>;
  deleteJob(queue: string, id: string): Promise<void>;

  getMetrics(queue: string): Promise<QueueMetrics>;

  subscribe(queue: string, cb: (event: JobEvent) => void): Unsubscribe;
}
