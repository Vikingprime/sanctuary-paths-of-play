import { useRef, useCallback, useEffect, MutableRefObject } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  turnRadiusPx: 200,        // Pixels needed for full turn - bigger = less sensitive
  maxTurnRadians: 0.8,      // Max turn per swipe (~45 degrees)
  deadzonePx: 12,           // Kills micro jitter
  throttleRadiusPx: 100,    // Pixels for full forward speed
  straightSwipeRatio: 0.35, // If |dx| < |dy| * ratio, treat as straight forward
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;  // Player state ref (read rotation on touch start)
  targetYawRef: MutableRefObject<number | null>;  // Target yaw to steer toward (null = no touch active)
  isMovingRef: MutableRefObject<boolean>;         // Whether player should move forward
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  isMovingRef,
  debugMode = false
}: MobileControlsProps) => {
  // Swipe state
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const startYawRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30')) return;
    
    // Only capture first pointer
    if (activePointerIdRef.current !== null) return;
    
    // Store swipe start and capture pointer
    activePointerIdRef.current = e.pointerId;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    
    // CRITICAL: Capture the player's current rotation as startYaw
    // This anchors the swipe to the heading at touch-start, preventing drift
    startYawRef.current = playerStateRef.current.rotation;
    
    // Set target yaw to current rotation (no turn initially)
    targetYawRef.current = startYawRef.current;
    
    // Capture pointer for reliable tracking
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    
    if (debugMode) {
      console.log('[MobileControls] pointerdown - startYaw:', startYawRef.current.toFixed(3));
    }
  }, [playerStateRef, targetYawRef, debugMode]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    const { turnRadiusPx, maxTurnRadians, deadzonePx, throttleRadiusPx, straightSwipeRatio } = MOBILE_CONTROL_CONFIG;
    
    // Calculate ABSOLUTE displacement from touch start (not delta from last frame!)
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    
    // Inside deadzone - no movement
    if (Math.abs(dx) < deadzonePx && Math.abs(dy) < deadzonePx) {
      targetYawRef.current = startYawRef.current;
      isMovingRef.current = false;
      return;
    }
    
    // Determine if this is a "straight swipe" (lane lock)
    // If horizontal displacement is much smaller than vertical, treat as pure forward
    const isStraightSwipe = Math.abs(dx) < Math.abs(dy) * straightSwipeRatio;
    
    let targetYaw: number;
    
    if (isStraightSwipe) {
      // Lane lock: keep heading straight, no turning
      targetYaw = startYawRef.current;
    } else {
      // Calculate turn amount from horizontal displacement
      // Clamp to [-1, 1] range
      const turn = Math.max(-1, Math.min(1, dx / turnRadiusPx));
      
      // Apply turn to startYaw (NOT current yaw - this prevents drift!)
      targetYaw = startYawRef.current + turn * maxTurnRadians;
    }
    
    // Set target yaw for the movement system to smoothly interpolate toward
    targetYawRef.current = targetYaw;
    
    // Forward movement based on vertical displacement (up = forward)
    // Negative dy = swiping up = forward
    const forwardAmount = -dy / throttleRadiusPx;
    isMovingRef.current = forwardAmount > 0.1; // Small threshold to start moving
    
    // Debug logging (throttled to once per 500ms)
    if (debugMode && Date.now() - lastDebugLogRef.current > 500) {
      lastDebugLogRef.current = Date.now();
      const turn = dx / turnRadiusPx;
      console.log('[MobileControls] dx:', dx.toFixed(0), 
                  'turn:', turn.toFixed(2), 
                  'startYaw:', startYawRef.current.toFixed(3),
                  'targetYaw:', targetYaw.toFixed(3),
                  'playerYaw:', playerStateRef.current.rotation.toFixed(3),
                  'straight:', isStraightSwipe);
    }
  }, [targetYawRef, isMovingRef, playerStateRef, debugMode]);

  const handlePointerEnd = useCallback((e: PointerEvent) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    
    // Clear active pointer
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    
    // Clear target yaw (signals no touch active)
    targetYawRef.current = null;
    isMovingRef.current = false;
    
    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    
    if (debugMode) {
      console.log('[MobileControls] pointerup - cleared');
    }
  }, [targetYawRef, isMovingRef, debugMode]);

  useEffect(() => {
    // Use pointer events for better cross-platform support
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerEnd);
    document.addEventListener('pointercancel', handlePointerEnd);
    
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerEnd);
      document.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerEnd]);

  // No visible UI - completely invisible control layer
  return null;
};
