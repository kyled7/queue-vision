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

  // Additional test suites will be added in subsequent subtasks:
  // - subtask-12-3: listQueues tests
  // - subtask-12-4: getJobs/getJob tests
  // - subtask-12-5: getMetrics tests
  // - subtask-12-6: subscribe tests
});
