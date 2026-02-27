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
