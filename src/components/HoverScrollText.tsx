import React, { useRef, useState, useEffect } from 'react';

interface HoverScrollTextProps {
  text: string;
  className?: string;
  maxWidthClass?: string;
}

export const HoverScrollText: React.FC<HoverScrollTextProps> = ({
  text,
  className = '',
  maxWidthClass = 'max-w-[200px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);

  const checkOverflow = () => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = textRef.current.scrollWidth;
      if (textWidth > containerWidth) {
        setIsOverflowing(true);
        setScrollDistance(textWidth - containerWidth + 8); // 8px buffer
      } else {
        setIsOverflowing(false);
        setScrollDistance(0);
      }
    }
  };

  useEffect(() => {
    checkOverflow();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`hover-scroll-container ${maxWidthClass} ${className}`}
      title={text}
      onMouseEnter={checkOverflow}
    >
      <span
        ref={textRef}
        className={`hover-scroll-inner inline-block ${isOverflowing ? 'is-overflowing cursor-help' : ''}`}
        style={
          isOverflowing
            ? ({
                '--scroll-distance': `-${scrollDistance}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
};
