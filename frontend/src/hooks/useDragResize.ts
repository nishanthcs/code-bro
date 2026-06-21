import { useCallback, useRef, type RefObject } from "react";

export function useDragResize({
  direction,
  min,
  max,
  onChange,
  onCommit,
}: {
  direction: "horizontal" | "vertical";
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  const dragState = useRef<{
    startPos: number;
    startValue: number;
    latestValue: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, startValue: number) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        startPos: direction === "horizontal" ? event.clientX : event.clientY,
        startValue,
        latestValue: startValue,
      };
    },
    [direction],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = dragState.current;
      if (!state) return;

      const currentPos = direction === "horizontal" ? event.clientX : event.clientY;
      const delta = currentPos - state.startPos;
      const signedDelta = direction === "horizontal" ? -delta : delta;
      const nextValue = Math.min(
        Math.max(state.startValue + signedDelta, min),
        max,
      );
      state.latestValue = nextValue;
      onChange(nextValue);
    },
    [direction, max, min, onChange],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = dragState.current;
      if (!state) return;
      dragState.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit?.(state.latestValue);
    },
    [onCommit],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: finishDrag,
    handlePointerCancel: finishDrag,
  };
}

export function useVerticalPercentResize({
  containerRef,
  min,
  max,
  onChange,
  onCommit,
}: {
  containerRef: RefObject<HTMLElement | null>;
  min: number;
  max: number;
  onChange: (percent: number) => void;
  onCommit?: (percent: number) => void;
}) {
  const dragState = useRef<{
    startY: number;
    startPercent: number;
    latestPercent: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, startPercent: number) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        startY: event.clientY,
        startPercent,
        latestPercent: startPercent,
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = dragState.current;
      const container = containerRef.current;
      if (!state || !container) return;

      const height = container.getBoundingClientRect().height;
      if (height <= 0) return;

      const deltaPercent = ((event.clientY - state.startY) / height) * 100;
      const nextPercent = Math.min(
        Math.max(state.startPercent + deltaPercent, min),
        max,
      );
      state.latestPercent = nextPercent;
      onChange(nextPercent);
    },
    [containerRef, max, min, onChange],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = dragState.current;
      if (!state) return;
      dragState.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit?.(state.latestPercent);
    },
    [onCommit],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: finishDrag,
    handlePointerCancel: finishDrag,
  };
}
