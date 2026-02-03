/**
 * Rail Controls - On-rail navigation system for maze exploration
 * 
 * When enabled, the animal is locked to the polyline path and moves automatically
 * between junctions. The user controls direction via clickable arrows.
 */

import { useCallback, useEffect, useState } from 'react';
import { MagnetismCache } from '@/game/CorridorMagnetism';
import { PolylineGraph, Point2D, Junction } from '@/game/SkeletonPolyline';
import { ArrowUp, RotateCcw, Square } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface RailControlsProps {
  /** Magnetism cache containing polyline data */
  cache: MagnetismCache | null;
  /** Current player position in world space */
  playerX: number;
  playerZ: number;
  /** Current camera yaw (radians) - used to classify directions relative to screen */
  cameraYaw: number;
  /** Callback when direction is selected - provides target position and direction */
  onDirectionSelect: (targetX: number, targetZ: number, pathPoints: Point2D[]) => void;
  /** Callback when stop is pressed */
  onStop: () => void;
  /** Callback when turn around is pressed */
  onTurnAround: () => void;
  /** Whether the animal is currently moving */
  isMoving: boolean;
  /** Whether rail controls are enabled */
  enabled: boolean;
}

/** Direction option for navigation */
interface DirectionOption {
  /** Display label */
  label: string;
  /** Icon type */
  direction: 'forward' | 'left' | 'right' | 'back';
  /** World angle of this direction (radians) */
  angle: number;
  /** Target position (junction or endpoint) */
  targetX: number;
  targetZ: number;
  /** Path points to follow */
  pathPoints: Point2D[];
  /** Is this the direction we came from */
  isTurnAround: boolean;
}

/** Current position on the polyline */
export interface RailPosition {
  /** Current segment index */
  segmentIndex: number;
  /** Current point index within segment */
  pointIndex: number;
  /** World position */
  x: number;
  z: number;
  /** Whether at a junction */
  atJunction: boolean;
  /** Whether at an endpoint */
  atEndpoint: boolean;
}

// ============================================================================
// RAIL POSITION TRACKING
// ============================================================================

/**
 * Find the current position on the polyline graph
 */
export function findRailPosition(
  x: number,
  z: number,
  cache: MagnetismCache | null
): RailPosition | null {
  if (!cache?.polylineGraph) return null;
  
  const { polylineGraph, polylineSpatialHash, polylineBucketSize } = cache;
  
  // Find nearest polyline point
  const bucketsToCheck = 3;
  const centerBx = Math.floor(x / polylineBucketSize);
  const centerBz = Math.floor(z / polylineBucketSize);
  
  let nearestSegIdx = -1;
  let nearestPtIdx = -1;
  let nearestDistSq = Infinity;
  let nearestX = x;
  let nearestZ = z;
  
  for (let dbx = -bucketsToCheck; dbx <= bucketsToCheck; dbx++) {
    for (let dbz = -bucketsToCheck; dbz <= bucketsToCheck; dbz++) {
      const bucketKey = `${centerBx + dbx},${centerBz + dbz}`;
      const bucket = polylineSpatialHash.get(bucketKey);
      if (!bucket) continue;
      
      for (const point of bucket.points) {
        const dx = x - point.wx;
        const dz = z - point.wz;
        const distSq = dx * dx + dz * dz;
        
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestSegIdx = point.segmentIndex;
          nearestPtIdx = point.pointIndex;
          nearestX = point.wx;
          nearestZ = point.wz;
        }
      }
    }
  }
  
  if (nearestSegIdx < 0) return null;
  
  const segment = polylineGraph.segments[nearestSegIdx];
  if (!segment) return null;
  
  // Check if at junction (within 0.5 world units of any junction)
  let atJunction = false;
  for (const junction of polylineGraph.junctions) {
    const dx = nearestX - junction.x;
    const dz = nearestZ - junction.z;
    if (dx * dx + dz * dz < 0.5 * 0.5) {
      atJunction = true;
      break;
    }
  }
  
  // Check if at endpoint
  const atEndpoint = (segment.startIsEndpoint && nearestPtIdx < 3) ||
                     (segment.endIsEndpoint && nearestPtIdx >= segment.points.length - 3);
  
  return {
    segmentIndex: nearestSegIdx,
    pointIndex: nearestPtIdx,
    x: nearestX,
    z: nearestZ,
    atJunction,
    atEndpoint,
  };
}

/**
 * Calculate total path length in world units
 */
function calculatePathLength(points: Point2D[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    length += Math.sqrt(dx * dx + dz * dz);
  }
  return length;
}

/**
 * Find the nearest junction to a position
 */
function findNearestJunction(
  x: number,
  z: number,
  junctions: Junction[],
  maxDist: number = 0.5
): Junction | null {
  let nearest: Junction | null = null;
  let nearestDistSq = maxDist * maxDist;
  
  for (const junction of junctions) {
    const dx = x - junction.x;
    const dz = z - junction.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = junction;
    }
  }
  
  return nearest;
}

