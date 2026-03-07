import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Control configuration for dial control (forward + turn only)
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - percentage of dial radius before input registers
  deadZonePercent: 0.15,
  
  // Maximum dial radius as percentage of screen height
  maxRadiusPercent: 0.12,
  
  // Visual sizes
  baseRadiusPercent: 0.09,
  knobRadiusPercent: 0.035,
  
  // Fixed dial position (percentage from edge)
  joystickLeftPercent: 0.15,
  joystickBottomPercent: 0.22,
};

// Camera orbit sensitivity (radians per pixel of horizontal drag)
const ORBIT_SENSITIVITY = 0.006;

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  // Dial output: X (-1 left to 1 right), Y (0 to 1 forward only - no backward)
  joystickXRef: MutableRefObject<number>;
  joystickYRef: MutableRefObject<number>;
  isMovingRef: MutableRefObject<boolean>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  // Camera orbit refs (right side of screen)
  cameraOrbitDeltaRef?: MutableRefObject<number>;
  cameraOrbitActiveRef?: MutableRefObject<boolean>;
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  joystickXRef,
  joystickYRef,
  isMovingRef,
  mobileTouchActiveRef,
  cameraOrbitDeltaRef,
  cameraOrbitActiveRef,
  debugMode = false,
}: MobileControlsProps) => {
  // Joystick refs
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const fingerRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  
  // Camera orbit refs (second pointer, right side of screen)
  const orbitPointerIdRef = useRef<number | null>(null);
  const orbitLastXRef = useRef<number>(0);
  
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
    magnitude: number;
  }>({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, magnitude: 0 });

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
      fixedAnchorX: screenWidth * MOBILE_CONTROL_CONFIG.joystickLeftPercent,
      fixedAnchorY: screenHeight * (1 - MOBILE_CONTROL_CONFIG.joystickBottomPercent),
    };
  }, []);

  // Reset all control state
  const resetControls = useCallback(() => {
    pointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    joystickXRef.current = 0;
    joystickYRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, magnitude: 0 });
    
    // Reset orbit
    orbitPointerIdRef.current = null;
    orbitLastXRef.current = 0;
    if (cameraOrbitActiveRef) cameraOrbitActiveRef.current = false;
    if (cameraOrbitDeltaRef) cameraOrbitDeltaRef.current = 0;
    
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [joystickXRef, joystickYRef, isMovingRef, mobileTouchActiveRef, cameraOrbitActiveRef, cameraOrbitDeltaRef]);

  // Track orientation
  const lastOrientationRef = useRef<'portrait' | 'landscape'>(
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  // Setup effects - reset controls on mount to prevent stale state
  useEffect(() => {
    // Immediately reset all control state on mount
    resetControls();
    
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
    
    // Reset mobile controls when window loses focus (user clicks outside)
    const handleBlur = () => {
      resetControls();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('touchstart', preventGestures, { passive: false, capture: true });
    document.addEventListener('touchmove', preventGestures, { passive: false, capture: true });
    document.addEventListener('touchend', preventGestures, { passive: false, capture: true });
    
    return () => {
      document.documentElement.classList.remove('game-active');
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('touchstart', preventGestures, { capture: true });
      document.removeEventListener('touchmove', preventGestures, { capture: true });
      document.removeEventListener('touchend', preventGestures, { capture: true });
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [resetControls]);

  // Main update loop - process dial input (forward + turn only)
  useEffect(() => {
    const updateLoop = () => {
      const { deadZone, maxRadius, fixedAnchorX, fixedAnchorY } = getPixelValues();
      
      if (pointerIdRef.current !== null && anchorRef.current && fingerRef.current) {
        // Calculate delta from anchor to finger
        const dx = fingerRef.current.x - anchorRef.current.x;
        const dy = fingerRef.current.y - anchorRef.current.y;
        
        // Clamp Y to only allow upward (forward) movement - no backward
        const clampedDy = Math.min(dy, 0); // Negative Y = upward on screen = forward
        
        // Calculate magnitude using clamped values
        const magnitude = Math.sqrt(dx * dx + clampedDy * clampedDy);
        
        // Clamp to max radius
        const clampedMagnitude = Math.min(magnitude, maxRadius);
        
        // Normalize direction
        const angle = Math.atan2(clampedDy, dx);
        const clampedX = Math.cos(angle) * clampedMagnitude;
        const clampedY = Math.sin(angle) * clampedMagnitude;
        
        // Visual knob position (clamped to upper semicircle)
        const knobX = anchorRef.current.x + clampedX;
        const knobY = anchorRef.current.y + clampedY;
        
        if (magnitude < deadZone) {
          // In dead zone - no output
          joystickXRef.current = 0;
          joystickYRef.current = 0;
          isMovingRef.current = false;
          
          setJoystickState({
            visible: true,
            baseX: fixedAnchorX,
            baseY: fixedAnchorY,
            knobX: fixedAnchorX,
            knobY: fixedAnchorY,
            magnitude: 0,
          });
        } else {
          // Outside dead zone - calculate normalized output
          // X: -1 (left) to 1 (right) for turning
          // Y: 0 to 1 (forward only, no backward)
          const normalizedMagnitude = (clampedMagnitude - deadZone) / (maxRadius - deadZone);
          joystickXRef.current = (clampedX / maxRadius) * Math.min(normalizedMagnitude * 1.2, 1);
          // Y is now 0 to 1 (forward only) - we invert and clamp to positive
          joystickYRef.current = Math.max(0, -(clampedY / maxRadius) * Math.min(normalizedMagnitude * 1.2, 1));
          isMovingRef.current = joystickYRef.current > 0.05 || Math.abs(joystickXRef.current) > 0.05;
          
          setJoystickState({
            visible: true,
            baseX: fixedAnchorX,
            baseY: fixedAnchorY,
            knobX,
            knobY,
            magnitude: normalizedMagnitude,
          });
        }
      } else {
        // No active input
        joystickXRef.current = 0;
        joystickYRef.current = 0;
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
  }, [joystickXRef, joystickYRef, isMovingRef, getPixelValues]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const screenMidX = screenDimensionsRef.current.width * 0.5;
    
    if (e.clientX < screenMidX) {
      // Left side → joystick
      if (pointerIdRef.current !== null) return;
      
      const { fixedAnchorX, fixedAnchorY } = getPixelValues();
      
      pointerIdRef.current = e.pointerId;
      anchorRef.current = { x: fixedAnchorX, y: fixedAnchorY };
      fingerRef.current = { x: e.clientX, y: e.clientY };
      mobileTouchActiveRef.current = true;
    } else {
      // Right side → camera orbit
      if (orbitPointerIdRef.current !== null) return;
      
      orbitPointerIdRef.current = e.pointerId;
      orbitLastXRef.current = e.clientX;
      if (cameraOrbitActiveRef) cameraOrbitActiveRef.current = true;
    }
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [mobileTouchActiveRef, getPixelValues, cameraOrbitActiveRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (pointerIdRef.current === e.pointerId && anchorRef.current) {
      fingerRef.current = { x: e.clientX, y: e.clientY };
    }
    
    if (orbitPointerIdRef.current === e.pointerId) {
      const deltaX = e.clientX - orbitLastXRef.current;
      orbitLastXRef.current = e.clientX;
      if (cameraOrbitDeltaRef) {
        cameraOrbitDeltaRef.current += deltaX * ORBIT_SENSITIVITY;
      }
    }
  }, [cameraOrbitDeltaRef]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (pointerIdRef.current === e.pointerId) {
      pointerIdRef.current = null;
      anchorRef.current = null;
      fingerRef.current = null;
      
      joystickXRef.current = 0;
      joystickYRef.current = 0;
      isMovingRef.current = false;
      mobileTouchActiveRef.current = false;
      
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, magnitude: 0 });
    }
    
    if (orbitPointerIdRef.current === e.pointerId) {
      orbitPointerIdRef.current = null;
      if (cameraOrbitActiveRef) cameraOrbitActiveRef.current = false;
    }
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [joystickXRef, joystickYRef, isMovingRef, mobileTouchActiveRef, cameraOrbitActiveRef]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === e.pointerId) {
      pointerIdRef.current = null;
      anchorRef.current = null;
      fingerRef.current = null;
      joystickXRef.current = 0;
      joystickYRef.current = 0;
      isMovingRef.current = false;
      mobileTouchActiveRef.current = false;
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, magnitude: 0 });
    }
    if (orbitPointerIdRef.current === e.pointerId) {
      orbitPointerIdRef.current = null;
      if (cameraOrbitActiveRef) cameraOrbitActiveRef.current = false;
    }
  }, [joystickXRef, joystickYRef, isMovingRef, mobileTouchActiveRef, cameraOrbitActiveRef]);

  const { baseRadius, knobRadius } = getPixelValues();

  return (
    <>
      <div
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
      
      {/* Dial Visual - Upper semicircle only */}
      {joystickState.visible && (
        <>
          {/* Base semicircle (upper arc) */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - baseRadius,
              top: joystickState.baseY - baseRadius,
              width: baseRadius * 2,
              height: baseRadius * 2,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 70%, transparent 100%)',
              border: '2px solid rgba(255,255,255,0.3)',
              pointerEvents: 'none',
              zIndex: 11,
              // Clip to upper semicircle
              clipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)',
            }}
          />
          {/* Lower half dimmed indicator */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - baseRadius,
              top: joystickState.baseY - baseRadius,
              width: baseRadius * 2,
              height: baseRadius * 2,
              borderRadius: '50%',
              background: 'transparent',
              border: '2px dashed rgba(255,255,255,0.1)',
              pointerEvents: 'none',
              zIndex: 10,
              clipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)',
            }}
          />
          
          {/* Knob */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.knobX - knobRadius,
              top: joystickState.knobY - knobRadius,
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: '50%',
              background: `rgba(255, 255, 255, ${0.4 + joystickState.magnitude * 0.4})`,
              border: '2px solid rgba(255,255,255,0.6)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
              zIndex: 12,
              transition: joystickState.magnitude === 0 ? 'all 0.1s ease' : 'none',
            }}
          />
        </>
      )}
      
      {/* Always-visible dial hint - semicircle */}
      {!joystickState.visible && (
        <>
          <div
            style={{
              position: 'fixed',
              left: screenDimensionsRef.current.width * MOBILE_CONTROL_CONFIG.joystickLeftPercent - baseRadius,
              top: screenDimensionsRef.current.height * (1 - MOBILE_CONTROL_CONFIG.joystickBottomPercent) - baseRadius,
              width: baseRadius * 2,
              height: baseRadius * 2,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
              border: '2px dashed rgba(255,255,255,0.2)',
              pointerEvents: 'none',
              zIndex: 9,
              clipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)',
            }}
          />
          {/* Arrow indicator pointing up */}
          <div
            style={{
              position: 'fixed',
              left: screenDimensionsRef.current.width * MOBILE_CONTROL_CONFIG.joystickLeftPercent - 6,
              top: screenDimensionsRef.current.height * (1 - MOBILE_CONTROL_CONFIG.joystickBottomPercent) - baseRadius * 0.6,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '10px solid rgba(255,255,255,0.3)',
              pointerEvents: 'none',
              zIndex: 9,
            }}
          />
        </>
      )}
      
      {/* Debug overlay */}
      {debugMode && (
        <div
          style={{
            position: 'fixed',
            bottom: 120,
            left: 10,
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 999,
          }}
        >
          <div>X: {joystickXRef.current.toFixed(2)}</div>
          <div>Y: {joystickYRef.current.toFixed(2)}</div>
          <div>Moving: {isMovingRef.current ? 'YES' : 'no'}</div>
        </div>
      )}
    </>
  );
};

export default MobileControls;
