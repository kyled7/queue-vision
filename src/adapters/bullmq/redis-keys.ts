/**
 * Helper functions for generating BullMQ Redis key patterns.
 *
 * BullMQ stores queue and job data in Redis using a specific key structure.
 * These helpers ensure consistent key generation across the adapter.
 *
 * @module redis-keys
 */

/**
 * Get the meta key pattern for queue discovery.
 *
 * The meta key stores queue metadata like options and configuration.
 * Used with SCAN to discover all existing queues: `bull:*:meta`
 *
 * @param queueName - The name of the queue (optional, use '*' for pattern matching)
 * @returns Redis key for queue metadata
 *
 * @example
 * ```typescript
 * getMetaKey("email-queue")  // => "bull:email-queue:meta"
 * getMetaKey("*")            // => "bull:*:meta" (for SCAN pattern)
 * ```
 */
export function getMetaKey(queueName: string): string {
  return `bull:${queueName}:meta`;
}

/**
 * Get the wait key for a queue.
 *
 * The wait key is a Redis LIST containing job IDs waiting to be processed.
 * Jobs are added to the tail (RPUSH) and workers pop from the head (LPOP).
 *
 * @param queueName - The name of the queue
 * @returns Redis key for waiting jobs list
 *
 * @example
 * ```typescript
 * getWaitKey("email-queue")  // => "bull:email-queue:wait"
 * ```
 */
export function getWaitKey(queueName: string): string {
  return `bull:${queueName}:wait`;
}

/**
 * Get the active key for a queue.
 *
 * The active key is a Redis LIST containing job IDs currently being processed by workers.
 * Jobs move from wait to active when picked up, and are removed when completed/failed.
 *
 * @param queueName - The name of the queue
 * @returns Redis key for active jobs list
 *
 * @example
 * ```typescript
 * getActiveKey("email-queue")  // => "bull:email-queue:active"
 * ```
 */
export function getActiveKey(queueName: string): string {
  return `bull:${queueName}:active`;
}

/**
 * Get the completed key for a queue.
 *
 * The completed key is a Redis SORTED SET containing job IDs that finished successfully.
 * Score is the completion timestamp, enabling time-based queries and retention policies.
 *
 * @param queueName - The name of the queue
 * @returns Redis key for completed jobs sorted set
 *
 * @example
 * ```typescript
 * getCompletedKey("email-queue")  // => "bull:email-queue:completed"
 * ```
 */
export function getCompletedKey(queueName: string): string {
  return `bull:${queueName}:completed`;
}

/**
 * Get the failed key for a queue.
 *
 * The failed key is a Redis SORTED SET containing job IDs that failed after max retries.
 * Score is the failure timestamp, preserving failure history for debugging.
 *
 * @param queueName - The name of the queue
 * @returns Redis key for failed jobs sorted set
 *
 * @example
 * ```typescript
 * getFailedKey("email-queue")  // => "bull:email-queue:failed"
 * ```
 */
export function getFailedKey(queueName: string): string {
  return `bull:${queueName}:failed`;
}

/**
 * Get the delayed key for a queue.
 *
 * The delayed key is a Redis SORTED SET containing job IDs scheduled for future execution.
 * Score is the timestamp when the job should move to the wait list.
 *
 * @param queueName - The name of the queue
 * @returns Redis key for delayed jobs sorted set
 *
 * @example
 * ```typescript
 * getDelayedKey("email-queue")  // => "bull:email-queue:delayed"
 * ```
 */
export function getDelayedKey(queueName: string): string {
  return `bull:${queueName}:delayed`;
}

/**
 * Get the job hash key for a specific job.
 *
 * The job key is a Redis HASH containing all job data including:
 * - data: JSON-serialized job payload
 * - opts: Job options (attempts, delay, etc.)
 * - returnvalue: Job result (for completed jobs)
 * - stacktrace: Error stack trace (for failed jobs)
 * - failedReason: Error message (for failed jobs)
 * - timestamp: Creation timestamp
 * - processedOn: Processing start timestamp
 * - finishedOn: Completion/failure timestamp
 *
 * @param queueName - The name of the queue
 * @param jobId - The unique job identifier
 * @returns Redis key for job hash
 *
 * @example
 * ```typescript
 * getJobKey("email-queue", "123")  // => "bull:email-queue:123"
 * ```
 */
export function getJobKey(queueName: string, jobId: string): string {
  return `bull:${queueName}:${jobId}`;
}
