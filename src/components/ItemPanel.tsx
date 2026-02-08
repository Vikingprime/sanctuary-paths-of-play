import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ItemPanelProps {
  appleCount: number;
  onAppleDrop: () => void;
  animalBounds?: { x: number; y: number; width: number; height: number } | null;
  friendshipProgress?: {
    currentTier: { id: string; name: string; pointsRequired: number };
    nextTier: { id: string; name: string; pointsRequired: number } | null;
    progress: number;
  };
  className?: string;
}

// Right-side item panel for gameplay with draggable apples
export const ItemPanel = ({
  appleCount,
  onAppleDrop,
  animalBounds,
  friendshipProgress,
  className,
}: ItemPanelProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [showFeedback, setShowFeedback] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (appleCount <= 0) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragPosition({ x: touch.clientX, y: touch.clientY });
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    setDragPosition({ x: touch.clientX, y: touch.clientY });
  };
  
  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    // Check if dropped on animal
    if (animalBounds) {
      const { x, y, width, height } = animalBounds;
      if (
        dragPosition.x >= x &&
        dragPosition.x <= x + width &&
        dragPosition.y >= y &&
        dragPosition.y <= y + height
      ) {
        onAppleDrop();
        setShowFeedback(true);
        setTimeout(() => setShowFeedback(false), 1000);
      }
    }
    
    setIsDragging(false);
  };
  
  // Mouse support for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (appleCount <= 0) return;
    
    setIsDragging(true);
    setDragPosition({ x: e.clientX, y: e.clientY });
  };
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp = () => {
      if (animalBounds) {
        const { x, y, width, height } = animalBounds;
        if (
          dragPosition.x >= x &&
          dragPosition.x <= x + width &&
          dragPosition.y >= y &&
          dragPosition.y <= y + height
        ) {
          onAppleDrop();
          setShowFeedback(true);
          setTimeout(() => setShowFeedback(false), 1000);
        }
      }
      
      setIsDragging(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragPosition, animalBounds, onAppleDrop]);
  
  return (
    <>
      {/* Item Panel */}
      <div
        ref={panelRef}
        className={cn(
          'bg-card/90 backdrop-blur-sm rounded-xl p-3 shadow-lg flex flex-col gap-3 pointer-events-auto',
          className
        )}
      >
        {/* Title */}
        <div className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">
          Items
        </div>
        
        {/* Apple slot */}
        <div
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-dashed transition-all cursor-grab active:cursor-grabbing select-none',
            appleCount > 0 
              ? 'border-primary/50 bg-primary/10 hover:bg-primary/20' 
              : 'border-muted opacity-50 cursor-not-allowed'
          )}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <span className="text-2xl">🍎</span>
          <span className="font-display font-bold text-foreground text-sm">
            ×{appleCount}
          </span>
          {appleCount > 0 && (
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Drag to feed
            </span>
          )}
        </div>
        
        {/* Friendship progress */}
        {friendshipProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">
                {friendshipProgress.currentTier.name}
              </span>
              {friendshipProgress.nextTier && (
                <span className="text-primary">
                  → {friendshipProgress.nextTier.name}
                </span>
              )}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${friendshipProgress.progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Dragging apple indicator */}
      {isDragging && (
        <div
          className="fixed z-[100] pointer-events-none animate-pulse"
          style={{
            left: dragPosition.x - 24,
            top: dragPosition.y - 24,
          }}
        >
          <span className="text-5xl drop-shadow-lg">🍎</span>
        </div>
      )}
      
      {/* +1 Friend Point animation */}
      {showFeedback && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none animate-bounce">
          <div className="bg-primary text-primary-foreground rounded-full px-4 py-2 font-display font-bold text-lg shadow-lg">
            +1 ❤️ Friend Point!
          </div>
        </div>
      )}
    </>
  );
};
