import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';

// WASD region detection config
export const MOBILE_CONTROL_CONFIG = {
  // Dead zone - percentage of screen height
  deadZonePercent: 0.03,
  
  // Maximum joystick radius as percentage of screen height
  maxRadiusPercent: 0.12,
  
  // Direction change debounce (ms) - prevents W -> WA -> D, makes it W -> D
  directionDebounceMs: 80,
  
  // Visual sizes
  baseRadiusPercent: 0.08,
  knobRadiusPercent: 0.035,
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const fingerRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastDebugLogRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  
  // Track screen dimensions for normalization
  const screenDimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  
  // Direction change debouncing
  const lastDirectionChangeRef = useRef<number>(0);
  const pendingWASDRef = useRef<WASDState>({ w: false, a: false, s: false, d: false });
  const committedWASDRef = useRef<WASDState>({ w: false, a: false, s: false, d: false });
  
  // Visual state for joystick
  const [joystickState, setJoystickState] = useState<{
    visible: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
    wasd: WASDState;
  }>({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, wasd: { w: false, a: false, s: false, d: false } });

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

  // Determine WASD state from joystick position
  const getWASDFromPosition = useCallback((dx: number, dy: number, deadZone: number): WASDState => {
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < deadZone) {
      return { w: false, a: false, s: false, d: false };
    }
    
    // Calculate angle in radians (-PI to PI, 0 = right, PI/2 = down in screen coords)
    const angle = Math.atan2(dy, dx);
    
    // Convert to degrees for easier reasoning (0 = right, 90 = down, -90 = up, 180/-180 = left)
    const degrees = angle * (180 / Math.PI);
    
    // Define regions with some overlap for diagonal movement
    // Each direction covers a 90-degree arc, with 45-degree overlaps for diagonals
    const wasd: WASDState = { w: false, a: false, s: false, d: false };
    
    // W (up): -135 to -45 degrees
    if (degrees >= -135 && degrees <= -45) {
      wasd.w = true;
    }
    
    // S (down): 45 to 135 degrees
    if (degrees >= 45 && degrees <= 135) {
      wasd.s = true;
    }
    
    // A (left): 135 to 180 or -180 to -135 degrees
    if (degrees >= 135 || degrees <= -135) {
      wasd.a = true;
    }
    
    // D (right): -45 to 45 degrees
    if (degrees >= -45 && degrees <= 45) {
      wasd.d = true;
    }
    
    return wasd;
  }, []);

  // Check if WASD states are different
  const wasdDifferent = (a: WASDState, b: WASDState): boolean => {
    return a.w !== b.w || a.a !== b.a || a.s !== b.s || a.d !== b.d;
  };

  // Check if this is a quick direction change (skip intermediate states)
  const isQuickDirectionChange = useCallback((current: WASDState, pending: WASDState): boolean => {
    // If going from a single direction to another single direction
    const currentCount = (current.w ? 1 : 0) + (current.a ? 1 : 0) + (current.s ? 1 : 0) + (current.d ? 1 : 0);
    const pendingCount = (pending.w ? 1 : 0) + (pending.a ? 1 : 0) + (pending.s ? 1 : 0) + (pending.d ? 1 : 0);
    
    // If pending has 2 keys (diagonal) and we're switching between opposite singles, skip the diagonal
    if (pendingCount === 2 && currentCount === 1) {
      return true;
    }
    
    return false;
  }, []);

  // Reset all control state
  const resetControls = useCallback(() => {
    activePointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    yawRateRef.current = 0;
    throttleRef.current = 0;
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    wasdRef.current = { w: false, a: false, s: false, d: false };
    committedWASDRef.current = { w: false, a: false, s: false, d: false };
    pendingWASDRef.current = { w: false, a: false, s: false, d: false };
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, wasd: { w: false, a: false, s: false, d: false } });
    
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
      const now = performance.now();
      
      if (anchorRef.current && fingerRef.current) {
        let dx = fingerRef.current.x - anchorRef.current.x;
        let dy = fingerRef.current.y - anchorRef.current.y;
        
        // Clamp knob to max radius
        const distance = Math.sqrt(dx * dx + dy * dy);
        let clampedKnobX = fingerRef.current.x;
        let clampedKnobY = fingerRef.current.y;
        
        if (distance > maxRadius) {
          const scale = maxRadius / distance;
          clampedKnobX = anchorRef.current.x + dx * scale;
          clampedKnobY = anchorRef.current.y + dy * scale;
          dx = clampedKnobX - anchorRef.current.x;
          dy = clampedKnobY - anchorRef.current.y;
        }
        
        // Get raw WASD state from position
        const rawWASD = getWASDFromPosition(dx, dy, deadZone);
        
        // Handle direction change debouncing
        if (wasdDifferent(rawWASD, pendingWASDRef.current)) {
          pendingWASDRef.current = rawWASD;
          lastDirectionChangeRef.current = now;
        }
        
        // Check if we should commit the pending state
        const timeSinceChange = now - lastDirectionChangeRef.current;
        
        if (timeSinceChange >= MOBILE_CONTROL_CONFIG.directionDebounceMs) {
          // Debounce period passed, commit the pending state
          if (wasdDifferent(pendingWASDRef.current, committedWASDRef.current)) {
            committedWASDRef.current = { ...pendingWASDRef.current };
          }
        } else if (isQuickDirectionChange(committedWASDRef.current, pendingWASDRef.current)) {
          // Don't commit diagonal intermediates during quick changes
          // Keep the current committed state until debounce passes
        }
        
        // Apply committed WASD to the ref
        wasdRef.current = { ...committedWASDRef.current };
        isMovingRef.current = committedWASDRef.current.w || committedWASDRef.current.a || 
                              committedWASDRef.current.s || committedWASDRef.current.d;
        
        // Update visuals
        setJoystickState({
          visible: true,
          baseX: anchorRef.current.x,
          baseY: anchorRef.current.y,
          knobX: clampedKnobX,
          knobY: clampedKnobY,
          wasd: committedWASDRef.current,
        });
        
        if (debugMode && Date.now() - lastDebugLogRef.current > 200) {
          lastDebugLogRef.current = Date.now();
          const { w, a, s, d } = committedWASDRef.current;
          console.log('[Mobile WASD]', 
            w ? 'W' : '-', 
            a ? 'A' : '-', 
            s ? 'S' : '-', 
            d ? 'D' : '-');
        }
      } else {
        // No touch - reset everything
        wasdRef.current = { w: false, a: false, s: false, d: false };
        committedWASDRef.current = { w: false, a: false, s: false, d: false };
        pendingWASDRef.current = { w: false, a: false, s: false, d: false };
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
  }, [debugMode, isMovingRef, wasdRef, getPixelValues, getWASDFromPosition, isQuickDirectionChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    activePointerIdRef.current = e.pointerId;
    anchorRef.current = { x: e.clientX, y: e.clientY };
    fingerRef.current = { x: e.clientX, y: e.clientY };
    
    mobileTouchActiveRef.current = true;
    lastDirectionChangeRef.current = performance.now();
    
    setJoystickState({
      visible: true,
      baseX: e.clientX,
      baseY: e.clientY,
      knobX: e.clientX,
      knobY: e.clientY,
      wasd: { w: false, a: false, s: false, d: false },
    });
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [mobileTouchActiveRef]);

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
    
    wasdRef.current = { w: false, a: false, s: false, d: false };
    committedWASDRef.current = { w: false, a: false, s: false, d: false };
    pendingWASDRef.current = { w: false, a: false, s: false, d: false };
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, wasd: { w: false, a: false, s: false, d: false } });
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }
  }, [mobileTouchActiveRef, isMovingRef, wasdRef]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === null) return;
    
    activePointerIdRef.current = null;
    anchorRef.current = null;
    fingerRef.current = null;
    
    wasdRef.current = { w: false, a: false, s: false, d: false };
    committedWASDRef.current = { w: false, a: false, s: false, d: false };
    pendingWASDRef.current = { w: false, a: false, s: false, d: false };
    isMovingRef.current = false;
    mobileTouchActiveRef.current = false;
    
    setJoystickState({ visible: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, wasd: { w: false, a: false, s: false, d: false } });
  }, [mobileTouchActiveRef, isMovingRef, wasdRef]);

  const { baseRadius, knobRadius } = getPixelValues();
  const { w, a, s, d } = joystickState.wasd;

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
      
      {/* WASD Joystick Visual */}
      {joystickState.visible && (
        <>
          {/* Base with direction indicators */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.baseX - baseRadius,
              top: joystickState.baseY - baseRadius,
              width: baseRadius * 2,
              height: baseRadius * 2,
              borderRadius: '50%',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              pointerEvents: 'none',
              zIndex: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Direction indicators */}
            {/* W - Up */}
            <div style={{
              position: 'absolute',
              top: '8%',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: baseRadius * 0.35,
              fontWeight: 'bold',
              color: w ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: w ? '0 0 8px #4ade80' : 'none',
              transition: 'color 0.1s, text-shadow 0.1s',
            }}>W</div>
            {/* S - Down */}
            <div style={{
              position: 'absolute',
              bottom: '8%',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: baseRadius * 0.35,
              fontWeight: 'bold',
              color: s ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: s ? '0 0 8px #4ade80' : 'none',
              transition: 'color 0.1s, text-shadow 0.1s',
            }}>S</div>
            {/* A - Left */}
            <div style={{
              position: 'absolute',
              left: '8%',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: baseRadius * 0.35,
              fontWeight: 'bold',
              color: a ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: a ? '0 0 8px #4ade80' : 'none',
              transition: 'color 0.1s, text-shadow 0.1s',
            }}>A</div>
            {/* D - Right */}
            <div style={{
              position: 'absolute',
              right: '8%',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: baseRadius * 0.35,
              fontWeight: 'bold',
              color: d ? '#4ade80' : 'rgba(255,255,255,0.4)',
              textShadow: d ? '0 0 8px #4ade80' : 'none',
              transition: 'color 0.1s, text-shadow 0.1s',
            }}>D</div>
          </div>
          
          {/* Knob */}
          <div
            style={{
              position: 'fixed',
              left: joystickState.knobX - knobRadius,
              top: joystickState.knobY - knobRadius,
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.6)',
              border: '2px solid rgba(255, 255, 255, 0.8)',
              pointerEvents: 'none',
              zIndex: 12,
            }}
          />
        </>
      )}
    </>
  );
};
