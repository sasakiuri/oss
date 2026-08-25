import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockAddEntry = vi.fn();
const mockSetEntries = vi.fn();
const mockToggleVisibility = vi.fn();
const mockSetActiveTab = vi.fn();
const mockClear = vi.fn();
let mockEntries: unknown[] = [];
let mockIsVisible = false;
let mockActiveTab = 'ALL';

vi.mock('@/renderer/presentation/stores/system/debug.store', () => ({
  useDebugStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      entries: mockEntries,
      addEntry: mockAddEntry,
      setEntries: mockSetEntries,
      isVisible: mockIsVisible,
      activeTab: mockActiveTab,
      toggleVisibility: mockToggleVisibility,
      setActiveTab: mockSetActiveTab,
      clear: mockClear,
    };
    return selector(state);
  },
}));

// Mock only window.electronAPI, not the entire window
beforeAll(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      queries: {
        getDebugLog: vi.fn().mockResolvedValue({
          success: true,
          data: { entries: [{ timestamp: 1, direction: 'LOG', raw: 'test' }] },
        }),
      },
    },
    writable: true,
    configurable: true,
  });
});

import { useDebugLog } from '@/renderer/presentation/hooks/useDebugLog';

describe('useDebugLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries = [];
    mockIsVisible = false;
    mockActiveTab = 'ALL';
  });

  it('should return entries', () => {
    mockEntries = [{ timestamp: 1, direction: 'LOG', raw: 'test' }];
    const { result } = renderHook(() => useDebugLog());
    expect(result.current.entries).toHaveLength(1);
  });

  it('should expose addEntry', () => {
    const { result } = renderHook(() => useDebugLog());
    const entry = { timestamp: 1, direction: 'LOG' as const, raw: 'test' };
    result.current.addEntry(entry);
    expect(mockAddEntry).toHaveBeenCalledWith(entry);
  });

  it('should expose toggleVisibility', () => {
    const { result } = renderHook(() => useDebugLog());
    result.current.toggleVisibility();
    expect(mockToggleVisibility).toHaveBeenCalled();
  });

  it('should expose setActiveTab', () => {
    const { result } = renderHook(() => useDebugLog());
    result.current.setActiveTab('TX');
    expect(mockSetActiveTab).toHaveBeenCalledWith('TX');
  });

  it('should expose clear', () => {
    const { result } = renderHook(() => useDebugLog());
    result.current.clear();
    expect(mockClear).toHaveBeenCalled();
  });

  it('should return isVisible', () => {
    mockIsVisible = true;
    const { result } = renderHook(() => useDebugLog());
    expect(result.current.isVisible).toBe(true);
  });

  it('should return activeTab', () => {
    mockActiveTab = 'RX';
    const { result } = renderHook(() => useDebugLog());
    expect(result.current.activeTab).toBe('RX');
  });

  it('should expose refreshLog', () => {
    const { result } = renderHook(() => useDebugLog());
    expect(result.current.refreshLog).toBeDefined();
    expect(typeof result.current.refreshLog).toBe('function');
  });
});
