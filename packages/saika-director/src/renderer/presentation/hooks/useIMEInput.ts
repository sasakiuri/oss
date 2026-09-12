import { useState, useCallback, useRef, useEffect, CompositionEvent, ChangeEvent } from 'react';

type InputElement = HTMLInputElement | HTMLTextAreaElement;

interface UseIMEInputReturn<T extends InputElement> {
  value: string;
  onChange: (e: ChangeEvent<T>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (e: CompositionEvent<T>) => void;
}

/** Keeps IME composition local and calls onChange when composition ends. */
export function useIMEInput<T extends InputElement = HTMLInputElement>(
  value: string,
  onChange: (value: string) => void,
): UseIMEInputReturn<T> {
  const isComposing = useRef(false);
  const [internalValue, setInternalValue] = useState(value);

  useEffect(() => {
    if (!isComposing.current) {
      setInternalValue(value);
    }
  }, [value]);

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: CompositionEvent<T>) => {
      isComposing.current = false;
      onChange(e.currentTarget.value);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<T>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);

      if (!isComposing.current) {
        onChange(newValue);
      }
    },
    [onChange],
  );

  return {
    value: internalValue,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
