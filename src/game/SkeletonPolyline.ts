/**
 * ============================================================================
 * SKELETON POLYLINE SMOOTHING
 * ============================================================================
 * 
 * Converts the pixel-based medial axis skeleton into smooth polylines
 * for better movement assistance and visualization.
 * 
 * Pipeline:
 * 1. Build skeleton graph (8-neighborhood adjacency)
 * 2. Extract polyline segments between endpoints/junctions
 * 3. Simplify with Ramer-Douglas-Peucker (removes micro zigzags)
 * 4. Smooth with Chaikin corner-cutting (rounds sharp corners)
 * 
 * The result is a set of smoothly curved polylines that can be used for:
 * - Magnetism target projection (nearest point on polyline)
 * - Tangent calculation (segment direction at projection)
 * - Debug visualization (line strips instead of dots)
 * 
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/** A 2D point in world space */
export interface Point2D {
  x: number;
  z: number;
}

/** A polyline segment connecting endpoints or junctions */
export interface PolylineSegment {
  /** Ordered list of points from one end to the other */
  points: Point2D[];
  /** True if start is an endpoint (degree 1), false if junction */
  startIsEndpoint: boolean;
  /** True if end is an endpoint (degree 1), false if junction */
  endIsEndpoint: boolean;
}

/** Complete polyline graph for the skeleton */
export interface PolylineGraph {
  /** All polyline segments */
  segments: PolylineSegment[];
  /** Junction points (degree >= 3) */
  junctions: Point2D[];
  /** Endpoint positions (degree 1) */
  endpoints: Point2D[];
}

/** Configuration for polyline processing */
export interface PolylineConfig {
  /** Epsilon for RDP simplification (world units, default: 0.02 * fineCellSize). Set to 0 to disable. */
  rdpEpsilon: number;
  /** Number of Chaikin smoothing iterations (default: 4) */
  chaikinIterations: number;
  /** Preserve N points at each end of segment from smoothing (default: 1) */
  preserveEndpoints: number;
  /** Resample spacing after smoothing (world units, 0 = disable, default: 0.1 * fineCellSize) */
  resampleSpacing: number;
  /** Use Catmull-Rom spline resampling instead of linear (default: true) */
  useCatmullRom: boolean;
  /** Number of samples per original point for Catmull-Rom (default: 10) */
  catmullRomSamplesPerPoint: number;
  /** Enable wall distance enforcement (default: true) */
  enforceWallClearance: boolean;
  /** Animal capsule radius in world units (default: 0.3) */
  animalRadius: number;
  /** Safety margin as fraction of cell size (default: 0.15) */
  marginFactor: number;
  /** Maze cell size in world units (default: 0.667) */
  cellSize: number;
}

/** Distance field interface for wall clearance */
export interface DistanceField {
  /** Fine grid with distance values */
  fineGrid: Array<Array<{ distance: number; walkable: boolean }>>;
  /** Fine grid width */
  fineWidth: number;
  /** Fine grid height */
  fineHeight: number;
  /** Size of each fine cell in world units */
  fineCellSize: number;
}

/** Point with clearance violation info for debug - extended by ClearancePoint in enforcement section */
export interface ClearancePointBasic extends Point2D {
  /** True if this point violated clearance before projection */
  hadViolation?: boolean;
}

// ============================================================================
// SKELETON GRAPH BUILDING
// ============================================================================

/** Grid node for graph building */
interface SkeletonNode {
  fx: number;
  fy: number;
  degree: number;
  neighbors: Array<{ fx: number; fy: number }>;
}

/**
 * Build a graph from skeleton pixels using 8-neighborhood adjacency.
 * 
 * @param fineGrid - The fine grid with isSkeleton flags
 * @param fineWidth - Grid width
 * @param fineHeight - Grid height
 * @returns Map from "fx,fy" to SkeletonNode
 */
