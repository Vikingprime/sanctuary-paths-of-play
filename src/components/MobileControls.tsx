import { useRef, useCallback, MutableRefObject, useEffect } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Movement thresholds (dy = vertical swipe distance)
  forwardThreshold: 15,       // Reduced for easier forward trigger
  reverseThreshold: 40,       // Swipe down this much to reverse
  
  // Steering settings - different for stationary vs moving
  stationaryTurnRadiusPx: 280,  // Wider radius when stationary (more precise)
  movingTurnRadiusPx: 180,      // Tighter radius while moving (sharper turns)
  maxTurnRateStationary: 2.8,   // Radians per second when stationary
  maxTurnRateMoving: 4.5,       // Radians per second while moving
  deadzonePx: 6,                // Ignore dx below this threshold
  laneLockThreshold: 20,        // If |dx| < this, lock to straight line
  
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
  const swipeStartRef = useRef<{ x: number; y: number; startYaw: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);
  
  // Hysteresis state for throttle
  const throttleStateRef = useRef<'idle' | 'forward' | 'reverse'>('idle');

  // Prevent default on touchstart at document level to stop browser gestures
  useEffect(() => {
    const preventGestures = (e: TouchEvent) => {
      // Only prevent if touch started on our overlay
      const target = e.target as HTMLElement;
      if (target.id === 'mobileControlSurface' || target.closest('#mobileControlSurface')) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchstart', preventGestures, { passive: false });
    document.addEventListener('touchmove', preventGestures, { passive: false });
    
    return () => {
      document.removeEventListener('touchstart', preventGestures);
      document.removeEventListener('touchmove', preventGestures);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30')) return;
    
    // Only capture first pointer
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    // Store start position AND current player rotation
    swipeStartRef.current = { 
      x: e.clientX, 
      y: e.clientY,
      startYaw: playerStateRef.current.rotation
    };
    
    mobileTouchActiveRef.current = true;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    throttleStateRef.current = 'idle';
    
    // Capture pointer for reliable tracking
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerdown at', e.clientX.toFixed(0), e.clientY.toFixed(0), 'startYaw:', swipeStartRef.current.startYaw.toFixed(2));
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, playerStateRef, debugMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { 
      forwardThreshold, reverseThreshold, 
      stationaryTurnRadiusPx, movingTurnRadiusPx,
      maxTurnRateStationary, maxTurnRateMoving,
      deadzonePx, laneLockThreshold,
      forwardSpeed, reverseSpeed 
    } = MOBILE_CONTROL_CONFIG;
    
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    
    // MOVEMENT: dy controls forward/reverse with hysteresis
    // Negative dy = swiped UP = forward
    // Positive dy = swiped DOWN = reverse
    let throttle = 0;
    let moving = false;
    
    const currentState = throttleStateRef.current;
    
    // Hysteresis logic - different thresholds for entering vs exiting states
    if (currentState === 'idle') {
      if (dy < -forwardThreshold) {
        throttleStateRef.current = 'forward';
      } else if (dy > reverseThreshold) {
        throttleStateRef.current = 'reverse';
      }
    } else if (currentState === 'forward') {
      // Stay forward until dy goes back above half the threshold
      if (dy > -forwardThreshold * 0.5) {
        throttleStateRef.current = 'idle';
      }
    } else if (currentState === 'reverse') {
      // Stay reverse until dy drops below half the threshold
      if (dy < reverseThreshold * 0.5) {
        throttleStateRef.current = 'idle';
      }
    }
    
    // Apply throttle based on state
    if (throttleStateRef.current === 'forward') {
      throttle = forwardSpeed;
      moving = true;
    } else if (throttleStateRef.current === 'reverse') {
      throttle = -reverseSpeed;
      moving = true;
    }
    
    isMovingRef.current = moving;
    throttleRef.current = throttle;
    
    // STEERING: dx controls turn rate
    // Use different sensitivity based on movement state
    const turnRadiusPx = moving ? movingTurnRadiusPx : stationaryTurnRadiusPx;
    const maxTurnRate = moving ? maxTurnRateMoving : maxTurnRateStationary;
    
    let turn = 0;
    
    // Lane lock: if horizontal displacement is small relative to vertical, don't steer
    const isLaneLocked = Math.abs(dx) < laneLockThreshold && Math.abs(dy) > forwardThreshold;
    
    if (!isLaneLocked && Math.abs(dx) > deadzonePx) {
      // Power curve for more precise small adjustments, sharp big turns
      const normalizedDx = Math.max(-1, Math.min(1, dx / turnRadiusPx));
      const sign = Math.sign(normalizedDx);
      const magnitude = Math.pow(Math.abs(normalizedDx), 1.5); // Power curve
      turn = sign * magnitude;
    }
    
    yawRateRef.current = turn * maxTurnRate;
    
    // Debug logging (throttled)
    if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
      lastDebugLogRef.current = Date.now();
      console.log('[Mobile] dx:', dx.toFixed(0), 'dy:', dy.toFixed(0), 
                  'state:', throttleStateRef.current,
                  'throttle:', throttle.toFixed(2),
                  'turn:', turn.toFixed(2),
                  'laneLock:', isLaneLocked);
    }
  }, [yawRateRef, throttleRef, isMovingRef, debugMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    throttleStateRef.current = 'idle';
    
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
