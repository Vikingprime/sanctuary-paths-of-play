/**
 * Rail Controls - On-rail navigation system for maze exploration
 * 
 * When enabled, the animal is locked to the polyline path and moves automatically
 * between junctions. The user controls direction via clickable arrows.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Current animal rotation (radians) - used to classify directions relative to animal's facing */
  animalRotation: number;
  /** Camera yaw (radians) - when provided, arrows are positioned relative to camera view */
  cameraYaw?: number;
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
  /** Angle relative to animal's facing direction (radians) - for UI positioning */
  relativeAngle: number;
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
 * Deduplicate directions by angle - keep only the longest path for similar directions
 */
function deduplicateDirectionsByAngle(
  directions: DirectionOption[],
  angleThreshold: number = Math.PI / 4 // 45 degrees - generous to handle skeleton fragmentation
): DirectionOption[] {
  if (directions.length <= 1) return directions;
  
  const result: DirectionOption[] = [];
  
  // Filter out very short paths first (likely skeleton artifacts)
  // A real path should be at least 0.5 world units
  const MIN_REAL_PATH_LENGTH = 0.5;
  const validDirections = directions.filter(d => calculatePathLength(d.pathPoints) >= MIN_REAL_PATH_LENGTH);
  
  // Sort by path length descending so we prefer longer paths
  const sorted = [...validDirections]
    .map((d) => ({ dir: d, length: calculatePathLength(d.pathPoints) }))
    .sort((a, b) => b.length - a.length);
  
  for (const { dir } of sorted) {
    // Check if this direction is too similar to one we already added
    let isDuplicate = false;
    for (const existing of result) {
      let angleDiff = Math.abs(dir.angle - existing.angle);
      // Normalize to [0, PI]
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      
      if (angleDiff < angleThreshold) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      result.push(dir);
    }
  }
  
  return result;
}

/**
 * Find available directions from current position
 * Uses topology-based junction connectivity instead of distance-based matching
 * @param actualPlayerX - The actual player X position (not snapped to polyline)
 * @param actualPlayerZ - The actual player Z position (not snapped to polyline)
 */
