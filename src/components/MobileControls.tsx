import { useRef, useCallback, useEffect, MutableRefObject } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment (thumb-friendly values)
export const MOBILE_CONTROL_CONFIG = {
  turnRadiusPx: 110,        // Pixels needed for full turn - smaller for thumb reach
  maxTurnRadians: 1.2,      // Max turn per swipe (~69 degrees) - more responsive
  deadzoneX: 6,             // Horizontal deadzone (steering)
  deadzoneY: 8,             // Vertical deadzone (throttle)
  throttleRadiusPx: 140,    // Pixels for full forward/reverse speed
  straightSwipeRatio: 0.12, // Relaxed lane lock - only for very straight swipes
  reverseSpeedMultiplier: 0.55, // Reverse is slower than forward
  turnResponsiveness: 16,   // Smoothing factor for steering (higher = faster response)
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;  // Player state ref (read rotation on touch start)
  targetYawRef: MutableRefObject<number>;         // Target yaw to steer toward (always a number)
  isMovingRef: MutableRefObject<boolean>;         // Whether player should move (forward or backward)
  throttleRef: MutableRefObject<number>;          // Throttle value: -1 (full reverse) to 1 (full forward)
  mobileTouchActiveRef: MutableRefObject<boolean>; // Whether touch is currently active
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  debugMode = false
}: MobileControlsProps) => {
  // Refs for control state
  const overlayRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const startYawRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);
  const exceededDeadzoneRef = useRef(false);
  const lastDebugLogRef = useRef<number>(0);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30')) return;
    
    // Only capture first pointer
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Store swipe start and capture pointer
    activePointerIdRef.current = e.pointerId;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    exceededDeadzoneRef.current = false;
    
    // CRITICAL: Capture the player's current rotation as startYaw
    startYawRef.current = playerStateRef.current.rotation;
    
    // Set target yaw to current rotation (no turn initially)
    targetYawRef.current = startYawRef.current;
    
    // Activate touch
    mobileTouchActiveRef.current = true;
    
    // Capture pointer for reliable tracking
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (debugMode) {
      console.log('[MobileControls] pointerdown - startYaw:', startYawRef.current.toFixed(3));
    }
  }, [playerStateRef, targetYawRef, mobileTouchActiveRef, debugMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { turnRadiusPx, maxTurnRadians, deadzoneX, deadzoneY, throttleRadiusPx, straightSwipeRatio } = MOBILE_CONTROL_CONFIG;
    
    // Calculate ABSOLUTE displacement from touch start (not delta from last frame!)
    let dx = e.clientX - swipeStartRef.current.x;
    let dy = e.clientY - swipeStartRef.current.y;
    
    // Apply separate deadzones for dx and dy
    if (Math.abs(dx) < deadzoneX) dx = 0;
    if (Math.abs(dy) < deadzoneY) dy = 0;
    
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Check if we've exceeded the deadzone (latching behavior)
    if (!exceededDeadzoneRef.current && dist > Math.max(deadzoneX, deadzoneY)) {
      exceededDeadzoneRef.current = true;
    }
    
    // If we haven't exceeded deadzone yet, don't move
    if (!exceededDeadzoneRef.current) {
      targetYawRef.current = startYawRef.current;
      isMovingRef.current = false;
      throttleRef.current = 0;
      return;
    }
    
    // Calculate throttle from vertical displacement: up = forward (+), down = reverse (-)
    // dy negative = swipe up = forward; dy positive = swipe down = reverse
    const throttle = Math.max(-1, Math.min(1, -dy / throttleRadiusPx));
    throttleRef.current = throttle;
    
    // Moving if throttle is non-zero
    isMovingRef.current = Math.abs(throttle) > 0.01;
    
    // Determine if this is a "straight swipe" (lane lock) - only for very straight swipes
    const isStraightSwipe = Math.abs(dx) < Math.abs(dy) * straightSwipeRatio;
    
    let targetYaw: number;
    
    if (isStraightSwipe) {
      // Lane lock: keep heading straight, no turning
      targetYaw = startYawRef.current;
    } else {
      // Calculate turn amount from horizontal displacement
      const turn = Math.max(-1, Math.min(1, dx / turnRadiusPx));
      
      // Apply turn to startYaw (NOT current yaw - this prevents drift!)
      targetYaw = startYawRef.current + turn * maxTurnRadians;
    }
    
    // Set target yaw for the movement system to smoothly interpolate toward
    targetYawRef.current = targetYaw;
    
    // Debug logging (throttled to once per 300ms)
    if (debugMode && Date.now() - lastDebugLogRef.current > 300) {
      lastDebugLogRef.current = Date.now();
      const turn = dx / turnRadiusPx;
      console.log('[MobileControls] pointermove - dx:', dx.toFixed(0), 
                  'dy:', dy.toFixed(0),
                  'turn:', turn.toFixed(2), 
                  'throttle:', throttle.toFixed(2),
                  'startYaw:', startYawRef.current.toFixed(3),
                  'targetYaw:', targetYaw.toFixed(3),
                  'straight:', isStraightSwipe);
    }
  }, [targetYawRef, isMovingRef, throttleRef, mobileTouchActiveRef, debugMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear active pointer
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    exceededDeadzoneRef.current = false;
    
    // Deactivate touch and stop moving
    mobileTouchActiveRef.current = false;
    isMovingRef.current = false;
    throttleRef.current = 0;
    
    // Release pointer capture
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore - pointer may already be released
    }
    
    if (debugMode) {
      console.log('[MobileControls] pointerup - cleared');
    }
  }, [mobileTouchActiveRef, isMovingRef, debugMode]);

  // Full-screen invisible control overlay
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
        zIndex: 10, // Above canvas, below UI (z-20+)
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Invisible but captures all touches
        background: 'transparent',
      }}
    />
  );
};
