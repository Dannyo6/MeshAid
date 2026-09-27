import React, { useRef, useEffect, useState } from 'react';

export interface SquaresProps {
  direction?: 'diagonal' | 'up' | 'down' | 'left' | 'right';
  speed?: number;
  squareSize?: number;
  borderColor?: string;
  hoverFillColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Squares: React.FC<SquaresProps> = ({
  direction = 'diagonal',
  speed = 0.2,
  squareSize = 40,
  borderColor = '#1a1e29',
  hoverFillColor = '#1e2433',
  className = '',
  style = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = container.offsetWidth || window.innerWidth);
    let height = (canvas.height = container.offsetHeight || window.innerHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = canvas.width = entry.contentRect.width;
        height = canvas.height = entry.contentRect.height;
      }
    });

    resizeObserver.observe(container);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        setMousePos({ x, y });
      } else {
        setMousePos(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const render = () => {
      // Update offset based on direction and speed
      switch (direction) {
        case 'diagonal':
          offsetRef.current.x = (offsetRef.current.x + speed) % squareSize;
          offsetRef.current.y = (offsetRef.current.y + speed) % squareSize;
          break;
        case 'up':
          offsetRef.current.y = (offsetRef.current.y - speed + squareSize) % squareSize;
          break;
        case 'down':
          offsetRef.current.y = (offsetRef.current.y + speed) % squareSize;
          break;
        case 'left':
          offsetRef.current.x = (offsetRef.current.x - speed + squareSize) % squareSize;
          break;
        case 'right':
          offsetRef.current.x = (offsetRef.current.x + speed) % squareSize;
          break;
      }

      ctx.clearRect(0, 0, width, height);

      const startX = Math.floor(offsetRef.current.x % squareSize) - squareSize;
      const startY = Math.floor(offsetRef.current.y % squareSize) - squareSize;

      // Draw hovered square highlight if mouse is over canvas
      if (mousePos) {
        const hoverCol = Math.floor((mousePos.x - startX) / squareSize);
        const hoverRow = Math.floor((mousePos.y - startY) / squareSize);
        const cellX = startX + hoverCol * squareSize;
        const cellY = startY + hoverRow * squareSize;

        ctx.fillStyle = hoverFillColor;
        ctx.fillRect(cellX, cellY, squareSize, squareSize);
      }

      // Draw grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = borderColor;

      ctx.beginPath();
      // Vertical grid lines
      for (let x = startX; x <= width + squareSize; x += squareSize) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      // Horizontal grid lines
      for (let y = startY; y <= height + squareSize; y += squareSize) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [direction, speed, squareSize, borderColor, hoverFillColor, mousePos]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none fixed inset-0 overflow-hidden ${className}`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default Squares;
