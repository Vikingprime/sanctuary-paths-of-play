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
  
  // Joystick-style controls: center deadzone, then proportional steering
  const DEADZONE = 20; // Small deadzone in center
  const MAX_DISTANCE = 120; // Max drag distance for full effect
  const FORWARD_THRESHOLD = 0.3; // Normalized Y threshold to move forward (lower = easier to go straight)

  const updateDirections = useCallback((dx: number, dy: number) => {
    const newDirections = new Set<'forward' | 'back' | 'left' | 'right'>();
    
    // Calculate distance and angle from center (joystick-style)
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Inside deadzone - no movement
    if (distance < DEADZONE) {
      if (rotationIntensityRef) {
        rotationIntensityRef.current = 0;
      }
      // End all active directions
      activeDirectionsRef.current.forEach(dir => onMoveEnd(dir));
      activeDirectionsRef.current = new Set();
      return;
    }
    
    // Normalize direction
    const normalizedX = dx / distance;
    const normalizedY = dy / distance;
    
    // Calculate effective distance (0 at deadzone, 1 at max)
    const effectiveDistance = Math.min(1, (distance - DEADZONE) / (MAX_DISTANCE - DEADZONE));
    
    // Forward/back based on Y (negative = up = forward)
    // Use a threshold so slight vertical movement still goes forward when turning
    if (normalizedY < -FORWARD_THRESHOLD) {
      newDirections.add('forward');
    } else if (normalizedY > FORWARD_THRESHOLD) {
      newDirections.add('back');
    }
    
    // Left/right rotation with proportional intensity
    // Allow turning while moving forward (simultaneous)
    if (Math.abs(normalizedX) > 0.2) {
      if (normalizedX < 0) newDirections.add('left');
      if (normalizedX > 0) newDirections.add('right');
      
      // Rotation intensity based on how far left/right (not total distance)
      // This allows forward + gentle turn vs forward + sharp turn
      const rotationIntensity = Math.abs(normalizedX) * effectiveDistance;
      if (rotationIntensityRef) {
        rotationIntensityRef.current = rotationIntensity * rotationIntensity; // Quadratic easing
      }
    } else {
      // Moving mostly forward/back - no rotation
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
