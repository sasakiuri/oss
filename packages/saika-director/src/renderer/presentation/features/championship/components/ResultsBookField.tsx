import { inputClass, stackedLabelClass } from '../../shared/common/formClasses';

/** A labelled text input of the Results Book forms. */
export function ResultsBookField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'decimal';
}) {
  return (
    <label className={stackedLabelClass}>
      {label}
      <input
        className={inputClass}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
