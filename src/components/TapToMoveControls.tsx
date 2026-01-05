import { useRef, useCallback, MutableRefObject, useEffect, useState } from 'react';
import { PlayerState } from '@/game/GameLogic';
import { PathPoint, findPath, simplifyPath } from '@/game/Pathfinding';
import { Maze } from '@/types/game';

// Configuration
export const TAP_MOVE_CONFIG = {
  // Movement
  moveSpeed: 2.5,           // Units per second
  turnSpeed: 3.0,           // Radians per second for turning (reduced for gradual turns)
  arrivalThreshold: 0.15,   // How close to waypoint before moving to next
  
  // Camera swipe
  cameraSwipeSensitivity: 0.003,  // Radians per pixel
  cameraResetDelay: 1500,         // Ms before camera starts resetting
  cameraResetSpeed: 0.03,         // Lerp factor for reset
  maxCameraOffset: Math.PI * 0.5, // Max camera swing from center
  
  // Touch detection
  tapMaxDuration: 300,      // Max ms for a tap (vs swipe)
  tapMaxDistance: 20,       // Max pixels moved for a tap
};

interface TapToMoveControlsProps {
  onTap: (screenX: number, screenY: number) => void;  // Called when tap detected
  onCameraOffsetChange?: (offset: number) => void;  // Camera yaw offset in radians
  debugMode?: boolean;
  disabled?: boolean;
}

