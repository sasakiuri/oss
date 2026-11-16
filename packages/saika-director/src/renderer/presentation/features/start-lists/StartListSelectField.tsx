import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';

import { mutedLabelClass, smallInputClass } from '../shared/common/formClasses';

/** A labelled select over enum values, shown in sentence case. */
export function StartListSelectField({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  values: readonly string[];
}) {
  return (
    <label className={mutedLabelClass}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={smallInputClass}>
        {values.map((item) => (
          <option key={item} value={item}>
            {sentenceCaseLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
