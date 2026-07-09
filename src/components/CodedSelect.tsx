export type CodedOption = {
  code: string;
  display: string;
  system?: string;
};

type CodedSelectProps = {
  label: string;
  value: string;
  options: CodedOption[];
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
};

export default function CodedSelect({
  label,
  value,
  options,
  onChange,
  required,
  disabled,
  id,
}: CodedSelectProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label htmlFor={selectId}>
      {label}
      {required ? " *" : ""}
      <select
        id={selectId}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.display}
          </option>
        ))}
      </select>
    </label>
  );
}

type CodedRadioGroupProps = {
  label: string;
  name: string;
  value: string;
  options: CodedOption[];
  onChange: (code: string) => void;
  disabled?: boolean;
};

export function CodedRadioGroup({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
}: CodedRadioGroupProps) {
  return (
    <fieldset className="coded-radio-group" disabled={disabled}>
      <legend>{label}</legend>
      <div className="choices">
        {options.map((opt) => (
          <label key={opt.code} className="choice">
            <input
              type="radio"
              name={name}
              value={opt.code}
              checked={value === opt.code}
              onChange={() => onChange(opt.code)}
            />
            {opt.display}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