function buildSkeletonGraph(
  fineGrid: Array<Array<{ isSkeleton: boolean; isSpur?: boolean }>>,
  fineWidth: number,
  fineHeight: number
): Map<string, SkeletonNode> {
  const graph = new Map<string, SkeletonNode>();
  
  // 8-neighborhood offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  // First pass: create nodes for all skeleton pixels
  for (let fy = 0; fy < fineHeight; fy++) {
    for (let fx = 0; fx < fineWidth; fx++) {
      const cell = fineGrid[fy]?.[fx];
      if (cell?.isSkeleton && !cell?.isSpur) {
        graph.set(`${fx},${fy}`, {
          fx,
          fy,
          degree: 0,
          neighbors: [],
        });
      }
    }
  }
  
  // Second pass: compute neighbors and degree
  for (const node of graph.values()) {
    for (let i = 0; i < 8; i++) {
      const nx = node.fx + dx[i];
      const ny = node.fy + dy[i];
      const key = `${nx},${ny}`;
      if (graph.has(key)) {
        node.neighbors.push({ fx: nx, fy: ny });
      }
    }
    node.degree = node.neighbors.length;
  }
  
  return graph;
}

// ============================================================================
// POLYLINE SEGMENT EXTRACTION
// ============================================================================

/**
 * Extract polyline segments from the skeleton graph.
 * 
 * Each segment starts at an endpoint (degree 1) or junction (degree >= 3)
 * and walks along degree-2 nodes until reaching another endpoint/junction.
 * 
 * @param graph - The skeleton graph
 * @param fineCellSize - Size of each fine cell in world units
 * @returns Array of polyline segments with world-space coordinates
 */
function extractPolylineSegments(
  graph: Map<string, SkeletonNode>,
  fineCellSize: number
): { segments: PolylineSegment[]; junctions: Point2D[]; endpoints: Point2D[] } {
  const segments: PolylineSegment[] = [];
  const visitedEdges = new Set<string>();
  
  const junctions: Point2D[] = [];
  const endpoints: Point2D[] = [];
  
  // Convert grid coords to world space
  const toWorld = (fx: number, fy: number): Point2D => ({
    x: (fx + 0.5) * fineCellSize,
    z: (fy + 0.5) * fineCellSize,
  });
  
  // Create edge key (order-independent)
  const edgeKey = (a: string, b: string): string => a < b ? `${a}->${b}` : `${b}->${a}`;
  
  // Find all endpoints and junctions
  for (const node of graph.values()) {
    if (node.degree === 1) {
      endpoints.push(toWorld(node.fx, node.fy));
    } else if (node.degree >= 3) {
      junctions.push(toWorld(node.fx, node.fy));
    }
  }
  
  // Walk segments starting from endpoints and junctions
  for (const startNode of graph.values()) {
    // Only start from endpoints or junctions
    if (startNode.degree !== 1 && startNode.degree < 3) continue;
    
    // Try each outgoing edge
    for (const firstNeighbor of startNode.neighbors) {
      const startKey = `${startNode.fx},${startNode.fy}`;
      const firstKey = `${firstNeighbor.fx},${firstNeighbor.fy}`;
      const edge = edgeKey(startKey, firstKey);
      
      // Skip if already visited
      if (visitedEdges.has(edge)) continue;
      visitedEdges.add(edge);
      
      // Walk along the segment
      const points: Point2D[] = [toWorld(startNode.fx, startNode.fy)];
      let prevKey = startKey;
      let currKey = firstKey;
      let currNode = graph.get(currKey);
      
      while (currNode && currNode.degree === 2) {
        points.push(toWorld(currNode.fx, currNode.fy));
        
        // Find the neighbor that isn't where we came from
        const nextNeighbor = currNode.neighbors.find(n => `${n.fx},${n.fy}` !== prevKey);
        if (!nextNeighbor) break;
        
        const nextKey = `${nextNeighbor.fx},${nextNeighbor.fy}`;
        const nextEdge = edgeKey(currKey, nextKey);
        visitedEdges.add(nextEdge);
        
        prevKey = currKey;
        currKey = nextKey;
        currNode = graph.get(currKey);
      }
      
      // Add the final endpoint/junction
      if (currNode) {
        points.push(toWorld(currNode.fx, currNode.fy));
      }
      
      // Create the segment
      if (points.length >= 2) {
        segments.push({
          points,
          startIsEndpoint: startNode.degree === 1,
          endIsEndpoint: currNode ? currNode.degree === 1 : false,
        });
      }
    }
  }
  
  return { segments, junctions, endpoints };
}

