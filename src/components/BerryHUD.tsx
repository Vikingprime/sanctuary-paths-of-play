import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface BerryHUDProps {
  berryCount: number;
  onDragStart?: () => void;
  onDragEnd?: (targetAnimalId: string | null) => void;
  animalBounds?: { x: number; y: number; width: number; height: number } | null;
  className?: string;
}

// HUD element showing berry count with drag-to-feed functionality
export const BerryHUD = ({
  berryCount,
  onDragStart,
  onDragEnd,
  animalBounds,
  className,
}: BerryHUDProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [showPlusOne, setShowPlusOne] = useState(false);
  const berryRef = useRef<HTMLDivElement>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (berryCount <= 0) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragPosition({ x: touch.clientX, y: touch.clientY });
    onDragStart?.();
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    setDragPosition({ x: touch.clientX, y: touch.clientY });
  };
  
  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    // Check if dropped on animal
    let targetAnimal: string | null = null;
    if (animalBounds) {
      const { x, y, width, height } = animalBounds;
      if (
        dragPosition.x >= x &&
        dragPosition.x <= x + width &&
        dragPosition.y >= y &&
        dragPosition.y <= y + height
      ) {
        targetAnimal = 'player'; // Current player animal
        setShowPlusOne(true);
        setTimeout(() => setShowPlusOne(false), 1000);
      }
    }
    
    setIsDragging(false);
    onDragEnd?.(targetAnimal);
  };
  
  // Mouse support for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (berryCount <= 0) return;
    
    setIsDragging(true);
    setDragPosition({ x: e.clientX, y: e.clientY });
    onDragStart?.();
  };
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp = () => {
      let targetAnimal: string | null = null;
      if (animalBounds) {
        const { x, y, width, height } = animalBounds;
        if (
          dragPosition.x >= x &&
          dragPosition.x <= x + width &&
          dragPosition.y >= y &&
          dragPosition.y <= y + height
        ) {
          targetAnimal = 'player';
          setShowPlusOne(true);
          setTimeout(() => setShowPlusOne(false), 1000);
        }
      }
      
      setIsDragging(false);
      onDragEnd?.(targetAnimal);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragPosition, animalBounds, onDragEnd]);
  
  return (
    <>
      {/* Berry counter in HUD */}
      <div
        ref={berryRef}
        className={cn(
          'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg flex items-center gap-2 cursor-grab active:cursor-grabbing select-none',
          berryCount <= 0 && 'opacity-50',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <span className="text-xl">🍓</span>
        <span className="font-display font-bold text-foreground">{berryCount}</span>
        
        {/* Hint text */}
        {berryCount > 0 && (
          <span className="text-xs text-muted-foreground hidden sm:inline">Drag to feed</span>
        )}
      </div>
      
      {/* Dragging berry indicator */}
      {isDragging && (
        <div
          className="fixed z-[100] pointer-events-none animate-pulse"
          style={{
            left: dragPosition.x - 20,
            top: dragPosition.y - 20,
          }}
        >
          <span className="text-4xl drop-shadow-lg">🍓</span>
        </div>
      )}
      
      {/* +1 Friend Point animation */}
      {showPlusOne && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none animate-bounce">
          <div className="bg-primary text-primary-foreground rounded-full px-4 py-2 font-display font-bold text-lg shadow-lg">
            +1 ❤️ Friend Point!
          </div>
        </div>
      )}
    </>
  );
};
