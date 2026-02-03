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

/** Connection from a junction to a segment */
export interface JunctionConnection {
  /** Index of the connected segment in PolylineGraph.segments */
  segmentIndex: number;
  /** True if segment.points[0] connects to this junction, false if segment.points[last] does */
  atStart: boolean;
}

/** A junction point with its connected segments */
export interface Junction extends Point2D {
  /** Segments that connect to this junction */
  connections: JunctionConnection[];
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
  /** Junction points (degree >= 3) with connectivity info */
  junctions: Junction[];
  /** Endpoint positions (degree 1) */
  endpoints: Point2D[];
}

/** Configuration for polyline processing */
export interface PolylineConfig {
  /** Epsilon for RDP simplification (world units, default: 0.02 * fineCellSize). Set to 0 to disable. */
  rdpEpsilon: number;
  /** Number of Chaikin smoothing iterations for straight sections (default: 1) */
  chaikinIterations: number;
  /** Number of additional Chaikin iterations for corner regions (default: 0) */
  chaikinCornerExtraIterations: number;
  /** Preserve N points at each end of segment from smoothing (default: 1) */
  preserveEndpoints: number;
  /** Resample spacing after smoothing (world units, 0 = disable, default: 0.1 * fineCellSize) */
  resampleSpacing: number;
  /** Use Catmull-Rom spline resampling instead of linear (default: true) */
  useCatmullRom: boolean;
  /** Number of samples per original point for Catmull-Rom (default: 10) */
  catmullRomSamplesPerPoint: number;
  /** Push corners away from walls by this magnitude (absolute value used, default: 0) */
  cornerPushStrength: number;
  /** Optional function to check if a world position is a wall (for wall-aware corner push) */
  isWallFn?: (x: number, z: number) => boolean;
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
): { segments: PolylineSegment[]; junctions: Junction[]; endpoints: Point2D[] } {
  const segments: PolylineSegment[] = [];
  const visitedEdges = new Set<string>();
  
  const junctions: Junction[] = [];
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
      const pt = toWorld(node.fx, node.fy);
      junctions.push({ x: pt.x, z: pt.z, connections: [] });
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
  // NOTE: Junction connectivity will be computed AFTER smoothing in buildSmoothedPolylines
  // This ensures segment endpoints match the final smoothed path positions
  
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
// CORNER DETECTION AND PUSHING
// ============================================================================

/**
 * Detect corner points in a polyline by measuring angle change.
 * Returns an array of booleans indicating which points are corners.
 */
function detectCorners(points: Point2D[], angleThreshold: number = Math.PI / 4): boolean[] {
  const isCorner: boolean[] = new Array(points.length).fill(false);
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Direction vectors
    const dx1 = curr.x - prev.x;
    const dz1 = curr.z - prev.z;
    const dx2 = next.x - curr.x;
    const dz2 = next.z - curr.z;
    
    const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
    const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
    
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    
    // Dot product to find angle
    const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    // Mark as corner if angle exceeds threshold (deviation from straight)
    if (angle > angleThreshold) {
      isCorner[i] = true;
      // Also mark neighbors for smoother transition
      if (i > 0) isCorner[i - 1] = true;
      if (i < points.length - 1) isCorner[i + 1] = true;
    }
  }
  
  return isCorner;
}

/**
 * Inflate corner regions by pushing points outward along their local curve normals.
 * Positive strength inflates outward (away from turn center).
 * Negative strength deflates inward (toward turn center).
 * 
 * Unlike a simple shift, this makes corners rounder/bulge rather than translate.
 */