// ============================================================================
// RAMER-DOUGLAS-PEUCKER SIMPLIFICATION
// ============================================================================

/**
 * Perpendicular distance from point to line segment.
 */
function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dz = lineEnd.z - lineStart.z;
  const lenSq = dx * dx + dz * dz;
  
  if (lenSq < 1e-10) {
    // Line segment is a point
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.z - lineStart.z) ** 2);
  }
  
  // Project point onto line and compute distance
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.z - lineStart.z) * dz) / lenSq));
  const projX = lineStart.x + t * dx;
  const projZ = lineStart.z + t * dz;
  
  return Math.sqrt((point.x - projX) ** 2 + (point.z - projZ) ** 2);
}

/**
 * Ramer-Douglas-Peucker line simplification.
 * 
 * Removes points that don't significantly deviate from a straight line.
 * 
 * @param points - Input polyline
 * @param epsilon - Maximum allowed deviation (smaller = more detail)
 * @returns Simplified polyline
 */
function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return [...points];
  
  // Find the point with maximum distance from the line
  let maxDist = 0;
  let maxIndex = 0;
  
  const first = points[0];
  const last = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  
  // If max distance exceeds epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIndex), epsilon);
    
    // Combine results (avoid duplicating the split point)
    return [...left.slice(0, -1), ...right];
  } else {
    // All intermediate points can be removed
    return [first, last];
  }
}

// ============================================================================
// CATMULL-ROM SPLINE RESAMPLING
// ============================================================================

/**
 * Evaluate a Catmull-Rom spline at parameter t.
 * 
 * @param p0 - Control point before the segment
 * @param p1 - Start of segment
 * @param p2 - End of segment
 * @param p3 - Control point after the segment
 * @param t - Parameter in [0, 1]
 * @returns Interpolated point
 */
function catmullRomPoint(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t;
  const t3 = t2 * t;
  
  // Catmull-Rom basis matrix coefficients
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );
  
  const z = 0.5 * (
    (2 * p1.z) +
    (-p0.z + p2.z) * t +
    (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
    (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
  );
  
  return { x, z };
}

/**
 * Resample a polyline using Catmull-Rom spline interpolation.
 * 
 * This produces smooth curves through the original points.
 * 
 * @param points - Input polyline (at least 2 points)
 * @param samplesPerSegment - Number of samples per original segment
 * @returns Densely sampled smooth curve
 */
function resampleCatmullRom(points: Point2D[], samplesPerSegment: number): Point2D[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) {
    // For just 2 points, do linear interpolation
    const result: Point2D[] = [points[0]];
    for (let i = 1; i < samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      result.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        z: points[0].z + (points[1].z - points[0].z) * t,
      });
    }
    result.push(points[points.length - 1]);
    return result;
  }
  
  const result: Point2D[] = [];
  
  // For each segment between points[i] and points[i+1]
  for (let i = 0; i < points.length - 1; i++) {
    // Get the 4 control points for this segment
    // Clamp indices for endpoints
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    // Sample this segment
    const isLastSegment = i === points.length - 2;
    const samples = isLastSegment ? samplesPerSegment + 1 : samplesPerSegment;
    
    for (let s = 0; s < samples; s++) {
      const t = s / samplesPerSegment;
      result.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }
  
  return result;
}

