import { useRef, useCallback, MutableRefObject } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Movement thresholds (dy = vertical swipe distance)
  forwardThreshold: 20,       // Swipe up this much to start moving forward
  reverseThreshold: 50,       // Swipe down this much to reverse (harder to trigger)
  
  // Steering settings
  turnRadiusPx: 100,          // Horizontal distance for full turn
  maxTurnRate: 3.2,           // Radians per second at full turn
  deadzonePx: 8,              // Ignore dx below this threshold
  
  // Speed settings
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>;
  yawRateRef: MutableRefObject<number>;
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  yawRateRef,
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  debugMode = false
}: MobileControlsProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30')) return;
    
    // Only capture first pointer
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    
    mobileTouchActiveRef.current = true;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    
    // Capture pointer for reliable tracking across screen
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerdown at', e.clientX, e.clientY);
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, debugMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { forwardThreshold, reverseThreshold, turnRadiusPx, maxTurnRate, deadzonePx, forwardSpeed, reverseSpeed } = MOBILE_CONTROL_CONFIG;
    
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    
    // MOVEMENT: dy controls forward/reverse
    // Negative dy = swiped UP = forward
    // Positive dy = swiped DOWN = reverse
    let moving = false;
    let throttle = 0;
    
    if (dy < -forwardThreshold) {
      // Swiping UP = forward
      moving = true;
      throttle = forwardSpeed;
    } else if (dy > reverseThreshold) {
      // Swiping DOWN = reverse
      moving = true;
      throttle = -reverseSpeed;
    }
    
    isMovingRef.current = moving;
    throttleRef.current = throttle;
    
    // STEERING: dx controls turn rate
    let turn = 0;
    if (Math.abs(dx) > deadzonePx) {
      turn = Math.max(-1, Math.min(1, dx / turnRadiusPx));
    }
    yawRateRef.current = turn * maxTurnRate;
    
    // Debug logging (throttled)
    if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
      lastDebugLogRef.current = Date.now();
      console.log('[Mobile] dx:', dx.toFixed(0), 'dy:', dy.toFixed(0), 
                  'moving:', moving, 'throttle:', throttle.toFixed(2),
                  'turn:', turn.toFixed(2));
    }
  }, [yawRateRef, throttleRef, isMovingRef, debugMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerup - stopped');
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, debugMode]);

  return (
    <div
      ref={overlayRef}
      id="mobileControlSurface"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        background: 'transparent',
      }}
    />
  );
};
