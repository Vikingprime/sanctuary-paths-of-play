import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - directional movement controls
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - small zone where no movement occurs
  deadZonePercent: 0.03,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.15,
  
  // Speeds
  moveSpeed: 1.0,
  
  // Turn rate for smooth rotation toward target direction
  turnRate: 4.0,       // How fast to turn toward target direction (rad/s)
  maxTurnRate: 4.0,
  
  // Visual sizes
  baseRadiusPercent: 0.06,
  knobRadiusPercent: 0.03,
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>;
  yawRateRef: MutableRefObject<number>;
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  targetDirectionRef?: MutableRefObject<number | null>; // Target direction to face (radians)
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  yawRateRef,
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  targetDirectionRef,
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
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    if (targetDirectionRef) {
      targetDirectionRef.current = null;
    }
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    // Update screen dimensions
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [yawRateRef, throttleRef, isMovingRef, mobileTouchActiveRef, targetDirectionRef]);

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

  // Animation loop for controls update
  useEffect(() => {
    const updateLoop = () => {
      const { moveSpeed, turnRate, maxTurnRate } = MOBILE_CONTROL_CONFIG;
      
      // Get current pixel values based on screen height
      const { deadZone, maxRadius } = getPixelValues();
      
      if (anchorRef.current && fingerRef.current) {
        // Calculate offset from anchor to finger (anchor is FIXED, no drifting)
        const dx = fingerRef.current.x - anchorRef.current.x;
        const dy = fingerRef.current.y - anchorRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Clamp knob position to max radius for visuals
        let clampedKnobX = fingerRef.current.x;
        let clampedKnobY = fingerRef.current.y;
        
        if (distance > maxRadius) {
          const scale = maxRadius / distance;
          clampedKnobX = anchorRef.current.x + dx * scale;
          clampedKnobY = anchorRef.current.y + dy * scale;
        }
        
        // Update visuals with clamped knob position
        setJoystickState({
          visible: true,
          baseX: anchorRef.current.x,
          baseY: anchorRef.current.y,
          knobX: clampedKnobX,
          knobY: clampedKnobY,
        });
        
        // Dead zone check - outside deadzone = movement
        if (distance >= deadZone) {
          // === DIRECTIONAL MOVEMENT ===
          // Convert screen drag direction to world direction
          // Screen: +X is right, +Y is down
          // World: rotation 0 = facing north (-Z), rotation increases clockwise
          // Joystick down (dy > 0) = south = rotation PI
          // Joystick right (dx > 0) = east = rotation PI/2
          
          // Calculate target direction from joystick
          // atan2(dx, dy) gives angle where down=0, right=PI/2
          // We need to convert to world where north=0
          // Screen down = world south (PI), so add PI
          const joystickAngle = Math.atan2(dx, dy);
          const targetDirection = joystickAngle + Math.PI;
          
          // Normalize to [-PI, PI]
          let normalizedTarget = targetDirection;
          while (normalizedTarget > Math.PI) normalizedTarget -= Math.PI * 2;
          while (normalizedTarget < -Math.PI) normalizedTarget += Math.PI * 2;
          
          // Set target direction for the movement system to rotate toward
          if (targetDirectionRef) {
            targetDirectionRef.current = normalizedTarget;
          }
          
          // Calculate yaw rate to turn toward target direction
          const currentRotation = playerStateRef.current.rotation;
          let angleDiff = normalizedTarget - currentRotation;
          
          // Normalize angle difference to [-PI, PI]
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          
          // Calculate yaw rate proportional to angle difference
          // Faster turn when far from target, slower when close
          const absAngleDiff = Math.abs(angleDiff);
          
          // Use a proportional controller with clamping
          let rawYawRate = angleDiff * turnRate;
          
          // Clamp to max turn rate
          rawYawRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, rawYawRate));
          
          yawRateRef.current = rawYawRate;
          
          // Always move forward (in the direction we're facing)
          // Speed scales with joystick distance
          const speedScale = Math.min(distance / maxRadius, 1.0);
          throttleRef.current = moveSpeed * speedScale;
          
          isMovingRef.current = true;
          
          // Debug logging (throttled)
          if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
            lastDebugLogRef.current = Date.now();
            console.log('[Mobile] target:', (normalizedTarget * 180 / Math.PI).toFixed(0) + '°',
                        'current:', (currentRotation * 180 / Math.PI).toFixed(0) + '°',
                        'yawRate:', yawRateRef.current.toFixed(2));
          }
        } else {
          // In dead zone - no movement
          throttleRef.current = 0;
          yawRateRef.current = 0;
          isMovingRef.current = false;
          if (targetDirectionRef) {
            targetDirectionRef.current = null;
          }
        }
      } else {
        // No touch active - stop
        throttleRef.current = 0;
        yawRateRef.current = 0;
        isMovingRef.current = false;
        if (targetDirectionRef) {
          targetDirectionRef.current = null;
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
  }, [debugMode, isMovingRef, throttleRef, yawRateRef, targetDirectionRef, playerStateRef, getPixelValues]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    // Anchor is FIXED at initial touch point
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
    
    // Only update finger position, anchor stays fixed
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
    if (targetDirectionRef) {
      targetDirectionRef.current = null;
    }
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerup - stopped');
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, targetDirectionRef, debugMode]);

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