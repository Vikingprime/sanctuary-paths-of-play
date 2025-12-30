import { useRef, useCallback, MutableRefObject, useEffect } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Movement thresholds
  moveThreshold: 20,           // Minimum swipe distance to start moving
  
  // Speed settings
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
  
  // Turn rate - how fast the animal rotates to match finger direction
  turnRate: 4.0,               // Radians per second
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

  // Add game-active class to html when mounted, remove on unmount
  useEffect(() => {
    document.documentElement.classList.add('game-active');
    
    const preventGestures = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === 'mobileControlSurface' || target.closest('#mobileControlSurface')) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchstart', preventGestures, { passive: false });
    document.addEventListener('touchmove', preventGestures, { passive: false });
    
    return () => {
      document.documentElement.classList.remove('game-active');
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
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    
    mobileTouchActiveRef.current = true;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    
    // Capture pointer for reliable tracking
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerdown at', e.clientX.toFixed(0), e.clientY.toFixed(0));
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, debugMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { moveThreshold, forwardSpeed, reverseSpeed, turnRate } = MOBILE_CONTROL_CONFIG;
    
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Not moving if finger hasn't moved enough
    if (distance < moveThreshold) {
      isMovingRef.current = false;
      throttleRef.current = 0;
      yawRateRef.current = 0;
      return;
    }
    
    // Calculate the angle from start to current finger position
    // atan2 gives us angle where: right=0, down=PI/2, left=PI/-PI, up=-PI/2
    // We want: up=forward (0), right=PI/2, down=PI (backward), left=-PI/2
    const fingerAngle = Math.atan2(dx, -dy); // Note: -dy so up is 0
    
    // Determine forward vs backward based on vertical component
    // If finger is above start point (dy < 0), we're moving forward
    // If finger is below start point (dy > 0), we're moving backward
    const isForward = dy < 0;
    
    // Set throttle based on direction
    throttleRef.current = isForward ? forwardSpeed : -reverseSpeed;
    isMovingRef.current = true;
    
    // For the target heading:
    // When going forward, the finger angle directly becomes the target heading
    // When going backward, we flip it by PI so the animal backs in that direction
    let targetHeading = fingerAngle;
    if (!isForward) {
      // When reversing, we want the animal's BACK to point toward the finger
      // So we add PI to flip the heading
      targetHeading = fingerAngle + Math.PI;
    }
    
    // Normalize to [-PI, PI]
    while (targetHeading > Math.PI) targetHeading -= 2 * Math.PI;
    while (targetHeading < -Math.PI) targetHeading += 2 * Math.PI;
    
    // Calculate the shortest angular difference between current heading and target
    const currentYaw = playerStateRef.current.rotation;
    let angleDiff = targetHeading - currentYaw;
    
    // Normalize angle difference to [-PI, PI] for shortest path
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Set yaw rate proportional to the difference, clamped to max turn rate
    // This creates smooth turning that's faster for big differences
    const turnStrength = Math.min(1, Math.abs(angleDiff) / (Math.PI / 4)); // Full speed at 45+ degrees
    const desiredRate = Math.sign(angleDiff) * turnStrength * turnRate;
    yawRateRef.current = desiredRate;
    
    // Store target yaw for the player movement system
    targetYawRef.current = targetHeading;
    
    // Debug logging (throttled)
    if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
      lastDebugLogRef.current = Date.now();
      console.log('[Mobile] dx:', dx.toFixed(0), 'dy:', dy.toFixed(0), 
                  'fingerAngle:', (fingerAngle * 180 / Math.PI).toFixed(0) + '°',
                  'forward:', isForward,
                  'targetHeading:', (targetHeading * 180 / Math.PI).toFixed(0) + '°',
                  'currentYaw:', (currentYaw * 180 / Math.PI).toFixed(0) + '°',
                  'yawRate:', yawRateRef.current.toFixed(2));
    }
  }, [yawRateRef, throttleRef, isMovingRef, targetYawRef, playerStateRef, debugMode]);

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
