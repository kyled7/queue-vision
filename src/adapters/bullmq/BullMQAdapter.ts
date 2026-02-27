/**
 * BullMQ adapter for QueueVision.
 *
 * Implements the QueueAdapter interface by reading BullMQ data structures directly
 * from Redis using ioredis. Does NOT import BullMQ as a dependency to avoid version coupling.
 *
 * This adapter connects to Redis and reads BullMQ's key patterns:
 * - bull:{queueName}:meta - Queue metadata
 * - bull:{queueName}:wait - Waiting jobs list
 * - bull:{queueName}:active - Active jobs list
 * - bull:{queueName}:completed - Completed jobs sorted set
 * - bull:{queueName}:failed - Failed jobs sorted set
 * - bull:{queueName}:delayed - Delayed jobs sorted set
 * - bull:{queueName}:{jobId} - Job data hash
 *
 * @module BullMQAdapter
 */

import Redis from 'ioredis';
import {
  QueueAdapter,
  GetJobsOptions,
  JobEventCallback,
  Metrics,
} from '../QueueAdapter';
import { Result } from '../../types/result';
import { Queue, ConnectionInfo } from '../../types/queue';
import { Job, JobStatus } from '../../types/job';
import { Ok, Err } from '../../utils/result';

/**
 * BullMQ adapter implementation.
 *
 * Connects to Redis and reads BullMQ queue data structures directly without
 * importing the BullMQ library. This enables monitoring BullMQ queues from
 * external services without version coupling.
 *
 * @example
 * ```typescript
 * const adapter = new BullMQAdapter();
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
 *   console.log("Queues:", queuesResult.value);
 * }
 *
 * // Cleanup
 * await adapter.disconnect();
 * ```
 */
export class BullMQAdapter implements QueueAdapter {
  /**
   * Primary Redis client for reading queue data.
   *
   * Initialized when connect() is called, null before connection.
   * Used for all queue and job read operations.
   */
  private client: Redis | null = null;

  /**
   * Redis subscriber client for keyspace notifications.
   *
   * Created when subscribe() is called, null before subscription.
   * Separate from primary client as pub/sub clients cannot execute regular commands.
   */
  private subscriber: Redis | null = null;

  /**
   * Create a new BullMQAdapter instance.
   *
   * The adapter starts unconnected. Call connect() before using other methods.
   *
   * @example
   * ```typescript
   * const adapter = new BullMQAdapter();
   * await adapter.connect("redis://localhost:6379");
   * ```
   */
  constructor() {
    this.client = null;
  }

