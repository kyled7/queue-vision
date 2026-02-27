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

  // Additional test suites will be added in subsequent subtasks:
  // - subtask-12-2: connect/disconnect tests
  // - subtask-12-3: listQueues tests
  // - subtask-12-4: getJobs/getJob tests
  // - subtask-12-5: getMetrics tests
  // - subtask-12-6: subscribe tests
});
