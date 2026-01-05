import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Tuning knobs - gesture-relative turning
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - tiny! Only stop if truly centered
  deadZonePercent: 0.02,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.15,
  
  // Drift lerp speed
  driftSpeed: 0.08,
  
  // Speeds
  forwardSpeed: 1.0,
  reverseSpeed: 0.5,
  
  // Gesture-relative turning config
  maxTurnPx: 150,        // Pixels of drag for full turn angle (increased for less sensitivity)
  maxTurnAngle: Math.PI * 0.35, // Maximum turn angle from baseline (63 degrees - much tighter)
  turnLerpSpeed: 0.12,   // Light smoothing for heading assignment
  
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
  debugMode?: boolean;
}

// Helper: lerp angle (handles wraparound)
function lerpAngle(from: number, to: number, t: number): number {
  // Normalize both to 0..2PI
  const TWO_PI = Math.PI * 2;
  from = ((from % TWO_PI) + TWO_PI) % TWO_PI;
  to = ((to % TWO_PI) + TWO_PI) % TWO_PI;
  
  // Find shortest path
  let diff = to - from;
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  
  return from + diff * t;
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
  
  // Gesture-relative turning state
  const turnStartHeadingRef = useRef<number>(0);   // Player yaw at gesture start
  const turnStartXRef = useRef<number>(0);         // Input X position at gesture start
  const currentHeadingRef = useRef<number>(0);     // Current smoothed heading
  const lastFrameTimeRef = useRef<number>(performance.now());
  const gestureActiveRef = useRef<boolean>(false); // Track if gesture is currently active
  
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
    gestureActiveRef.current = false;
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

  // Animation loop for drift anchor and gesture-relative controls update
  useEffect(() => {
    const updateLoop = () => {
      const { driftSpeed, forwardSpeed, reverseSpeed, maxTurnPx, maxTurnAngle, turnLerpSpeed } = MOBILE_CONTROL_CONFIG;
      
      // Get current pixel values based on screen height
      const { deadZone, maxRadius } = getPixelValues();
      
      if (anchorRef.current && fingerRef.current && gestureActiveRef.current) {
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
        
        // Dead zone check - outside deadzone = movement
        if (currentDistance >= deadZone) {
          // === BASELINE-RELATIVE: joystick angle added to BASELINE heading (not current!) ===
          // Joystick angle: up=0, left=-PI/2, right=+PI/2
          const joystickAngle = Math.atan2(dx, -dy);
          
          // Target heading = BASELINE (captured at touch start) + joystick offset
          // This prevents runaway accumulation - we never read the current heading
          const targetHeading = turnStartHeadingRef.current + joystickAngle;
          
          // Always move forward
          targetThrottle = forwardSpeed;
          
          // Apply rotation directly
          playerStateRef.current.rotation = targetHeading;
          currentHeadingRef.current = targetHeading;
          yawRateRef.current = 0;
          
          // Re-center baseline when joystick held at extreme angle (allows continuous turning)
          if (Math.abs(joystickAngle) > Math.PI * 0.4) {
            turnStartHeadingRef.current = targetHeading;
          }
        }
        
        // Apply throttle
        throttleRef.current = targetThrottle;
        isMovingRef.current = Math.abs(throttleRef.current) > 0.05;
        
        // Debug logging (throttled)
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          console.log('[Mobile] throttle:', throttleRef.current.toFixed(2),
                      'heading:', currentHeadingRef.current.toFixed(2));
        }
      } else {
        // No touch active - stop immediately
        throttleRef.current = 0;
        yawRateRef.current = 0;
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
  }, [debugMode, isMovingRef, throttleRef, yawRateRef, playerStateRef, getPixelValues]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    anchorRef.current = { x: e.clientX, y: e.clientY };
    fingerRef.current = { x: e.clientX, y: e.clientY };
    
    // === GESTURE-RELATIVE TURNING: Store baseline ===
    turnStartHeadingRef.current = playerStateRef.current.rotation;
    turnStartXRef.current = e.clientX;
    currentHeadingRef.current = playerStateRef.current.rotation;
    gestureActiveRef.current = true;
    
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
      console.log('[Mobile] pointerdown at', e.clientX.toFixed(0), e.clientY.toFixed(0),
                  'baseline heading:', turnStartHeadingRef.current.toFixed(2));
    }
  }, [mobileTouchActiveRef, yawRateRef, throttleRef, isMovingRef, debugMode, playerStateRef]);

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
    gestureActiveRef.current = false;
    
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

  // Handle pointer leaving the window - clears stuck drag state
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only reset if we have an active pointer that matches
    if (activePointerIdRef.current === null) return;
    
    // Clear everything to prevent stuck state
    activePointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    gestureActiveRef.current = false;
    
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
    
    if (debugMode) {
      console.log('[Mobile] pointerleave - cleared stuck state');
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