import React, { useEffect, useRef, useState } from 'react';

export interface CountUpProps {
  to: number | string;
  from?: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  separator?: string;
  className?: string;
  direction?: 'up' | 'down';
  onStart?: () => void;
  onEnd?: () => void;
}

export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  duration = 1.2,
  delay = 0,
  decimals,
  separator = '',
  className = '',
  direction = 'up',
  onStart,
  onEnd,
}) => {
  const targetNumber = typeof to === 'number' ? to : parseFloat(to) || 0;
  const isTargetFloat = String(to).includes('.');
  const calculatedDecimals =
    decimals !== undefined
      ? decimals
      : isTargetFloat
        ? (String(to).split('.')[1]?.length || 1)
        : 0;

  const [currentVal, setCurrentVal] = useState<number>(from);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const prevTargetRef = useRef<number>(from);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const startValue = prevTargetRef.current;
    const endValue = targetNumber;

    if (startValue === endValue) {
      setCurrentVal(endValue);
      return;
    }

    const startAnimation = () => {
      onStart?.();
      const durationMs = duration * 1000;

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / durationMs, 1);

        // Ease out expo / cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const nextValue = startValue + (endValue - startValue) * easeOut;

        setCurrentVal(nextValue);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setCurrentVal(endValue);
          prevTargetRef.current = endValue;
          startTimeRef.current = null;
          onEnd?.();
        }
      };

      startTimeRef.current = null;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      timeoutId = setTimeout(startAnimation, delay * 1000);
    } else {
      startAnimation();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [targetNumber, duration, delay, direction]);

  const formattedValue = () => {
    const fixed = currentVal.toFixed(calculatedDecimals);
    if (!separator) return fixed;
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return parts.join('.');
  };

  return (
    <span className={`tabular-nums font-mono ${className}`}>
      {formattedValue()}
    </span>
  );
};

export default CountUp;
