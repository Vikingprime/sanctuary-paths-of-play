/**
 * Rail Movement Hook - Handles automatic movement along polyline paths
 * 
 * When rail mode is active, this hook:
 * 1. Receives a path (array of points) from RailControls
 * 2. Automatically moves the animal along the path
 * 3. Stops at junctions, endpoints, or when user presses stop
 */

import { useCallback, useRef, useState, MutableRefObject } from 'react';
import { Point2D } from '@/game/SkeletonPolyline';
import { MagnetismCache } from '@/game/CorridorMagnetism';
import { PlayerState } from '@/game/GameLogic';

export interface RailMovementState {
  /** Whether currently moving along a rail path */
  isMoving: boolean;
  /** Current path being followed */
  currentPath: Point2D[];
  /** Current index in the path */
  pathIndex: number;
  /** Target position on the path */
  targetX: number;
  targetZ: number;
  /** Movement speed (world units per second) */
  speed: number;
}

export interface UseRailMovementProps {
  /** Player state ref to update */
  playerStateRef: MutableRefObject<PlayerState>;
  /** Magnetism cache for path data */
  cache: MagnetismCache | null;
  /** Movement speed */
  speed?: number;
  /** Callback when movement stops (reached destination or user stop) */
  onStop?: () => void;
  /** Callback when reaching a junction */
  onJunction?: (x: number, z: number) => void;
}

export interface UseRailMovementReturn {
  /** Start moving along a path */
  startPath: (pathPoints: Point2D[]) => void;
  /** Stop movement immediately */
  stopMovement: () => void;
  /** Turn around and go back the way we came */
  turnAround: () => void;
  /** Update function to call each frame (returns movement delta) */
  update: (delta: number) => { dx: number; dz: number; rotation: number } | null;
  /** Current movement state */
  state: RailMovementState;
  /** Whether rail mode is active */
  isRailMoving: boolean;
}

export function useRailMovement({
  playerStateRef,
  cache,
  speed = 2.5,
  onStop,
  onJunction,
}: UseRailMovementProps): UseRailMovementReturn {
  const [state, setState] = useState<RailMovementState>({
    isMoving: false,
    currentPath: [],
    pathIndex: 0,
    targetX: 0,
    targetZ: 0,
    speed,
  });
  
  // Track the path we came from for turn-around
  const previousPathRef = useRef<Point2D[]>([]);
  
  const startPath = useCallback((pathPoints: Point2D[]) => {
    if (pathPoints.length < 2) return;
    
    // Store current path as previous for turn-around
    if (state.currentPath.length > 0) {
      previousPathRef.current = [...state.currentPath].reverse();
    }
    
    setState({
      isMoving: true,
      currentPath: pathPoints,
      pathIndex: 0,
      targetX: pathPoints[pathPoints.length - 1].x,
      targetZ: pathPoints[pathPoints.length - 1].z,
      speed,
    });
  }, [speed, state.currentPath]);
  
  const stopMovement = useCallback(() => {
    setState(prev => ({
      ...prev,
      isMoving: false,
    }));
    onStop?.();
  }, [onStop]);
  
  const turnAround = useCallback(() => {
    // Reverse current path and continue
    if (state.currentPath.length > 1) {
      const reversedPath = [...state.currentPath].reverse();
      // Adjust path index to be relative to new reversed path
      const newIndex = state.currentPath.length - 1 - state.pathIndex;
      
      setState(prev => ({
        ...prev,
        currentPath: reversedPath,
        pathIndex: Math.max(0, newIndex - 1),
        targetX: reversedPath[reversedPath.length - 1].x,
        targetZ: reversedPath[reversedPath.length - 1].z,
      }));
    } else if (previousPathRef.current.length > 1) {
      // Use the stored previous path
      startPath(previousPathRef.current);
    }
  }, [state.currentPath, state.pathIndex, startPath]);
  
  const update = useCallback((delta: number): { dx: number; dz: number; rotation: number } | null => {
    if (!state.isMoving || state.currentPath.length < 2) {
      return null;
    }
    
    const player = playerStateRef.current;
    const path = state.currentPath;
    let pathIdx = state.pathIndex;
    
    // Get current target point
    let targetPoint = path[Math.min(pathIdx + 1, path.length - 1)];
    
    // Calculate direction to target
    let dx = targetPoint.x - player.x;
    let dz = targetPoint.z - player.y; // Note: player.y is world Z
    let dist = Math.sqrt(dx * dx + dz * dz);
    
    // Check if we've reached the current waypoint
    const waypointThreshold = 0.1;
    while (dist < waypointThreshold && pathIdx < path.length - 2) {
      pathIdx++;
      targetPoint = path[Math.min(pathIdx + 1, path.length - 1)];
      dx = targetPoint.x - player.x;
      dz = targetPoint.z - player.y;
      dist = Math.sqrt(dx * dx + dz * dz);
    }
    
    // Check if we've reached the end of the path
    if (pathIdx >= path.length - 2 && dist < waypointThreshold) {
      // Reached destination
      setState(prev => ({
        ...prev,
        isMoving: false,
        pathIndex: path.length - 1,
      }));
      
      // Check if this is a junction
      if (cache?.polylineGraph) {
        for (const junction of cache.polylineGraph.junctions) {
          const jDist = Math.sqrt(
            (player.x - junction.x) ** 2 + (player.y - junction.z) ** 2
          );
          if (jDist < 0.8) {
            onJunction?.(junction.x, junction.z);
            break;
          }
        }
      }
      
      onStop?.();
      return null;
    }
    
    // Update path index in state if changed
    if (pathIdx !== state.pathIndex) {
      setState(prev => ({ ...prev, pathIndex: pathIdx }));
    }
    
    // Calculate movement
    if (dist < 0.001) return null;
    
    const moveSpeed = state.speed * delta;
    const moveDist = Math.min(moveSpeed, dist);
    
    const moveX = (dx / dist) * moveDist;
    const moveZ = (dz / dist) * moveDist;
    
    // Calculate rotation to face movement direction
    const rotation = Math.atan2(dx, dz);
    
    return {
      dx: moveX,
      dz: moveZ,
      rotation,
    };
  }, [state, playerStateRef, cache, onStop, onJunction]);
  
  return {
    startPath,
    stopMovement,
    turnAround,
    update,
    state,
    isRailMoving: state.isMoving,
  };
}

export default useRailMovement;
