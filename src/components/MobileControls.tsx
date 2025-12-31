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
  
  // Turn rate - base rotation speed (capped by maxTurnRate)
  turnRate: 3.0,
  
  // Visual sizes as percentage of screen height
  baseRadiusPercent: 0.07,
  knobRadiusPercent: 0.035,
  
  // === MOMENTUM LOCKING (Arc-Based Movement) ===
  
  // Minimum forward speed when joystick is outside deadzone (30% = 0.3)
  // This prevents "pivot-in-place" and keeps the animal moving in arcs
  minForwardVelocity: 0.3,
  
  // Use joystick magnitude for speed (circular input mapping)
  // Speed = magnitude, so even pushing 100% right gives full speed
  useMagnitudeForSpeed: true,
  
  // Velocity preservation during sharp turns (maintain at least 40% forward speed)
  velocityPreservation: 0.4,
  
  // Input smoothing (lerp factor per frame, 0-1, lower = smoother)
  inputSmoothing: 0.15,
  
  // Banking/leaning intensity (radians at max turn)
  maxBankAngle: 0.15,
  
  // === STEERING STABILITY ===
  
  // Horizontal deadzone: ignore X input below this threshold (10% = 0.1)
  horizontalDeadzone: 0.10,
  
  // Maximum turn rate cap (radians/sec) - "minimum turning circle"
  // 2π radians / 1.5 seconds = ~4.19 rad/s for full 360° in 1.5s
  maxTurnRate: 4.19,
  
  // Angular drag - how quickly rotation stops when joystick centered (0-1, higher = faster stop)
  angularDrag: 0.4,
  
  // Adaptive turning: turn speed reduction at high speeds (0-1, 0 = no reduction)
  // At full speed, turn rate is reduced by this factor for wider, more stable arcs
  speedTurnReduction: 0.5,
  
  // Progressive steering wind-up time factor (0-1, lower = faster wind-up)
  steeringWindUp: 0.25,
  
  // Cardinal snapping: angle threshold in radians (~5 degrees)
  cardinalSnapThreshold: 0.087, // ~5 degrees in radians
  // Snap strength: how fast we align to cardinal (0-1)
  cardinalSnapStrength: 0.03,
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
              minForwardVelocity, velocityPreservation, inputSmoothing,
              horizontalDeadzone, maxTurnRate, angularDrag, speedTurnReduction, steeringWindUp } = MOBILE_CONTROL_CONFIG;
      
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
          // === CIRCULAR INPUT MAPPING ===
          // Use joystick magnitude for base speed (0 to 1)
          // This ensures even pushing 100% right (X=1, Y=0) still has magnitude=1
          const magnitude = Math.min(1, currentDistance / maxRadius);
          
          // Normalize offset to -1 to 1 range (clamped at maxRadius)
          const rawNormalizedY = Math.max(-1, Math.min(1, -dy / maxRadius));
          let normalizedX = Math.max(-1, Math.min(1, dx / maxRadius));
          
          // === HORIZONTAL DEADZONE (Straight-Away Buffer) ===
          // Treat small X inputs as zero for easier straight movement
          if (Math.abs(normalizedX) < horizontalDeadzone) {
            normalizedX = 0;
          } else {
            // Remap X so it starts from 0 after deadzone
            const sign = normalizedX > 0 ? 1 : -1;
            normalizedX = sign * (Math.abs(normalizedX) - horizontalDeadzone) / (1 - horizontalDeadzone);
          }
          
          // === DYNAMIC INPUT SENSITIVITY (Power Curve) ===
          // Use X³ for rotation - subtle near center, fast at extremes
          const curvedX = normalizedX * normalizedX * normalizedX;
          
          // === MOMENTUM LOCKING (Force Forward Velocity) ===
          // Rule: If joystick is outside deadzone, animal must have minimum forward velocity
          // This prevents "pivot-in-place" and ensures arc-based movement like a bicycle
          
          // Determine base direction from Y
          const isReversing = rawNormalizedY < -0.3;
          
          // Calculate effective forward from Y input (with slight power curve)
          let effectiveForward = rawNormalizedY * Math.abs(rawNormalizedY) * 0.5 + rawNormalizedY * 0.5;
          
          // For forward movement or neutral, enforce minimum forward velocity
          if (!isReversing) {
            // If turning (any X input), force at least minForwardVelocity
            const absX = Math.abs(curvedX);
            if (absX > 0.1) {
              // Scale min velocity by turn intensity - sharper turn = more forward boost
              // This creates arc-based movement
              const turnIntensity = Math.min(1, absX);
              const requiredMinSpeed = minForwardVelocity * (0.5 + 0.5 * turnIntensity);
              
              // Enforce minimum - never let speed drop below this while turning
              if (effectiveForward < requiredMinSpeed) {
                effectiveForward = requiredMinSpeed;
              }
            }
            
            // Also use magnitude to boost speed (circular input mapping)
            // If player pushes mostly sideways (high X, low Y), magnitude keeps speed up
            if (magnitude > 0.3) {
              const magnitudeBoost = magnitude * velocityPreservation;
              effectiveForward = Math.max(effectiveForward, magnitudeBoost);
            }
          }
          
          // Calculate throttle
          if (effectiveForward > 0 || !isReversing) {
            targetThrottle = Math.max(effectiveForward, 0) * forwardSpeed;
          }
          if (isReversing) {
            targetThrottle = effectiveForward * reverseSpeed;
          }
          
          // === ADAPTIVE TURNING (Speed-Based) ===
          // Turn speed is inversely proportional to forward speed
          // At high speed: wider, more majestic turns
          // At low speed: sharper, more agile turns
          const speedFactor = Math.abs(targetThrottle);
          const adaptiveTurnDamping = 1.0 - (speedFactor * speedTurnReduction);
          
          // === CALCULATE RAW TURN RATE (Arc-Based) ===
          // Steering is inverted when reversing for intuitive control
          let rawTurnRate = 0;
          const steerDirection = targetThrottle < 0 ? -1 : 1;
          rawTurnRate = curvedX * turnRate * adaptiveTurnDamping * steerDirection;
          
          // === ROTATION SPEED CAP (Minimum Turning Circle) ===
          // Cap to maxTurnRate - ensures 1.5+ seconds for full 360° rotation
          // This prevents "snapping" into tight spirals
          targetYawRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, rawTurnRate));
        }
        
        // === INPUT SMOOTHING (LERP) for throttle ===
        smoothedThrottleRef.current += (targetThrottle - smoothedThrottleRef.current) * inputSmoothing;
        
        // === PROGRESSIVE STEERING WIND-UP ===
        // Yaw rate lerps slower for smooth turn entry (prevents snapping into curves)
        smoothedYawRateRef.current += (targetYawRate - smoothedYawRateRef.current) * steeringWindUp;
        
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
        // No touch active - apply angular drag (fast stop for rotation)
        smoothedThrottleRef.current *= (1 - inputSmoothing);
        
        // === ANGULAR DRAG (Weighted Feel) ===
        // Rotation stops immediately when joystick released (no momentum carry-over)
        smoothedYawRateRef.current *= (1 - angularDrag);
        
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