function pushCornersInward(
  points: Point2D[],
  strength: number,
  isWallFn?: (x: number, z: number) => boolean
): Point2D[] {
  if (points.length < 3 || strength === 0) return [...points];
  
  const INFLUENCE_RADIUS = 4; // Points on each side of corner apex to affect
  
  // First pass: identify corner apexes and their sharpness
  interface CornerApex {
    index: number;
    angle: number; // Sharpness of the turn (0 = straight, PI = 180 degree turn)
    // Direction the corner "opens" toward (outward normal at apex)
    outwardX: number;
    outwardZ: number;
  }
  const corners: CornerApex[] = [];
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Direction vectors
    const dx1 = curr.x - prev.x;
    const dz1 = curr.z - prev.z;
    const dx2 = next.x - curr.x;
    const dz2 = next.z - curr.z;
    
    const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
    const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
    
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    
    // Normalized direction vectors
    const nx1 = dx1 / len1;
    const nz1 = dz1 / len1;
    const nx2 = dx2 / len2;
    const nz2 = dz2 / len2;
    
    // Angle at this corner
    const dot = nx1 * nx2 + nz1 * nz2;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    // Only consider significant turns (> 20 degrees)
    if (angle < Math.PI / 9) continue;
    
    // Bisector direction points INWARD (toward center of turn)
    // We want OUTWARD for inflation, so negate
    const bisectX = (nx1 + nx2); // Outward direction
    const bisectZ = (nz1 + nz2);
    const bisectLen = Math.sqrt(bisectX * bisectX + bisectZ * bisectZ);
    
    if (bisectLen < 1e-6) continue;
    
    corners.push({
      index: i,
      angle,
      outwardX: bisectX / bisectLen,
      outwardZ: bisectZ / bisectLen,
    });
  }
  
  // Second pass: for each point, calculate its inflation offset
  // Each point pushes along its LOCAL normal, not the corner's normal
  const offsets: Array<{ dx: number; dz: number }> = points.map(() => ({ dx: 0, dz: 0 }));
  
  for (const corner of corners) {
    const angleFactor = corner.angle / Math.PI; // 0-1 based on sharpness
    
    // Affect points within INFLUENCE_RADIUS of the corner apex
    for (let d = -INFLUENCE_RADIUS; d <= INFLUENCE_RADIUS; d++) {
      const idx = corner.index + d;
      if (idx <= 0 || idx >= points.length - 1) continue; // Skip endpoints
      
      // Calculate local curve normal at this point
      const prev = points[idx - 1];
      const curr = points[idx];
      const next = points[idx + 1];
      
      // Tangent direction (average of incoming and outgoing)
      const tx = (next.x - prev.x);
      const tz = (next.z - prev.z);
      const tLen = Math.sqrt(tx * tx + tz * tz);
      if (tLen < 1e-6) continue;
      
      // Normal is perpendicular to tangent (rotate 90 degrees)
      // Choose the direction that aligns with the corner's outward direction
      let normalX = -tz / tLen;
      let normalZ = tx / tLen;
      
      // Flip normal if it points opposite to corner's outward direction
      const dotWithCorner = normalX * corner.outwardX + normalZ * corner.outwardZ;
      if (dotWithCorner < 0) {
        normalX = -normalX;
        normalZ = -normalZ;
      }
      
      // Falloff: strongest at apex, weaker toward edges
      const distFromApex = Math.abs(d);
      const falloff = 1 - (distFromApex / (INFLUENCE_RADIUS + 1));
      
      // Push magnitude
      const pushMag = strength * angleFactor * falloff;
      
      // Accumulate offset
      offsets[idx].dx += normalX * pushMag;
      offsets[idx].dz += normalZ * pushMag;
    }
  }
  
  // Optional: validate pushes won't go into walls
  if (isWallFn) {
    for (let i = 1; i < points.length - 1; i++) {
      const pushedX = points[i].x + offsets[i].dx;
      const pushedZ = points[i].z + offsets[i].dz;
      if (isWallFn(pushedX, pushedZ)) {
        // Reduce push to avoid wall collision
        offsets[i].dx *= 0.2;
        offsets[i].dz *= 0.2;
      }
    }
  }
  
  // Apply offsets
  const result: Point2D[] = points.map((p, i) => ({
    x: p.x + offsets[i].dx,
    z: p.z + offsets[i].dz,
  }));
  
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
  fineGrid: Array<Array<{ isSkeleton: boolean; isSpur?: boolean }>>,
  fineWidth: number,
  fineHeight: number,
  fineCellSize: number,
  config?: Partial<PolylineConfig>
): PolylineGraph {
  // fineCellSize is the size of each fine grid cell (~0.033 world units)
  // We need RDP epsilon relative to CORRIDOR width, not fine cell size
  // Corridor width is ~2.0 world units, so scale = 20 means fineCellSize * scale ≈ cellSize
  // Use a fraction of corridor width for meaningful simplification
  const cellSize = fineCellSize * 20; // Approximate original cell size (0.667)
  const corridorWidth = cellSize * 3; // ~2.0 world units
  
  // Default configuration
  // KEY INSIGHT: We need aggressive RDP first to get corner points,
  // then Chaikin rounds those corners, then Catmull-Rom makes it smooth
  const cfg: PolylineConfig = {
    // RDP epsilon: 15% of corridor width to extract true corner points
    rdpEpsilon: config?.rdpEpsilon ?? (0.15 * corridorWidth), // ~0.3 world units
    chaikinIterations: config?.chaikinIterations ?? 1, // DEFAULT 1 iteration for minimal rounding
    chaikinCornerExtraIterations: config?.chaikinCornerExtraIterations ?? 0, // No extra iterations
    preserveEndpoints: config?.preserveEndpoints ?? 1,
    resampleSpacing: config?.resampleSpacing ?? (0.05 * corridorWidth), // ~0.1 world units
    useCatmullRom: config?.useCatmullRom ?? true,
    catmullRomSamplesPerPoint: config?.catmullRomSamplesPerPoint ?? 8,
    cornerPushStrength: config?.cornerPushStrength ?? 0, // No push by default
    isWallFn: config?.isWallFn, // Optional wall check function
  };
  
  // Step 1: Build skeleton graph
  const graph = buildSkeletonGraph(fineGrid, fineWidth, fineHeight);
  
  // Step 2: Extract polyline segments
  const { segments: rawSegments, junctions, endpoints } = extractPolylineSegments(graph, fineCellSize);
  
  // Steps 3, 4, 5, 6: Simplify, push corners, smooth, and resample each segment
  const smoothedSegments: PolylineSegment[] = rawSegments.map(segment => {
    // Step 3: RDP simplification - AGGRESSIVE to get corner structure
    // This removes the micro-zigzags and leaves only true corners
    let points = cfg.rdpEpsilon > 0 
      ? rdpSimplify(segment.points, cfg.rdpEpsilon)
      : [...segment.points];
    
    // Step 4: Push corner points away from walls (wall-aware)
    // Each corner independently determines push direction based on wall proximity
    if (cfg.cornerPushStrength !== 0) {
      points = pushCornersInward(points, cfg.cornerPushStrength * corridorWidth, cfg.isWallFn);
    }
    
    // Step 5: Base Chaikin smoothing - rounds all corners
    const totalIterations = cfg.chaikinIterations + cfg.chaikinCornerExtraIterations;
    points = chaikinSmooth(points, totalIterations, cfg.preserveEndpoints);
    
    // Step 6: Catmull-Rom resampling - creates smooth interpolated curve
    if (cfg.useCatmullRom && points.length >= 2) {
      points = resampleCatmullRom(points, cfg.catmullRomSamplesPerPoint);
    } else if (cfg.resampleSpacing > 0) {
      points = resampleLinear(points, cfg.resampleSpacing);
    }
    
    return {
      ...segment,
      points,
    };
  });
  
  // CRITICAL: Re-compute junction connectivity using SMOOTHED segment endpoints
  // The raw junctions have correct positions, but connectivity must match smoothed paths
  const JUNCTION_MATCH_THRESHOLD_SQ = 0.3 * 0.3; // Slightly larger for smoothed paths
  for (const junction of junctions) {
    junction.connections = []; // Clear old connectivity from raw segments
    for (let segIdx = 0; segIdx < smoothedSegments.length; segIdx++) {
      const seg = smoothedSegments[segIdx];
      if (seg.points.length < 2) continue;
      
      const firstPt = seg.points[0];
      const lastPt = seg.points[seg.points.length - 1];
      
      const firstDistSq = (firstPt.x - junction.x) ** 2 + (firstPt.z - junction.z) ** 2;
      const lastDistSq = (lastPt.x - junction.x) ** 2 + (lastPt.z - junction.z) ** 2;
      
      // Only add the closer endpoint to prevent double-counting
      if (firstDistSq < JUNCTION_MATCH_THRESHOLD_SQ && firstDistSq <= lastDistSq) {
        junction.connections.push({ segmentIndex: segIdx, atStart: true });
      } else if (lastDistSq < JUNCTION_MATCH_THRESHOLD_SQ) {
        junction.connections.push({ segmentIndex: segIdx, atStart: false });
      }
    }
  }
  
  const totalPoints = smoothedSegments.reduce((sum, s) => sum + s.points.length, 0);
  console.log(`[SkeletonPolyline] Built ${smoothedSegments.length} segments (${totalPoints} total points), Chaikin=${cfg.chaikinIterations}+${cfg.chaikinCornerExtraIterations}, cornerPush=${cfg.cornerPushStrength.toFixed(2)}`);
  
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
