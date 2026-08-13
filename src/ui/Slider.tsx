import { useId } from "react";

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
  const labelId = useId();
  const progress =
    max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="slider" title={tooltip}>
      <span className="slider__header">
        <span id={labelId} className="field-label">
          {label}
        </span>
        <output aria-live="polite" aria-atomic="true">
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-labelledby={labelId}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--slider-progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
