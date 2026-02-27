/**
 * Queue domain types for representing BullMQ queue metadata and status.
 *
 * @module queue
 */

/**
 * Represents a BullMQ queue with its name, job status counts, and connection information.
 *
 * @example
 * ```typescript
 * const queue: Queue = {
 *   name: "email-queue",
 *   waiting: 10,
 *   active: 2,
 *   completed: 150,
 *   failed: 3,
 *   delayed: 5,
 *   connection: {
 *     host: "localhost",
 *     port: 6379
 *   }
 * };
 * ```
 */
export interface Queue {
  /**
   * The unique name of the queue.
   */
  readonly name: string;

  /**
   * Number of jobs waiting to be processed.
   */
  readonly waiting: number;

  /**
   * Number of jobs currently being processed.
   */
  readonly active: number;

  /**
   * Number of jobs that have completed successfully.
   */
  readonly completed: number;

  /**
   * Number of jobs that have failed.
   */
  readonly failed: number;

  /**
   * Number of jobs that are delayed (scheduled for future execution).
   */
  readonly delayed: number;

  /**
   * Redis connection information for this queue.
   */
  readonly connection: ConnectionInfo;
}

/**
 * Redis connection information.
 */
export interface ConnectionInfo {
  /**
   * Redis server hostname or IP address.
   */
  readonly host: string;

  /**
   * Redis server port.
   */
  readonly port: number;

  /**
   * Optional database number (default: 0).
   */
  readonly db?: number;
}

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
