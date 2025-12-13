import { Button } from '@/components/ui/button';

interface MobileControlsProps {
  onMove: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMove }: MobileControlsProps) => {
  return (
    <div className="absolute inset-x-0 bottom-8 z-40 md:hidden pointer-events-none">
      <div className="flex justify-between items-end px-6">
        {/* Left side: Left/Right rotation */}
        <div className="flex flex-col gap-2 pointer-events-auto">
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
            onTouchStart={() => onMove('right')}
            onClick={() => onMove('right')}
            className="w-14 h-14 rounded-xl text-xl"
          >
            →
          </Button>
        </div>

        {/* Right side: Forward/Back movement */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <Button
            variant="secondary"
            size="lg"
            onTouchStart={() => onMove('forward')}
            onClick={() => onMove('forward')}
            className="w-14 h-14 rounded-xl text-xl"
          >
            ↑
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
        </div>
      </div>
    </div>
  );
};
