/**
 * Unit tests for BullMQAdapter.
 *
 * These tests verify that the BullMQAdapter correctly implements the QueueAdapter
 * interface by mocking Redis client operations.
 */

import { BullMQAdapter } from '../BullMQAdapter';
import { JobStatus } from '../../../types/job';
import Redis from 'ioredis';

// Mock ioredis module
jest.mock('ioredis');

/**
 * Type-safe mock Redis client for testing.
 * Provides Jest mock functions for all Redis methods used by BullMQAdapter.
 */
interface MockRedis {
  // Connection methods
  on: jest.Mock;
  once: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;

  // Key scanning and operations
  scan: jest.Mock;
  llen: jest.Mock;
  zcard: jest.Mock;
  lrange: jest.Mock;
  zrange: jest.Mock;
  zrevrange: jest.Mock;
  hgetall: jest.Mock;
  lpos: jest.Mock;
  zscore: jest.Mock;

  // Pub/sub methods
  psubscribe: jest.Mock;
  punsubscribe: jest.Mock;

  // Client configuration
  options: {
    host?: string;
    port?: number;
    db?: number;
    password?: string;
  };
}

/**
 * Create a mock Redis client with all required methods.
 * Returns a mock that behaves like a connected Redis client.
 */
function createMockRedis(): MockRedis {
  return {
    // Connection methods
    on: jest.fn(),
    once: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),

    // Key scanning and operations
    scan: jest.fn().mockResolvedValue(['0', []]),
    llen: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    lrange: jest.fn().mockResolvedValue([]),
    zrange: jest.fn().mockResolvedValue([]),
    zrevrange: jest.fn().mockResolvedValue([]),
    hgetall: jest.fn().mockResolvedValue({}),
    lpos: jest.fn().mockResolvedValue(null),
    zscore: jest.fn().mockResolvedValue(null),

    // Pub/sub methods
    psubscribe: jest.fn().mockResolvedValue(undefined),
    punsubscribe: jest.fn().mockResolvedValue(undefined),

    // Client configuration
    options: {
      host: 'localhost',
      port: 6379,
      db: 0,
    },
  };
}

/**
 * Helper to simulate successful Redis connection.
 * Configures the mock to emit 'ready' event after connection attempt.
 */
function mockSuccessfulConnection(mockRedis: MockRedis): void {
  mockRedis.once.mockImplementation((event: string, callback: () => void) => {
    if (event === 'ready') {
      // Simulate async connection success
      setImmediate(() => callback());
    }
    return mockRedis;
  });
}

/**
 * Helper to simulate failed Redis connection.
 * Configures the mock to emit 'error' event after connection attempt.
 */
function mockFailedConnection(mockRedis: MockRedis, error: Error): void {
  mockRedis.once.mockImplementation(
    (event: string, callback: (err?: Error) => void) => {
      if (event === 'error') {
        // Simulate async connection failure
        setImmediate(() => callback(error));
      }
      return mockRedis;
    }
  );
}

