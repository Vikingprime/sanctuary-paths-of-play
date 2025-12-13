import { useRef, useState, useCallback, useEffect } from 'react';

interface MobileControlsProps {
  onMove: (direction: 'forward' | 'back' | 'left' | 'right') => void;
}

export const MobileControls = ({ onMove }: MobileControlsProps) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const activeDirectionsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const JOYSTICK_SIZE = 120;
  const STICK_SIZE = 50;
  const MAX_DISTANCE = (JOYSTICK_SIZE - STICK_SIZE) / 2;
  const DEAD_ZONE = 0.2;

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!joystickRef.current) return;

    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;

    // Calculate distance from center
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Clamp to max distance
    if (distance > MAX_DISTANCE) {
      deltaX = (deltaX / distance) * MAX_DISTANCE;
      deltaY = (deltaY / distance) * MAX_DISTANCE;
    }

    setStickPosition({ x: deltaX, y: deltaY });

    // Normalize to -1 to 1 range
    const normalizedX = deltaX / MAX_DISTANCE;
    const normalizedY = deltaY / MAX_DISTANCE;

    // Determine directions based on joystick position
    const newDirections = new Set<string>();

    if (normalizedY < -DEAD_ZONE) newDirections.add('forward');
    if (normalizedY > DEAD_ZONE) newDirections.add('back');
    if (normalizedX < -DEAD_ZONE) newDirections.add('left');
    if (normalizedX > DEAD_ZONE) newDirections.add('right');

    activeDirectionsRef.current = newDirections;
  }, [MAX_DISTANCE]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    handleMove(clientX, clientY);

    // Start continuous movement
    intervalRef.current = setInterval(() => {
      activeDirectionsRef.current.forEach((dir) => {
        onMove(dir as 'forward' | 'back' | 'left' | 'right');
      });
    }, 50);
  }, [handleMove, onMove]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
    setStickPosition({ x: 0, y: 0 });
    activeDirectionsRef.current.clear();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  }, [handleStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isDragging) return;
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, [isDragging, handleMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX, e.clientY);
  }, [isDragging, handleMove]);

  useEffect(() => {
    const handleGlobalMouseUp = () => handleEnd();
    const handleGlobalTouchEnd = () => handleEnd();

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [handleEnd]);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 md:hidden">
      <div
        ref={joystickRef}
        className="relative rounded-full bg-secondary/40 backdrop-blur-sm border-2 border-secondary/60"
        style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleEnd}
      >
        {/* Joystick stick */}
        <div
          className="absolute rounded-full bg-secondary shadow-lg border-2 border-secondary-foreground/20 transition-transform duration-75"
          style={{
            width: STICK_SIZE,
            height: STICK_SIZE,
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${stickPosition.x}px), calc(-50% + ${stickPosition.y}px))`,
          }}
        />
      </div>
    </div>
  );
};