/**
 * Resample a polyline at fixed world-space intervals using linear interpolation.
 * 
 * @param points - Input polyline
 * @param spacing - Distance between output points
 * @returns Evenly spaced points along the polyline
 */
function resampleLinear(points: Point2D[], spacing: number): Point2D[] {
  if (points.length < 2 || spacing <= 0) return [...points];
  
  const result: Point2D[] = [points[0]];
  let accumulated = 0;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dz = curr.z - prev.z;
    const segmentLen = Math.sqrt(dx * dx + dz * dz);
    
    if (segmentLen < 1e-6) continue;
    
    const dirX = dx / segmentLen;
    const dirZ = dz / segmentLen;
    
    let remaining = segmentLen;
    let startX = prev.x;
    let startZ = prev.z;
    
    // First, use up any accumulated distance from previous segment
    if (accumulated > 0) {
      const needed = spacing - accumulated;
      if (remaining >= needed) {
        startX += dirX * needed;
        startZ += dirZ * needed;
        result.push({ x: startX, z: startZ });
        remaining -= needed;
        accumulated = 0;
      } else {
        accumulated += remaining;
        continue;
      }
    }
    
    // Emit points at regular intervals
    while (remaining >= spacing) {
      startX += dirX * spacing;
      startZ += dirZ * spacing;
      result.push({ x: startX, z: startZ });
      remaining -= spacing;
    }
    
    accumulated = remaining;
  }
  
  // Always include the final point
  const last = points[points.length - 1];
  const resultLast = result[result.length - 1];
  if (!resultLast || Math.abs(resultLast.x - last.x) > 1e-6 || Math.abs(resultLast.z - last.z) > 1e-6) {
    result.push(last);
  }
  
  return result;
}

// ============================================================================
// CHAIKIN CORNER-CUTTING SMOOTHING
// ============================================================================

/**
 * Chaikin corner-cutting smoothing.
 * 
 * Each iteration replaces each edge with two new edges at 1/4 and 3/4 positions.
 * This rounds sharp corners while approximately preserving the curve shape.
 * 
 * @param points - Input polyline
 * @param iterations - Number of smoothing passes (default: 2)
 * @param preserveEnds - Number of points at each end to preserve (default: 1)
 * @returns Smoothed polyline
 */
function chaikinSmooth(points: Point2D[], iterations: number = 4, preserveEnds: number = 1): Point2D[] {
  if (points.length <= 2) return [...points];
  
  let current = [...points];
  
  for (let iter = 0; iter < iterations; iter++) {
    if (current.length <= 2) break;
    
    const smoothed: Point2D[] = [];
    
    // Always preserve the first point (endpoint/junction)
    smoothed.push(current[0]);
    
    // Smooth ALL intermediate edges (only skip first and last point)
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      
      // Skip the very first edge's first subdivision (we already added point 0)
      if (i > 0) {
        smoothed.push({
          x: 0.75 * p0.x + 0.25 * p1.x,
          z: 0.75 * p0.z + 0.25 * p1.z,
        });
      }
      
      // Skip the very last edge's second subdivision (we'll add the last point after)
      if (i < current.length - 2) {
        smoothed.push({
          x: 0.25 * p0.x + 0.75 * p1.x,
          z: 0.25 * p0.z + 0.75 * p1.z,
        });
      }
    }
    
    // Always preserve the last point (endpoint/junction)
    smoothed.push(current[current.length - 1]);
    
    current = smoothed;
  }
  
  return current;
}

// ============================================================================
// WALL DISTANCE ENFORCEMENT (Constrained Smoothing Method)
// ============================================================================

/** Clearance state for debug visualization */
export type ClearanceState = 'safe' | 'marginal' | 'violation';

/** Point with clearance state for debug coloring */
export interface ClearancePoint extends Point2D {
  /** Clearance state AFTER final constraint (for final visualization) */
  clearanceState?: ClearanceState;
  /** Distance value at this point (fine grid units) */
  distanceValue?: number;
}

