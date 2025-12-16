import { useRef, useCallback, useEffect } from 'react';

interface MobileControlsProps {
  onMoveStart: (direction: 'forward' | 'back' | 'left' | 'right') => void;
  onMoveEnd: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMoveStart, onMoveEnd }: MobileControlsProps) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeDirectionsRef = useRef<Set<'forward' | 'back' | 'left' | 'right'>>(new Set());
  const touchIdRef = useRef<number | null>(null);
  
  const DEADZONE_X = 60; // Larger deadzone for turning (left/right)
  const DEADZONE_Y = 40; // Smaller deadzone for forward/back

  const updateDirections = useCallback((dx: number, dy: number) => {
    const newDirections = new Set<'forward' | 'back' | 'left' | 'right'>();
    
    // Forward/back based on Y delta (negative = drag up = forward)
    if (dy < -DEADZONE_Y) newDirections.add('forward');
    if (dy > DEADZONE_Y) newDirections.add('back');
    
    // Left/right based on X delta - larger deadzone to prevent accidental turns
    if (dx < -DEADZONE_X) newDirections.add('left');
    if (dx > DEADZONE_X) newDirections.add('right');
    
    const prev = activeDirectionsRef.current;
    
    // End directions no longer active
    prev.forEach(dir => {
      if (!newDirections.has(dir)) {
        onMoveEnd(dir);
      }
    });
    
    // Start new directions
    newDirections.forEach(dir => {
      if (!prev.has(dir)) {
        onMoveStart(dir);
      }
    });
    
    activeDirectionsRef.current = newDirections;
  }, [onMoveStart, onMoveEnd]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50')) return;
    
    if (touchIdRef.current !== null) return;
    
    const touch = e.touches[0];
    touchIdRef.current = touch.identifier;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchIdRef.current === null || !touchStartRef.current) return;
    
    const touch = Array.from(e.touches).find(t => t.identifier === touchIdRef.current);
    if (!touch) return;
    
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    
    updateDirections(dx, dy);
  }, [updateDirections]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchIdRef.current === null) return;
    
    const touchStillActive = Array.from(e.touches).some(t => t.identifier === touchIdRef.current);
    if (touchStillActive) return;
    
    touchIdRef.current = null;
    touchStartRef.current = null;
    
    // End all active directions
    activeDirectionsRef.current.forEach(dir => onMoveEnd(dir));
    activeDirectionsRef.current.clear();
  }, [onMoveEnd]);

  useEffect(() => {
    // Attach to document for full-screen touch capture
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // No visible UI - completely invisible control layer
  return null;
};
