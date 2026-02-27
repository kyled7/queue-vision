/**
 * Job domain types for representing BullMQ job data and state.
 *
 * @module job
 */

/**
 * Enumeration of possible job statuses in BullMQ.
 *
 * @example
 * ```typescript
 * const status: JobStatus = JobStatus.Completed;
 * if (job.status === JobStatus.Failed) {
 *   console.log('Job failed:', job.error);
 * }
 * ```
 */
export enum JobStatus {
  /**
   * Job is waiting in the queue to be processed.
   */
  Waiting = "waiting",

  /**
   * Job is currently being processed by a worker.
   */
  Active = "active",

  /**
   * Job has completed successfully.
   */
  Completed = "completed",

  /**
   * Job has failed after all retry attempts.
   */
  Failed = "failed",

  /**
   * Job is delayed and scheduled for future execution.
   */
  Delayed = "delayed",
}

/**
 * Represents a BullMQ job with its data, status, error information, and execution metadata.
 *
 * Jobs contain the work payload, current execution state, error details (if failed),
 * attempt history, and timestamps tracking the job lifecycle.
 *
 * @example
 * ```typescript
 * const job: Job = {
 *   id: "123",
 *   queueName: "email-queue",
 *   data: { to: "user@example.com", subject: "Welcome" },
 *   status: "completed",
 *   error: null,
 *   stacktrace: null,
 *   attempts: 1,
 *   maxAttempts: 3,
 *   timestamp: 1640000000000,
 *   processedOn: 1640000001000,
 *   finishedOn: 1640000005000
 * };
 * ```
 */
export interface Job {
  /**
   * The unique identifier for this job within its queue.
   */
  readonly id: string;

  /**
   * The name of the queue this job belongs to.
   */
  readonly queueName: string;

  /**
   * The job payload data (any JSON-serializable value).
   *
   * This is the actual work data passed when the job was created.
   */
  readonly data: unknown;

  /**
   * The current status of the job.
   */
  readonly status: JobStatus;

  /**
   * Error message if the job failed, null otherwise.
   *
   * This is the human-readable error message from the last failed attempt.
   */
  readonly error: string | null;

  /**
   * Stack trace if the job failed, null otherwise.
   *
   * Contains the full stack trace from the exception that caused the failure.
   */
  readonly stacktrace: string | null;

  /**
   * The number of times this job has been attempted.
   *
   * Starts at 0 for new jobs, increments with each processing attempt.
   */
  readonly attempts: number;

  /**
   * The maximum number of attempts allowed before the job is permanently failed.
   *
   * If undefined, the queue's default max attempts is used.
   */
  readonly maxAttempts?: number;

  /**
   * Unix timestamp (milliseconds) when the job was created.
   *
   * This is the time the job was first added to the queue.
   */
  readonly timestamp: number;

  /**
   * Unix timestamp (milliseconds) when the job started processing, or null if not yet processed.
   *
   * This marks when a worker picked up the job and began execution.
   */
  readonly processedOn: number | null;

  /**
   * Unix timestamp (milliseconds) when the job finished (completed or failed), or null if still active.
   *
   * For completed jobs, this is when success was recorded.
   * For failed jobs, this is when the final failure occurred.
   */
  readonly finishedOn: number | null;

  /**
   * Return value from the job processor if completed successfully, null otherwise.
   *
   * This is the value returned by the job handler function.
   */
  readonly returnvalue?: unknown;

  /**
   * Unix timestamp (milliseconds) when a delayed job should be promoted to waiting, or null if not delayed.
   *
   * Only applicable for jobs in the "delayed" status.
   */
  readonly delay?: number;
}

/**
 * Represents a real-time event notification for job state changes.
 *
 * JobEvents are emitted by the subscribe() method when Redis keyspace notifications
 * detect changes to BullMQ job keys. These enable real-time monitoring of queue activity.
 *
 * @example
 * ```typescript
 * adapter.subscribe((event: JobEvent) => {
 *   console.log(`Job ${event.jobId} in ${event.queueName}: ${event.eventType}`);
 *   if (event.eventType === 'failed') {
 *     // Handle job failure
 *   }
 * });
 * ```
 */
export interface JobEvent {
  /**
   * The type of event that occurred.
   *
   * Common values: "added", "completed", "failed", "active", "delayed", "removed"
   */
  readonly eventType: string;

  /**
   * The name of the queue where the event occurred.
   */
  readonly queueName: string;

  /**
   * The unique identifier of the job that triggered the event.
   */
  readonly jobId: string;

  /**
   * Unix timestamp (milliseconds) when the event was detected.
   */
  readonly timestamp: number;
}
