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
  
  // Forward momentum bias settings
  // If X input is above this threshold (0-1), ignore small backward inputs
  turnThreshold: 0.6,
  // Maximum backward Y that gets ignored when turning sharply
  reverseIgnoreThreshold: 0.3,
  // Minimum forward speed maintained during sharp turns (0-1)
  minTurnSpeed: 0.3,
  
  // Speed-sensitive steering
  // At low speeds, turning is faster (pivot behavior)
  pivotTurnMultiplier: 2.0,
  
  // Input smoothing (lerp factor per frame, 0-1, lower = smoother)
  inputSmoothing: 0.15,
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
  
  // Smoothed input values for lerp
  const smoothedThrottleRef = useRef<number>(0);
  const smoothedYawRateRef = useRef<number>(0);
  
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
      const { 
        deadZone, maxRadius, driftSpeed, forwardSpeed, reverseSpeed, turnRate,
        turnThreshold, reverseIgnoreThreshold, minTurnSpeed, pivotTurnMultiplier, inputSmoothing
      } = MOBILE_CONTROL_CONFIG;
      
      if (anchorRef.current && fingerRef.current) {
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
        
        // Target values before smoothing
        let targetThrottle = 0;
        let targetYawRate = 0;
        
        // Dead zone check
        if (currentDistance >= deadZone) {
          // Tank controls: Y = forward/backward, X = steering
          
          // Normalize offset to -1 to 1 range (clamped at maxRadius)
          const rawNormalizedY = Math.max(-1, Math.min(1, -dy / maxRadius)); // Negative because screen Y is inverted
          const normalizedX = Math.max(-1, Math.min(1, dx / maxRadius));
          const absX = Math.abs(normalizedX);
          
          // === FORWARD MOMENTUM BIAS ===
          // If turning sharply (X > turnThreshold), ignore small backward inputs
          let effectiveY = rawNormalizedY;
          
          if (absX >= turnThreshold && rawNormalizedY < 0 && rawNormalizedY > -reverseIgnoreThreshold) {
            // Sharp turn with small backward input - treat as forward/neutral
            effectiveY = 0;
          }
          
          // === WIDE ARC LOGIC ===
          // When X input is high, maintain minimum forward speed
          if (absX >= turnThreshold && effectiveY >= 0) {
            // During sharp turns, ensure minimum forward movement
            effectiveY = Math.max(effectiveY, minTurnSpeed);
          }
          
          // Calculate throttle
          if (effectiveY > 0) {
            targetThrottle = effectiveY * forwardSpeed;
          } else if (effectiveY < 0) {
            // Only reverse if we have significant backward input (not ignored by bias)
            targetThrottle = effectiveY * reverseSpeed;
          }
          
          // === SPEED-SENSITIVE STEERING ===
          // Turn sharper at low speeds, enabling pivot turns
          const speedFactor = Math.abs(targetThrottle);
          // At low speed (< 0.3), multiply turn rate; at high speed, use normal rate
          const pivotFactor = speedFactor < 0.3 
            ? pivotTurnMultiplier * (1 - speedFactor / 0.3) + 1 
            : 1;
          
          // If near Y-center with high X, allow pivot turn (spin in place)
          const isPivoting = absX > 0.5 && Math.abs(effectiveY) < 0.2;
          
          if (isPivoting) {
            // Pivot turn: spin in place with boosted turn rate
            targetYawRate = normalizedX * turnRate * pivotTurnMultiplier;
            // Small forward nudge to prevent complete stop feeling
            targetThrottle = Math.max(targetThrottle, 0.1);
          } else if (Math.abs(targetThrottle) > 0.05) {
            // Normal movement: steer based on direction
            const steerDirection = targetThrottle < 0 ? -1 : 1;
            targetYawRate = normalizedX * turnRate * pivotFactor * steerDirection;
          }
        }
        
        // === INPUT SMOOTHING (LERP) ===
        // Smooth transition between current and target values
        smoothedThrottleRef.current += (targetThrottle - smoothedThrottleRef.current) * inputSmoothing;
        smoothedYawRateRef.current += (targetYawRate - smoothedYawRateRef.current) * inputSmoothing;
        
        // Apply smoothed values
        throttleRef.current = smoothedThrottleRef.current;
        yawRateRef.current = smoothedYawRateRef.current;
        isMovingRef.current = Math.abs(throttleRef.current) > 0.05;
        
        // Debug logging (throttled)
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          console.log('[Mobile] dx:', dx.toFixed(0), 'dy:', dy.toFixed(0),
                      'throttle:', throttleRef.current.toFixed(2),
                      'yawRate:', yawRateRef.current.toFixed(2));
        }
      } else {
        // No touch active - smoothly decay to zero
        smoothedThrottleRef.current *= (1 - inputSmoothing);
        smoothedYawRateRef.current *= (1 - inputSmoothing);
        
        if (Math.abs(smoothedThrottleRef.current) < 0.01) smoothedThrottleRef.current = 0;
        if (Math.abs(smoothedYawRateRef.current) < 0.01) smoothedYawRateRef.current = 0;
        
        throttleRef.current = smoothedThrottleRef.current;
        yawRateRef.current = smoothedYawRateRef.current;
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