describe('BullMQAdapter', () => {
  let adapter: BullMQAdapter;
  let mockRedis: MockRedis;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create fresh adapter instance
    adapter = new BullMQAdapter();

    // Create mock Redis client
    mockRedis = createMockRedis();

    // Configure Redis constructor to return our mock
    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);
  });

  afterEach(async () => {
    // Cleanup: disconnect adapter if connected
    await adapter.disconnect();
  });

  describe('constructor', () => {
    it('should create an adapter instance', () => {
      expect(adapter).toBeInstanceOf(BullMQAdapter);
    });

    it('should start in disconnected state', () => {
      // Adapter should not have created Redis client yet
      expect(Redis).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('should successfully connect to Redis with valid connection string', async () => {
      // Configure mock to simulate successful connection
      mockSuccessfulConnection(mockRedis);

      const result = await adapter.connect('redis://localhost:6379');

      expect(result.ok).toBe(true);
      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          maxRetriesPerRequest: null,
        })
      );
      expect(mockRedis.once).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedis.once).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should successfully connect with custom port', async () => {
      mockSuccessfulConnection(mockRedis);

      const result = await adapter.connect('redis://localhost:6380');

      expect(result.ok).toBe(true);
      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6380',
        expect.any(Object)
      );
    });

    it('should successfully connect with database number', async () => {
      mockSuccessfulConnection(mockRedis);

      const result = await adapter.connect('redis://localhost:6379/2');

      expect(result.ok).toBe(true);
      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379/2',
        expect.any(Object)
      );
    });

    it('should reject invalid connection string format', async () => {
      const result = await adapter.connect('localhost:6379');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(
          'Invalid connection string format'
        );
      }
      // Should not attempt to create Redis client for invalid format
      expect(Redis).not.toHaveBeenCalled();
    });

    it('should reject connection string without redis:// prefix', async () => {
      const result = await adapter.connect('http://localhost:6379');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(
          'Invalid connection string format'
        );
      }
      expect(Redis).not.toHaveBeenCalled();
    });

    it('should handle Redis connection failure', async () => {
      const connectionError = new Error('ECONNREFUSED: Connection refused');
      mockFailedConnection(mockRedis, connectionError);

      const result = await adapter.connect('redis://localhost:6379');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(connectionError);
      }
      // Should cleanup client on connection failure
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should handle Redis authentication failure', async () => {
      const authError = new Error('NOAUTH: Authentication required');
      mockFailedConnection(mockRedis, authError);

      const result = await adapter.connect('redis://localhost:6379');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Authentication required');
      }
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should pass maxRetriesPerRequest: null option to Redis client', async () => {
      mockSuccessfulConnection(mockRedis);

      await adapter.connect('redis://localhost:6379');

      expect(Redis).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxRetriesPerRequest: null,
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect when connected', async () => {
      // First connect
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Then disconnect
      const result = await adapter.disconnect();

      expect(result.ok).toBe(true);
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should return Ok when disconnecting without connection', async () => {
      // Disconnect without connecting first
      const result = await adapter.disconnect();

      expect(result.ok).toBe(true);
      // Should not attempt to quit non-existent client
      expect(mockRedis.quit).not.toHaveBeenCalled();
    });

    it('should handle multiple disconnect calls safely', async () => {
      // Connect first
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Disconnect twice
      const result1 = await adapter.disconnect();
      const result2 = await adapter.disconnect();

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      // quit() should only be called once (first disconnect)
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });

    it('should handle quit() failure by forcing disconnect', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Simulate quit() throwing an error
      const quitError = new Error('Connection already closed');
      mockRedis.quit.mockRejectedValue(quitError);

      const result = await adapter.disconnect();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Connection already closed');
      }
      // Should fallback to disconnect() on error
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should cleanup subscriber if present during disconnect', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Create a mock subscriber to simulate active subscription
      const mockSubscriber = createMockRedis();
      (adapter as any).subscriber = mockSubscriber;

      const result = await adapter.disconnect();

      expect(result.ok).toBe(true);
      // Should unsubscribe and quit subscriber first
      expect(mockSubscriber.punsubscribe).toHaveBeenCalled();
      expect(mockSubscriber.quit).toHaveBeenCalled();
      // Then quit main client
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should handle subscriber cleanup failure gracefully', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Create a mock subscriber that fails on punsubscribe
      const mockSubscriber = createMockRedis();
      mockSubscriber.punsubscribe.mockRejectedValue(
        new Error('Unsubscribe failed')
      );
      (adapter as any).subscriber = mockSubscriber;

      const result = await adapter.disconnect();

      expect(result.ok).toBe(true);
      // Should force disconnect subscriber on error
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
      // Should still cleanup main client
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should cleanup both client and subscriber on error', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Add subscriber
      const mockSubscriber = createMockRedis();
      (adapter as any).subscriber = mockSubscriber;

      // Make main client quit fail
      mockRedis.quit.mockRejectedValue(new Error('Quit failed'));

      const result = await adapter.disconnect();

      expect(result.ok).toBe(false);
      // Should force disconnect both clients
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });

  describe('listQueues', () => {
    it('should return empty array when no queues exist', async () => {
      // Connect first
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to return no keys
      mockRedis.scan.mockResolvedValue(['0', []]);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'bull:*:meta',
        'COUNT',
        '100'
      );
    });

    it('should discover single queue with accurate job counts', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to return one queue meta key
      mockRedis.scan.mockResolvedValue(['0', ['bull:email-queue:meta']]);

      // Mock job count queries
      mockRedis.llen.mockImplementation((key: string) => {
        if (key === 'bull:email-queue:wait') return Promise.resolve(5);
        if (key === 'bull:email-queue:active') return Promise.resolve(2);
        return Promise.resolve(0);
      });

      mockRedis.zcard.mockImplementation((key: string) => {
        if (key === 'bull:email-queue:completed') return Promise.resolve(100);
        if (key === 'bull:email-queue:failed') return Promise.resolve(3);
        if (key === 'bull:email-queue:delayed') return Promise.resolve(0);
        return Promise.resolve(0);
      });

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual({
          name: 'email-queue',
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3,
          delayed: 0,
          connection: {
            host: 'localhost',
            port: 6379,
          },
        });
      }

      // Verify parallel job count queries
      expect(mockRedis.llen).toHaveBeenCalledWith('bull:email-queue:wait');
      expect(mockRedis.llen).toHaveBeenCalledWith('bull:email-queue:active');
      expect(mockRedis.zcard).toHaveBeenCalledWith('bull:email-queue:completed');
      expect(mockRedis.zcard).toHaveBeenCalledWith('bull:email-queue:failed');
      expect(mockRedis.zcard).toHaveBeenCalledWith('bull:email-queue:delayed');
    });

    it('should discover multiple queues with different job counts', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to return multiple queue meta keys
      mockRedis.scan.mockResolvedValue([
        '0',
        ['bull:email-queue:meta', 'bull:video-processing:meta', 'bull:notifications:meta'],
      ]);

      // Mock job counts for different queues
      mockRedis.llen.mockImplementation((key: string) => {
        if (key === 'bull:email-queue:wait') return Promise.resolve(10);
        if (key === 'bull:email-queue:active') return Promise.resolve(1);
        if (key === 'bull:video-processing:wait') return Promise.resolve(0);
        if (key === 'bull:video-processing:active') return Promise.resolve(5);
        if (key === 'bull:notifications:wait') return Promise.resolve(50);
        if (key === 'bull:notifications:active') return Promise.resolve(0);
        return Promise.resolve(0);
      });

      mockRedis.zcard.mockImplementation((key: string) => {
        if (key === 'bull:email-queue:completed') return Promise.resolve(200);
        if (key === 'bull:email-queue:failed') return Promise.resolve(2);
        if (key === 'bull:email-queue:delayed') return Promise.resolve(0);
        if (key === 'bull:video-processing:completed') return Promise.resolve(50);
        if (key === 'bull:video-processing:failed') return Promise.resolve(10);
        if (key === 'bull:video-processing:delayed') return Promise.resolve(3);
        if (key === 'bull:notifications:completed') return Promise.resolve(1000);
        if (key === 'bull:notifications:failed') return Promise.resolve(0);
        if (key === 'bull:notifications:delayed') return Promise.resolve(25);
        return Promise.resolve(0);
      });

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);

        // Verify email-queue
        const emailQueue = result.value.find((q) => q.name === 'email-queue');
        expect(emailQueue).toEqual({
          name: 'email-queue',
          waiting: 10,
          active: 1,
          completed: 200,
          failed: 2,
          delayed: 0,
          connection: {
            host: 'localhost',
            port: 6379,
          },
        });

        // Verify video-processing queue
        const videoQueue = result.value.find((q) => q.name === 'video-processing');
        expect(videoQueue).toEqual({
          name: 'video-processing',
          waiting: 0,
          active: 5,
          completed: 50,
          failed: 10,
          delayed: 3,
          connection: {
            host: 'localhost',
            port: 6379,
          },
        });

        // Verify notifications queue
        const notifQueue = result.value.find((q) => q.name === 'notifications');
        expect(notifQueue).toEqual({
          name: 'notifications',
          waiting: 50,
          active: 0,
          completed: 1000,
          failed: 0,
          delayed: 25,
          connection: {
            host: 'localhost',
            port: 6379,
          },
        });
      }
    });

    it('should handle paginated SCAN results correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to return results across multiple pages
      let scanCallCount = 0;
      mockRedis.scan.mockImplementation((cursor: string) => {
        scanCallCount++;
        if (cursor === '0' && scanCallCount === 1) {
          // First call: return cursor for next page
          return Promise.resolve(['123', ['bull:queue1:meta', 'bull:queue2:meta']]);
        } else if (cursor === '123') {
          // Second call: return final page
          return Promise.resolve(['0', ['bull:queue3:meta']]);
        }
        return Promise.resolve(['0', []]);
      });

      // Mock job counts (all zeros for simplicity)
      mockRedis.llen.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value.map((q) => q.name).sort()).toEqual([
          'queue1',
          'queue2',
          'queue3',
        ]);
      }

      // Verify scan was called twice
      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.scan).toHaveBeenNthCalledWith(
        1,
        '0',
        'MATCH',
        'bull:*:meta',
        'COUNT',
        '100'
      );
      expect(mockRedis.scan).toHaveBeenNthCalledWith(
        2,
        '123',
        'MATCH',
        'bull:*:meta',
        'COUNT',
        '100'
      );
    });

    it('should include database number in connection info when non-zero', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379/2');

      // Update mock Redis client options to include db
      mockRedis.options.db = 2;

      mockRedis.scan.mockResolvedValue(['0', ['bull:test-queue:meta']]);
      mockRedis.llen.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toBeDefined();
        expect(result.value[0]!.connection).toEqual({
          host: 'localhost',
          port: 6379,
          db: 2,
        });
      }
    });

    it('should skip keys that do not match bull:*:meta pattern', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to return invalid keys mixed with valid ones
      mockRedis.scan.mockResolvedValue([
        '0',
        [
          'bull:valid-queue:meta',
          'bull:another-queue:wait', // Not a meta key
          'other-prefix:queue:meta', // Wrong prefix
          'bull::meta', // Empty queue name
        ],
      ]);

      mockRedis.llen.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only process valid meta key
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toBeDefined();
        expect(result.value[0]!.name).toBe('valid-queue');
      }
    });

    it('should return error when not connected', async () => {
      // Don't connect, just call listQueues
      const result = await adapter.listQueues();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Not connected to Redis');
      }

      // Should not attempt any Redis operations
      expect(mockRedis.scan).not.toHaveBeenCalled();
    });

    it('should handle Redis scan failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan to throw error
      const scanError = new Error('Redis connection lost');
      mockRedis.scan.mockRejectedValue(scanError);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(scanError);
      }
    });

    it('should handle job count query failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.scan.mockResolvedValue(['0', ['bull:test-queue:meta']]);

      // Mock llen to throw error
      const countError = new Error('LLEN operation failed');
      mockRedis.llen.mockRejectedValue(countError);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('LLEN operation failed');
      }
    });

    it('should handle queue names with special characters', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock scan with queue names containing special characters
      mockRedis.scan.mockResolvedValue([
        '0',
        [
          'bull:my-queue-123:meta',
          'bull:queue_with_underscores:meta',
          'bull:queue.with.dots:meta',
        ],
      ]);

      mockRedis.llen.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value.map((q) => q.name).sort()).toEqual([
          'my-queue-123',
          'queue.with.dots',
          'queue_with_underscores',
        ]);
      }
    });

    it('should extract connection info from Redis client options', async () => {
      mockSuccessfulConnection(mockRedis);

      // Set custom connection info in mock
      mockRedis.options = {
        host: 'redis.example.com',
        port: 6380,
        db: 1,
      };

      await adapter.connect('redis://redis.example.com:6380/1');

      mockRedis.scan.mockResolvedValue(['0', ['bull:test:meta']]);
      mockRedis.llen.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(0);

      const result = await adapter.listQueues();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toBeDefined();
        expect(result.value[0]!.connection).toEqual({
          host: 'redis.example.com',
          port: 6380,
          db: 1,
        });
      }
    });
  });

  describe('getJobs', () => {
    it('should retrieve waiting jobs with pagination', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock lrange to return job IDs from waiting list
      mockRedis.lrange.mockResolvedValue(['1', '2', '3']);

      // Mock hgetall to return job data for each job
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === 'bull:email-queue:1') {
          return Promise.resolve({
            data: JSON.stringify({ to: 'user1@example.com' }),
            timestamp: '1640000000000',
            attemptsMade: '0',
          });
        } else if (key === 'bull:email-queue:2') {
          return Promise.resolve({
            data: JSON.stringify({ to: 'user2@example.com' }),
            timestamp: '1640000001000',
            attemptsMade: '0',
          });
        } else if (key === 'bull:email-queue:3') {
          return Promise.resolve({
            data: JSON.stringify({ to: 'user3@example.com' }),
            timestamp: '1640000002000',
            attemptsMade: '0',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getJobs({
        queueName: 'email-queue',
        status: JobStatus.Waiting,
        offset: 0,
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]).toMatchObject({
          id: '1',
          queueName: 'email-queue',
          status: JobStatus.Waiting,
          attempts: 0,
        });
        expect(result.value[0]!.data).toEqual({ to: 'user1@example.com' });
      }

      // Verify correct Redis commands
      expect(mockRedis.lrange).toHaveBeenCalledWith(
        'bull:email-queue:wait',
        0,
        9
      );
      expect(mockRedis.hgetall).toHaveBeenCalledWith('bull:email-queue:1');
      expect(mockRedis.hgetall).toHaveBeenCalledWith('bull:email-queue:2');
      expect(mockRedis.hgetall).toHaveBeenCalledWith('bull:email-queue:3');
    });

    it('should retrieve active jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lrange.mockResolvedValue(['10', '11']);
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === 'bull:processing:10') {
          return Promise.resolve({
            data: JSON.stringify({ task: 'process-video' }),
            timestamp: '1640000000000',
            processedOn: '1640000010000',
            attemptsMade: '1',
          });
        } else if (key === 'bull:processing:11') {
          return Promise.resolve({
            data: JSON.stringify({ task: 'process-image' }),
            timestamp: '1640000001000',
            processedOn: '1640000011000',
            attemptsMade: '1',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getJobs({
        queueName: 'processing',
        status: JobStatus.Active,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toMatchObject({
          id: '10',
          queueName: 'processing',
          status: JobStatus.Active,
          attempts: 1,
        });
        expect(result.value[0]!.processedOn).toBe(1640000010000);
      }

      expect(mockRedis.lrange).toHaveBeenCalledWith(
        'bull:processing:active',
        0,
        99
      );
    });

    it('should retrieve completed jobs sorted by newest first', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock zrevrange for completed jobs (sorted by completion time, newest first)
      mockRedis.zrevrange.mockResolvedValue(['20', '21']);
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === 'bull:orders:20') {
          return Promise.resolve({
            data: JSON.stringify({ orderId: 1001 }),
            timestamp: '1640000000000',
            processedOn: '1640000005000',
            finishedOn: '1640000010000',
            returnvalue: JSON.stringify({ success: true }),
            attemptsMade: '1',
          });
        } else if (key === 'bull:orders:21') {
          return Promise.resolve({
            data: JSON.stringify({ orderId: 1002 }),
            timestamp: '1640000001000',
            processedOn: '1640000006000',
            finishedOn: '1640000009000',
            returnvalue: JSON.stringify({ success: true }),
            attemptsMade: '1',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getJobs({
        queueName: 'orders',
        status: JobStatus.Completed,
        offset: 0,
        limit: 50,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toMatchObject({
          id: '20',
          queueName: 'orders',
          status: JobStatus.Completed,
          finishedOn: 1640000010000,
        });
        expect(result.value[0]!.returnvalue).toEqual({ success: true });
      }

      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'bull:orders:completed',
        0,
        49
      );
    });

    it('should retrieve failed jobs with error information', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.zrevrange.mockResolvedValue(['30']);
      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ email: 'invalid-email' }),
        timestamp: '1640000000000',
        processedOn: '1640000005000',
        finishedOn: '1640000008000',
        failedReason: 'Invalid email address',
        stacktrace: JSON.stringify(['Error: Invalid email address', '  at validate()']),
        attemptsMade: '3',
        opts: JSON.stringify({ attempts: 3 }),
      });

      const result = await adapter.getJobs({
        queueName: 'notifications',
        status: JobStatus.Failed,
        offset: 0,
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toMatchObject({
          id: '30',
          queueName: 'notifications',
          status: JobStatus.Failed,
          error: 'Invalid email address',
          attempts: 3,
          maxAttempts: 3,
        });
        expect(result.value[0]!.stacktrace).toEqual([
          'Error: Invalid email address',
          '  at validate()',
        ]);
      }

      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'bull:notifications:failed',
        0,
        9
      );
    });

    it('should retrieve delayed jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.zrange.mockResolvedValue(['40']);
      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ reminder: 'Follow up email' }),
        timestamp: '1640000000000',
        delay: '3600000',
        attemptsMade: '0',
      });

      const result = await adapter.getJobs({
        queueName: 'scheduled',
        status: JobStatus.Delayed,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toMatchObject({
          id: '40',
          queueName: 'scheduled',
          status: JobStatus.Delayed,
          delay: 3600000,
        });
      }

      expect(mockRedis.zrange).toHaveBeenCalledWith(
        'bull:scheduled:delayed',
        0,
        99
      );
    });

    it('should handle pagination with offset', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lrange.mockResolvedValue(['100', '101']);
      mockRedis.hgetall.mockImplementation((key: string) => {
        const id = key.split(':').pop();
        return Promise.resolve({
          data: JSON.stringify({ id }),
          timestamp: '1640000000000',
          attemptsMade: '0',
        });
      });

      const result = await adapter.getJobs({
        queueName: 'test',
        status: JobStatus.Waiting,
        offset: 50,
        limit: 2,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }

      // Verify offset and limit are correctly calculated (start=50, stop=51)
      expect(mockRedis.lrange).toHaveBeenCalledWith('bull:test:wait', 50, 51);
    });

    it('should return empty array when no jobs match', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lrange.mockResolvedValue([]);

      const result = await adapter.getJobs({
        queueName: 'empty-queue',
        status: JobStatus.Waiting,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should filter out jobs that fail to fetch', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lrange.mockResolvedValue(['1', '2', '3']);
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === 'bull:test:1') {
          return Promise.resolve({
            data: JSON.stringify({ valid: true }),
            timestamp: '1640000000000',
            attemptsMade: '0',
          });
        } else if (key === 'bull:test:2') {
          // Job deleted or missing
          return Promise.resolve({});
        } else if (key === 'bull:test:3') {
          return Promise.resolve({
            data: JSON.stringify({ valid: true }),
            timestamp: '1640000002000',
            attemptsMade: '0',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getJobs({
        queueName: 'test',
        status: JobStatus.Waiting,
        offset: 0,
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only include jobs 1 and 3 (job 2 was missing)
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.id).toBe('1');
        expect(result.value[1]!.id).toBe('3');
      }
    });

    it('should return error when not connected', async () => {
      const result = await adapter.getJobs({
        queueName: 'test',
        status: JobStatus.Waiting,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Not connected to Redis');
      }

      expect(mockRedis.lrange).not.toHaveBeenCalled();
    });

    it('should return error for unknown job status', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const result = await adapter.getJobs({
        queueName: 'test',
        status: 'invalid-status' as any,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Unknown job status');
      }
    });

    it('should handle Redis lrange failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const redisError = new Error('Redis connection lost');
      mockRedis.lrange.mockRejectedValue(redisError);

      const result = await adapter.getJobs({
        queueName: 'test',
        status: JobStatus.Waiting,
        offset: 0,
        limit: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(redisError);
      }
    });

    it('should use default pagination values when not specified', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lrange.mockResolvedValue([]);

      await adapter.getJobs({
        queueName: 'test',
        status: JobStatus.Waiting,
      });

      // Default offset=0, limit=100, so range should be 0 to 99
      expect(mockRedis.lrange).toHaveBeenCalledWith('bull:test:wait', 0, 99);
    });
  });

  describe('getJob', () => {
    it('should retrieve a waiting job by ID', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Mock lpos to find job in waiting list
      mockRedis.lpos.mockImplementation((key: string, jobId: string) => {
        if (key === 'bull:email:wait' && jobId === '123') {
          return Promise.resolve(0); // Found at position 0
        }
        return Promise.resolve(null);
      });

      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ to: 'user@example.com', subject: 'Welcome' }),
        timestamp: '1640000000000',
        attemptsMade: '0',
        opts: JSON.stringify({ attempts: 3 }),
      });

      const result = await adapter.getJob('email', '123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '123',
          queueName: 'email',
          status: JobStatus.Waiting,
          attempts: 0,
          maxAttempts: 3,
        });
        expect(result.value.data).toEqual({
          to: 'user@example.com',
          subject: 'Welcome',
        });
      }

      // Verify it checked waiting list
      expect(mockRedis.lpos).toHaveBeenCalledWith('bull:email:wait', '123');
      expect(mockRedis.hgetall).toHaveBeenCalledWith('bull:email:123');
    });

    it('should retrieve an active job by ID', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Not in waiting, but in active
      mockRedis.lpos.mockImplementation((key: string) => {
        if (key === 'bull:processing:wait') return Promise.resolve(null);
        if (key === 'bull:processing:active') return Promise.resolve(2);
        return Promise.resolve(null);
      });

      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ videoId: 'abc123' }),
        timestamp: '1640000000000',
        processedOn: '1640000010000',
        attemptsMade: '1',
      });

      const result = await adapter.getJob('processing', '456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '456',
          queueName: 'processing',
          status: JobStatus.Active,
          processedOn: 1640000010000,
        });
      }

      expect(mockRedis.lpos).toHaveBeenCalledWith('bull:processing:active', '456');
    });

    it('should retrieve a completed job by ID', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Not in lists, but in completed sorted set
      mockRedis.lpos.mockResolvedValue(null);
      mockRedis.zscore.mockImplementation((key: string) => {
        if (key === 'bull:orders:completed') return Promise.resolve('1640000020000');
        return Promise.resolve(null);
      });

      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ orderId: 1001, items: 5 }),
        timestamp: '1640000000000',
        processedOn: '1640000005000',
        finishedOn: '1640000020000',
        returnvalue: JSON.stringify({ status: 'shipped' }),
        attemptsMade: '1',
      });

      const result = await adapter.getJob('orders', '789');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '789',
          queueName: 'orders',
          status: JobStatus.Completed,
          finishedOn: 1640000020000,
        });
        expect(result.value.returnvalue).toEqual({ status: 'shipped' });
      }

      expect(mockRedis.zscore).toHaveBeenCalledWith('bull:orders:completed', '789');
    });

    it('should retrieve a failed job by ID', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lpos.mockResolvedValue(null);
      mockRedis.zscore.mockImplementation((key: string) => {
        if (key === 'bull:email:completed') return Promise.resolve(null);
        if (key === 'bull:email:failed') return Promise.resolve('1640000030000');
        return Promise.resolve(null);
      });

      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ to: 'invalid@' }),
        timestamp: '1640000000000',
        processedOn: '1640000005000',
        finishedOn: '1640000030000',
        failedReason: 'Invalid email format',
        stacktrace: JSON.stringify(['Error: Invalid email format', '  at sendEmail()']),
        attemptsMade: '3',
        opts: JSON.stringify({ attempts: 3 }),
      });

      const result = await adapter.getJob('email', '999');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '999',
          queueName: 'email',
          status: JobStatus.Failed,
          error: 'Invalid email format',
          attempts: 3,
          maxAttempts: 3,
        });
        expect(result.value.stacktrace).toEqual([
          'Error: Invalid email format',
          '  at sendEmail()',
        ]);
      }
    });

    it('should retrieve a delayed job by ID', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lpos.mockResolvedValue(null);
      mockRedis.zscore.mockImplementation((key: string) => {
        if (key === 'bull:scheduled:delayed') return Promise.resolve('1640003600000');
        return Promise.resolve(null);
      });

      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ taskId: 'reminder-1' }),
        timestamp: '1640000000000',
        delay: '3600000',
        attemptsMade: '0',
      });

      const result = await adapter.getJob('scheduled', '111');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '111',
          queueName: 'scheduled',
          status: JobStatus.Delayed,
          delay: 3600000,
        });
      }

      expect(mockRedis.zscore).toHaveBeenCalledWith('bull:scheduled:delayed', '111');
    });

    it('should return error when job not found', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Not found in any data structure
      mockRedis.lpos.mockResolvedValue(null);
      mockRedis.zscore.mockResolvedValue(null);

      const result = await adapter.getJob('test', 'non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Job non-existent not found');
      }

      // Verify all data structures were checked
      expect(mockRedis.lpos).toHaveBeenCalledWith('bull:test:wait', 'non-existent');
      expect(mockRedis.lpos).toHaveBeenCalledWith('bull:test:active', 'non-existent');
      expect(mockRedis.zscore).toHaveBeenCalledWith('bull:test:completed', 'non-existent');
      expect(mockRedis.zscore).toHaveBeenCalledWith('bull:test:failed', 'non-existent');
      expect(mockRedis.zscore).toHaveBeenCalledWith('bull:test:delayed', 'non-existent');
    });

    it('should return error when job hash is empty', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Found in waiting list
      mockRedis.lpos.mockImplementation((key: string) => {
        if (key === 'bull:test:wait') return Promise.resolve(0);
        return Promise.resolve(null);
      });

      // But job hash is empty (job was deleted)
      mockRedis.hgetall.mockResolvedValue({});

      const result = await adapter.getJob('test', '123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Job 123 not found');
      }
    });

    it('should return error when not connected', async () => {
      const result = await adapter.getJob('test', '123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Not connected to Redis');
      }

      expect(mockRedis.lpos).not.toHaveBeenCalled();
      expect(mockRedis.hgetall).not.toHaveBeenCalled();
    });

    it('should handle Redis lpos failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const redisError = new Error('Redis command failed');
      mockRedis.lpos.mockRejectedValue(redisError);

      const result = await adapter.getJob('test', '123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(redisError);
      }
    });

    it('should handle Redis hgetall failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lpos.mockImplementation((key: string) => {
        if (key === 'bull:test:wait') return Promise.resolve(0);
        return Promise.resolve(null);
      });

      const redisError = new Error('Hash read failed');
      mockRedis.hgetall.mockRejectedValue(redisError);

      const result = await adapter.getJob('test', '123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(redisError);
      }
    });

    it('should parse job data with all optional fields', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      mockRedis.lpos.mockImplementation((key: string) => {
        if (key === 'bull:test:wait') return Promise.resolve(0);
        return Promise.resolve(null);
      });

      // Job with all optional fields present
      mockRedis.hgetall.mockResolvedValue({
        data: JSON.stringify({ key: 'value' }),
        timestamp: '1640000000000',
        processedOn: '1640000005000',
        finishedOn: '1640000010000',
        failedReason: 'Some error',
        stacktrace: JSON.stringify(['line1', 'line2']),
        returnvalue: JSON.stringify({ result: 42 }),
        attemptsMade: '2',
        delay: '5000',
        opts: JSON.stringify({ attempts: 5, backoff: 1000 }),
      });

      const result = await adapter.getJob('test', '123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          id: '123',
          queueName: 'test',
          status: JobStatus.Waiting,
          data: { key: 'value' },
          error: 'Some error',
          stacktrace: ['line1', 'line2'],
          attempts: 2,
          maxAttempts: 5,
          timestamp: 1640000000000,
          processedOn: 1640000005000,
          finishedOn: 1640000010000,
          returnvalue: { result: 42 },
          delay: 5000,
        });
      }
    });
  });

  describe('getMetrics', () => {
    it('should calculate metrics with completed and failed jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      // Mock completed jobs: 3 in last hour, 1 older
      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),           // Recent
            'job2', String(now - 30 * 60 * 1000), // Recent (30 min ago)
            'job3', String(now - 45 * 60 * 1000), // Recent (45 min ago)
            'job4', String(twoHoursAgo),          // Old (2 hours ago)
          ]);
        }
        if (key === 'bull:test:failed') {
          return Promise.resolve([
            'job5', String(now - 15 * 60 * 1000), // Recent (15 min ago)
          ]);
        }
        return Promise.resolve([]);
      });

      // Mock job data for processing time calculation
      mockRedis.hgetall.mockImplementation((key: string) => {
        const jobId = key.split(':').pop();
        if (jobId === 'job1') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            processedOn: String(now - 5000),
            finishedOn: String(now - 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job2') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 40 * 60 * 1000),
            processedOn: String(now - 35 * 60 * 1000),
            finishedOn: String(now - 30 * 60 * 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job3') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 50 * 60 * 1000),
            processedOn: String(now - 48 * 60 * 1000),
            finishedOn: String(now - 45 * 60 * 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job4') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(twoHoursAgo - 10000),
            processedOn: String(twoHoursAgo - 5000),
            finishedOn: String(twoHoursAgo),
            attemptsMade: '1',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Throughput: 3 completed + 1 failed in last hour = 4 jobs/hour
        expect(result.value.throughput).toBe(4);

        // Failure rate: 1 failed / 5 total = 0.2 (20%)
        expect(result.value.failureRate).toBeCloseTo(0.2);

        // Average processing time: (4000 + 300000 + 180000 + 5000) / 4 = 122250ms
        expect(result.value.avgProcessingTime).toBeCloseTo(122250);
      }
    });

    it('should calculate metrics with no jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // No jobs at all
      mockRedis.zrevrange.mockResolvedValue([]);

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // No jobs processed
        expect(result.value.throughput).toBe(0);
        expect(result.value.failureRate).toBe(0);
        expect(result.value.avgProcessingTime).toBe(0);
      }
    });

    it('should calculate metrics with only completed jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();

      // Mock 2 completed jobs, 0 failed
      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),
            'job2', String(now - 2000),
          ]);
        }
        return Promise.resolve([]); // No failed jobs
      });

      mockRedis.hgetall.mockImplementation((key: string) => {
        const jobId = key.split(':').pop();
        if (jobId === 'job1') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            processedOn: String(now - 5000),
            finishedOn: String(now - 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job2') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 20000),
            processedOn: String(now - 12000),
            finishedOn: String(now - 2000),
            attemptsMade: '1',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Throughput: 2 completed jobs in last hour
        expect(result.value.throughput).toBe(2);

        // Failure rate: 0 failed / 2 total = 0%
        expect(result.value.failureRate).toBe(0);

        // Average processing time: (4000 + 10000) / 2 = 7000ms
        expect(result.value.avgProcessingTime).toBeCloseTo(7000);
      }
    });

    it('should calculate metrics with only failed jobs', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();

      // Mock 0 completed, 2 failed jobs
      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:failed') {
          return Promise.resolve([
            'job1', String(now - 1000),
            'job2', String(now - 2000),
          ]);
        }
        return Promise.resolve([]); // No completed jobs
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Throughput: 2 failed jobs in last hour
        expect(result.value.throughput).toBe(2);

        // Failure rate: 2 failed / 2 total = 100%
        expect(result.value.failureRate).toBe(1.0);

        // Average processing time: 0 (no completed jobs to measure)
        expect(result.value.avgProcessingTime).toBe(0);
      }
    });

    it('should only count jobs from last hour for throughput', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      // Mock jobs: some recent, some old
      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),      // Recent
            'job2', String(twoHoursAgo),     // Old
            'job3', String(threeDaysAgo),    // Very old
          ]);
        }
        if (key === 'bull:test:failed') {
          return Promise.resolve([
            'job4', String(now - 30 * 60 * 1000), // Recent
            'job5', String(twoHoursAgo),          // Old
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.hgetall.mockImplementation((key: string) => {
        const jobId = key.split(':').pop();
        return Promise.resolve({
          data: '{}',
          timestamp: String(now - 10000),
          processedOn: String(now - 5000),
          finishedOn: String(now - 1000),
          attemptsMade: '1',
        });
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Throughput: only job1 and job4 are in last hour = 2 jobs/hour
        expect(result.value.throughput).toBe(2);

        // Failure rate uses all jobs: 2 failed / 5 total = 0.4 (40%)
        expect(result.value.failureRate).toBeCloseTo(0.4);
      }
    });

    it('should handle jobs with missing processing time fields', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();

      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),
            'job2', String(now - 2000),
            'job3', String(now - 3000),
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.hgetall.mockImplementation((key: string) => {
        const jobId = key.split(':').pop();
        if (jobId === 'job1') {
          // Valid job with processing times
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            processedOn: String(now - 5000),
            finishedOn: String(now - 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job2') {
          // Missing finishedOn
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            processedOn: String(now - 5000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job3') {
          // Missing processedOn
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            finishedOn: String(now - 3000),
            attemptsMade: '1',
          });
        }
        return Promise.resolve({});
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only job1 has valid processing time: 4000ms
        expect(result.value.avgProcessingTime).toBeCloseTo(4000);
      }
    });

    it('should handle failed job data fetches gracefully', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();

      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),
            'job2', String(now - 2000),
          ]);
        }
        return Promise.resolve([]);
      });

      // Mock hgetall to fail for job2
      mockRedis.hgetall.mockImplementation((key: string) => {
        const jobId = key.split(':').pop();
        if (jobId === 'job1') {
          return Promise.resolve({
            data: '{}',
            timestamp: String(now - 10000),
            processedOn: String(now - 5000),
            finishedOn: String(now - 1000),
            attemptsMade: '1',
          });
        }
        if (jobId === 'job2') {
          // Job deleted or unavailable
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still calculate metrics with available job
        expect(result.value.avgProcessingTime).toBeCloseTo(4000);
      }
    });

    it('should return error when not connected', async () => {
      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Not connected to Redis');
      }

      expect(mockRedis.zrevrange).not.toHaveBeenCalled();
    });

    it('should handle Redis zrevrange failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const redisError = new Error('Redis command failed');
      mockRedis.zrevrange.mockRejectedValue(redisError);

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(redisError);
      }
    });

    it('should calculate correct metrics with high failure rate', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();

      // Mock 1 completed, 9 failed (90% failure rate)
      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(now - 1000),
          ]);
        }
        if (key === 'bull:test:failed') {
          return Promise.resolve([
            'job2', String(now - 1000),
            'job3', String(now - 2000),
            'job4', String(now - 3000),
            'job5', String(now - 4000),
            'job6', String(now - 5000),
            'job7', String(now - 6000),
            'job8', String(now - 7000),
            'job9', String(now - 8000),
            'job10', String(now - 9000),
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.hgetall.mockImplementation((key: string) => {
        return Promise.resolve({
          data: '{}',
          timestamp: String(now - 10000),
          processedOn: String(now - 5000),
          finishedOn: String(now - 1000),
          attemptsMade: '1',
        });
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Throughput: 1 completed + 9 failed = 10 jobs/hour
        expect(result.value.throughput).toBe(10);

        // Failure rate: 9 failed / 10 total = 0.9 (90%)
        expect(result.value.failureRate).toBeCloseTo(0.9);
      }
    });

    it('should handle edge case with exact one hour boundary', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const now = Date.now();
      const exactlyOneHourAgo = now - 60 * 60 * 1000;
      const justOverOneHourAgo = now - 60 * 60 * 1000 - 1;

      mockRedis.zrevrange.mockImplementation((key: string) => {
        if (key === 'bull:test:completed') {
          return Promise.resolve([
            'job1', String(exactlyOneHourAgo),     // Should be included (>=)
            'job2', String(justOverOneHourAgo),    // Should be excluded
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.hgetall.mockImplementation((key: string) => {
        return Promise.resolve({
          data: '{}',
          timestamp: String(now - 10000),
          processedOn: String(now - 5000),
          finishedOn: String(now - 1000),
          attemptsMade: '1',
        });
      });

      const result = await adapter.getMetrics('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only job1 should count (exactly at boundary)
        expect(result.value.throughput).toBe(1);
      }
    });
  });

  describe('subscribe', () => {
    it('should successfully subscribe to keyspace notifications', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Create a second mock Redis client for subscriber
      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      // Mock Redis constructor to return subscriber on second call
      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis; // First call (connect)
        if (callCount === 2) return mockSubscriber; // Second call (subscribe)
        return createMockRedis();
      });

      // Reconnect to reset call count properly
      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      const result = await adapter.subscribe(callback);

      expect(result.ok).toBe(true);
      expect(mockSubscriber.psubscribe).toHaveBeenCalledWith('__keyspace@0__:bull:*');
      expect(mockSubscriber.on).toHaveBeenCalledWith('pmessage', expect.any(Function));
    });

    it('should subscribe with correct database pattern', async () => {
      mockSuccessfulConnection(mockRedis);

      // Mock client options to use database 2
      mockRedis.options = {
        host: 'localhost',
        port: 6379,
        db: 2,
      };

      await adapter.connect('redis://localhost:6379/2');

      // Create subscriber mock
      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      mockRedis.options.db = 2;
      await adapter.connect('redis://localhost:6379/2');

      const callback = jest.fn();
      const result = await adapter.subscribe(callback);

      expect(result.ok).toBe(true);
      expect(mockSubscriber.psubscribe).toHaveBeenCalledWith('__keyspace@2__:bull:*');
    });

    it('should return error when not connected', async () => {
      const callback = jest.fn();
      const result = await adapter.subscribe(callback);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Not connected to Redis');
      }
    });

    it('should return error when already subscribed', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Setup subscriber mock
      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();

      // First subscription should succeed
      const result1 = await adapter.subscribe(callback);
      expect(result1.ok).toBe(true);

      // Second subscription should fail
      const result2 = await adapter.subscribe(callback);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.message).toContain('Already subscribed');
      }
    });

    it('should handle subscriber connection failure', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      // Create subscriber mock that fails to connect
      const mockSubscriber = createMockRedis();
      const connectionError = new Error('Connection refused');
      mockSubscriber.once.mockImplementation((event: string, callback: (err?: Error) => void) => {
        if (event === 'error') {
          setImmediate(() => callback(connectionError));
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      const result = await adapter.subscribe(callback);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(connectionError);
      }
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
    });

    it('should parse job hash update events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      // Capture the pmessage handler
      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job hash update (hset operation)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:123',
        'hset'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'updated',
        queueName: 'myqueue',
        jobId: '123',
        timestamp: expect.any(Number),
      });
    });

    it('should parse job deletion events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job deletion (del operation)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:456',
        'del'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'removed',
        queueName: 'myqueue',
        jobId: '456',
        timestamp: expect.any(Number),
      });
    });

    it('should parse waiting queue events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job added to waiting queue (lpush operation)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:wait',
        'lpush'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'waiting',
        queueName: 'myqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should parse active queue events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job moved to active (rpush operation)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:testqueue:active',
        'rpush'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'active',
        queueName: 'testqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should parse completed queue events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job completed (zadd operation on completed set)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:processqueue:completed',
        'zadd'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'completed',
        queueName: 'processqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should parse failed queue events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job failed (zadd operation on failed set)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:errorqueue:failed',
        'zadd'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'failed',
        queueName: 'errorqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should parse delayed queue events correctly', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate delayed job (zadd operation on delayed set)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:scheduledqueue:delayed',
        'zadd'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'delayed',
        queueName: 'scheduledqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should ignore meta key events', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate meta key update (should be ignored)
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:meta',
        'hset'
      );

      // Callback should not be invoked for meta keys
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle job IDs with colons', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job with colon in ID
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:job:with:colons:123',
        'hset'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'updated',
        queueName: 'myqueue',
        jobId: 'job:with:colons:123',
        timestamp: expect.any(Number),
      });
    });

    it('should handle hmset operation as update', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate hmset operation
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:myqueue:999',
        'hmset'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'updated',
        queueName: 'myqueue',
        jobId: '999',
        timestamp: expect.any(Number),
      });
    });

    it('should handle lrem operation on wait queue', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate job removed from wait queue
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:bull:testqueue:wait',
        'lrem'
      );

      expect(callback).toHaveBeenCalledWith({
        eventType: 'dequeued',
        queueName: 'testqueue',
        jobId: '',
        timestamp: expect.any(Number),
      });
    });

    it('should not invoke callback on parsing errors', async () => {
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const mockSubscriber = createMockRedis();
      mockSubscriber.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setImmediate(() => callback());
        }
        return mockSubscriber;
      });

      let pmessageHandler: (pattern: string, channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'pmessage') {
          pmessageHandler = handler;
        }
        return mockSubscriber;
      });

      let callCount = 0;
      (Redis as unknown as jest.Mock).mockImplementation((config?: any) => {
        callCount++;
        if (callCount === 1) return mockRedis;
        if (callCount === 2) return mockSubscriber;
        return createMockRedis();
      });

      await adapter.disconnect();
      mockSuccessfulConnection(mockRedis);
      await adapter.connect('redis://localhost:6379');

      const callback = jest.fn();
      await adapter.subscribe(callback);

      // Simulate invalid channel format
      pmessageHandler!(
        '__keyspace@0__:bull:*',
        '__keyspace@0__:invalid:format',
        'set'
      );

      // Callback should not be invoked for invalid events
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
