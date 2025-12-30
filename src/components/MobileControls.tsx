import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - exposed for easy adjustment
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - minimum distance to register input
  deadZone: 15,
  
  // Maximum joystick radius before drift kicks in
  maxRadius: 50,
  
  // Drift lerp speed (how fast anchor slides toward finger)
  driftSpeed: 0.08,
  
  // Speed settings
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
  
  // Turn rate - how fast the animal rotates based on X offset
  turnRate: 3.0,
  
  // Visual sizes
  baseRadius: 60,
  knobRadius: 30,
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
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const fingerRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  
  // Visual state for joystick
  const [joystickState, setJoystickState] = useState<{
    visible: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
  }>({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });

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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Animation loop for drift anchor and controls update
  useEffect(() => {
    const updateLoop = () => {
      if (anchorRef.current && fingerRef.current) {
        const { deadZone, maxRadius, driftSpeed, forwardSpeed, reverseSpeed, turnRate } = MOBILE_CONTROL_CONFIG;
        
        // Calculate offset from anchor to finger
        let dx = fingerRef.current.x - anchorRef.current.x;
        let dy = fingerRef.current.y - anchorRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Drift anchor if beyond max radius
        if (distance > maxRadius) {
          const excess = distance - maxRadius;
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          anchorRef.current.x += normalizedDx * excess * driftSpeed;
          anchorRef.current.y += normalizedDy * excess * driftSpeed;
          
          // Recalculate offset after drift
          dx = fingerRef.current.x - anchorRef.current.x;
          dy = fingerRef.current.y - anchorRef.current.y;
        }
        
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Update visuals
        setJoystickState({
          visible: true,
          baseX: anchorRef.current.x,
          baseY: anchorRef.current.y,
          knobX: fingerRef.current.x,
          knobY: fingerRef.current.y,
        });
        
        // Dead zone check
        if (currentDistance < deadZone) {
          isMovingRef.current = false;
          throttleRef.current = 0;
          yawRateRef.current = 0;
        } else {
          // Tank controls: Y = forward/backward, X = steering
          
          // Normalize offset to -1 to 1 range (clamped at maxRadius)
          const normalizedY = Math.max(-1, Math.min(1, -dy / maxRadius)); // Negative because screen Y is inverted
          const normalizedX = Math.max(-1, Math.min(1, dx / maxRadius));
          
          // Forward/backward from Y
          if (normalizedY > 0) {
            throttleRef.current = normalizedY * forwardSpeed;
          } else {
            throttleRef.current = normalizedY * reverseSpeed;
          }
          
          isMovingRef.current = Math.abs(throttleRef.current) > 0.1;
          
          // Steering from X (only when moving)
          if (isMovingRef.current) {
            // When reversing, flip steering direction for intuitive control
            const steerDirection = throttleRef.current < 0 ? -1 : 1;
            yawRateRef.current = normalizedX * turnRate * steerDirection;
          } else {
            yawRateRef.current = 0;
          }
          
          // Debug logging (throttled)
          if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
            lastDebugLogRef.current = Date.now();
            console.log('[Mobile] dx:', dx.toFixed(0), 'dy:', dy.toFixed(0),
                        'throttle:', throttleRef.current.toFixed(2),
                        'yawRate:', yawRateRef.current.toFixed(2));
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateLoop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [debugMode, isMovingRef, throttleRef, yawRateRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture if touch is on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], .z-50, .z-40, .z-30')) return;
    
    // Only capture first pointer
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    anchorRef.current = { x: e.clientX, y: e.clientY };
    fingerRef.current = { x: e.clientX, y: e.clientY };
    
    mobileTouchActiveRef.current = true;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    
    setJoystickState({
      visible: true,
      baseX: e.clientX,
      baseY: e.clientY,
      knobX: e.clientX,
      knobY: e.clientY,
    });
    
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
    if (!anchorRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Just update finger position - the animation loop handles the rest
    fingerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerup - stopped');
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, debugMode]);

  const { baseRadius, knobRadius } = MOBILE_CONTROL_CONFIG;

  return (
    <>
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
      
      {/* Joystick Base */}
      {joystickState.visible && (
        <>
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - baseRadius,
              top: joystickState.baseY - baseRadius,
              width: baseRadius * 2,
              height: baseRadius * 2,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              pointerEvents: 'none',
              zIndex: 11,
            }}
          />
          {/* Joystick Knob */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.knobX - knobRadius,
              top: joystickState.knobY - knobRadius,
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.5)',
              border: '2px solid rgba(255, 255, 255, 0.7)',
              pointerEvents: 'none',
              zIndex: 12,
            }}
          />
        </>
      )}
    </>
  );
};
