import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - now using normalized values (0-1 as percentage of screen height)
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone as percentage of screen height
  deadZonePercent: 0.02,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.06,
  
  // Drift lerp speed (how fast anchor slides toward finger)
  driftSpeed: 0.08,
  
  // Speed settings
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
  
  // Turn rate - how fast the animal rotates based on X offset
  turnRate: 3.0,
  
  // Visual sizes as percentage of screen height
  baseRadiusPercent: 0.07,
  knobRadiusPercent: 0.035,
  
  // Arc-based movement settings
  // Minimum forward speed when joystick magnitude > 0.5 (40% of max)
  minArcSpeed: 0.4,
  // Magnitude threshold for arc movement
  arcMagnitudeThreshold: 0.5,
  
  // Speed-sensitive steering
  pivotTurnMultiplier: 2.0,
  
  // Input smoothing (lerp factor per frame, 0-1, lower = smoother)
  inputSmoothing: 0.15,
  
  // Banking/leaning intensity (radians at max turn)
  maxBankAngle: 0.15,
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
  
  // Track screen dimensions for normalization
  const screenDimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  
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

  // Calculate pixel values from percentage-based config
  const getPixelValues = useCallback(() => {
    const screenHeight = screenDimensionsRef.current.height;
    return {
      deadZone: screenHeight * MOBILE_CONTROL_CONFIG.deadZonePercent,
      maxRadius: screenHeight * MOBILE_CONTROL_CONFIG.maxRadiusPercent,
      baseRadius: screenHeight * MOBILE_CONTROL_CONFIG.baseRadiusPercent,
      knobRadius: screenHeight * MOBILE_CONTROL_CONFIG.knobRadiusPercent,
    };
  }, []);

  // Reset all control state - used on orientation change
  const resetControls = useCallback(() => {
    activePointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    smoothedThrottleRef.current = 0;
    smoothedYawRateRef.current = 0;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    // Update screen dimensions
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [yawRateRef, throttleRef, isMovingRef, mobileTouchActiveRef]);

  // Track last known orientation to detect actual orientation changes
  const lastOrientationRef = useRef<'portrait' | 'landscape'>(
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  // Add game-active class to html when mounted, remove on unmount
  // Also handle orientation changes and prevent all browser gestures
  useEffect(() => {
    document.documentElement.classList.add('game-active');
    
    // Prevent pull-to-refresh and other overscroll behaviors
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    
    // Initialize screen dimensions
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
    
    const preventGestures = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === 'mobileControlSurface' || target.closest('#mobileControlSurface')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // Handle resize/orientation changes
    const handleResize = () => {
      const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      
      // Update screen dimensions regardless
      screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
      
      // Only reset controls on actual orientation change
      if (currentOrientation !== lastOrientationRef.current) {
        lastOrientationRef.current = currentOrientation;
        resetControls();
      }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    document.addEventListener('touchstart', preventGestures, { passive: false, capture: true });
    document.addEventListener('touchmove', preventGestures, { passive: false, capture: true });
    document.addEventListener('touchend', preventGestures, { passive: false, capture: true });
    
    return () => {
      document.documentElement.classList.remove('game-active');
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('touchstart', preventGestures, { capture: true });
      document.removeEventListener('touchmove', preventGestures, { capture: true });
      document.removeEventListener('touchend', preventGestures, { capture: true });
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [resetControls]);

  // Animation loop for drift anchor and controls update
  useEffect(() => {
    const updateLoop = () => {
      const { driftSpeed, forwardSpeed, reverseSpeed, turnRate, 
              minArcSpeed, arcMagnitudeThreshold, pivotTurnMultiplier, inputSmoothing } = MOBILE_CONTROL_CONFIG;
      
      // Get current pixel values based on screen height
      const { deadZone, maxRadius } = getPixelValues();
      
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
          // Normalize offset to -1 to 1 range (clamped at maxRadius)
          const rawNormalizedY = Math.max(-1, Math.min(1, -dy / maxRadius));
          const normalizedX = Math.max(-1, Math.min(1, dx / maxRadius));
          
          // Calculate joystick magnitude (0 to 1)
          const magnitude = Math.min(1, currentDistance / maxRadius);
          
          // === SENSITIVITY CURVE (Y * abs(Y)) ===
          // Apply power curve for finer control at low values
          const curvedY = rawNormalizedY * Math.abs(rawNormalizedY);
          const curvedX = normalizedX * Math.abs(normalizedX);
          
          // === ARC-BASED MOVEMENT ===
          // Instead of allowing pivot-only, always maintain forward motion during turns
          
          // Base forward speed from Y input
          let effectiveForward = curvedY;
          
          // If magnitude is above threshold and we're turning, maintain minimum forward speed
          // This eliminates "pivot-only" state and creates arc movement
          if (magnitude >= arcMagnitudeThreshold) {
            const absX = Math.abs(curvedX);
            
            // If turning significantly (X > 0.3), enforce minimum forward speed
            if (absX > 0.3) {
              // Scale min speed by how much we're turning (more turn = more forward boost)
              const turnIntensity = Math.min(1, absX / 0.8);
              const requiredMinSpeed = minArcSpeed * turnIntensity;
              
              // Only apply if current forward would be less than minimum
              // This prevents pivot-in-place during sharp turns
              if (effectiveForward >= 0 && effectiveForward < requiredMinSpeed) {
                effectiveForward = requiredMinSpeed;
              }
              // For slight backward + turn, convert to forward arc
              else if (effectiveForward < 0 && effectiveForward > -0.2 && absX > 0.5) {
                effectiveForward = requiredMinSpeed * 0.5;
              }
            }
          }
          
          // Calculate throttle based on effective forward
          if (effectiveForward > 0) {
            targetThrottle = effectiveForward * forwardSpeed;
          } else if (effectiveForward < 0) {
            targetThrottle = effectiveForward * reverseSpeed;
          }
          
          // === TURN RATE ===
          // Turn rate scales with how much we're moving forward
          // Faster movement = slightly reduced turn rate for stability
          const speedFactor = Math.abs(targetThrottle);
          const turnDamping = speedFactor > 0.7 ? 0.8 : 1.0;
          
          // Apply turn rate - steering is inverted when reversing
          if (Math.abs(targetThrottle) > 0.05) {
            const steerDirection = targetThrottle < 0 ? -1 : 1;
            targetYawRate = curvedX * turnRate * turnDamping * steerDirection;
          } else if (magnitude < arcMagnitudeThreshold) {
            // Only allow slow pivot when barely touching joystick (in deadzone-ish area)
            targetYawRate = curvedX * turnRate * 0.3;
          }
        }
        
        // === INPUT SMOOTHING (LERP) ===
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
                      'yawRate:', yawRateRef.current.toFixed(2),
                      'screenH:', screenDimensionsRef.current.height);
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
  }, [debugMode, isMovingRef, throttleRef, yawRateRef, getPixelValues]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Check what element is actually at this point (underneath our overlay)
    // Temporarily hide overlay to check
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';
      
      // If there's an interactive element below, let it handle the click
      if (elementBelow?.closest('button, [role="button"], a, input, select, textarea, [data-interactive]')) {
        return;
      }
    }
    
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

  // Get current pixel values for rendering
  const { baseRadius, knobRadius } = getPixelValues();

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
          zIndex: 50,
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
              zIndex: 51,
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
              zIndex: 52,
            }}
          />
        </>
      )}
    </>
  );
};
