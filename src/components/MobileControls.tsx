import { useRef, useCallback, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface MobileControlsProps {
  onMove: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMove }: MobileControlsProps) => {
  const activeDirectionsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startMove = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    activeDirectionsRef.current.add(direction);
    
    // Start continuous movement if not already running
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        activeDirectionsRef.current.forEach((dir) => {
          onMove(dir as 'forward' | 'back' | 'left' | 'right');
        });
      }, 50);
    }
  }, [onMove]);

  const stopMove = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    activeDirectionsRef.current.delete(direction);
    
    // Stop interval if no directions are active
    if (activeDirectionsRef.current.size === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    startMove(direction);
  }, [startMove]);

  const handleTouchEnd = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    stopMove(direction);
  }, [stopMove]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const buttonClass = "w-14 h-14 flex items-center justify-center rounded-full bg-secondary/60 backdrop-blur-sm border-2 border-secondary/80 active:bg-secondary/90 touch-none select-none";

  return (
    <div className="absolute bottom-6 left-6 z-40 md:hidden">
      <div className="flex flex-col items-center gap-1">
        {/* Up button */}
        <button
          className={buttonClass}
          onTouchStart={handleTouchStart('forward')}
          onTouchEnd={handleTouchEnd('forward')}
          onTouchCancel={handleTouchEnd('forward')}
        >
          <ArrowUp className="w-7 h-7 text-secondary-foreground" />
        </button>
        
        {/* Left and Right buttons */}
        <div className="flex gap-12">
          <button
            className={buttonClass}
            onTouchStart={handleTouchStart('left')}
            onTouchEnd={handleTouchEnd('left')}
            onTouchCancel={handleTouchEnd('left')}
          >
            <ArrowLeft className="w-7 h-7 text-secondary-foreground" />
          </button>
          <button
            className={buttonClass}
            onTouchStart={handleTouchStart('right')}
            onTouchEnd={handleTouchEnd('right')}
            onTouchCancel={handleTouchEnd('right')}
          >
            <ArrowRight className="w-7 h-7 text-secondary-foreground" />
          </button>
        </div>
        
        {/* Down button */}
        <button
          className={buttonClass}
          onTouchStart={handleTouchStart('back')}
          onTouchEnd={handleTouchEnd('back')}
          onTouchCancel={handleTouchEnd('back')}
        >
          <ArrowDown className="w-7 h-7 text-secondary-foreground" />
        </button>
      </div>
    </div>
  );
};
