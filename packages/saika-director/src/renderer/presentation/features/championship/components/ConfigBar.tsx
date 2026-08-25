import { useState, useEffect, type ChangeEvent, type FocusEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

interface ConfigBarProps {
  relayCount: number;
  firingPointCount: number;
  onRelayCountChange: (count: number) => void;
  onFiringPointCountChange: (count: number) => void;
}

interface NumberStepperProps {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

function NumberStepper({ label, value, min = 1, onChange }: NumberStepperProps) {
  const [rawValue, setRawValue] = useState(String(value));

  useEffect(() => {
    setRawValue(String(value));
  }, [value]);

  const handleDecrement = () => {
    if (value > min) onChange(value - 1);
  };

  const handleIncrement = () => {
    onChange(value + 1);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setRawValue(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10);
    if (isNaN(parsed) || parsed < min) {
      onChange(min);
    }
    setRawValue(String(value));
  };

  return (
    <label className="flex items-center gap-2 text-xs text-vscode-text-muted">
      {label}
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="h-8 rounded-l-[3px] border border-vscode-border bg-vscode-input px-1.5 text-vscode-text transition-colors hover:bg-vscode-hover disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={rawValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className="h-8 w-10 border-y border-vscode-border bg-vscode-input px-1 text-center text-[13px] text-vscode-text"
        />
        <button
          type="button"
          onClick={handleIncrement}
          aria-label={`Increase ${label}`}
          className="h-8 rounded-r-[3px] border border-vscode-border bg-vscode-input px-1.5 text-vscode-text transition-colors hover:bg-vscode-hover"
        >
          <Plus size={14} />
        </button>
      </div>
    </label>
  );
}

export function ConfigBar({
  relayCount,
  firingPointCount,
  onRelayCountChange,
  onFiringPointCountChange,
}: ConfigBarProps) {
  return (
    <div className="flex items-center gap-4">
      <NumberStepper label="Relays:" value={relayCount} onChange={onRelayCountChange} />
      <NumberStepper label="Firing points:" value={firingPointCount} onChange={onFiringPointCountChange} />
    </div>
  );
}