/**
 * Find available directions from current position
 * Uses topology-based junction connectivity instead of distance-based matching
 */
export function findAvailableDirections(
  position: RailPosition,
  cameraYaw: number,
  cache: MagnetismCache | null,
): DirectionOption[] {
  if (!cache?.polylineGraph) return [];
  
  const { polylineGraph } = cache;
  const directions: DirectionOption[] = [];
  
  // Helper to classify angle relative to camera (screen orientation)
  const classifyWorldDirection = (targetAngle: number): 'forward' | 'left' | 'right' | 'back' => {
    let relativeAngle = targetAngle - cameraYaw;
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    const absAngle = Math.abs(relativeAngle);
    if (absAngle < Math.PI / 4) return 'forward';
    if (absAngle > 3 * Math.PI / 4) return 'back';
    return relativeAngle > 0 ? 'right' : 'left';
  };
  
  // Minimum path length for a direction to be valid (prevents "turn only" buttons)
  // Set low to ensure short corridor segments still appear as valid directions
  const MIN_PATH_LENGTH = 0.1;
  
  // At a junction - use the stored connectivity data
  if (position.atJunction) {
    const junction = findNearestJunction(position.x, position.z, polylineGraph.junctions);
    
    if (junction) {
      // Process each connected segment exactly once
      const processedSegments = new Set<number>();
      
      for (const conn of junction.connections) {
        // Skip if we've already processed this segment
        if (processedSegments.has(conn.segmentIndex)) continue;
        processedSegments.add(conn.segmentIndex);
        
        const seg = polylineGraph.segments[conn.segmentIndex];
        if (!seg || seg.points.length < 2) continue;
        
        // If segment starts at this junction, walk forward through points
        // If segment ends at this junction, walk backward (reverse points)
        const points = conn.atStart ? seg.points : [...seg.points].reverse();
        
        // Calculate direction from first few points after junction
        const lookAheadIdx = Math.min(10, points.length - 1);
        const lookAheadPt = points[lookAheadIdx];
        const startPt = points[0];
        const dirX = lookAheadPt.x - startPt.x;
        const dirZ = lookAheadPt.z - startPt.z;
        const angle = Math.atan2(dirX, dirZ);
        
        // Build path starting from current position (not junction center)
        const pathPoints: Point2D[] = [
          { x: position.x, z: position.z },
          ...points
        ];
        
        // Validate path has sufficient length
        const pathLength = calculatePathLength(pathPoints);
        if (pathLength < MIN_PATH_LENGTH) continue;
        
        const targetPt = points[points.length - 1];
        
        directions.push({
          label: classifyWorldDirection(angle),
          direction: classifyWorldDirection(angle),
          angle,
          targetX: targetPt.x,
          targetZ: targetPt.z,
          pathPoints,
          isTurnAround: false,
        });
      }
    }
  } else {
    // On a segment (not at junction) - can go forward or backward along it
    const segment = polylineGraph.segments[position.segmentIndex];
    if (!segment) return [];
    
    const points = segment.points;
    const ptIdx = position.pointIndex;
    
    // Forward direction (toward end of segment)
    if (ptIdx < points.length - 1) {
      const targetPt = points[points.length - 1];
      const lookAheadIdx = Math.min(ptIdx + 10, points.length - 1);
      const lookAheadPt = points[lookAheadIdx];
      const dirX = lookAheadPt.x - position.x;
      const dirZ = lookAheadPt.z - position.z;
      const angle = Math.atan2(dirX, dirZ);
      
      const pathPoints: Point2D[] = [
        { x: position.x, z: position.z },
        ...points.slice(ptIdx)
      ];
      
      const pathLength = calculatePathLength(pathPoints);
      if (pathLength >= MIN_PATH_LENGTH) {
        directions.push({
          label: 'Forward',
          direction: classifyWorldDirection(angle),
          angle,
          targetX: targetPt.x,
          targetZ: targetPt.z,
          pathPoints,
          isTurnAround: false,
        });
      }
    }
    
    // Backward direction (toward start of segment)
    if (ptIdx > 0) {
      const targetPt = points[0];
      const lookBackIdx = Math.max(0, ptIdx - 10);
      const lookBackPt = points[lookBackIdx];
      const dirX = lookBackPt.x - position.x;
      const dirZ = lookBackPt.z - position.z;
      const angle = Math.atan2(dirX, dirZ);
      
      const pathPoints: Point2D[] = [
        { x: position.x, z: position.z },
        ...points.slice(0, ptIdx + 1).reverse()
      ];
      
      const pathLength = calculatePathLength(pathPoints);
      if (pathLength >= MIN_PATH_LENGTH) {
        directions.push({
          label: 'Backward',
          direction: classifyWorldDirection(angle),
          angle,
          targetX: targetPt.x,
          targetZ: targetPt.z,
          pathPoints,
          isTurnAround: false,
        });
      }
    }
  }
  
  return directions;
}