/**
 * Sample the distance-to-wall value at a world position from the fine grid.
 * Uses nearest-cell lookup.
 * 
 * @param p - Point in world space
 * @param distField - Distance field from medial axis computation
 * @returns Distance value (in fine cell units), or 0 if out of bounds/not walkable
 */
function sampleDistance(p: Point2D, distField: DistanceField): number {
  const fx = Math.floor(p.x / distField.fineCellSize);
  const fz = Math.floor(p.z / distField.fineCellSize);
  
  if (fz < 0 || fz >= distField.fineHeight || fx < 0 || fx >= distField.fineWidth) {
    return 0;
  }
  
  const cell = distField.fineGrid[fz]?.[fx];
  return cell?.walkable ? cell.distance : 0;
}

/**
 * Sample distance at fine grid coordinates (integer).
 */
function sampleDistanceAt(fx: number, fz: number, distField: DistanceField): number {
  if (fz < 0 || fz >= distField.fineHeight || fx < 0 || fx >= distField.fineWidth) {
    return 0;
  }
  const cell = distField.fineGrid[fz]?.[fx];
  return cell?.walkable ? cell.distance : 0;
}

/**
 * Calculate the minimum distance requirement based on animal radius.
 * 
 * @param animalRadius - Animal capsule radius in world units (default: 0.3)
 * @param marginWorld - Margin in world units (default: 0.1)
 * @param fineCellSize - Fine grid cell size in world units
 * @returns Minimum distance in fine grid units (Dmin)
 */
function calculateDmin(
  animalRadius: number,
  marginWorld: number,
  fineCellSize: number
): number {
  const requiredClearanceWorld = animalRadius + marginWorld;
  // Convert world units to fine grid units and round up
  return Math.ceil(requiredClearanceWorld / fineCellSize);
}

/**
 * Get clearance state for a point based on its distance value.
 */
function getClearanceState(distance: number, dMin: number): ClearanceState {
  if (distance < dMin) return 'violation';
  if (distance < dMin + 1) return 'marginal';
  return 'safe';
}

/**
 * Estimate the gradient of the distance field at a point using finite differences.
 * 
 * @param p - Point in world space
 * @param distField - Distance field
 * @returns Normalized gradient vector in world space, or null if gradient is ~zero
 */
function estimateDistanceGradient(
  p: Point2D,
  distField: DistanceField
): Point2D | null {
  const fx = Math.floor(p.x / distField.fineCellSize);
  const fz = Math.floor(p.z / distField.fineCellSize);
  
  // Sample distance at neighboring cells for gradient estimation
  const dxPlus = sampleDistanceAt(fx + 1, fz, distField);
  const dxMinus = sampleDistanceAt(fx - 1, fz, distField);
  const dzPlus = sampleDistanceAt(fx, fz + 1, distField);
  const dzMinus = sampleDistanceAt(fx, fz - 1, distField);
  
  // Finite difference gradient (in fine grid coordinates)
  const gx = dxPlus - dxMinus;
  const gz = dzPlus - dzMinus;
  
  const magnitude = Math.sqrt(gx * gx + gz * gz);
  
  // If gradient is too small, can't determine direction
  if (magnitude < 0.01) {
    return null;
  }
  
  // Normalize and convert to world space direction
  return {
    x: gx / magnitude,
    z: gz / magnitude,
  };
}

/**
 * Apply a single constraint step: if D(p) < Dmin, do gradient ascent steps.
 * 
 * @param p - Current point position
 * @param dMin - Minimum required distance (fine grid units)
 * @param distField - Distance field
 * @param maxSteps - Maximum gradient ascent steps (default: 6)
 * @param stepWorld - Step size in world units
 * @returns Constrained point position
 */