// Helper: normalize angle to -PI to PI
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export const TapToMoveControls = ({ 
  onTap,
  onCameraOffsetChange,
  debugMode = false,
  disabled = false
}: TapToMoveControlsProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Multi-touch state
  const touchesRef = useRef<Map<number, { startX: number; startY: number; startTime: number; currentX: number; currentY: number }>>(new Map());
  const primaryTouchIdRef = useRef<number | null>(null);
  const secondaryTouchIdRef = useRef<number | null>(null);
  
  // Camera offset state
  const cameraOffsetRef = useRef<number>(0);
  const lastCameraTouchTimeRef = useRef<number>(0);
  const cameraTouchStartOffsetRef = useRef<number>(0);
  const cameraTouchStartXRef = useRef<number>(0);
  
  // Add game-active class to prevent browser gestures
  useEffect(() => {
    document.documentElement.classList.add('game-active');
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    
    return () => {
      document.documentElement.classList.remove('game-active');
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);
  
  // Camera reset animation loop
  useEffect(() => {
    let animationFrame: number;
    
    const updateCamera = () => {
      const now = performance.now();
      const timeSinceCameraTouch = now - lastCameraTouchTimeRef.current;
      
      // If no camera touch for a while and we have secondary touch, don't reset
      if (secondaryTouchIdRef.current === null && timeSinceCameraTouch > TAP_MOVE_CONFIG.cameraResetDelay) {
        // Lerp camera back to center
        if (Math.abs(cameraOffsetRef.current) > 0.01) {
          cameraOffsetRef.current *= (1 - TAP_MOVE_CONFIG.cameraResetSpeed);
          onCameraOffsetChange?.(cameraOffsetRef.current);
        } else if (cameraOffsetRef.current !== 0) {
          cameraOffsetRef.current = 0;
          onCameraOffsetChange?.(0);
        }
      }
      
      animationFrame = requestAnimationFrame(updateCamera);
    };
    
    animationFrame = requestAnimationFrame(updateCamera);
    return () => cancelAnimationFrame(animationFrame);
  }, [onCameraOffsetChange]);
  
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        currentX: touch.clientX,
        currentY: touch.clientY,
      };
      
      touchesRef.current.set(touch.identifier, touchData);
      
      // First touch = primary (for tapping)
      if (primaryTouchIdRef.current === null) {
        primaryTouchIdRef.current = touch.identifier;
        if (debugMode) console.log('[TapMove] Primary touch start:', touch.identifier);
      }
      // Second touch = camera control
      else if (secondaryTouchIdRef.current === null) {
        secondaryTouchIdRef.current = touch.identifier;
        cameraTouchStartOffsetRef.current = cameraOffsetRef.current;
        cameraTouchStartXRef.current = touch.clientX;
        lastCameraTouchTimeRef.current = performance.now();
        if (debugMode) console.log('[TapMove] Secondary touch start (camera):', touch.identifier);
      }
    }
  }, [debugMode, disabled]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = touchesRef.current.get(touch.identifier);
      if (touchData) {
        touchData.currentX = touch.clientX;
        touchData.currentY = touch.clientY;
      }
      
      // Handle camera swipe (secondary touch)
      if (touch.identifier === secondaryTouchIdRef.current) {
        const deltaX = touch.clientX - cameraTouchStartXRef.current;
        let newOffset = cameraTouchStartOffsetRef.current + deltaX * TAP_MOVE_CONFIG.cameraSwipeSensitivity;
        
        // Clamp to max offset
        newOffset = Math.max(-TAP_MOVE_CONFIG.maxCameraOffset, Math.min(TAP_MOVE_CONFIG.maxCameraOffset, newOffset));
        
        cameraOffsetRef.current = newOffset;
        lastCameraTouchTimeRef.current = performance.now();
        onCameraOffsetChange?.(newOffset);
        
        if (debugMode && Math.abs(deltaX) > 10) {
          console.log('[TapMove] Camera swipe:', newOffset.toFixed(2));
        }
      }
    }
  }, [debugMode, onCameraOffsetChange, disabled]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = touchesRef.current.get(touch.identifier);
      
      if (touchData && touch.identifier === primaryTouchIdRef.current) {
        // Check if this was a tap (short duration, minimal movement)
        const duration = performance.now() - touchData.startTime;
        const dx = touchData.currentX - touchData.startX;
        const dy = touchData.currentY - touchData.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (duration < TAP_MOVE_CONFIG.tapMaxDuration && distance < TAP_MOVE_CONFIG.tapMaxDistance) {
          // This is a tap! Pass screen coordinates to parent for raycasting
          if (debugMode) console.log('[TapMove] Tap detected at:', touchData.currentX, touchData.currentY);
          onTap(touchData.currentX, touchData.currentY);
        }
        
        primaryTouchIdRef.current = null;
      }
      
      if (touch.identifier === secondaryTouchIdRef.current) {
        secondaryTouchIdRef.current = null;
        lastCameraTouchTimeRef.current = performance.now();
        if (debugMode) console.log('[TapMove] Camera touch ended');
      }
      
      touchesRef.current.delete(touch.identifier);
    }
    
    // Reassign primary if needed
    if (primaryTouchIdRef.current === null && touchesRef.current.size > 0) {
      const firstTouch = touchesRef.current.keys().next().value;
      if (firstTouch !== secondaryTouchIdRef.current) {
        primaryTouchIdRef.current = firstTouch;
      }
    }
  }, [debugMode, onTap, disabled]);
  
  // Also handle mouse clicks for desktop
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (debugMode) console.log('[TapMove] Mouse click at:', e.clientX, e.clientY);
    onTap(e.clientX, e.clientY);
  }, [debugMode, onTap, disabled]);
  
  return (
    <div
      ref={overlayRef}
      id="mobileControlSurface"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
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
        cursor: 'pointer',
      }}
    />
  );
};

// Path following hook - used in the 3D scene to move along a path
export interface PathFollowerState {
  path: PathPoint[];
  currentWaypointIndex: number;
  isFollowingPath: boolean;
  targetWorldPos: PathPoint | null;
  // Stuck detection
  lastProgressX: number;
  lastProgressY: number;
  stuckFrames: number;
}

export function usePathFollower() {
  const stateRef = useRef<PathFollowerState>({
    path: [],
    currentWaypointIndex: 0,
    isFollowingPath: false,
    targetWorldPos: null,
    lastProgressX: 0,
    lastProgressY: 0,
    stuckFrames: 0,
  });
  
  const setPath = useCallback((path: PathPoint[], targetWorldPos: PathPoint | null) => {
    stateRef.current = {
      path,
      currentWaypointIndex: 0,
      isFollowingPath: path.length > 0,
      targetWorldPos,
      lastProgressX: 0,
      lastProgressY: 0,
      stuckFrames: 0,
    };
  }, []);
  
  const clearPath = useCallback(() => {
    stateRef.current = {
      path: [],
      currentWaypointIndex: 0,
      isFollowingPath: false,
      targetWorldPos: null,
      lastProgressX: 0,
      lastProgressY: 0,
      stuckFrames: 0,
    };
  }, []);
  
  return {
    stateRef,
    setPath,
    clearPath,
  };
}