// ============================================================================
// RAIL CONTROLS COMPONENT
// ============================================================================

/**
 * Radial direction button - positioned by actual path angle
 * Arrow rotates to point in the direction of travel
 */
const RadialDirectionButton = ({
  angle,
  onClick,
  disabled,
  isTurnAround,
  radius = 60, // Distance from center
}: {
  angle: number; // World angle in radians
  onClick: () => void;
  disabled?: boolean;
  isTurnAround?: boolean;
  radius?: number;
}) => {
  // Convert world angle to screen position
  // angle 0 = +Z = down on screen, angle PI/2 = +X = right on screen
  // We want angle 0 to point "up" visually when facing +Z
  const screenAngle = -angle + Math.PI; // Flip and rotate
  
  // Position on circle (center of container is at 80,80 for w-40 h-40)
  const centerX = 80;
  const centerY = 80;
  const x = centerX + Math.sin(screenAngle) * radius;
  const y = centerY - Math.cos(screenAngle) * radius;
  
  // Arrow rotation - point in direction of travel
  const arrowRotation = (screenAngle * 180 / Math.PI);
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        transform: `translate(-50%, -50%)`,
      }}
      className={`
        w-14 h-14 rounded-full
        flex items-center justify-center
        transition-all duration-200
        ${disabled 
          ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' 
          : isTurnAround
            ? 'bg-amber-600/80 hover:bg-amber-500 text-white shadow-lg hover:scale-110'
            : 'bg-primary/80 hover:bg-primary text-white shadow-lg hover:scale-110'
        }
        border-2 ${disabled ? 'border-gray-600' : isTurnAround ? 'border-amber-400' : 'border-primary-foreground/30'}
      `}
    >
      {isTurnAround ? (
        <RotateCcw className="w-6 h-6" />
      ) : (
        <ArrowUp 
          className="w-6 h-6" 
          style={{ transform: `rotate(${arrowRotation}deg)` }}
        />
      )}
    </button>
  );
};

export function RailControls({
  cache,
  playerX,
  playerZ,
  cameraYaw,
  onDirectionSelect,
  onStop,
  onTurnAround,
  isMoving,
  enabled,
}: RailControlsProps) {
  const [directions, setDirections] = useState<DirectionOption[]>([]);
  
  // Find current position and available directions
  useEffect(() => {
    if (!enabled || !cache) {
      setDirections([]);
      return;
    }
    
    const position = findRailPosition(playerX, playerZ, cache);
    if (!position) {
      setDirections([]);
      return;
    }
    
    // Only update directions when stopped
    if (!isMoving) {
      const availableDirs = findAvailableDirections(
        position,
        cameraYaw,
        cache,
      );
      setDirections(availableDirs);
    }
  }, [enabled, cache, playerX, playerZ, cameraYaw, isMoving]);
  
  const handleDirectionClick = useCallback((dir: DirectionOption) => {
    if (dir.isTurnAround) {
      onTurnAround();
    }
    
    onDirectionSelect(dir.targetX, dir.targetZ, dir.pathPoints);
  }, [onDirectionSelect, onTurnAround]);
  
  if (!enabled) return null;
  
  // When moving, only show stop button
  if (isMoving) {
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={onStop}
          className="
            w-16 h-16 rounded-full
            flex items-center justify-center
            bg-red-600/90 hover:bg-red-500
            text-white shadow-xl hover:scale-110
            transition-all duration-200
            border-2 border-red-400
          "
        >
          <Square className="w-8 h-8 fill-current" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
      <div className="relative w-40 h-40">
        {/* Center indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-background/80 border-2 border-muted flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
          </div>
        </div>
        
        {/* Direction buttons - positioned at actual path angles */}
        {directions.map((dir, idx) => (
          <RadialDirectionButton
            key={idx}
            angle={dir.angle}
            onClick={() => handleDirectionClick(dir)}
            isTurnAround={dir.isTurnAround}
          />
        ))}
        
        {/* Turn around button (always available) */}
        {directions.length > 0 && !directions.some(d => d.isTurnAround) && (
          <button
            onClick={onTurnAround}
            className="
              absolute bottom-2 right-2
              w-10 h-10 rounded-full
              flex items-center justify-center
              bg-amber-600/80 hover:bg-amber-500
              text-white shadow-lg hover:scale-110
              transition-all duration-200
              border border-amber-400
            "
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {/* Status text */}
      <div className="text-center mt-2 text-xs text-muted-foreground">
        {directions.length === 0 
          ? 'No path found' 
          : `${directions.length} direction${directions.length > 1 ? 's' : ''} available`
        }
      </div>
    </div>
  );
}

export default RailControls;
