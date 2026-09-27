import React, { useState, useEffect, useRef } from 'react';

export interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: 'start' | 'end' | 'center';
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: 'mount' | 'hover';
}

const HEX_CHARS = '0123456789ABCDEF';

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 25,
  maxIterations = 10,
  sequential = true,
  characters = HEX_CHARS,
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'mount',
}) => {
  const [displayText, setDisplayText] = useState<string>(text || '');
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isScrambling, setIsScrambling] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startScramble = () => {
    if (!text) {
      setDisplayText('');
      return;
    }

    let iteration = 0;
    const originalText = String(text);
    const length = originalText.length;
    setIsScrambling(true);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setDisplayText(() => {
        return originalText
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '\n' || char === '\t') return char;

            if (sequential) {
              const revealIndex = Math.floor((iteration / (maxIterations * length)) * length * 1.5);
              if (index < revealIndex) {
                return originalText[index];
              }
            } else if (iteration >= maxIterations) {
              return originalText[index];
            }

            const randomChar = characters[Math.floor(Math.random() * characters.length)] || '0';
            return randomChar;
          })
          .join('');
      });

      iteration += 1;

      if (iteration > maxIterations * (sequential ? 1.5 : 1)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        setDisplayText(originalText);
        setIsScrambling(false);
      }
    }, speed);
  };

  useEffect(() => {
    if (animateOn === 'mount') {
      startScramble();
    } else {
      setDisplayText(text || '');
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, animateOn, speed, characters]);

  const handleMouseEnter = () => {
    if (animateOn === 'hover' && !isHovering) {
      setIsHovering(true);
      startScramble();
    }
  };

  const handleMouseLeave = () => {
    if (animateOn === 'hover') {
      setIsHovering(false);
    }
  };

  return (
    <span
      className={parentClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`${className} ${isScrambling ? encryptedClassName : ''}`}>
        {displayText}
      </span>
    </span>
  );
};

export default DecryptedText;
