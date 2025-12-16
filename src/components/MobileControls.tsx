import { useRef, useCallback, useEffect, MutableRefObject } from 'react';

interface MobileControlsProps {
  onMoveStart: (direction: 'forward' | 'back' | 'left' | 'right') => void;
  onMoveEnd: (direction: 'forward' | 'back' | 'left' | 'right') => void;
  rotationIntensityRef?: MutableRefObject<number>;
}

export const MobileControls = ({ onMoveStart, onMoveEnd, rotationIntensityRef }: MobileControlsProps) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeDirectionsRef = useRef<Set<'forward' | 'back' | 'left' | 'right'>>(new Set());
  const touchIdRef = useRef<number | null>(null);
  
  const DEADZONE_X = 30; // Smaller deadzone since we use proportional intensity
  const DEADZONE_Y = 30;
  const MAX_DRAG_X = 150; // Full rotation intensity at this drag distance

  const updateDirections = useCallback((dx: number, dy: number) => {
    const newDirections = new Set<'forward' | 'back' | 'left' | 'right'>();
    
    // Forward/back based on Y delta (negative = drag up = forward)
    if (dy < -DEADZONE_Y) newDirections.add('forward');
    if (dy > DEADZONE_Y) newDirections.add('back');
    
    // Left/right based on X delta with proportional intensity
    const absDx = Math.abs(dx);
    if (absDx > DEADZONE_X) {
      if (dx < 0) newDirections.add('left');
      if (dx > 0) newDirections.add('right');
      
      // Calculate rotation intensity: 0 at deadzone, 1 at MAX_DRAG_X
      const effectiveDrag = absDx - DEADZONE_X;
      const maxEffectiveDrag = MAX_DRAG_X - DEADZONE_X;
      const intensity = Math.min(1, effectiveDrag / maxEffectiveDrag);
      
      // Apply easing for smoother control (quadratic)
      const easedIntensity = intensity * intensity;
      
      if (rotationIntensityRef) {
        rotationIntensityRef.current = easedIntensity;
      }
    } else {
      // Inside deadzone - no rotation
      if (rotationIntensityRef) {
        rotationIntensityRef.current = 0;
      }
    }
    
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
  }, [onMoveStart, onMoveEnd, rotationIntensityRef]);

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
    
    // End all active directions and reset intensity
    activeDirectionsRef.current.forEach(dir => onMoveEnd(dir));
    activeDirectionsRef.current.clear();
    
    if (rotationIntensityRef) {
      rotationIntensityRef.current = 0;
    }
  }, [onMoveEnd, rotationIntensityRef]);

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
