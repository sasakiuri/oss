import { Input, Label } from '@/components/ui';

import type { Length } from '../model';

interface LengthFieldProps {
  id: string;
  label: string;
  value: Length;
  onChange: (value: Length) => void;
  description?: string;
  readOnly?: boolean;
}

export function LengthField({ id, label, value, onChange, description, readOnly }: LengthFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          step="any"
          value={Number.isNaN(value.number) ? '' : value.number}
          readOnly={readOnly}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) => onChange({ ...value, number: event.target.valueAsNumber })}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{value.unit}</span>
      </div>
      {description && (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
