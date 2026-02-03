/**
 * Rail Controls - On-rail navigation system for maze exploration
 * 
 * When enabled, the animal is locked to the polyline path and moves automatically
 * between junctions. The user controls direction via clickable arrows.
 */

import { useCallback, useEffect, useState } from 'react';
import { MagnetismCache } from '@/game/CorridorMagnetism';
import { PolylineGraph, Point2D } from '@/game/SkeletonPolyline';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, Square } from 'lucide-react';

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
 * Find available directions from current position
 */
/**
 * Find available directions from current position
 * Directions are classified relative to screen/camera (not player rotation)
 * - 'forward' = toward top of screen (negative Z in world)
 * - 'back' = toward bottom of screen (positive Z in world)
 * - 'left' = toward left of screen (negative X in world)
 * - 'right' = toward right of screen (positive X in world)
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
  // In this game, we use a fixed top-down or isometric camera where:
  // - "forward" arrow = moving away from camera (typically +Z or based on camera angle)
  // - We'll classify based on world angles for now (north/south/east/west style)
  const classifyWorldDirection = (targetAngle: number): 'forward' | 'left' | 'right' | 'back' => {
    // Use camera yaw to determine relative direction
    let relativeAngle = targetAngle - cameraYaw;
    // Normalize to [-PI, PI]
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    const absAngle = Math.abs(relativeAngle);
    if (absAngle < Math.PI / 4) return 'forward';
    if (absAngle > 3 * Math.PI / 4) return 'back';
    return relativeAngle > 0 ? 'right' : 'left';
  };
  
  // At a junction - find all connected segments
  if (position.atJunction) {
    // Find the junction point
    let junctionPoint: Point2D | null = null;
    for (const junction of polylineGraph.junctions) {
      const dx = position.x - junction.x;
      const dz = position.z - junction.z;
      if (dx * dx + dz * dz < 0.5 * 0.5) {
        junctionPoint = junction;
        break;
      }
    }
    
    if (junctionPoint) {
      // Find all segments that connect to this junction
      for (let segIdx = 0; segIdx < polylineGraph.segments.length; segIdx++) {
        const seg = polylineGraph.segments[segIdx];
        const firstPt = seg.points[0];
        const lastPt = seg.points[seg.points.length - 1];
        
        // Check if segment starts at this junction
        const firstDist = Math.sqrt((firstPt.x - junctionPoint.x) ** 2 + (firstPt.z - junctionPoint.z) ** 2);
        if (firstDist < 0.5) {
          // Segment starts here - direction is toward end
          const targetPt = lastPt;
          // Look at a point a bit down the segment for direction
          const lookAheadIdx = Math.min(10, seg.points.length - 1);
          const lookAheadPt = seg.points[lookAheadIdx];
          const dirX = lookAheadPt.x - firstPt.x;
          const dirZ = lookAheadPt.z - firstPt.z;
          const angle = Math.atan2(dirX, dirZ);
          
          // Include current position as first point for smooth start
          const pathWithStart: Point2D[] = [
            { x: junctionPoint.x, z: junctionPoint.z },
            ...seg.points
          ];
          
          directions.push({
            label: classifyWorldDirection(angle),
            direction: classifyWorldDirection(angle),
            angle,
            targetX: targetPt.x,
            targetZ: targetPt.z,
            pathPoints: pathWithStart,
            isTurnAround: false,
          });
        }
        
        // Check if segment ends at this junction (separately, as it could be both)
        const lastDist = Math.sqrt((lastPt.x - junctionPoint.x) ** 2 + (lastPt.z - junctionPoint.z) ** 2);
        if (lastDist < 0.5 && firstDist >= 0.5) {
          // Segment ends here (and doesn't start here) - direction is toward start
          const targetPt = firstPt;
          // Look at a point a bit back from the end for direction
          const lookBackIdx = Math.max(0, seg.points.length - 11);
          const lookBackPt = seg.points[lookBackIdx];
          const dirX = lookBackPt.x - lastPt.x;
          const dirZ = lookBackPt.z - lastPt.z;
          const angle = Math.atan2(dirX, dirZ);
          
          // Include current position as first point for smooth start
          const pathWithStart: Point2D[] = [
            { x: junctionPoint.x, z: junctionPoint.z },
            ...[...seg.points].reverse()
          ];
          
          directions.push({
            label: classifyWorldDirection(angle),
            direction: classifyWorldDirection(angle),
            angle,
            targetX: targetPt.x,
            targetZ: targetPt.z,
            pathPoints: pathWithStart,
            isTurnAround: false,
          });
        }
      }
    }
  } else {
    // On a segment - can go forward or backward along it
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
      
      // Include current position as first point for smooth start
      const pathWithStart: Point2D[] = [
        { x: position.x, z: position.z },
        ...points.slice(ptIdx)
      ];
      
      directions.push({
        label: 'Forward',
        direction: classifyWorldDirection(angle),
        angle,
        targetX: targetPt.x,
        targetZ: targetPt.z,
        pathPoints: pathWithStart,
        isTurnAround: false,
      });
    }
    
    // Backward direction (toward start of segment)
    if (ptIdx > 0) {
      const targetPt = points[0];
      const lookBackIdx = Math.max(0, ptIdx - 10);
      const lookBackPt = points[lookBackIdx];
      const dirX = lookBackPt.x - position.x;
      const dirZ = lookBackPt.z - position.z;
      const angle = Math.atan2(dirX, dirZ);
      
      // Include current position as first point for smooth start
      const pathWithStart: Point2D[] = [
        { x: position.x, z: position.z },
        ...points.slice(0, ptIdx + 1).reverse()
      ];
      
      directions.push({
        label: 'Backward',
        direction: classifyWorldDirection(angle),
        angle,
        targetX: targetPt.x,
        targetZ: targetPt.z,
        pathPoints: pathWithStart,
        isTurnAround: false,
      });
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
