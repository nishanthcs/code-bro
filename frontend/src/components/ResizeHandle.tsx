import type { CSSProperties } from "react";

export function ResizeHandle({
  direction,
  label,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  direction: "horizontal" | "vertical";
  label: string;
  style?: CSSProperties;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={`resize-handle resize-handle--${direction}`}
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-label={label}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}
