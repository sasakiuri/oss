// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServiceMethod, ServiceError, unwrap } from '@/renderer/services/createServiceMethod';

// ---------------------------------------------------------------------------
// unwrap
// ---------------------------------------------------------------------------

describe('unwrap', () => {
  it('success -> returns data', async () => {
    const call = vi.fn().mockResolvedValue({ success: true, data: { id: '1', name: 'test' } });

    await expect(unwrap(call)).resolves.toEqual({ id: '1', name: 'test' });
  });

  it('success=true & data=undefined -> returns undefined', async () => {
    await expect(unwrap(vi.fn().mockResolvedValue({ success: true }))).resolves.toBeUndefined();
  });

  it('success=true & data=null -> returns null', async () => {
    await expect(unwrap(vi.fn().mockResolvedValue({ success: true, data: null }))).resolves.toBeNull();
  });

  it('failure → ServiceError (code + message)', async () => {
    const call = vi.fn().mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });

    await expect(unwrap(call)).rejects.toThrow(ServiceError);
    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('failure with undefined error -> UNKNOWN', async () => {
    const call = vi.fn().mockResolvedValue({ success: false });

    await expect(unwrap(call)).rejects.toThrow(ServiceError);
    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'Unknown error',
    });
  });

  it('failure with metadata -> ServiceError includes metadata', async () => {
    const call = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION', message: 'Invalid', metadata: { field: 'name' } },
    });

    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'VALIDATION',
      metadata: { field: 'name' },
    });
  });

  it('IPC communication error -> IPC_ERROR', async () => {
    const call = vi.fn().mockRejectedValue(new Error('Network failure'));

    await expect(unwrap(call)).rejects.toThrow(ServiceError);
    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'Network failure',
    });
  });

  it('non-Error IPC rejection -> IPC_ERROR with string message', async () => {
    const call = vi.fn().mockRejectedValue('string error');

    await expect(unwrap(call)).rejects.toThrow(ServiceError);
    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'string error',
    });
  });

  it('a call that throws synchronously -> IPC_ERROR', async () => {
    const call = () => {
      throw new TypeError('bridge missing');
    };

    await expect(unwrap(call)).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'bridge missing',
    });
  });
});

// ---------------------------------------------------------------------------
// createServiceMethod
// ---------------------------------------------------------------------------

describe('createServiceMethod', () => {
  const originalGetScoreSheet = window.electronAPI.report.getScoreSheet;
  const originalListPrinters = window.electronAPI.report.listPrinters;

  afterEach(() => {
    window.electronAPI.report.getScoreSheet = originalGetScoreSheet;
    window.electronAPI.report.listPrinters = originalListPrinters;
  });

  it('passes the input to the bridge method and returns the data', async () => {
    const sheet = { sessionId: 'session-1' };
    vi.mocked(window.electronAPI.report.getScoreSheet).mockResolvedValue({ success: true, data: sheet } as never);
    const method = createServiceMethod((api) => api.report.getScoreSheet);

    await expect(method({ sessionId: 'session-1' })).resolves.toBe(sheet);
    expect(window.electronAPI.report.getScoreSheet).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });

  it('calls a void-input bridge method without arguments', async () => {
    vi.mocked(window.electronAPI.report.listPrinters).mockResolvedValue({ success: true, data: [] });
    const method = createServiceMethod((api) => api.report.listPrinters);

    await expect(method()).resolves.toEqual([]);
    expect(window.electronAPI.report.listPrinters).toHaveBeenCalledWith();
  });

  it('looks the bridge method up on each call', async () => {
    const method = createServiceMethod((api) => api.report.listPrinters);
    const replacement = vi.fn().mockResolvedValue({ success: true, data: [{ name: 'Printer' }] });
    window.electronAPI.report.listPrinters = replacement;

    await expect(method()).resolves.toEqual([{ name: 'Printer' }]);
    expect(replacement).toHaveBeenCalledOnce();
  });

  it('failure → ServiceError', async () => {
    vi.mocked(window.electronAPI.report.listPrinters).mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
    const method = createServiceMethod((api) => api.report.listPrinters);

    await expect(method()).rejects.toThrow(ServiceError);
    await expect(method()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  });

  it('a missing bridge method -> IPC_ERROR', async () => {
    window.electronAPI.report.listPrinters = undefined as never;
    const method = createServiceMethod((api) => api.report.listPrinters);

    await expect(method()).rejects.toMatchObject({ code: 'IPC_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// ServiceError
// ---------------------------------------------------------------------------

describe('ServiceError', () => {
  it('name is ServiceError', () => {
    const err = new ServiceError('msg', 'CODE');
    expect(err.name).toBe('ServiceError');
  });

  it('extends Error', () => {
    const err = new ServiceError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });
});
