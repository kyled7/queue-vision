/**
 * Unit tests for BullMQAdapter.
 *
 * These tests verify that the BullMQAdapter correctly implements the QueueAdapter
 * interface by mocking Redis client operations.
 */

import { BullMQAdapter } from '../BullMQAdapter';
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

  // Additional test suites will be added in subsequent subtasks:
  // - subtask-12-4: getJobs/getJob tests
  // - subtask-12-5: getMetrics tests
  // - subtask-12-6: subscribe tests
});
