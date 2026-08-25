import type { InputHTMLAttributes } from 'react';
import { useIMEInput } from '@/renderer/presentation/hooks/useIMEInput';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  onChange?: (value: string) => void;
}

export function Input({ label, className = '', id, value, onChange, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const ime = useIMEInput(typeof value === 'string' ? value : '', onChange ?? (() => {}));

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-vscode-text-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        lang="en"
        className={`min-h-9 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1.5 text-[13px] text-vscode-text transition-colors placeholder:text-vscode-dimmed disabled:opacity-50 ${className}`}
        value={ime.value}
        onChange={ime.onChange}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        {...props}
      />
    </div>
  );
}
