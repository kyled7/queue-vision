/**
 * QueueAdapter interface for connecting to and monitoring job queues.
 *
 * This interface defines the contract that all queue adapters (BullMQ, Bull, etc.)
 * must implement. All methods return Result<T, E> for explicit error handling without exceptions.
 *
 * @module adapters
 */

import { Result } from '../types/result';
import { Queue } from '../types/queue';
import { Job, JobStatus, JobEvent } from '../types/job';

/**
 * Metrics for queue performance monitoring.
 *
 * Provides statistics about queue throughput, reliability, and processing performance.
 *
 * @example
 * ```typescript
 * const metrics: Metrics = {
 *   throughput: 150.5, // 150.5 jobs per hour
 *   failureRate: 0.02, // 2% failure rate
 *   avgProcessingTime: 2500 // 2.5 seconds average
 * };
 * ```
 */
export interface Metrics {
  /**
   * Number of jobs processed per hour.
   *
   * Calculated from recent completed and failed jobs.
   */
  readonly throughput: number;

  /**
   * Proportion of jobs that failed (0.0 to 1.0).
   *
   * Calculated as: failed / (completed + failed)
   */
  readonly failureRate: number;

  /**
   * Average time to process a job in milliseconds.
   *
   * Calculated as: average(finishedOn - processedOn) for completed jobs
   */
  readonly avgProcessingTime: number;
}

/**
 * Options for paginated job retrieval.
 *
 * @example
 * ```typescript
 * const options: GetJobsOptions = {
 *   queueName: "email-queue",
 *   status: JobStatus.Failed,
 *   offset: 0,
 *   limit: 50
 * };
 * ```
 */
export interface GetJobsOptions {
  /**
   * The name of the queue to retrieve jobs from.
   */
  readonly queueName: string;

  /**
   * Filter jobs by this status.
   */
  readonly status: JobStatus;

  /**
   * Number of jobs to skip (for pagination).
   *
   * Defaults to 0.
   */
  readonly offset?: number;

  /**
   * Maximum number of jobs to return.
   *
   * Defaults to 100.
   */
  readonly limit?: number;
}

/**
 * Callback function for receiving real-time job events.
 *
 * @param event - The job event that occurred
 *
 * @example
 * ```typescript
 * const callback: JobEventCallback = (event) => {
 *   console.log(`Job ${event.jobId} ${event.eventType} at ${event.timestamp}`);
 * };
 * ```
 */
export type JobEventCallback = (event: JobEvent) => void;

/**
 * QueueAdapter interface for monitoring and interacting with job queues.
 *
 * Adapters implement this interface to provide read-only access to job queue systems
 * like BullMQ, Bull, Bee-Queue, etc. The adapter reads queue state directly from
 * the underlying data store (e.g., Redis) without requiring the queue library as a dependency.
 *
 * All methods use the Result<T, E> pattern for error handling - they never throw exceptions.
 * Callers must check result.ok to determine success or failure.
 *
 * @example
 * ```typescript
 * const adapter: QueueAdapter = new BullMQAdapter();
 *
 * // Connect to Redis
 * const connectResult = await adapter.connect("redis://localhost:6379");
 * if (!connectResult.ok) {
 *   console.error("Connection failed:", connectResult.error);
 *   return;
 * }
 *
 * // List all queues
 * const queuesResult = await adapter.listQueues();
 * if (queuesResult.ok) {
 *   console.log("Found queues:", queuesResult.value);
 * }
 *
 * // Get failed jobs
 * const jobsResult = await adapter.getJobs({
 *   queueName: "email-queue",
 *   status: JobStatus.Failed,
 *   offset: 0,
 *   limit: 10
 * });
 *
 * // Subscribe to real-time events
 * const subscribeResult = await adapter.subscribe((event) => {
 *   console.log("Job event:", event);
 * });
 *
 * // Cleanup
 * await adapter.disconnect();
 * ```
 */
export interface QueueAdapter {
  /**
   * Connect to the queue backend (e.g., Redis server).
   *
   * Establishes a connection using the provided connection string.
   * Must be called before any other adapter methods.
   *
   * @param connectionString - Connection string for the queue backend.
   *                          For Redis: "redis://host:port" or "redis://host:port/db"
   * @returns Result<void, Error> - Ok if connection successful, Err with error details if failed
   *
   * @example
   * ```typescript
   * const result = await adapter.connect("redis://localhost:6379");
   * if (!result.ok) {
   *   console.error("Failed to connect:", result.error.message);
   * }
   * ```
   */
  connect(connectionString: string): Promise<Result<void, Error>>;

