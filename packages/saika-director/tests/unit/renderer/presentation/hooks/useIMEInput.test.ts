import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIMEInput } from '@/renderer/presentation/hooks/useIMEInput';

describe('useIMEInput', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnChange = vi.fn();
  });

  it('should return initial value', () => {
    const { result } = renderHook(() => useIMEInput('hello', mockOnChange));
    expect(result.current.value).toBe('hello');
  });

  it('should call onChange on non-composing input', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));

    act(() => {
      result.current.onChange({
        target: { value: 'test' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe('test');
    expect(mockOnChange).toHaveBeenCalledWith('test');
  });

  it('should not call onChange during composition', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));

    act(() => {
      result.current.onCompositionStart();
    });

    act(() => {
      result.current.onChange({
        target: { value: 'él' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe('él');
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('should call onChange on compositionEnd', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));

    act(() => {
      result.current.onCompositionStart();
    });

    act(() => {
      result.current.onChange({
        target: { value: 'élan' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.onCompositionEnd({
        currentTarget: { value: 'élan' },
      } as React.CompositionEvent<HTMLInputElement>);
    });

    expect(mockOnChange).toHaveBeenCalledWith('élan');
  });

  it('should sync with external value changes when not composing', () => {
    const { result, rerender } = renderHook(({ value }) => useIMEInput(value, mockOnChange), {
      initialProps: { value: 'initial' },
    });

    expect(result.current.value).toBe('initial');

    rerender({ value: 'updated' });
    expect(result.current.value).toBe('updated');
  });

  it('should not sync with external value during composition', () => {
    const { result, rerender } = renderHook(({ value }) => useIMEInput(value, mockOnChange), {
      initialProps: { value: 'initial' },
    });

    act(() => {
      result.current.onCompositionStart();
    });

    act(() => {
      result.current.onChange({
        target: { value: 'café' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    // External value changes should not override composing value
    rerender({ value: 'external-update' });
    expect(result.current.value).toBe('café');
  });

  it('should handle empty string value', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));
    expect(result.current.value).toBe('');
  });

  it('should handle rapid value changes', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));

    act(() => {
      result.current.onChange({ target: { value: 'a' } } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.onChange({ target: { value: 'ab' } } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.onChange({ target: { value: 'abc' } } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe('abc');
    expect(mockOnChange).toHaveBeenCalledTimes(3);
  });

  it('should resume onChange after composition ends', () => {
    const { result } = renderHook(() => useIMEInput('', mockOnChange));

    // Start composition
    act(() => {
      result.current.onCompositionStart();
    });

    act(() => {
      result.current.onChange({ target: { value: 'e' } } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(mockOnChange).not.toHaveBeenCalled();

    // End composition
    act(() => {
      result.current.onCompositionEnd({
        currentTarget: { value: 'é' },
      } as React.CompositionEvent<HTMLInputElement>);
    });

    // After composition ends, normal input should call onChange
    act(() => {
      result.current.onChange({ target: { value: 'été' } } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(mockOnChange).toHaveBeenCalledWith('été');
  });
});