function constraintStep(
  p: Point2D,
  dMin: number,
  distField: DistanceField,
  maxSteps: number,
  stepWorld: number
): Point2D {
  let current = { ...p };
  let currentDist = sampleDistance(current, distField);
  
  if (currentDist >= dMin) {
    return current; // Already safe
  }
  
  for (let step = 0; step < maxSteps; step++) {
    const gradient = estimateDistanceGradient(current, distField);
    
    if (!gradient) {
      break; // Can't determine gradient direction
    }
    
    // Move in gradient direction
    const next = {
      x: current.x + stepWorld * gradient.x,
      z: current.z + stepWorld * gradient.z,
    };
    
    const nextDist = sampleDistance(next, distField);
    
    // Stop if not making progress
    if (nextDist <= currentDist) {
      break;
    }
    
    current = next;
    currentDist = nextDist;
    
    // Stop once we've reached safe clearance
    if (currentDist >= dMin) {
      break;
    }
  }
  
  return current;
}

/**
 * Enforce wall clearance using CONSTRAINED SMOOTHING.
 * 
 * This method alternates between:
 * 1. Laplacian smoothing (averaging neighbors)
 * 2. Gradient-ascent constraint (pushing toward higher distance)
 * 
 * The combination produces a smooth curve that maintains wall clearance.
 * After the outer loop, we resample to restore uniform density.
 * 
 * @param points - Input polyline
 * @param distField - Distance field for clearance lookup
 * @param animalRadius - Animal capsule radius in world units
 * @param marginWorld - Safety margin in world units
 * @param outerIterations - Number of smooth+constraint iterations (default: 8)
 * @param lambda - Laplacian smoothing strength (default: 0.3)
 * @param constraintSteps - Gradient ascent steps per constraint (default: 6)
 * @param resampleSpacing - Final resampling spacing in world units (default: 0.1)
 * @returns Points with clearance state for debug visualization
 */
function enforceWallClearanceConstrained(
  points: Point2D[],
  distField: DistanceField,
  animalRadius: number = 0.3,
  marginWorld: number = 0.1,
  outerIterations: number = 8,
  lambda: number = 0.3,
  constraintSteps: number = 6,
  resampleSpacing: number = 0.1
): ClearancePoint[] {
  if (points.length < 3) {
    // Too few points to smooth
    const dMin = calculateDmin(animalRadius, marginWorld, distField.fineCellSize);
    return points.map(p => {
      const dist = sampleDistance(p, distField);
      return {
        ...p,
        clearanceState: getClearanceState(dist, dMin),
        distanceValue: dist,
      };
    });
  }
  
  const dMin = calculateDmin(animalRadius, marginWorld, distField.fineCellSize);
  const stepWorld = 0.25 * distField.fineCellSize;
  
  // Working copy of points
  let current: Point2D[] = points.map(p => ({ ...p }));
  
  // Store original endpoints (fixed positions)
  const firstPoint = { ...current[0] };
  const lastPoint = { ...current[current.length - 1] };
  
  // Outer loop: alternate smoothing and constraint
  for (let iter = 0; iter < outerIterations; iter++) {
    // For each interior point (exclude endpoints)
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const curr = current[i];
      const next = current[i + 1];
      
      // Step a: Laplacian smoothing
      // p = p + lambda * (midpoint - p)
      const midX = 0.5 * (prev.x + next.x);
      const midZ = 0.5 * (prev.z + next.z);
      const smoothed = {
        x: curr.x + lambda * (midX - curr.x),
        z: curr.z + lambda * (midZ - curr.z),
      };
      
      // Step b: Constraint step (gradient ascent if below Dmin)
      const constrained = constraintStep(smoothed, dMin, distField, constraintSteps, stepWorld);
      
      current[i] = constrained;
    }
    
    // Restore endpoints (keep them fixed)
    current[0] = { ...firstPoint };
    current[current.length - 1] = { ...lastPoint };
  }
  
  // Resample at fixed spacing to restore uniform density
  if (resampleSpacing > 0 && current.length >= 2) {
    current = resampleLinear(current, resampleSpacing);
    
    // Ensure endpoints are exact
    if (current.length > 0) {
      current[0] = { ...firstPoint };
      current[current.length - 1] = { ...lastPoint };
    }
  }
  
  // Add clearance state for debug visualization (FINAL state after constraint)
  return current.map(p => {
    const dist = sampleDistance(p, distField);
    return {
      ...p,
      clearanceState: getClearanceState(dist, dMin),
      distanceValue: dist,
    };
  });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process skeleton pixels into smooth polylines.
 * 
 * @param fineGrid - The fine grid with isSkeleton flags
 * @param fineWidth - Grid width
 * @param fineHeight - Grid height
 * @param fineCellSize - Size of each fine cell in world units
 * @param config - Optional processing configuration
 * @returns PolylineGraph with smoothed segments
 */