export function findAvailableDirections(
  position: RailPosition,
  animalRotation: number,
  cache: MagnetismCache | null,
  actualPlayerX?: number,
  actualPlayerZ?: number,
  cameraYaw?: number,
): DirectionOption[] {
  if (!cache?.polylineGraph) return [];
  
  // Use actual player position for path start, fall back to polyline position
  const startX = actualPlayerX ?? position.x;
  const startZ = actualPlayerZ ?? position.z;
  
  const { polylineGraph } = cache;
  const directions: DirectionOption[] = [];
  
  // Use camera yaw for arrow positioning if available, otherwise animal rotation
  const referenceRotation = cameraYaw ?? animalRotation;
  const animalFacingAngle = -referenceRotation + Math.PI;
  
  // Helper to compute relative angle (for UI positioning)
  // The world uses atan2(x, z) where +angle is counter-clockwise when viewed from above
  // But screen coordinates have +X to the right (clockwise from forward = right)
  // So we need to NEGATE the relative angle to convert from world to screen convention
  const computeRelativeAngle = (targetAngle: number): number => {
    let relativeAngle = targetAngle - animalFacingAngle;
    // Normalize to [-PI, PI]
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    // NEGATE to convert from world (CCW+) to screen (CW+) convention
    relativeAngle = -relativeAngle;
    
    return relativeAngle;
  };
  
  // Helper to classify angle relative to animal's facing direction
  // Since camera is locked behind the animal, screen directions match animal directions
  // After negation: positive = right, negative = left
  const classifyWorldDirection = (targetAngle: number): 'forward' | 'left' | 'right' | 'back' => {
    const relativeAngle = computeRelativeAngle(targetAngle);
    const absAngle = Math.abs(relativeAngle);
    // Forward = same direction animal is facing (within 45°)
    if (absAngle < Math.PI / 4) return 'forward';
    // Back = opposite direction (more than 135°)
    if (absAngle > 3 * Math.PI / 4) return 'back';
    // Left/Right based on sign (positive = right from animal's POV after negation)
    return relativeAngle > 0 ? 'right' : 'left';
  };
  
  // Minimum path length for a direction to be valid
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
        
        // Build path starting from actual player position (not snapped polyline point)
        const pathPoints: Point2D[] = [
          { x: startX, z: startZ },
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
          relativeAngle: computeRelativeAngle(angle),
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
      const dirX = lookAheadPt.x - startX;
      const dirZ = lookAheadPt.z - startZ;
      const angle = Math.atan2(dirX, dirZ);
      
      // Start from the point AHEAD of the nearest point, not the nearest point itself
      // This prevents briefly moving backward to reach the polyline
      const pathPoints: Point2D[] = [
        { x: startX, z: startZ },
        ...points.slice(ptIdx + 1)
      ];
      
      const pathLength = calculatePathLength(pathPoints);
      if (pathLength >= MIN_PATH_LENGTH) {
        directions.push({
          label: 'Forward',
          direction: classifyWorldDirection(angle),
          angle,
          relativeAngle: computeRelativeAngle(angle),
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
      const dirX = lookBackPt.x - startX;
      const dirZ = lookBackPt.z - startZ;
      const angle = Math.atan2(dirX, dirZ);
      
      // Start from the point BEFORE the nearest point (going backward)
      // This prevents briefly moving forward to reach the polyline before reversing
      const pathPoints: Point2D[] = [
        { x: startX, z: startZ },
        ...points.slice(0, ptIdx).reverse()
      ];
      
      const pathLength = calculatePathLength(pathPoints);
      if (pathLength >= MIN_PATH_LENGTH) {
        directions.push({
          label: 'Backward',
          direction: classifyWorldDirection(angle),
          angle,
          relativeAngle: computeRelativeAngle(angle),
          targetX: targetPt.x,
          targetZ: targetPt.z,
          pathPoints,
          isTurnAround: false,
        });
      }
    }
  }
  
  // Deduplicate directions that point in nearly the same direction
  // Keep the longer path when two directions are within 30 degrees
  return deduplicateDirectionsByAngle(directions);
}

// ============================================================================
// RAIL CONTROLS COMPONENT
// ============================================================================

/**
 * Radial direction button - positioned by actual path angle
 * Arrow rotates to point in the direction of travel
 */
const RadialDirectionButton = ({
  relativeAngle,
  onClick,
  disabled,
  isTurnAround,
  radius = 60, // Distance from center
}: {
  relativeAngle: number; // Angle relative to animal's facing direction (radians)
  onClick: () => void;
  disabled?: boolean;
  isTurnAround?: boolean;
  radius?: number;
}) => {
  // relativeAngle: 0 = forward, PI/2 = right, -PI/2 = left, PI = back
  // For screen position: forward should be at top (y = center - radius)
  // Position on circle (center of container is at 80,80 for w-40 h-40)
  const centerX = 80;
  const centerY = 80;
  // Screen coordinates: +Y is down, +X is right
  // relativeAngle 0 (forward) = top = (0, -1)
  // relativeAngle PI/2 (right) = right = (1, 0)
  const x = centerX + Math.sin(relativeAngle) * radius;
  const y = centerY - Math.cos(relativeAngle) * radius;
  
  // Arrow rotation - point in direction of travel (relative to up)
  const arrowRotation = (relativeAngle * 180 / Math.PI);
  
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
        ${isTurnAround
          ? 'bg-amber-500/20 hover:bg-amber-500/40 text-white/70 shadow-lg hover:scale-110 backdrop-blur-sm'
          : 'bg-primary/20 hover:bg-primary/40 text-white/70 shadow-lg hover:scale-110 backdrop-blur-sm'
        }
        ${disabled ? 'pointer-events-none' : ''}
        border ${isTurnAround ? 'border-amber-200/30' : 'border-white/20'}
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
  animalRotation,
  onDirectionSelect,
  onStop,
  onTurnAround,
  isMoving,
  enabled,
}: RailControlsProps) {
   const [directions, setDirections] = useState<DirectionOption[]>([]);
   const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
   
   // Track orientation changes
   useEffect(() => {
     const handleResize = () => {
       setIsLandscape(window.innerWidth > window.innerHeight);
     };
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
   }, []);
  
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
        animalRotation,
        cache,
        playerX,  // Pass actual player position
        playerZ,
      );
      setDirections(availableDirs);
    }
  }, [enabled, cache, playerX, playerZ, animalRotation, isMoving]);
  
  const handleDirectionClick = useCallback((dir: DirectionOption) => {
    if (dir.isTurnAround) {
      onTurnAround();
    }
    
    onDirectionSelect(dir.targetX, dir.targetZ, dir.pathPoints);
  }, [onDirectionSelect, onTurnAround]);
  
  // Guard against stop→direction button ghost clicks
  const [justStopped, setJustStopped] = useState(false);
  const justStoppedRef = useRef(false);
  
  // Track when movement stops to add a brief cooldown
  useEffect(() => {
    if (!isMoving && justStoppedRef.current) {
      setJustStopped(true);
      const timer = setTimeout(() => {
        setJustStopped(false);
        justStoppedRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
    if (isMoving) {
      justStoppedRef.current = true;
    }
  }, [isMoving]);
  
  if (!enabled) return null;
  
  // When moving, only show stop button
  if (isMoving) {
    return (
       <div className={`fixed left-1/2 -translate-x-1/2 z-20 ${isLandscape ? 'bottom-4' : 'bottom-20'}`}>
        <button
          onClick={onStop}
          className="
            w-16 h-16 rounded-full
            flex items-center justify-center
            bg-amber-500/20 hover:bg-amber-500/40
            text-white/70 shadow-xl hover:scale-110 backdrop-blur-sm
            transition-all duration-200
            border border-amber-200/30
          "
        >
          <Square className="w-8 h-8 fill-current" />
        </button>
      </div>
    );
  }
  
  return (
     <div className={`fixed left-1/2 -translate-x-1/2 z-20 ${isLandscape ? 'bottom-2' : 'bottom-20'}`}>
      <div className="relative w-40 h-40">
        {/* Direction buttons - positioned at actual path angles, disabled briefly after stop */}
        {directions.map((dir, idx) => (
          <RadialDirectionButton
            key={`${dir.relativeAngle.toFixed(2)}-${dir.isTurnAround}`}
            relativeAngle={dir.relativeAngle}
            onClick={() => handleDirectionClick(dir)}
            isTurnAround={dir.isTurnAround}
            disabled={justStopped}
          />
        ))}
        
        {/* Turn around button removed - user should use direction arrows instead */}
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
