import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AppleHUDModel } from './AppleHUDModel';

interface ItemPanelProps {
  appleCount?: number;
  onAppleDrop: () => void;
  animalBounds?: { x: number; y: number; width: number; height: number } | null;
  className?: string;
}

// Simple floating apple panel for gameplay with draggable apples
export const ItemPanel = ({
  appleCount = 100, // Debug: default to 100 apples
  onAppleDrop,
  animalBounds,
  className,
}: ItemPanelProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [showFeedback, setShowFeedback] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Use ref to track latest appleCount for callbacks
  const appleCountRef = useRef(appleCount);
  useEffect(() => {
    appleCountRef.current = appleCount;
  }, [appleCount]);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (appleCountRef.current <= 0) return;
    
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
    if (appleCountRef.current <= 0) return;
    
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
  
  // Display count - use prop directly for rendering
  const displayCount = appleCount;
  
  return (
    <>
      {/* Simple floating apple - no box, fully opaque */}
      <div
        ref={panelRef}
        className={cn(
          'flex items-center gap-1 pointer-events-auto cursor-grab active:cursor-grabbing select-none transition-transform',
          displayCount > 0 ? 'hover:scale-105' : 'cursor-not-allowed',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <AppleHUDModel size={64} />
        <span 
          className="font-display font-bold text-xl"
          style={{ 
            color: '#ffffff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)'
          }}
        >
          ×{displayCount}
        </span>
      </div>
      
      {/* Dragging apple indicator */}
      {isDragging && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: dragPosition.x - 32,
            top: dragPosition.y - 32,
          }}
        >
          <AppleHUDModel size={64} />
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
