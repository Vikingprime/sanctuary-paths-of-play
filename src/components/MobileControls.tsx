import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - simplified angle-based directional controls
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone as percentage of screen height
  deadZonePercent: 0.15,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.12,
  
  // Drift lerp speed (how fast anchor slides toward finger)
  driftSpeed: 0.08,
  
  // Fixed speeds (binary: 0 or this value)
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
  
  // Turn rate - base rotation speed
  turnRate: 3.0,
  
  // Visual sizes as percentage of screen height
  baseRadiusPercent: 0.06,
  knobRadiusPercent: 0.03,
  
  // === ANGLE-BASED DIRECTION ===
  // Reverse zone: only reverse when joystick angle is in bottom wedge
  // 135° to 225° (measured from right, counterclockwise)
  // In radians: ~2.36 to ~3.93 rad (or -135° to -225° which is -2.36 to -3.93)
  reverseAngleMin: 135, // degrees from right (pointing down-left)
  reverseAngleMax: 225, // degrees from right (pointing down-right)
  
  // Maximum turn rate cap (radians/sec)
  maxTurnRate: 3.0,
  
  // Angular drag - how quickly rotation stops when joystick centered
  angularDrag: 0.4,
  
  // Cardinal snapping
  cardinalSnapThreshold: 0.087,
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
              reverseAngleMin, reverseAngleMax,
              maxTurnRate, angularDrag } = MOBILE_CONTROL_CONFIG;
      
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
        
        // Target values
        let targetThrottle = 0;
        let targetYawRate = 0;
        
        // Dead zone check - outside deadzone = movement
        if (currentDistance >= deadZone) {
          // === ANGLE-BASED DIRECTION ===
          // Calculate angle of joystick (0° = right, 90° = down, 180° = left, 270° = up)
          // atan2(dy, dx) gives angle from right, positive = down (screen coords)
          let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
          // Normalize to 0-360
          if (angleDeg < 0) angleDeg += 360;
          
          // Check if in reverse zone (bottom 90° wedge: 135° to 225°)
          const isReverse = angleDeg >= reverseAngleMin && angleDeg <= reverseAngleMax;
          
          // Fixed speed: 100% forward or reverse based on angle
          if (isReverse) {
            targetThrottle = -reverseSpeed;
          } else {
            targetThrottle = forwardSpeed;
          }
          
          // === STEERING ===
          // Use X component directly for steering
          const normalizedX = dx / maxRadius;
          // Clamp to -1 to 1
          const clampedX = Math.max(-1, Math.min(1, normalizedX));
          
          // Simple squared curve for smooth control
          const curvedX = clampedX * Math.abs(clampedX);
          
          // Calculate turn rate
          let rawTurnRate = curvedX * turnRate;
          
          // Invert steering when reversing
          if (isReverse) {
            rawTurnRate = -rawTurnRate;
          }
          
          // Cap turn rate
          targetYawRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, rawTurnRate));
        }
        
        // Apply values directly
        throttleRef.current = targetThrottle;
        yawRateRef.current = targetYawRate;
        
        isMovingRef.current = Math.abs(throttleRef.current) > 0.05;
        
        // Debug logging (throttled)
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          console.log('[Mobile] throttle:', throttleRef.current.toFixed(2),
                      'yawRate:', yawRateRef.current.toFixed(2));
        }
      } else {
        // No touch active - stop immediately
        throttleRef.current = 0;
        
        // Angular drag for rotation
        smoothedYawRateRef.current *= (1 - angularDrag);
        if (Math.abs(smoothedYawRateRef.current) < 0.01) smoothedYawRateRef.current = 0;
        yawRateRef.current = smoothedYawRateRef.current;
        
        isMovingRef.current = false;
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
