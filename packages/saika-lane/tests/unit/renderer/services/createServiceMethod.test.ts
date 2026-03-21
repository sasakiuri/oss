// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import {
  createCommandMethod,
  createServiceMethod,
  createVoidServiceMethod,
  ServiceError,
} from '@/renderer/services/createServiceMethod';

// ---------------------------------------------------------------------------
// createServiceMethod
// ---------------------------------------------------------------------------

describe('createServiceMethod', () => {
  it('success -> returns data', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: true, data: { id: '1', name: 'test' } });
    const method = createServiceMethod(apiCall);

    const result = await method({ id: '1' });

    expect(result).toEqual({ id: '1', name: 'test' });
    expect(apiCall).toHaveBeenCalledWith({ id: '1' });
  });

  it('failure → ServiceError (code + message)', async () => {
    const apiCall = vi.fn().mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
    const method = createServiceMethod(apiCall);

    await expect(method({})).rejects.toThrow(ServiceError);
    await expect(method({})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('failure with undefined error -> UNKNOWN', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: false });
    const method = createServiceMethod(apiCall);

    await expect(method({})).rejects.toThrow(ServiceError);
    await expect(method({})).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'Unknown error',
    });
  });

  it('IPC communication error -> IPC_ERROR', async () => {
    const apiCall = vi.fn().mockRejectedValue(new Error('Network failure'));
    const method = createServiceMethod(apiCall);

    await expect(method({})).rejects.toThrow(ServiceError);
    await expect(method({})).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'Network failure',
    });
  });

  it('non-Error IPC rejection -> IPC_ERROR with string message', async () => {
    const apiCall = vi.fn().mockRejectedValue('string error');
    const method = createServiceMethod(apiCall);

    await expect(method({})).rejects.toThrow(ServiceError);
    await expect(method({})).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'string error',
    });
  });

  it('success=true & data=undefined -> returns undefined', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: true });
    const method = createServiceMethod(apiCall);

    const result = await method({});

    expect(result).toBeUndefined();
  });

  it('failure with metadata -> ServiceError includes metadata', async () => {
    const apiCall = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION', message: 'Invalid', metadata: { field: 'name' } },
    });
    const method = createServiceMethod(apiCall);

    await expect(method({})).rejects.toMatchObject({
      code: 'VALIDATION',
      metadata: { field: 'name' },
    });
  });
});

// ---------------------------------------------------------------------------
// createVoidServiceMethod
// ---------------------------------------------------------------------------

describe('createVoidServiceMethod', () => {
  it('success -> returns data', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: true, data: [1, 2, 3] });
    const method = createVoidServiceMethod(apiCall);

    const result = await method();

    expect(result).toEqual([1, 2, 3]);
    expect(apiCall).toHaveBeenCalledWith();
  });

  it('failure → ServiceError', async () => {
    const apiCall = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
    const method = createVoidServiceMethod(apiCall);

    await expect(method()).rejects.toThrow(ServiceError);
    await expect(method()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  });

  it('failure with undefined error -> UNKNOWN', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: false });
    const method = createVoidServiceMethod(apiCall);

    await expect(method()).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('IPC communication error -> IPC_ERROR', async () => {
    const apiCall = vi.fn().mockRejectedValue(new Error('Timeout'));
    const method = createVoidServiceMethod(apiCall);

    await expect(method()).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'Timeout',
    });
  });

  it('success=true & data=null -> returns null', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: true, data: null });
    const method = createVoidServiceMethod(apiCall);

    const result = await method();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCommandMethod
// ---------------------------------------------------------------------------

describe('createCommandMethod', () => {
  it('success -> returns void (undefined)', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: true });
    const method = createCommandMethod(apiCall);

    const result = await method({ action: 'delete' });

    expect(result).toBeUndefined();
    expect(apiCall).toHaveBeenCalledWith({ action: 'delete' });
  });

  it('failure → ServiceError', async () => {
    const apiCall = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'Already exists' },
    });
    const method = createCommandMethod(apiCall);

    await expect(method({})).rejects.toThrow(ServiceError);
    await expect(method({})).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Already exists',
    });
  });

  it('failure with undefined error -> UNKNOWN', async () => {
    const apiCall = vi.fn().mockResolvedValue({ success: false });
    const method = createCommandMethod(apiCall);

    await expect(method({})).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('IPC communication error -> IPC_ERROR', async () => {
    const apiCall = vi.fn().mockRejectedValue(new Error('Connection lost'));
    const method = createCommandMethod(apiCall);

    await expect(method({})).rejects.toMatchObject({
      code: 'IPC_ERROR',
      message: 'Connection lost',
    });
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
