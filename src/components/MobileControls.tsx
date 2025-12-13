import { Button } from '@/components/ui/button';

interface MobileControlsProps {
  onMove: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMove }: MobileControlsProps) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden">
      <div className="flex flex-col items-center gap-2">
        {/* Forward */}
        <Button
          variant="secondary"
          size="lg"
          onTouchStart={() => onMove('forward')}
          onClick={() => onMove('forward')}
          className="w-14 h-14 rounded-xl text-xl"
        >
          ↑
        </Button>

        {/* Middle row: Left, Back, Right */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            onTouchStart={() => onMove('left')}
            onClick={() => onMove('left')}
            className="w-14 h-14 rounded-xl text-xl"
          >
            ←
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onTouchStart={() => onMove('back')}
            onClick={() => onMove('back')}
            className="w-14 h-14 rounded-xl text-xl"
          >
            ↓
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onTouchStart={() => onMove('right')}
            onClick={() => onMove('right')}
            className="w-14 h-14 rounded-xl text-xl"
          >
            →
          </Button>
        </div>
      </div>
    </div>
  );
};
