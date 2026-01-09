import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// Control configuration
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - percentage of screen height for throttle joystick
  deadZonePercent: 0.03,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.10,
  
  // Visual sizes
  baseRadiusPercent: 0.06,
  knobRadiusPercent: 0.025,
  
  // Swipe threshold in pixels before turn activates
  swipeThreshold: 5,
};

// WASD direction flags
interface WASDState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

interface MobileControlsProps {
  playerStateRef: MutableRefObject<PlayerState>;
  targetYawRef: MutableRefObject<number>;
  yawRateRef: MutableRefObject<number>;
  isMovingRef: MutableRefObject<boolean>;
  throttleRef: MutableRefObject<number>;
  mobileTouchActiveRef: MutableRefObject<boolean>;
  wasdRef: MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean }>;
  debugMode?: boolean;
}

export const MobileControls = ({ 
  playerStateRef, 
  targetYawRef, 
  yawRateRef,
  isMovingRef,
  throttleRef,
  mobileTouchActiveRef,
  wasdRef,
  debugMode = false
}: MobileControlsProps) => {
  // Left joystick refs (throttle - W/S only)
  const leftAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const leftFingerRef = useRef<{ x: number; y: number } | null>(null);
  const leftPointerIdRef = useRef<number | null>(null);
  
  // Right swipe refs (turning - A/D nudges)
  const rightStartRef = useRef<{ x: number; y: number } | null>(null);
  const rightPointerIdRef = useRef<number | null>(null);
  
  const lastDebugLogRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  
  // Track screen dimensions for normalization
  const screenDimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  
  // Visual state for joystick
  const [joystickState, setJoystickState] = useState<{
    visible: boolean;
    baseX: number;
    baseY: number;
    knobY: number;
    throttle: number; // -1 to 1
  }>({ visible: false, baseX: 0, baseY: 0, knobY: 0, throttle: 0 });

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
    leftPointerIdRef.current = null;
    leftAnchorRef.current = null;
    leftFingerRef.current = null;
    rightPointerIdRef.current = null;
    rightStartRef.current = null;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    wasdRef.current = { w: false, a: false, s: false, d: false };
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobY: 0, throttle: 0 });
    
    screenDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
  }, [yawRateRef, throttleRef, isMovingRef, mobileTouchActiveRef, wasdRef]);

  // Track orientation
  const lastOrientationRef = useRef<'portrait' | 'landscape'>(
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  // Setup effects
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

  // Main update loop
  useEffect(() => {
    const updateLoop = () => {
      const { deadZone, maxRadius } = getPixelValues();
      
      if (leftAnchorRef.current && leftFingerRef.current) {
        // Only use vertical (Y) movement for throttle
        let dy = leftFingerRef.current.y - leftAnchorRef.current.y;
        
        // Clamp to max radius
        const clampedDy = Math.max(-maxRadius, Math.min(maxRadius, dy));
        const clampedKnobY = leftAnchorRef.current.y + clampedDy;
        
        // Calculate throttle (-1 to 1, negative = forward because Y is inverted)
        const absY = Math.abs(clampedDy);
        
        if (absY < deadZone) {
          // In dead zone
          wasdRef.current.w = false;
          wasdRef.current.s = false;
          isMovingRef.current = wasdRef.current.a || wasdRef.current.d;
          setJoystickState(prev => ({
            ...prev,
            knobY: leftAnchorRef.current!.y,
            throttle: 0,
          }));
        } else {
          // Outside dead zone
          const throttle = -clampedDy / maxRadius; // Negative because up = forward
          
          wasdRef.current.w = throttle > 0;
          wasdRef.current.s = throttle < 0;
          isMovingRef.current = true;
          
          setJoystickState(prev => ({
            ...prev,
            knobY: clampedKnobY,
            throttle,
          }));
        }
        
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          const { w, a, s, d } = wasdRef.current;
          console.log('[Mobile WASD]', 
            w ? 'W' : '-', 
            a ? 'A' : '-', 
            s ? 'S' : '-', 
            d ? 'D' : '-');
        }
      } else {
        // No left touch - reset throttle
        wasdRef.current.w = false;
        wasdRef.current.s = false;
        isMovingRef.current = wasdRef.current.a || wasdRef.current.d;
      }
      
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateLoop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [debugMode, isMovingRef, wasdRef, getPixelValues]);

  // Determine which side of screen a point is on
  const isLeftSide = useCallback((x: number) => {
    return x < screenDimensionsRef.current.width * 0.4; // Left 40%
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isLeft = isLeftSide(e.clientX);
    
    if (isLeft) {
      // Left side - throttle joystick
      if (leftPointerIdRef.current !== null) return;
      
      leftPointerIdRef.current = e.pointerId;
      leftAnchorRef.current = { x: e.clientX, y: e.clientY };
      leftFingerRef.current = { x: e.clientX, y: e.clientY };
      mobileTouchActiveRef.current = true;
      
      setJoystickState({
        visible: true,
        baseX: e.clientX,
        baseY: e.clientY,
        knobY: e.clientY,
        throttle: 0,
      });
    } else {
      // Right side - swipe for turning
      if (rightPointerIdRef.current !== null) return;
      
      rightPointerIdRef.current = e.pointerId;
      rightStartRef.current = { x: e.clientX, y: e.clientY };
    }
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [mobileTouchActiveRef, isLeftSide]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (leftPointerIdRef.current === e.pointerId && leftAnchorRef.current) {
      // Left joystick move
      leftFingerRef.current = { x: e.clientX, y: e.clientY };
    } else if (rightPointerIdRef.current === e.pointerId && rightStartRef.current) {
      // Right swipe move - set A/D based on cumulative swipe direction
      const dx = e.clientX - rightStartRef.current.x;
      
      // Set A/D based on swipe direction with threshold
      const threshold = MOBILE_CONTROL_CONFIG.swipeThreshold;
      wasdRef.current.a = dx < -threshold;
      wasdRef.current.d = dx > threshold;
      
      // DON'T reset start position - keep tracking total swipe distance
      // This keeps A/D active as long as finger has moved past threshold
    }
  }, [wasdRef, yawRateRef]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (leftPointerIdRef.current === e.pointerId) {
      // Left joystick release
      leftPointerIdRef.current = null;
      leftAnchorRef.current = null;
      leftFingerRef.current = null;
      
      wasdRef.current.w = false;
      wasdRef.current.s = false;
      isMovingRef.current = wasdRef.current.a || wasdRef.current.d;
      
      if (rightPointerIdRef.current === null) {
        mobileTouchActiveRef.current = false;
      }
      
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobY: 0, throttle: 0 });
    } else if (rightPointerIdRef.current === e.pointerId) {
      // Right swipe release
      rightPointerIdRef.current = null;
      rightStartRef.current = null;
      
      wasdRef.current.a = false;
      wasdRef.current.d = false;
      yawRateRef.current = 0;
      isMovingRef.current = wasdRef.current.w || wasdRef.current.s;
    }
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [mobileTouchActiveRef, isMovingRef, wasdRef, yawRateRef]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Reset both controls on leave
    if (leftPointerIdRef.current !== null) {
      leftPointerIdRef.current = null;
      leftAnchorRef.current = null;
      leftFingerRef.current = null;
      setJoystickState({ visible: false, baseX: 0, baseY: 0, knobY: 0, throttle: 0 });
    }
    
    if (rightPointerIdRef.current !== null) {
      rightPointerIdRef.current = null;
      rightStartRef.current = null;
      yawRateRef.current = 0;
    }
    
    wasdRef.current = { w: false, a: false, s: false, d: false };
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
  }, [mobileTouchActiveRef, isMovingRef, wasdRef, yawRateRef]);

  const { baseRadius, knobRadius, maxRadius } = getPixelValues();

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
      
      
      {/* Right side hint */}
      <div
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          fontSize: 14,
          color: 'rgba(255,255,255,0.4)',
          pointerEvents: 'none',
          zIndex: 9,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 4 }}>⟷</div>
        <div>Swipe to turn</div>
      </div>
      
      {/* Vertical Throttle Joystick Visual */}
      {joystickState.visible && (
        <>
          {/* Vertical track */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - baseRadius * 0.4,
              top: joystickState.baseY - maxRadius,
              width: baseRadius * 0.8,
              height: maxRadius * 2,
              borderRadius: baseRadius * 0.4,
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              pointerEvents: 'none',
              zIndex: 11,
            }}
          >
            {/* W indicator at top */}
            <div style={{
              position: 'absolute',
              top: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: baseRadius * 0.4,
              fontWeight: 'bold',
              color: wasdRef.current.w ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: wasdRef.current.w ? '0 0 8px #4ade80' : 'none',
            }}>W</div>
            {/* S indicator at bottom */}
            <div style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: baseRadius * 0.4,
              fontWeight: 'bold',
              color: wasdRef.current.s ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: wasdRef.current.s ? '0 0 8px #4ade80' : 'none',
            }}>S</div>
          </div>
          
          {/* Knob */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - knobRadius,
              top: joystickState.knobY - knobRadius,
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: '50%',
              background: joystickState.throttle !== 0 
                ? 'rgba(74, 222, 128, 0.8)' 
                : 'rgba(255, 255, 255, 0.7)',
              border: '2px solid white',
              boxShadow: joystickState.throttle !== 0 
                ? '0 0 12px rgba(74, 222, 128, 0.6)' 
                : '0 2px 8px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
              zIndex: 12,
              transition: 'background 0.1s, box-shadow 0.1s',
            }}
          />
        </>
      )}
      
      {/* Debug overlay */}
      {debugMode && (
        <div
          style={{
            position: 'fixed',
            top: 100,
            left: 10,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            fontSize: 12,
            fontFamily: 'monospace',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div>WASD: {wasdRef.current.w ? 'W' : '-'}{wasdRef.current.a ? 'A' : '-'}{wasdRef.current.s ? 'S' : '-'}{wasdRef.current.d ? 'D' : '-'}</div>
          <div>Throttle: {joystickState.throttle.toFixed(2)}</div>
          <div>Left: {leftPointerIdRef.current !== null ? 'active' : 'idle'}</div>
          <div>Right: {rightPointerIdRef.current !== null ? 'active' : 'idle'}</div>
        </div>
      )}
    </>
  );
};
