import type { CSSProperties, KeyboardEvent } from "react";

export function ResizeHandle({
  direction,
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueCommit,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  direction: "horizontal" | "vertical";
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  style?: CSSProperties;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const decreaseKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const increaseKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    let nextValue: number | null = null;

    if (event.key === decreaseKey) {
      nextValue = Math.max(value - step, min);
    } else if (event.key === increaseKey) {
      nextValue = Math.min(value + step, max);
    } else if (event.key === "Home") {
      nextValue = min;
    } else if (event.key === "End") {
      nextValue = max;
    }

    if (nextValue === null) return;
    event.preventDefault();
    onValueChange(nextValue);
    onValueCommit?.(nextValue);
  };

  return (
    <div
      className={`resize-handle resize-handle--${direction}`}
      role="separator"
      tabIndex={0}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      style={style}
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}