  /**
   * Connect to Redis server.
   *
   * Parses the connection string and establishes a Redis connection.
   * Must be called before any other adapter methods.
   *
   * @param connectionString - Redis connection string (redis://host:port or redis://host:port/db)
   * @returns Result<void, Error> - Ok if connection successful, Err if failed
   */
  async connect(connectionString: string): Promise<Result<void, Error>> {
    try {
      // Validate connection string format
      if (!connectionString.startsWith('redis://')) {
        return Err(
          new Error(
            'Invalid connection string format. Expected redis://host:port'
          )
        );
      }

      // Create Redis client (ioredis supports redis:// URLs directly)
      this.client = new Redis(connectionString, {
        maxRetriesPerRequest: null, // Required for blocking commands in BullMQ
      });

      // Wait for connection to be ready or fail
      return await new Promise<Result<void, Error>>((resolve) => {
        if (!this.client) {
          resolve(Err(new Error('Client initialization failed')));
          return;
        }

        this.client.once('ready', () => {
          resolve(Ok(undefined));
        });

        this.client.once('error', (error: Error) => {
          // Cleanup on connection failure
          if (this.client) {
            this.client.disconnect();
            this.client = null;
          }
          resolve(Err(error));
        });
      });
    } catch (error) {
      // Handle any unexpected errors during setup
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Disconnect from Redis and cleanup resources.
   *
   * Closes all Redis connections (client and subscriber if active).
   * Safe to call multiple times.
   *
   * @returns Result<void, Error> - Ok if disconnection successful, Err if cleanup failed
   */
  async disconnect(): Promise<Result<void, Error>> {
    try {
      // Track if we had any connections to clean up
      const hadClient = this.client !== null;
      const hadSubscriber = this.subscriber !== null;

      // No connections to disconnect
      if (!hadClient && !hadSubscriber) {
        return Ok(undefined);
      }

      // Cleanup subscriber first (if exists)
      if (this.subscriber) {
        try {
          // Unsubscribe from all patterns
          await this.subscriber.punsubscribe();
          // Close subscriber connection
          await this.subscriber.quit();
        } catch (subError) {
          // Force disconnect on error
          this.subscriber.disconnect();
        } finally {
          this.subscriber = null;
        }
      }

      // Cleanup primary client
      if (this.client) {
        // Gracefully close Redis connection (waits for pending commands)
        await this.client.quit();
        this.client = null;
      }

      return Ok(undefined);
    } catch (error) {
      // Fallback to forceful disconnect on error
      if (this.subscriber) {
        this.subscriber.disconnect();
        this.subscriber = null;
      }
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * List all BullMQ queues with their job counts.
   *
   * Auto-discovers queues by scanning for bull:*:meta keys in Redis.
   * Returns queue names with counts for each job status.
   *
   * @returns Result<Queue[], Error> - Ok with array of queues, Err if discovery failed
   */
  async listQueues(): Promise<Result<Queue[], Error>> {
    try {
      // Verify Redis connection is established
      if (!this.client) {
        return Err(new Error('Not connected to Redis. Call connect() first.'));
      }

      // Use SCAN to find all bull:*:meta keys (auto-discovery)
      const metaKeys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'bull:*:meta',
          'COUNT',
          '100'
        );
        cursor = nextCursor;
        metaKeys.push(...keys);
      } while (cursor !== '0');

      // Extract queue names and fetch job counts for each
      const queues: Queue[] = [];

      for (const metaKey of metaKeys) {
        // Extract queue name from bull:{queueName}:meta pattern
        const match = metaKey.match(/^bull:(.+):meta$/);
        if (!match) continue;

        const queueName = match[1];

        // Fetch job counts in parallel for performance
        // Lists: LLEN for wait/active, Sorted Sets: ZCARD for completed/failed/delayed
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            this.client.llen(`bull:${queueName}:wait`),
            this.client.llen(`bull:${queueName}:active`),
            this.client.zcard(`bull:${queueName}:completed`),
            this.client.zcard(`bull:${queueName}:failed`),
            this.client.zcard(`bull:${queueName}:delayed`),
          ]
        );

        // Extract connection info from client options
        const options = this.client.options;
        const connection: ConnectionInfo = {
          host: options.host || 'localhost',
          port: options.port || 6379,
          ...(options.db && options.db !== 0 ? { db: options.db } : {}),
        };

        queues.push({
          name: queueName,
          waiting,
          active,
          completed,
          failed,
          delayed,
          connection,
        });
      }

      return Ok(queues);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Retrieve paginated jobs from a queue filtered by status.
   *
   * Reads job IDs from the appropriate Redis data structure (list or sorted set)
   * based on the status, then fetches full job data for each ID.
   *
   * @param options - Query options including queue name, status, and pagination
   * @returns Result<Job[], Error> - Ok with array of jobs, Err if retrieval failed
   */
  async getJobs(options: GetJobsOptions): Promise<Result<Job[], Error>> {
    try {
      // Verify Redis connection is established
      if (!this.client) {
        return Err(new Error('Not connected to Redis. Call connect() first.'));
      }

      const { queueName, status, offset = 0, limit = 100 } = options;

      // Calculate Redis range indices (Redis uses 0-based indexing)
      const start = offset;
      const stop = offset + limit - 1;

      // Fetch job IDs based on status using appropriate Redis data structure
      let jobIds: string[];

      switch (status) {
        case 'waiting':
          // Waiting jobs are stored in a Redis list (bull:{queue}:wait)
          jobIds = await this.client.lrange(
            `bull:${queueName}:wait`,
            start,
            stop
          );
          break;

        case 'active':
          // Active jobs are stored in a Redis list (bull:{queue}:active)
          jobIds = await this.client.lrange(
            `bull:${queueName}:active`,
            start,
            stop
          );
          break;

        case 'completed':
          // Completed jobs are stored in a sorted set (bull:{queue}:completed)
          // Sorted by completion timestamp, newest first (use ZREVRANGE for reverse order)
          jobIds = await this.client.zrevrange(
            `bull:${queueName}:completed`,
            start,
            stop
          );
          break;

        case 'failed':
          // Failed jobs are stored in a sorted set (bull:{queue}:failed)
          // Sorted by failure timestamp, newest first
          jobIds = await this.client.zrevrange(
            `bull:${queueName}:failed`,
            start,
            stop
          );
          break;

        case 'delayed':
          // Delayed jobs are stored in a sorted set (bull:{queue}:delayed)
          // Sorted by delay timestamp (when they should be promoted to waiting)
          jobIds = await this.client.zrange(
            `bull:${queueName}:delayed`,
            start,
            stop
          );
          break;

        default:
          return Err(new Error(`Unknown job status: ${status}`));
      }

      // Fetch full job data for each ID in parallel
      const jobResults = await Promise.all(
        jobIds.map((jobId) => this.fetchJobData(queueName, jobId, status))
      );

      // Filter out any failed fetches and extract successful jobs
      const jobs: Job[] = [];
      for (const result of jobResults) {
        if (result.ok) {
          jobs.push(result.value);
        }
        // Skip jobs that failed to fetch (they may have been deleted)
      }

      return Ok(jobs);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch and parse job data from Redis hash.
   *
   * Helper method that reads the job hash from Redis and parses all fields
   * into a Job object. Used by both getJobs() and getJob().
   *
   * @param queueName - The name of the queue containing the job
   * @param jobId - The unique identifier of the job
   * @param status - The current status of the job
   * @returns Result<Job, Error> - Ok with job data, Err if job not found or parsing failed
   */
  private async fetchJobData(
    queueName: string,
    jobId: string,
    status: JobStatus
  ): Promise<Result<Job, Error>> {
    try {
      if (!this.client) {
        return Err(new Error('Not connected to Redis'));
      }

      // Fetch all fields from job hash (bull:{queue}:{jobId})
      const jobData = await this.client.hgetall(`bull:${queueName}:${jobId}`);

      // Job not found or deleted
      if (!jobData || Object.keys(jobData).length === 0) {
        return Err(new Error(`Job ${jobId} not found in queue ${queueName}`));
      }

      // Parse job fields from Redis hash
      // BullMQ stores data as JSON strings in the hash
      const job: Job = {
        id: jobId,
        queueName,
        data: jobData.data ? JSON.parse(jobData.data) : null,
        status,
        error: jobData.failedReason || null,
        stacktrace: jobData.stacktrace ? JSON.parse(jobData.stacktrace) : null,
        attempts: parseInt(jobData.attemptsMade || '0', 10),
        maxAttempts: jobData.opts
          ? JSON.parse(jobData.opts).attempts
          : undefined,
        timestamp: parseInt(jobData.timestamp || '0', 10),
        processedOn: jobData.processedOn
          ? parseInt(jobData.processedOn, 10)
          : null,
        finishedOn: jobData.finishedOn
          ? parseInt(jobData.finishedOn, 10)
          : null,
        returnvalue: jobData.returnvalue
          ? JSON.parse(jobData.returnvalue)
          : undefined,
        delay: jobData.delay ? parseInt(jobData.delay, 10) : undefined,
      };

      return Ok(job);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Retrieve full details for a specific job by ID.
   *
   * Reads the job hash from Redis and parses all fields including data,
   * error information, timestamps, and execution metadata.
   *
   * @param queueName - The name of the queue containing the job
   * @param jobId - The unique identifier of the job
   * @returns Result<Job, Error> - Ok with job details, Err if job not found or retrieval failed
   */
  async getJob(queueName: string, jobId: string): Promise<Result<Job, Error>> {
    try {
      // Verify Redis connection is established
      if (!this.client) {
        return Err(new Error('Not connected to Redis. Call connect() first.'));
      }

      // Determine job status by checking which Redis data structure contains the job ID
      // Check in order: waiting, active, completed, failed, delayed

      // Check waiting list (LPOS returns position or null)
      const waitingPos = await this.client.lpos(`bull:${queueName}:wait`, jobId);
      if (waitingPos !== null) {
        return await this.fetchJobData(queueName, jobId, JobStatus.Waiting);
      }

      // Check active list
      const activePos = await this.client.lpos(`bull:${queueName}:active`, jobId);
      if (activePos !== null) {
        return await this.fetchJobData(queueName, jobId, JobStatus.Active);
      }

      // Check completed sorted set (ZSCORE returns score or null)
      const completedScore = await this.client.zscore(
        `bull:${queueName}:completed`,
        jobId
      );
      if (completedScore !== null) {
        return await this.fetchJobData(queueName, jobId, JobStatus.Completed);
      }

      // Check failed sorted set
      const failedScore = await this.client.zscore(
        `bull:${queueName}:failed`,
        jobId
      );
      if (failedScore !== null) {
        return await this.fetchJobData(queueName, jobId, JobStatus.Failed);
      }

      // Check delayed sorted set
      const delayedScore = await this.client.zscore(
        `bull:${queueName}:delayed`,
        jobId
      );
      if (delayedScore !== null) {
        return await this.fetchJobData(queueName, jobId, JobStatus.Delayed);
      }

      // Job not found in any data structure
      return Err(new Error(`Job ${jobId} not found in queue ${queueName}`));
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate performance metrics for a queue.
   *
   * Computes throughput (jobs/hour), failure rate, and average processing time
   * by analyzing recent completed and failed jobs.
   *
   * @param queueName - The name of the queue to analyze
   * @returns Result<Metrics, Error> - Ok with metrics data, Err if calculation failed
   */
  async getMetrics(queueName: string): Promise<Result<Metrics, Error>> {
    try {
      // Verify Redis connection is established
      if (!this.client) {
        return Err(new Error('Not connected to Redis. Call connect() first.'));
      }

      // Fetch last 100 completed and failed jobs with their timestamps (scores)
      // Using ZREVRANGE with WITHSCORES to get job IDs and completion timestamps
      const [completedWithScores, failedWithScores] = await Promise.all([
        this.client.zrevrange(
          `bull:${queueName}:completed`,
          0,
          99,
          'WITHSCORES'
        ),
        this.client.zrevrange(`bull:${queueName}:failed`, 0, 99, 'WITHSCORES'),
      ]);

      // Parse results (Redis returns [id1, score1, id2, score2, ...])
      const completedJobs: Array<{ id: string; timestamp: number }> = [];
      for (let i = 0; i < completedWithScores.length; i += 2) {
        completedJobs.push({
          id: completedWithScores[i],
          timestamp: parseFloat(completedWithScores[i + 1]),
        });
      }

      const failedJobs: Array<{ id: string; timestamp: number }> = [];
      for (let i = 0; i < failedWithScores.length; i += 2) {
        failedJobs.push({
          id: failedWithScores[i],
          timestamp: parseFloat(failedWithScores[i + 1]),
        });
      }

      // Calculate throughput (jobs/hour) from jobs in the last hour
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      const recentCompleted = completedJobs.filter(
        (job) => job.timestamp >= oneHourAgo
      );
      const recentFailed = failedJobs.filter(
        (job) => job.timestamp >= oneHourAgo
      );

      const throughput = recentCompleted.length + recentFailed.length;

      // Calculate failure rate (failed / total)
      const totalJobs = completedJobs.length + failedJobs.length;
      const failureRate = totalJobs > 0 ? failedJobs.length / totalJobs : 0;

      // Calculate average processing time from completed jobs
      // Need to fetch job data to get processedOn and finishedOn timestamps
      let totalProcessingTime = 0;
      let processedJobCount = 0;

      // Fetch full job data for completed jobs to calculate processing time
      for (const job of completedJobs) {
        const jobDataResult = await this.fetchJobData(
          queueName,
          job.id,
          JobStatus.Completed
        );

        if (
          jobDataResult.ok &&
          jobDataResult.value.processedOn !== null &&
          jobDataResult.value.finishedOn !== null
        ) {
          const processingTime =
            jobDataResult.value.finishedOn - jobDataResult.value.processedOn;
          totalProcessingTime += processingTime;
          processedJobCount++;
        }
      }

      const avgProcessingTime =
        processedJobCount > 0 ? totalProcessingTime / processedJobCount : 0;

      return Ok({
        throughput,
        failureRate,
        avgProcessingTime,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Subscribe to real-time job events via Redis keyspace notifications.
   *
   * Creates a subscriber client and listens for keyspace events on bull:* keys.
   * Requires Redis keyspace notifications to be enabled (notify-keyspace-events).
   *
   * @param callback - Function to call when job events occur
   * @returns Result<void, Error> - Ok if subscription successful, Err if setup failed
   */
  async subscribe(callback: JobEventCallback): Promise<Result<void, Error>> {
    try {
      // Verify Redis connection is established
      if (!this.client) {
        return Err(new Error('Not connected to Redis. Call connect() first.'));
      }

      // Avoid duplicate subscriptions
      if (this.subscriber) {
        return Err(
          new Error('Already subscribed. Call disconnect() to unsubscribe.')
        );
      }

      // Create separate subscriber client (pub/sub clients can't run regular commands)
      // Clone connection options from primary client
      const options = this.client.options;
      this.subscriber = new Redis({
        host: options.host,
        port: options.port,
        db: options.db,
        password: options.password,
        maxRetriesPerRequest: null,
      });

      // Wait for subscriber to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.subscriber) {
          reject(new Error('Subscriber initialization failed'));
          return;
        }

        this.subscriber.once('ready', () => resolve());
        this.subscriber.once('error', (error: Error) => reject(error));
      });

      // Subscribe to keyspace notifications for all bull:* keys
      // Pattern: __keyspace@0__:bull:* (db 0 is default, adjust if using different db)
      const db = options.db || 0;
      const pattern = `__keyspace@${db}__:bull:*`;

      await this.subscriber.psubscribe(pattern);

      // Set up event handler for keyspace notifications
      this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
        try {
          // Parse keyspace notification
          // Channel format: __keyspace@0__:bull:{queueName}:{key}
          // Message: operation type (e.g., "set", "del", "lpush", "zadd")

          const event = this.parseKeyspaceEvent(channel, message);
          if (event) {
            callback(event);
          }
        } catch (error) {
          // Log error but don't throw - don't want to break subscription
          // In production, could emit error events or use logging framework
        }
      });

      return Ok(undefined);
    } catch (error) {
      // Cleanup on subscription failure
      if (this.subscriber) {
        this.subscriber.disconnect();
        this.subscriber = null;
      }
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Parse Redis keyspace notification into JobEvent.
   *
   * Extracts queue name, job ID, and event type from keyspace notification channel and message.
   * Returns null if the notification doesn't match expected BullMQ patterns.
   *
   * @param channel - Keyspace notification channel (e.g., __keyspace@0__:bull:myqueue:123)
   * @param message - Operation type (e.g., "set", "del", "lpush", "zadd")
   * @returns JobEvent if parseable, null if not a relevant BullMQ event
   */
  private parseKeyspaceEvent(
    channel: string,
    message: string
  ): JobEvent | null {
    // Extract key from channel: __keyspace@0__:bull:{queueName}:{key}
    const keyMatch = channel.match(/^__keyspace@\d+__:bull:(.+)$/);
    if (!keyMatch) return null;

    const keyPart = keyMatch[1]; // e.g., "myqueue:123" or "myqueue:wait"

    // Split into queue name and key suffix
    const parts = keyPart.split(':');
    if (parts.length < 2) return null;

    const queueName = parts[0];
    const keySuffix = parts.slice(1).join(':'); // Handle job IDs with colons

    // Determine event type based on key pattern and operation
    let eventType: string;
    let jobId: string;

    // Job-specific events (bull:{queue}:{jobId})
    if (keySuffix !== 'wait' &&
        keySuffix !== 'active' &&
        keySuffix !== 'completed' &&
        keySuffix !== 'failed' &&
        keySuffix !== 'delayed' &&
        keySuffix !== 'meta') {
      // This is a job hash (bull:{queue}:{jobId})
      jobId = keySuffix;

      // Map Redis operation to BullMQ event
      switch (message) {
        case 'hset':
        case 'hmset':
          eventType = 'updated';
          break;
        case 'del':
          eventType = 'removed';
          break;
        default:
          eventType = message; // Use raw operation as fallback
      }
    }
    // Queue list/set events (bull:{queue}:wait, etc.)
    else {
      // For list/set operations, infer job state changes
      // Note: We can't reliably extract job ID from list operations without additional queries
      // So we use a generic event with empty job ID
      jobId = '';

      switch (keySuffix) {
        case 'wait':
          if (message === 'lpush' || message === 'rpush') {
            eventType = 'waiting';
          } else if (message === 'lrem') {
            eventType = 'dequeued';
          } else {
            eventType = message;
          }
          break;
        case 'active':
          if (message === 'lpush' || message === 'rpush') {
            eventType = 'active';
          } else {
            eventType = message;
          }
          break;
        case 'completed':
          if (message === 'zadd') {
            eventType = 'completed';
          } else {
            eventType = message;
          }
          break;
        case 'failed':
          if (message === 'zadd') {
            eventType = 'failed';
          } else {
            eventType = message;
          }
          break;
        case 'delayed':
          if (message === 'zadd') {
            eventType = 'delayed';
          } else {
            eventType = message;
          }
          break;
        default:
          // Other BullMQ keys (meta, etc.) - ignore or use raw operation
          return null;
      }
    }

    return {
      eventType,
      queueName,
      jobId,
      timestamp: Date.now(),
    };
  }
}
