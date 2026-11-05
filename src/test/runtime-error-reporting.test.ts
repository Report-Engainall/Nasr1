import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportRuntimeError } from '@/lib/runtime-error-reporting';

describe('provider-neutral runtime diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports only the error class and approved boundary, never the message or private data', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secretMessage = 'Bearer eyJhbGciOiJIUzI1NiJ9.private.payload customer@example.test';

    reportRuntimeError(new Error(secretMessage), {
      boundary: 'root_error_boundary',
    });

    expect(diagnostic).toHaveBeenCalledWith('[Aghbari] Runtime error', {
      errorName: 'Error',
      boundary: 'root_error_boundary',
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(secretMessage);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('customer@example.test');
  });

  it('reports an HTTP status without exposing its response body', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = new Response('private response body', { status: 503 });
    reportRuntimeError(response, { boundary: 'route_error_boundary' });

    expect(diagnostic).toHaveBeenCalledWith('[Aghbari] Runtime error', {
      errorName: 'ResponseError',
      httpStatus: 503,
      boundary: 'route_error_boundary',
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private response body');
  });
});