  /**
   * Disconnect from the queue backend and cleanup all resources.
   *
   * Closes all Redis connections, unsubscribes from channels, and releases resources.
   * Safe to call multiple times - subsequent calls are no-ops.
   *
   * @returns Result<void, Error> - Ok if disconnection successful, Err if cleanup failed
   *
   * @example
   * ```typescript
   * const result = await adapter.disconnect();
   * if (!result.ok) {
   *   console.error("Error during disconnect:", result.error.message);
   * }
   * ```
   */
  disconnect(): Promise<Result<void, Error>>;

  /**
   * List all queues with their current job counts.
   *
   * Auto-discovers queues by scanning for queue metadata keys in the backend.
   * For BullMQ, this scans for bull:*:meta keys in Redis.
   *
   * @returns Result<Queue[], Error> - Ok with array of queues, Err if discovery failed
   *
   * @example
   * ```typescript
   * const result = await adapter.listQueues();
   * if (result.ok) {
   *   result.value.forEach(queue => {
   *     console.log(`${queue.name}: ${queue.waiting} waiting, ${queue.failed} failed`);
   *   });
   * }
   * ```
   */
  listQueues(): Promise<Result<Queue[], Error>>;

  /**
   * Retrieve paginated jobs from a queue filtered by status.
   *
   * Returns jobs in the specified state (waiting, active, completed, failed, delayed).
   * Supports pagination via offset and limit for efficient querying of large queues.
   *
   * @param options - Query options including queue name, status, and pagination
   * @returns Result<Job[], Error> - Ok with array of jobs, Err if retrieval failed
   *
   * @example
   * ```typescript
   * const result = await adapter.getJobs({
   *   queueName: "email-queue",
   *   status: JobStatus.Failed,
   *   offset: 0,
   *   limit: 50
   * });
   *
   * if (result.ok) {
   *   result.value.forEach(job => {
   *     console.log(`Job ${job.id}: ${job.error}`);
   *   });
   * }
   * ```
   */
  getJobs(options: GetJobsOptions): Promise<Result<Job[], Error>>;

  /**
   * Retrieve full details for a specific job by ID.
   *
   * Returns complete job information including data payload, error details,
   * stack trace, attempt history, and all timestamps.
   *
   * @param queueName - The name of the queue containing the job
   * @param jobId - The unique identifier of the job
   * @returns Result<Job, Error> - Ok with job details, Err if job not found or retrieval failed
   *
   * @example
   * ```typescript
   * const result = await adapter.getJob("email-queue", "12345");
   * if (result.ok) {
   *   const job = result.value;
   *   console.log(`Job data:`, job.data);
   *   if (job.error) {
   *     console.log(`Error: ${job.error}`);
   *     console.log(`Stack: ${job.stacktrace}`);
   *   }
   * } else {
   *   console.error("Job not found or error:", result.error.message);
   * }
   * ```
   */
  getJob(queueName: string, jobId: string): Promise<Result<Job, Error>>;

  /**
   * Calculate performance metrics for a queue.
   *
   * Computes throughput (jobs/hour), failure rate (failed/total), and
   * average processing time based on recent job history.
   *
   * @param queueName - The name of the queue to analyze
   * @returns Result<Metrics, Error> - Ok with metrics data, Err if calculation failed
   *
   * @example
   * ```typescript
   * const result = await adapter.getMetrics("email-queue");
   * if (result.ok) {
   *   const m = result.value;
   *   console.log(`Throughput: ${m.throughput.toFixed(1)} jobs/hour`);
   *   console.log(`Failure rate: ${(m.failureRate * 100).toFixed(2)}%`);
   *   console.log(`Avg processing time: ${m.avgProcessingTime}ms`);
   * }
   * ```
   */
  getMetrics(queueName: string): Promise<Result<Metrics, Error>>;

  /**
   * Subscribe to real-time job events via backend notifications.
   *
   * Receives callbacks for job state changes (added, completed, failed, etc.)
   * using the backend's pub/sub mechanism. For Redis, this uses keyspace notifications.
   *
   * Note: Redis keyspace notifications must be enabled (notify-keyspace-events config).
   *
   * @param callback - Function to call when job events occur
   * @returns Result<void, Error> - Ok if subscription successful, Err if setup failed
   *
   * @example
   * ```typescript
   * const result = await adapter.subscribe((event) => {
   *   console.log(`[${event.queueName}] Job ${event.jobId}: ${event.eventType}`);
   *   if (event.eventType === 'failed') {
   *     // Alert on-call engineer
   *   }
   * });
   *
   * if (!result.ok) {
   *   console.error("Failed to subscribe:", result.error.message);
   * }
   * ```
   */
  subscribe(callback: JobEventCallback): Promise<Result<void, Error>>;
}
