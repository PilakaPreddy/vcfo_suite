import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicErrorMessage } from './api-error';

describe('publicErrorMessage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps a message our own code wrote, including domain error classes', () => {
    class AssignmentError extends Error {}
    expect(publicErrorMessage(new Error('Not permitted'), 'update_failed')).toBe('Not permitted');
    expect(publicErrorMessage(new AssignmentError('Lead not found'), 'update_failed')).toBe('Lead not found');
  });

  it('hides driver, SDK and runtime errors behind the fixed code and logs them', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pg = Object.assign(new Error('relation "users" does not exist'), { severity: 'ERROR', code: '42P01' });
    const drizzle = new Error('Failed query: select * from users', { cause: pg });
    const s3 = Object.assign(new Error('Access Denied'), { $metadata: { httpStatusCode: 403 } });
    expect(publicErrorMessage(pg, 'list_failed')).toBe('list_failed');
    expect(publicErrorMessage(drizzle, 'list_failed')).toBe('list_failed');
    expect(publicErrorMessage(s3, 'upload_failed')).toBe('upload_failed');
    expect(publicErrorMessage(new TypeError('fetch failed'), 'send_failed')).toBe('send_failed');
    expect(publicErrorMessage('boom', 'send_failed')).toBe('send_failed');
    expect(log).toHaveBeenCalledTimes(5);
  });
});
