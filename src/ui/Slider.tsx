interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  unit?: string;
  tooltip?: string;
  onChange(value: number): void;
}

export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  unit = "",
  tooltip,
  onChange,
}: SliderProps) {
  const progress =
    max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <label className="slider" title={tooltip}>
      <span className="slider__header">
        <span className="field-label">{label}</span>
        <output>{value}{unit}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--slider-progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
