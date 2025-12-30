import { useRef, useCallback, MutableRefObject } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Throttle hysteresis thresholds (pixels)
  forwardThreshold: 18,      // dy < -18 to enter forward mode
  reverseThreshold: 40,      // dy > 40 to enter reverse mode  
  forwardExitThreshold: 8,   // dy > 8 to exit forward mode
  reverseExitThreshold: 20,  // dy < 20 to exit reverse mode
  throttleRadiusPx: 140,     // Pixels for full throttle
  
  // Steering settings
  turnRadiusPxMoving: 220,   // Turn radius when moving
  turnRadiusPxStationary: 340, // Turn radius when stationary (less sensitive)
  maxTurnRadMoving: 0.95,    // Max turn angle when moving (~55 degrees)
  maxTurnRadStationary: 0.55, // Max turn angle when stationary (~31 degrees)
  steerCurveExponent: 1.6,   // Steering curve (higher = more forgiving near center)
  
  // Lane lock (only for forward)
  laneLockDxThreshold: 25,   // Max dx for lane lock when forward
  
  reverseSpeedMultiplier: 0.55, // Reverse is slower than forward
  turnResponsiveness: 16,    // Smoothing factor for steering
};

type DriveMode = 'idle' | 'forward' | 'reverse';

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>;
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  debugMode?: boolean;
}

// Normalize angle to [-PI, PI]
const normalizeAngle = (angle: number): number => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

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
  const driveModeRef = useRef<DriveMode>('idle');
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
    driveModeRef.current = 'idle';
    
    // CRITICAL: Capture the player's current rotation as startYaw (normalized)
    startYawRef.current = normalizeAngle(playerStateRef.current.rotation);
    
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
    
    const { 
      forwardThreshold, reverseThreshold, forwardExitThreshold, reverseExitThreshold,
      throttleRadiusPx, turnRadiusPxMoving, turnRadiusPxStationary,
      maxTurnRadMoving, maxTurnRadStationary, steerCurveExponent, laneLockDxThreshold
    } = MOBILE_CONTROL_CONFIG;
    
    // Calculate ABSOLUTE displacement from touch start
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    
    // === THROTTLE with hysteresis ===
    const currentMode = driveModeRef.current;
    let newMode: DriveMode = currentMode;
    
    // Check mode transitions
    if (currentMode === 'idle') {
      if (dy < -forwardThreshold) {
        newMode = 'forward';
      } else if (dy > reverseThreshold) {
        newMode = 'reverse';
      }
    } else if (currentMode === 'forward') {
      // Stay in forward until dy > forwardExitThreshold
      if (dy > forwardExitThreshold) {
        newMode = 'idle';
      }
    } else if (currentMode === 'reverse') {
      // Stay in reverse until dy < reverseExitThreshold
      if (dy < reverseExitThreshold) {
        newMode = 'idle';
      }
    }
    
    driveModeRef.current = newMode;
    
    // Calculate throttle amount based on mode
    let throttle = 0;
    if (newMode === 'forward') {
      // Forward: throttle increases as dy goes more negative
      throttle = Math.min(1, (-dy - forwardThreshold) / throttleRadiusPx);
      throttle = Math.max(0, throttle);
    } else if (newMode === 'reverse') {
      // Reverse: throttle increases as dy goes more positive
      throttle = -Math.min(1, (dy - reverseThreshold) / throttleRadiusPx);
      throttle = Math.min(0, throttle);
    }
    
    throttleRef.current = throttle;
    isMovingRef.current = newMode !== 'idle';
    
    // === STEERING (decoupled from throttle) ===
    const isMoving = newMode !== 'idle';
    const turnRadiusPx = isMoving ? turnRadiusPxMoving : turnRadiusPxStationary;
    const maxTurnRad = isMoving ? maxTurnRadMoving : maxTurnRadStationary;
    
    // Apply steering curve
    let t = Math.max(-1, Math.min(1, dx / turnRadiusPx));
    t = Math.sign(t) * Math.pow(Math.abs(t), steerCurveExponent);
    
    // Lane lock: only for forward mode with small dx
    const shouldLaneLock = newMode === 'forward' && dy < -forwardThreshold && Math.abs(dx) < laneLockDxThreshold;
    
    let targetYaw: number;
    if (shouldLaneLock) {
      // Lane lock: keep heading straight
      targetYaw = startYawRef.current;
    } else {
      // Apply turn to startYaw
      targetYaw = normalizeAngle(startYawRef.current + t * maxTurnRad);
    }
    
    targetYawRef.current = targetYaw;
    
    // Debug logging (throttled to once per 300ms)
    if (debugMode && Date.now() - lastDebugLogRef.current > 300) {
      lastDebugLogRef.current = Date.now();
      console.log('[MobileControls] dx:', dx.toFixed(0), 
                  'dy:', dy.toFixed(0),
                  'mode:', newMode,
                  'throttle:', throttle.toFixed(2),
                  'targetYaw:', targetYaw.toFixed(3),
                  'laneLock:', shouldLaneLock);
    }
  }, [targetYawRef, isMovingRef, throttleRef, debugMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear active pointer
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    driveModeRef.current = 'idle';
    
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
  }, [mobileTouchActiveRef, isMovingRef, throttleRef, debugMode]);

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
        zIndex: 10,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: 'transparent',
      }}
    />
  );
};
