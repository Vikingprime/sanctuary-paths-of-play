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
  /** Epsilon for RDP simplification (world units, default: 0.1 * fineCellSize) */
  rdpEpsilon: number;
  /** Number of Chaikin smoothing iterations (default: 2) */
  chaikinIterations: number;
  /** Preserve N points at each end of segment from smoothing (default: 1) */
  preserveEndpoints: number;
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
function chaikinSmooth(points: Point2D[], iterations: number = 2, preserveEnds: number = 1): Point2D[] {
  if (points.length <= 2) return [...points];
  
  let current = [...points];
  
  for (let iter = 0; iter < iterations; iter++) {
    if (current.length <= 2) break;
    
    const smoothed: Point2D[] = [];
    
    // Preserve start points
    for (let i = 0; i < Math.min(preserveEnds, current.length); i++) {
      smoothed.push(current[i]);
    }
    
    // Smooth the middle section
    const startIdx = preserveEnds;
    const endIdx = current.length - preserveEnds;
    
    for (let i = startIdx; i < endIdx - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      
      // Generate two points at 1/4 and 3/4 positions
      smoothed.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        z: 0.75 * p0.z + 0.25 * p1.z,
      });
      smoothed.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        z: 0.25 * p0.z + 0.75 * p1.z,
      });
    }
    
    // Preserve end points
    for (let i = Math.max(0, current.length - preserveEnds); i < current.length; i++) {
      smoothed.push(current[i]);
    }
    
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
  // Default configuration
  const cfg: PolylineConfig = {
    rdpEpsilon: config?.rdpEpsilon ?? (0.1 * fineCellSize),
    chaikinIterations: config?.chaikinIterations ?? 2,
    preserveEndpoints: config?.preserveEndpoints ?? 1,
  };
  
  // Step 1: Build skeleton graph
  const graph = buildSkeletonGraph(fineGrid, fineWidth, fineHeight);
  
  // Step 2: Extract polyline segments
  const { segments: rawSegments, junctions, endpoints } = extractPolylineSegments(graph, fineCellSize);
  
  // Steps 3 & 4: Simplify and smooth each segment
  const smoothedSegments: PolylineSegment[] = rawSegments.map(segment => {
    // RDP simplification
    let points = rdpSimplify(segment.points, cfg.rdpEpsilon);
    
    // Chaikin smoothing
    points = chaikinSmooth(points, cfg.chaikinIterations, cfg.preserveEndpoints);
    
    return {
      ...segment,
      points,
    };
  });
  
  console.log(`[SkeletonPolyline] Built ${smoothedSegments.length} segments, ${junctions.length} junctions, ${endpoints.length} endpoints`);
  
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