export function buildSmoothedPolylines(
  fineGrid: Array<Array<{ isSkeleton: boolean; isSpur?: boolean; distance?: number; walkable?: boolean }>>,
  fineWidth: number,
  fineHeight: number,
  fineCellSize: number,
  config?: Partial<PolylineConfig>,
  distanceField?: DistanceField
): PolylineGraph {
  // fineCellSize is the size of each fine grid cell (~0.033 world units)
  // We need RDP epsilon relative to CORRIDOR width, not fine cell size
  // Corridor width is ~2.0 world units, so scale = 20 means fineCellSize * scale ≈ cellSize
  // Use a fraction of corridor width for meaningful simplification
  const cellSize = fineCellSize * 20; // Approximate original cell size (0.667)
  const corridorWidth = cellSize * 3; // ~2.0 world units
  const scale = 20; // Fine cells per maze cell
  
  // Default configuration
  // KEY INSIGHT: We need aggressive RDP first to get corner points,
  // then Chaikin rounds those corners, then Catmull-Rom makes it smooth
  const cfg: PolylineConfig = {
    // RDP epsilon: 15% of corridor width to extract true corner points
    rdpEpsilon: config?.rdpEpsilon ?? (0.15 * corridorWidth), // ~0.3 world units
    chaikinIterations: config?.chaikinIterations ?? 4, // 4 iterations for good rounding
    preserveEndpoints: config?.preserveEndpoints ?? 1,
    resampleSpacing: config?.resampleSpacing ?? (0.05 * corridorWidth), // ~0.1 world units
    useCatmullRom: config?.useCatmullRom ?? true,
    catmullRomSamplesPerPoint: config?.catmullRomSamplesPerPoint ?? 8,
    enforceWallClearance: config?.enforceWallClearance ?? true,
    animalRadius: config?.animalRadius ?? 0.3, // Player capsule radius
    marginFactor: config?.marginFactor ?? 0.35, // 35% of cell size margin (increased from 15%)
    cellSize: config?.cellSize ?? cellSize, // Maze cell size
  };
  
  // Build distance field if not provided but we need clearance enforcement
  const effectiveDistField: DistanceField | undefined = distanceField ?? (
    cfg.enforceWallClearance ? {
      fineGrid: fineGrid as Array<Array<{ distance: number; walkable: boolean }>>,
      fineWidth,
      fineHeight,
      fineCellSize,
    } : undefined
  );
  
  // Step 1: Build skeleton graph
  const graph = buildSkeletonGraph(fineGrid, fineWidth, fineHeight);
  
  // Step 2: Extract polyline segments
  const { segments: rawSegments, junctions, endpoints } = extractPolylineSegments(graph, fineCellSize);
  
  // Steps 3, 4, 5, 6: Simplify, smooth, resample, and enforce clearance
  const smoothedSegments: PolylineSegment[] = rawSegments.map(segment => {
    // Step 3: RDP simplification - AGGRESSIVE to get corner structure
    // This removes the micro-zigzags and leaves only true corners
    let points: Point2D[] = cfg.rdpEpsilon > 0 
      ? rdpSimplify(segment.points, cfg.rdpEpsilon)
      : [...segment.points];
    
    // Step 4: Chaikin smoothing - rounds the sharp corners
    points = chaikinSmooth(points, cfg.chaikinIterations, cfg.preserveEndpoints);
    
    // Step 5: Catmull-Rom resampling - creates smooth interpolated curve
    if (cfg.useCatmullRom && points.length >= 2) {
      points = resampleCatmullRom(points, cfg.catmullRomSamplesPerPoint);
    } else if (cfg.resampleSpacing > 0) {
      points = resampleLinear(points, cfg.resampleSpacing);
    }
    
    // Step 6: Wall clearance enforcement via CONSTRAINED SMOOTHING
    // Alternates Laplacian smoothing with gradient-ascent constraint steps
    // Then resamples to restore uniform density
    if (cfg.enforceWallClearance && effectiveDistField) {
      const marginWorld = cfg.marginFactor * cfg.cellSize;
      const clearancePoints = enforceWallClearanceConstrained(
        points,
        effectiveDistField,
        cfg.animalRadius,
        marginWorld,
        12,  // outerIterations (increased from 8 for tighter corners)
        0.25, // lambda (reduced from 0.3 to let constraint dominate)
        10,   // constraintSteps (increased from 6 for stronger push)
        cfg.resampleSpacing // resample spacing
      );
      points = clearancePoints;
    }
    
    return {
      ...segment,
      points,
    };
  });
  
  // Calculate Dmin for logging
  const marginWorld = cfg.marginFactor * cfg.cellSize;
  const dMin = cfg.enforceWallClearance && effectiveDistField
    ? calculateDmin(cfg.animalRadius, marginWorld, fineCellSize)
    : 0;
  const totalPoints = smoothedSegments.reduce((sum, s) => sum + s.points.length, 0);
  console.log(`[SkeletonPolyline] Built ${smoothedSegments.length} segments (${totalPoints} points), clearance=${cfg.enforceWallClearance ? 'ON' : 'OFF'}, Dmin=${dMin} (R=${cfg.animalRadius}, margin=${marginWorld.toFixed(3)})`);

  return {
    segments: smoothedSegments,
    junctions,
    endpoints,
  };
}

