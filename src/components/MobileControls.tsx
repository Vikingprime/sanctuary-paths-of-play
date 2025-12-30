import { useRef, useCallback, MutableRefObject, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';
import { ArrowDown, ArrowUp } from 'lucide-react';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Steering settings - dx ONLY
  turnRadiusPx: 85,           // Thumb-friendly turn radius
  maxTurnRate: 2.8,           // Radians per second (sharp turning)
  deadzonePx: 6,              // Ignore dx below this threshold
  
  // Movement is controlled by buttons, NOT by dy
  forwardSpeed: 1.0,          // Forward speed multiplier
  reverseSpeed: 0.55,         // Reverse is slower
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>;
  yawRateRef: MutableRefObject<number>;  // NEW: yaw rate instead of absolute yaw
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
  // Refs for control state
  const overlayRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);
  
  // State for movement buttons
  const [isForwardPressed, setIsForwardPressed] = useState(false);
  const [isReversePressed, setIsReversePressed] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture if touch is on UI elements (buttons, etc)
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30, .mobile-move-button')) return;
    
    // Only capture first pointer for steering
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Store swipe start and capture pointer
    activePointerIdRef.current = e.pointerId;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    
    // Activate touch for steering (movement controlled by buttons)
    mobileTouchActiveRef.current = true;
    yawRateRef.current = 0; // Start with no turn
    
    // Capture pointer for reliable tracking
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (debugMode) {
      console.log('[MobileControls] pointerdown - steering active');
    }
  }, [mobileTouchActiveRef, yawRateRef, debugMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!swipeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const { turnRadiusPx, maxTurnRate, deadzonePx } = MOBILE_CONTROL_CONFIG;
    
    // Calculate ONLY horizontal displacement (steering)
    const dx = e.clientX - swipeStartRef.current.x;
    
    // Apply deadzone
    let turn = 0;
    if (Math.abs(dx) > deadzonePx) {
      // Normalize dx to [-1, 1] range
      turn = Math.max(-1, Math.min(1, dx / turnRadiusPx));
    }
    
    // Set yaw RATE (not absolute angle) - player will rotate by this amount per second
    yawRateRef.current = turn * maxTurnRate;
    
    // Debug logging (throttled)
    if (debugMode && Date.now() - lastDebugLogRef.current > 300) {
      lastDebugLogRef.current = Date.now();
      console.log('[MobileControls] dx:', dx.toFixed(0), 
                  'turn:', turn.toFixed(2),
                  'yawRate:', yawRateRef.current.toFixed(3));
    }
  }, [yawRateRef, debugMode]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to our active pointer
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear active pointer
    activePointerIdRef.current = null;
    swipeStartRef.current = null;
    
    // Stop turning but keep mobile active if buttons pressed
    yawRateRef.current = 0;
    
    // Only deactivate if no movement buttons pressed
    if (!isForwardPressed && !isReversePressed) {
      mobileTouchActiveRef.current = false;
    }
    
    // Release pointer capture
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore - pointer may already be released
    }
    
    if (debugMode) {
      console.log('[MobileControls] pointerup - steering stopped');
    }
  }, [mobileTouchActiveRef, yawRateRef, isForwardPressed, isReversePressed, debugMode]);

  // Movement button handlers
  const handleForwardStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsForwardPressed(true);
    setIsReversePressed(false); // Can't be both
    mobileTouchActiveRef.current = true;
    isMovingRef.current = true;
    throttleRef.current = MOBILE_CONTROL_CONFIG.forwardSpeed;
  }, [mobileTouchActiveRef, isMovingRef, throttleRef]);

  const handleForwardEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsForwardPressed(false);
    if (!isReversePressed) {
      isMovingRef.current = false;
      throttleRef.current = 0;
      // Only deactivate mobile if not steering
      if (activePointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
    }
  }, [mobileTouchActiveRef, isMovingRef, throttleRef, isReversePressed]);

  const handleReverseStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsReversePressed(true);
    setIsForwardPressed(false); // Can't be both
    mobileTouchActiveRef.current = true;
    isMovingRef.current = true;
    throttleRef.current = -MOBILE_CONTROL_CONFIG.reverseSpeed;
  }, [mobileTouchActiveRef, isMovingRef, throttleRef]);

  const handleReverseEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsReversePressed(false);
    if (!isForwardPressed) {
      isMovingRef.current = false;
      throttleRef.current = 0;
      // Only deactivate mobile if not steering
      if (activePointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
    }
  }, [mobileTouchActiveRef, isMovingRef, throttleRef, isForwardPressed]);

  return (
    <>
      {/* Full-screen invisible steering surface */}
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
          touchAction: 'none',  // CRITICAL: prevents browser from stealing gestures
          userSelect: 'none',
          WebkitUserSelect: 'none',
          background: 'transparent',
        }}
      />
      
      {/* Movement buttons - bottom right corner */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto',
        }}
      >
        {/* Forward button */}
        <button
          className="mobile-move-button"
          onTouchStart={handleForwardStart}
          onTouchEnd={handleForwardEnd}
          onMouseDown={handleForwardStart}
          onMouseUp={handleForwardEnd}
          onMouseLeave={handleForwardEnd}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: isForwardPressed ? 'rgba(74, 222, 128, 0.8)' : 'rgba(255, 255, 255, 0.3)',
            border: '3px solid rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
            cursor: 'pointer',
          }}
        >
          <ArrowUp size={32} color="white" />
        </button>
        
        {/* Reverse button */}
        <button
          className="mobile-move-button"
          onTouchStart={handleReverseStart}
          onTouchEnd={handleReverseEnd}
          onMouseDown={handleReverseStart}
          onMouseUp={handleReverseEnd}
          onMouseLeave={handleReverseEnd}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: isReversePressed ? 'rgba(248, 113, 113, 0.8)' : 'rgba(255, 255, 255, 0.3)',
            border: '3px solid rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
            cursor: 'pointer',
          }}
        >
          <ArrowDown size={32} color="white" />
        </button>
      </div>
    </>
  );
};
