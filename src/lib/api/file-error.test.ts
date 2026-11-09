import { describe, expect, it } from 'vitest';
import { fileErrorResponse } from './file-error';

const req = (accept: string) => new Request('http://localhost/api/client/documents/file?ref=x', { headers: { accept } });

describe('fileErrorResponse', () => {
  it('answers a page load (a preview frame) with a readable page, not raw JSON', async () => {
    const res = fileErrorResponse(req('text/html,application/xhtml+xml'), 'download_failed', 500);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('could not be loaded');
    expect(body).not.toContain('download_failed');
  });

  it('keeps the JSON error for fetch callers', async () => {
    const res = fileErrorResponse(req('*/*'), 'not_found', 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
