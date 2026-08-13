interface CheckboxProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  tooltip?: string;
  onChange(checked: boolean): void;
}

export default function Checkbox({
  label,
  checked,
  disabled = false,
  tooltip,
  onChange,
}: CheckboxProps) {
  return (
    <label className="checkbox" title={tooltip}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
