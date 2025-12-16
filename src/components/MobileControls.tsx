import { useRef, useState, useCallback } from 'react';

interface MobileControlsProps {
  onMoveStart: (direction: 'forward' | 'back' | 'left' | 'right') => void;
  onMoveEnd: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMoveStart, onMoveEnd }: MobileControlsProps) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });
  const activeDirectionsRef = useRef<Set<'forward' | 'back' | 'left' | 'right'>>(new Set());
  const touchIdRef = useRef<number | null>(null);
  
  const JOYSTICK_RADIUS = 50;
  const DEADZONE = 15;

  const updateDirections = useCallback((dx: number, dy: number) => {
    const newDirections = new Set<'forward' | 'back' | 'left' | 'right'>();
    
    // Calculate distance from center
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > DEADZONE) {
      // Normalize for direction detection
      const angle = Math.atan2(dy, dx);
      
      // Forward/back based on Y (negative Y = forward in screen coords)
      if (dy < -DEADZONE) newDirections.add('forward');
      if (dy > DEADZONE) newDirections.add('back');
      
      // Left/right based on X
      if (dx < -DEADZONE) newDirections.add('left');
      if (dx > DEADZONE) newDirections.add('right');
    }
    
    // Determine what changed
    const prev = activeDirectionsRef.current;
    
    // End directions that are no longer active
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (touchIdRef.current !== null) return; // Already tracking a touch
    
    const touch = e.touches[0];
    touchIdRef.current = touch.identifier;
    
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    // Clamp to radius
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > JOYSTICK_RADIUS) {
      dx = (dx / distance) * JOYSTICK_RADIUS;
      dy = (dy / distance) * JOYSTICK_RADIUS;
    }
    
    setKnobPosition({ x: dx, y: dy });
    updateDirections(dx, dy);
  }, [updateDirections]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    // Find our tracked touch
    const touch = Array.from(e.touches).find(t => t.identifier === touchIdRef.current);
    if (!touch) return;
    
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    // Clamp to radius
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > JOYSTICK_RADIUS) {
      dx = (dx / distance) * JOYSTICK_RADIUS;
      dy = (dy / distance) * JOYSTICK_RADIUS;
    }
    
    setKnobPosition({ x: dx, y: dy });
    updateDirections(dx, dy);
  }, [updateDirections]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    // Check if our tracked touch ended
    const touchStillActive = Array.from(e.touches).some(t => t.identifier === touchIdRef.current);
    if (touchStillActive) return;
    
    touchIdRef.current = null;
    setKnobPosition({ x: 0, y: 0 });
    
    // End all active directions
    activeDirectionsRef.current.forEach(dir => onMoveEnd(dir));
    activeDirectionsRef.current.clear();
  }, [onMoveEnd]);

  return (
    <div className="absolute bottom-8 left-8 z-40 md:hidden">
      <div
        ref={joystickRef}
        className="relative w-32 h-32 rounded-full bg-black/30 backdrop-blur-sm border-2 border-white/20 touch-none select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Center marker */}
        <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
        
        {/* Draggable knob */}
        <div
          className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full bg-secondary/80 border-2 border-secondary shadow-lg transition-none"
          style={{
            transform: `translate(calc(-50% + ${knobPosition.x}px), calc(-50% + ${knobPosition.y}px))`,
          }}
        />
      </div>
    </div>
  );
};