/**
 * Build raw (unsimplified, unsmoothed) polylines for comparison.
 */
export function buildRawPolylines(
  fineGrid: Array<Array<{ isSkeleton: boolean; isSpur?: boolean }>>,
  fineWidth: number,
  fineHeight: number,
  fineCellSize: number
): PolylineGraph {
  const graph = buildSkeletonGraph(fineGrid, fineWidth, fineHeight);
  const { segments, junctions, endpoints } = extractPolylineSegments(graph, fineCellSize);
  
  return { segments, junctions, endpoints };
}

/**
 * Build intermediate polylines (RDP only, no smoothing) for debug visualization.
 * Shows the simplified corner points before Chaikin smoothing.
 */
export function buildSmoothedControlPoints(
  fineGrid: Array<Array<{ isSkeleton: boolean; isSpur?: boolean }>>,
  fineWidth: number,
  fineHeight: number,
  fineCellSize: number,
  config?: Partial<PolylineConfig>
): PolylineGraph {
  // Use same scale-relative epsilon as main function
  const cellSize = fineCellSize * 20;
  const corridorWidth = cellSize * 3;
  const rdpEpsilon = config?.rdpEpsilon ?? (0.15 * corridorWidth);
  
  const graph = buildSkeletonGraph(fineGrid, fineWidth, fineHeight);
  const { segments: rawSegments, junctions, endpoints } = extractPolylineSegments(graph, fineCellSize);
  
  // Only apply RDP to show the corner structure
  const simplifiedSegments: PolylineSegment[] = rawSegments.map(segment => {
    const points = rdpEpsilon > 0 
      ? rdpSimplify(segment.points, rdpEpsilon)
      : [...segment.points];
    
    return { ...segment, points };
  });
  
  return { segments: simplifiedSegments, junctions, endpoints };
}
