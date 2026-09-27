import React, { useRef, useState } from 'react';

export interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: React.CSSProperties;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(239, 68, 68, 0.15)',
  style = {},
  contentClassName = '',
  contentStyle = {},
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState<number>(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setOpacity(1);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden transition-colors ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {/* ── Spotlight Radial Illumination Layer ── */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity,
          background: `radial-gradient(350px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
          zIndex: 1,
        }}
      />

      {/* ── 1px Border Glow Highlight ── */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: opacity * 0.8,
          border: '1px solid transparent',
          background: `radial-gradient(280px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%) border-box`,
          WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'destination-out',
          maskComposite: 'exclude',
          zIndex: 2,
        }}
      />

      {/* ── Content Container ── */}
      <div
        className={contentClassName}
        style={{
          position: 'relative',
          zIndex: 3,
          height: '100%',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SpotlightCard;
