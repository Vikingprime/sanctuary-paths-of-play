import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs for joystick controls
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - percentage of max radius
  deadZonePercent: 0.15,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.12,
  
  // Visual sizes
  baseRadiusPercent: 0.08,
  knobRadiusPercent: 0.035,
  
  // Movement speed multiplier
  moveSpeedMultiplier: 1.0,
};

// Camera swipe sensitivity config
export const CAMERA_SWIPE_CONFIG = {
  // Sensitivity (radians per pixel of movement)
  sensitivity: 0.004,
  
  // Mouse sensitivity (for desktop camera mode)
  mouseSensitivity: 0.003,
  
  // Smoothing factor (0-1, higher = more responsive)
  smoothing: 0.15,
  
  // Velocity decay when touch ends
  velocityDecay: 0.92,
  
  // Minimum velocity to keep spinning
  minVelocity: 0.001,
};

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>; // Legacy - not used
  yawRateRef: MutableRefObject<number>; // Legacy - not used
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  // New: camera-relative movement
  cameraYawRef: MutableRefObject<number>; // Current camera yaw angle
  moveDirectionRef: MutableRefObject<{ x: number; y: number }>; // Normalized movement direction relative to camera
  debugMode?: boolean;
  cameraModeEnabled?: boolean; // Whether camera control mode is active
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  yawRateRef,
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  cameraYawRef,
  moveDirectionRef,
  debugMode = false,
  cameraModeEnabled = true,
}: MobileControlsProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Joystick state (movement)
  const joystickAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const joystickFingerRef = useRef<{ x: number; y: number } | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  
  // Camera swipe state
  const cameraPointerIdRef = useRef<number | null>(null);
  const cameraLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const cameraVelocityRef = useRef<number>(0);
  
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
      deadZone: screenHeight * MOBILE_CONTROL_CONFIG.maxRadiusPercent * MOBILE_CONTROL_CONFIG.deadZonePercent,
      maxRadius: screenHeight * MOBILE_CONTROL_CONFIG.maxRadiusPercent,
      baseRadius: screenHeight * MOBILE_CONTROL_CONFIG.baseRadiusPercent,
      knobRadius: screenHeight * MOBILE_CONTROL_CONFIG.knobRadiusPercent,
    };
  }, []);

  // Reset all control state - used on orientation change
  const resetControls = useCallback(() => {
    joystickPointerIdRef.current = null;
    joystickAnchorRef.current = null;
    joystickFingerRef.current = null;
    cameraPointerIdRef.current = null;
    cameraLastPosRef.current = null;
    cameraVelocityRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    moveDirectionRef.current = { x: 0, y: 0 };
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    // Update screen dimensions
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [throttleRef, isMovingRef, mobileTouchActiveRef, moveDirectionRef]);

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

  // Desktop mouse camera control (when cameraModeEnabled is true)
  // Track mouse state for click-and-drag camera control
  const mouseDownRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number } | null>(null);
  
  useEffect(() => {
    if (!cameraModeEnabled) {
      console.log('[Camera] cameraModeEnabled is false, skipping mouse listeners');
      return;
    }
    
    console.log('[Camera] Setting up mouse camera control listeners');
    
    const handleMouseDown = (e: MouseEvent) => {
      mouseDownRef.current = true;
      lastMousePosRef.current = { x: e.clientX };
      console.log('[Camera] mousedown at', e.clientX);
    };
    
    const handleMouseUp = () => {
      console.log('[Camera] mouseup');
      mouseDownRef.current = false;
      lastMousePosRef.current = null;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      // Only control camera when mouse is held down (click-and-drag)
      if (!mouseDownRef.current || !lastMousePosRef.current) return;
      
      const deltaX = e.clientX - lastMousePosRef.current.x;
      lastMousePosRef.current = { x: e.clientX };
      
      // Update camera yaw
      const yawDelta = -deltaX * CAMERA_SWIPE_CONFIG.mouseSensitivity;
      cameraYawRef.current += yawDelta;
      console.log('[Camera] mousemove deltaX:', deltaX, 'yaw:', cameraYawRef.current.toFixed(2));
    };
    
    // WASD keyboard controls emulating joystick
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        updateWASDDirection();
        isMovingRef.current = true;
        throttleRef.current = 1.0; // Full speed
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        // Re-evaluate direction after a key release
        setTimeout(updateWASDDirection, 0);
      }
    };
    
    // Track which WASD keys are currently pressed
    const wasdState = { w: false, a: false, s: false, d: false };
    
    const updateWASDDirectionFromState = () => {
      let x = 0;
      let y = 0;
      
      if (wasdState.w) y += 1;  // Forward
      if (wasdState.s) y -= 1;  // Backward
      if (wasdState.a) x -= 1;  // Left
      if (wasdState.d) x += 1;  // Right
      
      // Normalize diagonal movement
      const magnitude = Math.sqrt(x * x + y * y);
      if (magnitude > 0) {
        moveDirectionRef.current = { x: x / magnitude, y: y / magnitude };
        throttleRef.current = 1.0;
        isMovingRef.current = true;
      } else {
        moveDirectionRef.current = { x: 0, y: 0 };
        throttleRef.current = 0;
        isMovingRef.current = false;
      }
    };
    
    const handleWASDKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w') wasdState.w = true;
      else if (key === 'a') wasdState.a = true;
      else if (key === 's') wasdState.s = true;
      else if (key === 'd') wasdState.d = true;
      
      if (['w', 'a', 's', 'd'].includes(key)) {
        updateWASDDirectionFromState();
      }
    };
    
    const handleWASDKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w') wasdState.w = false;
      else if (key === 'a') wasdState.a = false;
      else if (key === 's') wasdState.s = false;
      else if (key === 'd') wasdState.d = false;
      
      if (['w', 'a', 's', 'd'].includes(key)) {
        updateWASDDirectionFromState();
      }
    };
    
    // Unused helper - keeping for reference
    const updateWASDDirection = () => {
      updateWASDDirectionFromState();
    };
    
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleWASDKeyDown);
    window.addEventListener('keyup', handleWASDKeyUp);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleWASDKeyDown);
      window.removeEventListener('keyup', handleWASDKeyUp);
    };
  }, [cameraModeEnabled, cameraYawRef, moveDirectionRef, isMovingRef, throttleRef]);

  // Animation loop for joystick input processing
  useEffect(() => {
    const updateLoop = () => {
      const { maxRadius, deadZone } = getPixelValues();
      
      // Process joystick input
      if (joystickAnchorRef.current && joystickFingerRef.current) {
        let dx = joystickFingerRef.current.x - joystickAnchorRef.current.x;
        let dy = joystickFingerRef.current.y - joystickAnchorRef.current.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        
        // Clamp finger position to max radius (stick can't go past circle)
        if (distance > maxRadius) {
          const scale = maxRadius / distance;
          dx *= scale;
          dy *= scale;
          distance = maxRadius;
          
          // Update actual finger position to clamped position for visual
          joystickFingerRef.current.x = joystickAnchorRef.current.x + dx;
          joystickFingerRef.current.y = joystickAnchorRef.current.y + dy;
        }
        
        // Update visuals with clamped position
        setJoystickState({
          visible: true,
          baseX: joystickAnchorRef.current.x,
          baseY: joystickAnchorRef.current.y,
          knobX: joystickFingerRef.current.x,
          knobY: joystickFingerRef.current.y,
        });
        
        // Process movement
        if (distance >= deadZone) {
          // Normalize to -1 to 1 range
          const normalizedX = dx / maxRadius;
          const normalizedY = dy / maxRadius; // Positive Y = down on screen = forward in game
          
          // Set movement direction (relative to camera - will be transformed in player update)
          // Note: Y is inverted because screen Y increases downward
          moveDirectionRef.current = { 
            x: normalizedX, 
            y: -normalizedY  // Invert so pushing up = forward
          };
          
          // Calculate throttle (0 to 1 based on distance from deadzone)
          const effectiveDistance = (distance - deadZone) / (maxRadius - deadZone);
          throttleRef.current = Math.min(1, effectiveDistance);
          isMovingRef.current = true;
        } else {
          // In dead zone
          moveDirectionRef.current = { x: 0, y: 0 };
          throttleRef.current = 0;
          isMovingRef.current = false;
        }
        
        // Debug logging (throttled)
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          console.log('[Mobile] moveDir:', moveDirectionRef.current.x.toFixed(2), moveDirectionRef.current.y.toFixed(2),
                      'throttle:', throttleRef.current.toFixed(2));
        }
      } else {
        // No joystick active
        moveDirectionRef.current = { x: 0, y: 0 };
        throttleRef.current = 0;
        isMovingRef.current = false;
      }
      
      // Process camera velocity decay (momentum after release)
      if (cameraPointerIdRef.current === null && Math.abs(cameraVelocityRef.current) > CAMERA_SWIPE_CONFIG.minVelocity) {
        cameraYawRef.current += cameraVelocityRef.current;
        cameraVelocityRef.current *= CAMERA_SWIPE_CONFIG.velocityDecay;
      }
      
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateLoop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [debugMode, isMovingRef, throttleRef, moveDirectionRef, cameraYawRef, getPixelValues]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // On desktop with camera mode enabled, let mouse events pass through to window listeners
    // (mouse controls camera via separate mousedown/mousemove listener, WASD controls movement)
    if (cameraModeEnabled && e.pointerType === 'mouse') {
      // Don't preventDefault - let the event bubble to window listeners
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // First touch becomes joystick
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
        console.log('[Mobile] joystick down at', e.clientX.toFixed(0), e.clientY.toFixed(0));
      }
      return;
    }
    
    // Second touch becomes camera control (if enabled)
    if (cameraModeEnabled && cameraPointerIdRef.current === null) {
      cameraPointerIdRef.current = e.pointerId;
      cameraLastPosRef.current = { x: e.clientX, y: e.clientY };
      cameraVelocityRef.current = 0;
      
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] camera control down at', e.clientX.toFixed(0), e.clientY.toFixed(0));
      }
    }
  }, [mobileTouchActiveRef, debugMode, cameraModeEnabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Let mouse events pass through when camera mode is enabled
    if (cameraModeEnabled && e.pointerType === 'mouse') {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // Joystick movement
    if (e.pointerId === joystickPointerIdRef.current && joystickAnchorRef.current) {
      joystickFingerRef.current = { x: e.clientX, y: e.clientY };
    }
    
    // Camera swipe movement
    if (cameraModeEnabled && e.pointerId === cameraPointerIdRef.current && cameraLastPosRef.current) {
      const deltaX = e.clientX - cameraLastPosRef.current.x;
      
      // Update camera yaw
      const yawDelta = -deltaX * CAMERA_SWIPE_CONFIG.sensitivity;
      cameraYawRef.current += yawDelta;
      
      // Track velocity for momentum
      cameraVelocityRef.current = yawDelta * CAMERA_SWIPE_CONFIG.smoothing;
      
      cameraLastPosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [cameraYawRef, cameraModeEnabled]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Joystick released
    if (e.pointerId === joystickPointerIdRef.current) {
      joystickPointerIdRef.current = null;
      joystickAnchorRef.current = null;
      joystickFingerRef.current = null;
      
      throttleRef.current = 0;
      isMovingRef.current = false;
      moveDirectionRef.current = { x: 0, y: 0 };
      
      // Only set mobileTouchActive to false if camera isn't active
      if (cameraPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
      
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] joystick up');
      }
    }
    
    // Camera released
    if (e.pointerId === cameraPointerIdRef.current) {
      cameraPointerIdRef.current = null;
      cameraLastPosRef.current = null;
      // Keep velocity for momentum decay
      
      // Only set mobileTouchActive to false if joystick isn't active
      if (joystickPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] camera up, velocity:', cameraVelocityRef.current.toFixed(4));
      }
    }
  }, [mobileTouchActiveRef, throttleRef, isMovingRef, moveDirectionRef, debugMode]);

  // Handle pointer leaving the window - clears stuck drag state
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Clear joystick if it matches
    if (joystickPointerIdRef.current === e.pointerId) {
      joystickPointerIdRef.current = null;
      joystickAnchorRef.current = null;
      joystickFingerRef.current = null;
      throttleRef.current = 0;
      isMovingRef.current = false;
      moveDirectionRef.current = { x: 0, y: 0 };
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    }
    
    // Clear camera if it matches
    if (cameraPointerIdRef.current === e.pointerId) {
      cameraPointerIdRef.current = null;
      cameraLastPosRef.current = null;
    }
    
    // Clear mobile touch active if neither active
    if (joystickPointerIdRef.current === null && cameraPointerIdRef.current === null) {
      mobileTouchActiveRef.current = false;
    }
    
    if (debugMode) {
      console.log('[Mobile] pointerleave - cleared stuck state');
    }
  }, [mobileTouchActiveRef, throttleRef, isMovingRef, moveDirectionRef, debugMode]);

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
