/**
 * Unit tests for BullMQ Redis key helper functions.
 *
 * These tests verify that Redis key generation follows BullMQ's key structure.
 */

import {
  getMetaKey,
  getWaitKey,
  getActiveKey,
  getCompletedKey,
  getFailedKey,
  getDelayedKey,
  getJobKey,
} from '../redis-keys';

describe('redis-keys', () => {
  describe('getMetaKey', () => {
    it('should generate correct meta key for a queue', () => {
      expect(getMetaKey('email-queue')).toBe('bull:email-queue:meta');
    });

    it('should support wildcard pattern for queue discovery', () => {
      expect(getMetaKey('*')).toBe('bull:*:meta');
    });

    it('should handle queue names with hyphens', () => {
      expect(getMetaKey('send-email-notifications')).toBe(
        'bull:send-email-notifications:meta'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getMetaKey('email_queue')).toBe('bull:email_queue:meta');
    });

    it('should handle queue names with numbers', () => {
      expect(getMetaKey('queue-123')).toBe('bull:queue-123:meta');
    });

    it('should handle single character queue names', () => {
      expect(getMetaKey('q')).toBe('bull:q:meta');
    });
  });

  describe('getWaitKey', () => {
    it('should generate correct wait key for a queue', () => {
      expect(getWaitKey('email-queue')).toBe('bull:email-queue:wait');
    });

    it('should handle queue names with hyphens', () => {
      expect(getWaitKey('process-payment')).toBe('bull:process-payment:wait');
    });

    it('should handle queue names with underscores', () => {
      expect(getWaitKey('process_payment')).toBe('bull:process_payment:wait');
    });

    it('should handle queue names with numbers', () => {
      expect(getWaitKey('queue-123')).toBe('bull:queue-123:wait');
    });

    it('should handle single character queue names', () => {
      expect(getWaitKey('q')).toBe('bull:q:wait');
    });
  });

  describe('getActiveKey', () => {
    it('should generate correct active key for a queue', () => {
      expect(getActiveKey('email-queue')).toBe('bull:email-queue:active');
    });

    it('should handle queue names with hyphens', () => {
      expect(getActiveKey('process-payment')).toBe(
        'bull:process-payment:active'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getActiveKey('process_payment')).toBe(
        'bull:process_payment:active'
      );
    });

    it('should handle queue names with numbers', () => {
      expect(getActiveKey('queue-123')).toBe('bull:queue-123:active');
    });

    it('should handle single character queue names', () => {
      expect(getActiveKey('q')).toBe('bull:q:active');
    });
  });

  describe('getCompletedKey', () => {
    it('should generate correct completed key for a queue', () => {
      expect(getCompletedKey('email-queue')).toBe('bull:email-queue:completed');
    });

    it('should handle queue names with hyphens', () => {
      expect(getCompletedKey('process-payment')).toBe(
        'bull:process-payment:completed'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getCompletedKey('process_payment')).toBe(
        'bull:process_payment:completed'
      );
    });

    it('should handle queue names with numbers', () => {
      expect(getCompletedKey('queue-123')).toBe('bull:queue-123:completed');
    });

    it('should handle single character queue names', () => {
      expect(getCompletedKey('q')).toBe('bull:q:completed');
    });
  });

  describe('getFailedKey', () => {
    it('should generate correct failed key for a queue', () => {
      expect(getFailedKey('email-queue')).toBe('bull:email-queue:failed');
    });

    it('should handle queue names with hyphens', () => {
      expect(getFailedKey('process-payment')).toBe(
        'bull:process-payment:failed'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getFailedKey('process_payment')).toBe(
        'bull:process_payment:failed'
      );
    });

    it('should handle queue names with numbers', () => {
      expect(getFailedKey('queue-123')).toBe('bull:queue-123:failed');
    });

    it('should handle single character queue names', () => {
      expect(getFailedKey('q')).toBe('bull:q:failed');
    });
  });

  describe('getDelayedKey', () => {
    it('should generate correct delayed key for a queue', () => {
      expect(getDelayedKey('email-queue')).toBe('bull:email-queue:delayed');
    });

    it('should handle queue names with hyphens', () => {
      expect(getDelayedKey('process-payment')).toBe(
        'bull:process-payment:delayed'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getDelayedKey('process_payment')).toBe(
        'bull:process_payment:delayed'
      );
    });

    it('should handle queue names with numbers', () => {
      expect(getDelayedKey('queue-123')).toBe('bull:queue-123:delayed');
    });

    it('should handle single character queue names', () => {
      expect(getDelayedKey('q')).toBe('bull:q:delayed');
    });
  });

  describe('getJobKey', () => {
    it('should generate correct job key for a queue and job ID', () => {
      expect(getJobKey('email-queue', '123')).toBe('bull:email-queue:123');
    });

    it('should handle numeric job IDs', () => {
      expect(getJobKey('email-queue', '456789')).toBe(
        'bull:email-queue:456789'
      );
    });

    it('should handle UUID job IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(getJobKey('email-queue', uuid)).toBe(`bull:email-queue:${uuid}`);
    });

    it('should handle job IDs with special characters', () => {
      expect(getJobKey('email-queue', 'job-abc-123')).toBe(
        'bull:email-queue:job-abc-123'
      );
    });

    it('should handle queue names with hyphens', () => {
      expect(getJobKey('process-payment', '123')).toBe(
        'bull:process-payment:123'
      );
    });

    it('should handle queue names with underscores', () => {
      expect(getJobKey('process_payment', '123')).toBe(
        'bull:process_payment:123'
      );
    });

    it('should handle queue names with numbers', () => {
      expect(getJobKey('queue-123', '456')).toBe('bull:queue-123:456');
    });

    it('should handle single character queue names and job IDs', () => {
      expect(getJobKey('q', '1')).toBe('bull:q:1');
    });
  });

  describe('key format consistency', () => {
    const queueName = 'test-queue';

    it('should all use the same bull: prefix', () => {
      expect(getMetaKey(queueName)).toMatch(/^bull:/);
      expect(getWaitKey(queueName)).toMatch(/^bull:/);
      expect(getActiveKey(queueName)).toMatch(/^bull:/);
      expect(getCompletedKey(queueName)).toMatch(/^bull:/);
      expect(getFailedKey(queueName)).toMatch(/^bull:/);
      expect(getDelayedKey(queueName)).toMatch(/^bull:/);
      expect(getJobKey(queueName, '123')).toMatch(/^bull:/);
    });

    it('should all include the queue name', () => {
      expect(getMetaKey(queueName)).toContain(queueName);
      expect(getWaitKey(queueName)).toContain(queueName);
      expect(getActiveKey(queueName)).toContain(queueName);
      expect(getCompletedKey(queueName)).toContain(queueName);
      expect(getFailedKey(queueName)).toContain(queueName);
      expect(getDelayedKey(queueName)).toContain(queueName);
      expect(getJobKey(queueName, '123')).toContain(queueName);
    });

    it('should use colon as delimiter', () => {
      const keys = [
        getMetaKey(queueName),
        getWaitKey(queueName),
        getActiveKey(queueName),
        getCompletedKey(queueName),
        getFailedKey(queueName),
        getDelayedKey(queueName),
        getJobKey(queueName, '123'),
      ];

      keys.forEach((key) => {
        expect(key.split(':').length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('function purity', () => {
    it('should return the same result for the same inputs', () => {
      const queueName = 'test-queue';
      const jobId = '123';

      expect(getMetaKey(queueName)).toBe(getMetaKey(queueName));
      expect(getWaitKey(queueName)).toBe(getWaitKey(queueName));
      expect(getActiveKey(queueName)).toBe(getActiveKey(queueName));
      expect(getCompletedKey(queueName)).toBe(getCompletedKey(queueName));
      expect(getFailedKey(queueName)).toBe(getFailedKey(queueName));
      expect(getDelayedKey(queueName)).toBe(getDelayedKey(queueName));
      expect(getJobKey(queueName, jobId)).toBe(getJobKey(queueName, jobId));
    });

    it('should not mutate inputs', () => {
      const queueName = 'test-queue';
      const jobId = '123';
      const originalQueueName = queueName;
      const originalJobId = jobId;

      getMetaKey(queueName);
      getWaitKey(queueName);
      getActiveKey(queueName);
      getCompletedKey(queueName);
      getFailedKey(queueName);
      getDelayedKey(queueName);
      getJobKey(queueName, jobId);

      expect(queueName).toBe(originalQueueName);
      expect(jobId).toBe(originalJobId);
    });
  });

  describe('BullMQ key structure compliance', () => {
    it('should match BullMQ meta key structure', () => {
      expect(getMetaKey('myqueue')).toBe('bull:myqueue:meta');
    });

    it('should match BullMQ wait key structure (LIST)', () => {
      expect(getWaitKey('myqueue')).toBe('bull:myqueue:wait');
    });

    it('should match BullMQ active key structure (LIST)', () => {
      expect(getActiveKey('myqueue')).toBe('bull:myqueue:active');
    });

    it('should match BullMQ completed key structure (ZSET)', () => {
      expect(getCompletedKey('myqueue')).toBe('bull:myqueue:completed');
    });

    it('should match BullMQ failed key structure (ZSET)', () => {
      expect(getFailedKey('myqueue')).toBe('bull:myqueue:failed');
    });

    it('should match BullMQ delayed key structure (ZSET)', () => {
      expect(getDelayedKey('myqueue')).toBe('bull:myqueue:delayed');
    });

    it('should match BullMQ job hash key structure', () => {
      expect(getJobKey('myqueue', '42')).toBe('bull:myqueue:42');
    });
  });
});
