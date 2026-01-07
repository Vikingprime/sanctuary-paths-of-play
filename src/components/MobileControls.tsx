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
  
  // Fixed joystick position (percentage from edges)
  fixedPositionLeft: 0.12, // 12% from left edge
  fixedPositionBottom: 0.18, // 18% from bottom edge
};

// Camera swipe sensitivity config
export const CAMERA_SWIPE_CONFIG = {
  // Sensitivity (radians per pixel of movement)
  sensitivity: 0.013,
  
  // Mouse sensitivity (for desktop camera mode)
  mouseSensitivity: 0.008,
  
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
  const cameraSurfaceRef = useRef<HTMLDivElement>(null);
  const joystickSurfaceRef = useRef<HTMLDivElement>(null);
  
  // Joystick state (movement) - fixed position
  const joystickFingerRef = useRef<{ x: number; y: number } | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  
  // Camera swipe state
  const cameraPointerIdRef = useRef<number | null>(null);
  const cameraLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const cameraVelocityRef = useRef<number>(0);
  
  const lastDebugLogRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const wasdActiveRef = useRef<boolean>(false); // Track if WASD keys are pressed
  
  // Track screen dimensions for normalization
  const screenDimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  
  // Visual state for joystick knob offset
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate pixel values from percentage-based config
  const getPixelValues = useCallback(() => {
    const screenHeight = screenDimensionsRef.current.height;
    const screenWidth = screenDimensionsRef.current.width;
    return {
      deadZone: screenHeight * MOBILE_CONTROL_CONFIG.maxRadiusPercent * MOBILE_CONTROL_CONFIG.deadZonePercent,
      maxRadius: screenHeight * MOBILE_CONTROL_CONFIG.maxRadiusPercent,
      baseRadius: screenHeight * MOBILE_CONTROL_CONFIG.baseRadiusPercent,
      knobRadius: screenHeight * MOBILE_CONTROL_CONFIG.knobRadiusPercent,
      // Fixed joystick center position
      joystickCenterX: screenWidth * MOBILE_CONTROL_CONFIG.fixedPositionLeft,
      joystickCenterY: screenHeight * (1 - MOBILE_CONTROL_CONFIG.fixedPositionBottom),
    };
  }, []);

  // Reset all control state - used on orientation change
  const resetControls = useCallback(() => {
    joystickPointerIdRef.current = null;
    joystickFingerRef.current = null;
    cameraPointerIdRef.current = null;
    cameraLastPosRef.current = null;
    cameraVelocityRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    moveDirectionRef.current = { x: 0, y: 0 };
    setKnobOffset({ x: 0, y: 0 });
    
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
      if (target.id === 'cameraSurface' || target.id === 'joystickSurface' || 
          target.closest('#cameraSurface') || target.closest('#joystickSurface')) {
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
      return;
    }
    
    const handleMouseDown = (e: MouseEvent) => {
      mouseDownRef.current = true;
      lastMousePosRef.current = { x: e.clientX };
    };
    
    const handleMouseUp = () => {
      mouseDownRef.current = false;
      lastMousePosRef.current = null;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDownRef.current || !lastMousePosRef.current) return;
      
      const deltaX = e.clientX - lastMousePosRef.current.x;
      lastMousePosRef.current = { x: e.clientX };
      
      // Update camera yaw (inverted: drag right = camera rotates left = yaw decreases)
      const yawDelta = -deltaX * CAMERA_SWIPE_CONFIG.mouseSensitivity;
      cameraYawRef.current += yawDelta;
      // Normalize to prevent unbounded growth
      if (cameraYawRef.current > Math.PI) cameraYawRef.current -= Math.PI * 2;
      else if (cameraYawRef.current < -Math.PI) cameraYawRef.current += Math.PI * 2;
    };
    
    // Handle WASD keyboard input for camera mode
    const handleWASDKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      
      wasdActiveRef.current = true;
      
      // Calculate movement direction based on WASD
      // W/S = forward/backward (y axis), A/D = left/right (x axis)
      let x = 0, y = 0;
      if (key === 'w') y = 1;  // Forward
      if (key === 's') y = -1; // Backward
      if (key === 'a') x = -1; // Left
      if (key === 'd') x = 1;  // Right
      
      // Combine with existing direction for diagonal movement
      const current = moveDirectionRef.current;
      if (key === 'w' || key === 's') {
        moveDirectionRef.current = { x: current.x, y };
      } else {
        moveDirectionRef.current = { x, y: current.y };
      }
      
      // Normalize diagonal movement
      const len = Math.sqrt(moveDirectionRef.current.x ** 2 + moveDirectionRef.current.y ** 2);
      if (len > 1) {
        moveDirectionRef.current.x /= len;
        moveDirectionRef.current.y /= len;
      }
      
      isMovingRef.current = true;
      throttleRef.current = 1;
    };
    
    const handleWASDKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      
      // Clear the direction for the released key
      const current = moveDirectionRef.current;
      if (key === 'w' && current.y > 0) moveDirectionRef.current = { ...current, y: 0 };
      if (key === 's' && current.y < 0) moveDirectionRef.current = { ...current, y: 0 };
      if (key === 'a' && current.x < 0) moveDirectionRef.current = { ...current, x: 0 };
      if (key === 'd' && current.x > 0) moveDirectionRef.current = { ...current, x: 0 };
      
      // Check if still moving
      if (moveDirectionRef.current.x === 0 && moveDirectionRef.current.y === 0) {
        wasdActiveRef.current = false;
        isMovingRef.current = false;
        throttleRef.current = 0;
      }
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
      const { maxRadius, deadZone, joystickCenterX, joystickCenterY } = getPixelValues();
      
      // Process joystick input
      if (joystickFingerRef.current) {
        let dx = joystickFingerRef.current.x - joystickCenterX;
        let dy = joystickFingerRef.current.y - joystickCenterY;
        let distance = Math.sqrt(dx * dx + dy * dy);
        
        // Clamp finger position to max radius (stick can't go past circle)
        if (distance > maxRadius) {
          const scale = maxRadius / distance;
          dx *= scale;
          dy *= scale;
          distance = maxRadius;
        }
        
        // Update knob visual offset
        setKnobOffset({ x: dx, y: dy });
        
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
        // No touch joystick active - only reset if WASD is also not active
        if (!wasdActiveRef.current) {
          moveDirectionRef.current = { x: 0, y: 0 };
          throttleRef.current = 0;
          isMovingRef.current = false;
        }
        // Reset knob to center
        setKnobOffset({ x: 0, y: 0 });
      }
      
      // Process camera velocity decay (momentum after release)
      if (cameraPointerIdRef.current === null && Math.abs(cameraVelocityRef.current) > CAMERA_SWIPE_CONFIG.minVelocity) {
        cameraYawRef.current += cameraVelocityRef.current;
        cameraVelocityRef.current *= CAMERA_SWIPE_CONFIG.velocityDecay;
      }
      
      // Normalize camera yaw to prevent unbounded growth (keep in -PI to PI range)
      if (cameraYawRef.current > Math.PI) {
        cameraYawRef.current -= Math.PI * 2;
      } else if (cameraYawRef.current < -Math.PI) {
        cameraYawRef.current += Math.PI * 2;
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

  // ========== JOYSTICK HANDLERS ==========
  const handleJoystickPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraModeEnabled && e.pointerType === 'mouse') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (joystickPointerIdRef.current === null) {
      joystickPointerIdRef.current = e.pointerId;
      joystickFingerRef.current = { x: e.clientX, y: e.clientY };
      mobileTouchActiveRef.current = true;
      
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] joystick down at', e.clientX.toFixed(0), e.clientY.toFixed(0));
      }
    }
  }, [mobileTouchActiveRef, debugMode, cameraModeEnabled]);

  const handleJoystickPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraModeEnabled && e.pointerType === 'mouse') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId === joystickPointerIdRef.current) {
      joystickFingerRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [cameraModeEnabled]);

  const handleJoystickPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId === joystickPointerIdRef.current) {
      joystickPointerIdRef.current = null;
      joystickFingerRef.current = null;
      throttleRef.current = 0;
      isMovingRef.current = false;
      moveDirectionRef.current = { x: 0, y: 0 };
      
      if (cameraPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
      
      if (debugMode) {
        console.log('[Mobile] joystick up');
      }
    }
  }, [mobileTouchActiveRef, throttleRef, isMovingRef, moveDirectionRef, debugMode]);

  // ========== CAMERA HANDLERS ==========
  const handleCameraPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraModeEnabled && e.pointerType === 'mouse') return;
    if (!cameraModeEnabled) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (cameraPointerIdRef.current === null) {
      cameraPointerIdRef.current = e.pointerId;
      cameraLastPosRef.current = { x: e.clientX, y: e.clientY };
      cameraVelocityRef.current = 0;
      mobileTouchActiveRef.current = true;
      
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

  const handleCameraPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraModeEnabled && e.pointerType === 'mouse') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId === cameraPointerIdRef.current && cameraLastPosRef.current) {
      const deltaX = e.clientX - cameraLastPosRef.current.x;
      
      // Inverted: swipe right = camera rotates left = yaw decreases
      const yawDelta = -deltaX * CAMERA_SWIPE_CONFIG.sensitivity;
      cameraYawRef.current += yawDelta;
      
      if (cameraYawRef.current > Math.PI) cameraYawRef.current -= Math.PI * 2;
      else if (cameraYawRef.current < -Math.PI) cameraYawRef.current += Math.PI * 2;
      
      cameraVelocityRef.current = yawDelta * CAMERA_SWIPE_CONFIG.smoothing;
      cameraLastPosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [cameraYawRef, cameraModeEnabled]);

  const handleCameraPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId === cameraPointerIdRef.current) {
      cameraPointerIdRef.current = null;
      cameraLastPosRef.current = null;
      
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
  }, [mobileTouchActiveRef, debugMode]);

  // Get current pixel values for rendering
  const { baseRadius, knobRadius, joystickCenterX, joystickCenterY } = getPixelValues();
  
  // Calculate joystick zone size (touch area around the fixed joystick)
  const joystickZoneSize = baseRadius * 2.5;

  return (
    <>
      {/* Camera swipe surface - covers the whole screen but sits behind the joystick zone */}
      <div
        ref={cameraSurfaceRef}
        id="cameraSurface"
        onPointerDown={handleCameraPointerDown}
        onPointerMove={handleCameraPointerMove}
        onPointerUp={handleCameraPointerEnd}
        onPointerCancel={handleCameraPointerEnd}
        onPointerLeave={handleCameraPointerEnd}
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
      
      {/* Fixed Joystick Zone - sits on top of camera surface */}
      <div
        ref={joystickSurfaceRef}
        id="joystickSurface"
        onPointerDown={handleJoystickPointerDown}
        onPointerMove={handleJoystickPointerMove}
        onPointerUp={handleJoystickPointerEnd}
        onPointerCancel={handleJoystickPointerEnd}
        onPointerLeave={handleJoystickPointerEnd}
        style={{
          position: 'fixed',
          left: joystickCenterX - joystickZoneSize / 2,
          top: joystickCenterY - joystickZoneSize / 2,
          width: joystickZoneSize,
          height: joystickZoneSize,
          zIndex: 11,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          background: 'transparent',
        }}
      />
      
      {/* Always-visible Joystick Base */}
      <div
        style={{
          position: 'fixed',
          left: joystickCenterX - baseRadius,
          top: joystickCenterY - baseRadius,
          width: baseRadius * 2,
          height: baseRadius * 2,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.15)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          pointerEvents: 'none',
          zIndex: 12,
        }}
      />
      
      {/* Joystick Knob - moves based on input */}
      <div
        style={{
          position: 'fixed',
          left: joystickCenterX + knobOffset.x - knobRadius,
          top: joystickCenterY + knobOffset.y - knobRadius,
          width: knobRadius * 2,
          height: knobRadius * 2,
          borderRadius: '50%',
          background: joystickPointerIdRef.current !== null 
            ? 'rgba(255, 255, 255, 0.7)' 
            : 'rgba(255, 255, 255, 0.5)',
          border: '2px solid rgba(255, 255, 255, 0.8)',
          pointerEvents: 'none',
          zIndex: 13,
          transition: joystickPointerIdRef.current === null ? 'all 0.15s ease-out' : 'none',
        }}
      />
    </>
  );
};
