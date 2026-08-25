import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { CalendarPopup } from './CalendarPopup';
import { isoToDisplay, displayToIso, isValidDisplayDate, autoFormatDate } from './dateUtils';

interface DateInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function DateInput({
  label,
  value,
  onChange,
  placeholder = 'YYYY/MM/DD',
  required,
  disabled,
  id,
  className = '',
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState(isoToDisplay(value));
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);

  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    setDisplayValue(isoToDisplay(value));
  }, [value]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = autoFormatDate(e.target.value);
    setDisplayValue(formatted);

    if (isComposing.current) return;

    if (formatted.length === 10 && isValidDisplayDate(formatted)) {
      onChange(displayToIso(formatted));
    } else if (formatted.length === 0) {
      onChange('');
    }
  };

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      const formatted = autoFormatDate(e.currentTarget.value);
      setDisplayValue(formatted);

      if (formatted.length === 10 && isValidDisplayDate(formatted)) {
        onChange(displayToIso(formatted));
      } else if (formatted.length === 0) {
        onChange('');
      }
    },
    [onChange],
  );

  const handleBlur = () => {
    if (displayValue.length !== 10 || !isValidDisplayDate(displayValue)) {
      setDisplayValue(isoToDisplay(value));
    }
  };

  const handleCalendarSelect = (isoDate: string) => {
    onChange(isoDate);
    setDisplayValue(isoToDisplay(isoDate));
    setIsOpen(false);
  };

  const toggleCalendar = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-vscode-text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          lang="en"
          value={displayValue}
          onChange={handleInput}
          onBlur={handleBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="min-h-9 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1.5 pr-10 text-[13px] text-vscode-text transition-colors placeholder:text-vscode-dimmed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={toggleCalendar}
          disabled={disabled}
          aria-label="Open calendar"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text disabled:opacity-50"
        >
          <Calendar size={16} aria-hidden="true" />
        </button>
        {isOpen && (
          <div className="absolute left-0 top-full z-50 mt-1">
            <CalendarPopup selectedDate={value} onSelect={handleCalendarSelect} onClose={() => setIsOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
