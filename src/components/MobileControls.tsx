import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface MobileControlsProps {
  onMoveStart: (direction: 'forward' | 'back' | 'left' | 'right') => void;
  onMoveEnd: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMoveStart, onMoveEnd }: MobileControlsProps) => {
  const handleTouchStart = (direction: 'forward' | 'back' | 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    onMoveStart(direction);
  };

  const handleTouchEnd = (direction: 'forward' | 'back' | 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    onMoveEnd(direction);
  };

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
