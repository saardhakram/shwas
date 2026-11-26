import { useEffect, useRef, useState } from 'react';

export function useAnimatedNumber(target: number, resetKey: number, duration = 300): number {
  const [state, setState] = useState({ value: target, resetKey });
  const currentRef = useRef(target);

  useEffect(() => {
    let animationFrameId: number;

    if (state.resetKey !== resetKey || Math.abs(target - currentRef.current) < 0.01) {
      animationFrameId = requestAnimationFrame(() => {
        currentRef.current = target;
        setState({ value: target, resetKey });
      });
      return () => cancelAnimationFrame(animationFrameId);
    }

    let startTimestamp: number | null = null;
    const startValue = currentRef.current;
    const diff = target - startValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const nextVal = startValue + diff * (1 - Math.pow(1 - progress, 3));
      currentRef.current = nextVal;
      setState({ value: nextVal, resetKey });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        currentRef.current = target;
        setState({ value: target, resetKey });
      }
    };

    animationFrameId = requestAnimationFrame(step);
    const safetyTimer = setTimeout(() => {
      currentRef.current = target;
      setState({ value: target, resetKey });
    }, duration + 80);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(safetyTimer);
    };
  }, [target, resetKey, duration, state.resetKey]);

  return state.resetKey !== resetKey ? target : state.value;
}
