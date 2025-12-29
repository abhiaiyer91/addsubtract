import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number[]) => void;
  className?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      defaultValue = [0],
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      onValueChange,
      className,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const trackRef = React.useRef<HTMLDivElement>(null);

    const currentValue = value ?? internalValue;
    const percentage = ((currentValue[0] - min) / (max - min)) * 100;

    const handleChange = (newValue: number) => {
      // Clamp value to min/max
      const clampedValue = Math.min(max, Math.max(min, newValue));
      // Round to step
      const steppedValue = Math.round(clampedValue / step) * step;

      const newValues = [steppedValue];

      if (value === undefined) {
        setInternalValue(newValues);
      }
      onValueChange?.(newValues);
    };

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newValue = min + percent * (max - min);
      handleChange(newValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      let newValue = currentValue[0];

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          newValue = currentValue[0] + step;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          newValue = currentValue[0] - step;
          break;
        case 'Home':
          newValue = min;
          break;
        case 'End':
          newValue = max;
          break;
        default:
          return;
      }

      e.preventDefault();
      handleChange(newValue);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <div
          ref={trackRef}
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20 cursor-pointer"
          onClick={handleTrackClick}
        >
          <div
            className="absolute h-full bg-primary"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={currentValue[0]}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow',
            'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'hover:bg-accent',
            disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
          )}
          style={{ left: `calc(${percentage}% - 8px)` }}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => {
            if (disabled) return;

            const startX = e.clientX;
            const startValue = currentValue[0];
            const trackWidth = trackRef.current?.getBoundingClientRect().width ?? 1;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const delta = moveEvent.clientX - startX;
              const valueDelta = (delta / trackWidth) * (max - min);
              handleChange(startValue + valueDelta);
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
