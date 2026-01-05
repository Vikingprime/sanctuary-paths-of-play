import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs for two-finger control system
export const MOBILE_CONTROL_CONFIG = {
  // Joystick settings
  deadZonePercent: 0.03,        // Dead zone as % of screen height
  maxRadiusPercent: 0.12,       // Max joystick radius as % of screen height
  driftSpeed: 0.12,             // How fast anchor drifts toward finger
  
  // Movement speeds
  forwardSpeed: 1.0,
  reverseSpeed: 0.6,
  
  // Camera swipe settings
  swipeSensitivity: 0.004,      // Radians per pixel of swipe
  cameraLerpSpeed: 0.15,        // Smoothing for camera rotation
  
  // Visual sizes
  baseRadiusPercent: 0.065,
  knobRadiusPercent: 0.035,
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  cameraYawRef: MutableRefObject<number>;          // Camera rotation (we control this via swipe)
  movementInputRef: MutableRefObject<{ x: number; y: number }>; // -1 to 1 joystick input
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;           // Speed multiplier 0-1
  mobileTouchActiveRef: MutableRefObject<boolean>;
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  cameraYawRef,
  movementInputRef,
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  debugMode = false
}: MobileControlsProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Joystick state (first finger)
  const joystickPointerIdRef = useRef<number | null>(null);
  const joystickAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const joystickFingerRef = useRef<{ x: number; y: number } | null>(null);
  
  // Camera swipe state (second finger)
  const cameraPointerIdRef = useRef<number | null>(null);
  const cameraLastXRef = useRef<number>(0);
  
  // Animation frame for continuous updates
  const animationFrameRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);
  
  // Screen dimensions for percentage-based sizing
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

  // Reset all control state
  const resetControls = useCallback(() => {
    joystickPointerIdRef.current = null;
    joystickAnchorRef.current = null;
    joystickFingerRef.current = null;
    cameraPointerIdRef.current = null;
    cameraLastXRef.current = 0;
    
    movementInputRef.current = { x: 0, y: 0 };
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [movementInputRef, throttleRef, isMovingRef, mobileTouchActiveRef]);

  // Track orientation changes
  const lastOrientationRef = useRef<'portrait' | 'landscape'>(
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  // Setup and cleanup
  useEffect(() => {
    document.documentElement.classList.add('game-active');
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
    
    const preventGestures = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === 'mobileControlSurface' || target.closest('#mobileControlSurface')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    const handleResize = () => {
      const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
      
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

  // Animation loop for joystick processing
  useEffect(() => {
    const updateLoop = () => {
      const { driftSpeed, forwardSpeed, reverseSpeed } = MOBILE_CONTROL_CONFIG;
      const { deadZone, maxRadius } = getPixelValues();
      
      if (joystickAnchorRef.current && joystickFingerRef.current) {
        // Calculate offset from anchor to finger
        let dx = joystickFingerRef.current.x - joystickAnchorRef.current.x;
        let dy = joystickFingerRef.current.y - joystickAnchorRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Drift anchor if beyond max radius
        if (distance > maxRadius) {
          const excess = distance - maxRadius;
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          joystickAnchorRef.current.x += normalizedDx * excess * driftSpeed;
          joystickAnchorRef.current.y += normalizedDy * excess * driftSpeed;
          
          dx = joystickFingerRef.current.x - joystickAnchorRef.current.x;
          dy = joystickFingerRef.current.y - joystickAnchorRef.current.y;
        }
        
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Update joystick visuals
        setJoystickState({
          visible: true,
          baseX: joystickAnchorRef.current.x,
          baseY: joystickAnchorRef.current.y,
          knobX: joystickFingerRef.current.x,
          knobY: joystickFingerRef.current.y,
        });
        
        // Calculate normalized joystick input (-1 to 1)
        if (currentDistance >= deadZone) {
          const normalizedX = dx / maxRadius;
          const normalizedY = -dy / maxRadius; // Invert Y (screen coords are inverted)
          
          // Clamp to unit circle
          const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
          const clampedMagnitude = Math.min(magnitude, 1);
          
          if (magnitude > 0) {
            movementInputRef.current = {
              x: (normalizedX / magnitude) * clampedMagnitude,
              y: (normalizedY / magnitude) * clampedMagnitude,
            };
          }
          
          // Throttle is based on magnitude (how far joystick is pushed)
          // Forward has full speed, backward is slower
          const isBackward = normalizedY < -0.3 && Math.abs(normalizedY) > Math.abs(normalizedX);
          throttleRef.current = isBackward 
            ? clampedMagnitude * reverseSpeed 
            : clampedMagnitude * forwardSpeed;
          
          isMovingRef.current = true;
        } else {
          // In dead zone - no movement
          movementInputRef.current = { x: 0, y: 0 };
          throttleRef.current = 0;
          isMovingRef.current = false;
        }
        
        // Debug logging
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          console.log('[Mobile] input:', movementInputRef.current.x.toFixed(2), movementInputRef.current.y.toFixed(2),
                      'throttle:', throttleRef.current.toFixed(2),
                      'cameraYaw:', cameraYawRef.current.toFixed(2));
        }
      } else {
        // No joystick touch - stop movement
        movementInputRef.current = { x: 0, y: 0 };
        throttleRef.current = 0;
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
  }, [debugMode, movementInputRef, throttleRef, isMovingRef, cameraYawRef, getPixelValues]);

  // Handle pointer down - assign to joystick or camera based on which slot is free
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // First finger becomes joystick
    if (joystickPointerIdRef.current === null) {
      joystickPointerIdRef.current = e.pointerId;
      joystickAnchorRef.current = { x: e.clientX, y: e.clientY };
      joystickFingerRef.current = { x: e.clientX, y: e.clientY };
      mobileTouchActiveRef.current = true;
      
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
        console.log('[Mobile] Joystick started at', e.clientX.toFixed(0), e.clientY.toFixed(0));
      }
      return;
    }
    
    // Second finger becomes camera control
    if (cameraPointerIdRef.current === null) {
      cameraPointerIdRef.current = e.pointerId;
      cameraLastXRef.current = e.clientX;
      
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] Camera swipe started at', e.clientX.toFixed(0));
      }
      return;
    }
    
    // Additional fingers ignored
  }, [mobileTouchActiveRef, debugMode]);

  // Handle pointer move
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Joystick movement
    if (e.pointerId === joystickPointerIdRef.current && joystickAnchorRef.current) {
      joystickFingerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    // Camera swipe
    if (e.pointerId === cameraPointerIdRef.current) {
      const deltaX = e.clientX - cameraLastXRef.current;
      cameraLastXRef.current = e.clientX;
      
      // Update camera yaw (swipe right = rotate clockwise)
      cameraYawRef.current += deltaX * MOBILE_CONTROL_CONFIG.swipeSensitivity;
      
      // Normalize to 0..2PI
      const TWO_PI = Math.PI * 2;
      while (cameraYawRef.current < 0) cameraYawRef.current += TWO_PI;
      while (cameraYawRef.current >= TWO_PI) cameraYawRef.current -= TWO_PI;
      
      return;
    }
  }, [cameraYawRef]);

  // Handle pointer end
  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Joystick released
    if (e.pointerId === joystickPointerIdRef.current) {
      joystickPointerIdRef.current = null;
      joystickAnchorRef.current = null;
      joystickFingerRef.current = null;
      
      // Only set touch inactive if no camera touch either
      if (cameraPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      movementInputRef.current = { x: 0, y: 0 };
      throttleRef.current = 0;
      isMovingRef.current = false;
      
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
      
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] Joystick released');
      }
      return;
    }
    
    // Camera released
    if (e.pointerId === cameraPointerIdRef.current) {
      cameraPointerIdRef.current = null;
      
      // Only set touch inactive if no joystick touch either
      if (joystickPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] Camera swipe released');
      }
      return;
    }
  }, [mobileTouchActiveRef, movementInputRef, throttleRef, isMovingRef, debugMode]);

  // Handle pointer leave (edge case - pointer exits window)
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Release joystick if that pointer left
    if (e.pointerId === joystickPointerIdRef.current) {
      joystickPointerIdRef.current = null;
      joystickAnchorRef.current = null;
      joystickFingerRef.current = null;
      movementInputRef.current = { x: 0, y: 0 };
      throttleRef.current = 0;
      isMovingRef.current = false;
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    }
    
    // Release camera if that pointer left
    if (e.pointerId === cameraPointerIdRef.current) {
      cameraPointerIdRef.current = null;
    }
    
    // Update touch active state
    if (joystickPointerIdRef.current === null && cameraPointerIdRef.current === null) {
      mobileTouchActiveRef.current = false;
    }
    
    if (debugMode) {
      console.log('[Mobile] Pointer left window');
    }
  }, [mobileTouchActiveRef, movementInputRef, throttleRef, isMovingRef, debugMode]);

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
        onPointerLeave={handlePointerLeave}
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
