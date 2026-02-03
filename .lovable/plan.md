
# Plan: Fix Duplicate Rail Direction Buttons

## Problem Analysis

The Rail mode shows too many direction buttons because the `findAvailableDirections` function has a fundamental architectural flaw in how it identifies connected paths at junctions.

### Root Causes

1. **Distance-based matching is unreliable**: The current code loops through ALL segments in the polyline graph and checks if their first/last point is within 0.5 units of the current junction. This creates duplicates when:
   - Multiple segments have endpoints that overlap near the same junction
   - The same segment gets matched twice (once for its start, once for its end) at U-shaped paths

2. **Junction topology isn't stored**: The `PolylineGraph` has `junctions` and `segments` arrays, but there's no direct mapping between them (e.g., "junction #3 connects to segments #1, #5, #7"). The code reconstructs this relationship via distance checks every frame.

3. **Non-functional buttons**: When the animal is very close to a junction, the generated `pathPoints` array may be extremely short (1-2 points), causing the movement loop to complete instantly without visible movement.

---

## Solution

### 1. Store Junction-to-Segment Connectivity in the Graph

Modify `SkeletonPolyline.ts` to compute and store which segment indices connect to each junction during graph construction:

```text
interface Junction extends Point2D {
  connectedSegments: Array<{
    segmentIndex: number;
    atStart: boolean; // true if segment.points[0] is at this junction
  }>;
}
```

This eliminates the need for distance-based matching at runtime.

### 2. Rewrite Junction Direction Finding

Replace the current "loop all segments, check distance" logic with a direct lookup:

```text
if (position.atJunction) {
  const junction = findNearestJunction(position, cache);
  for (const conn of junction.connectedSegments) {
    const segment = polylineGraph.segments[conn.segmentIndex];
    // If segment starts at this junction, direction goes toward last point
    // If segment ends at this junction, direction goes toward first point
    const points = conn.atStart ? segment.points : [...segment.points].reverse();
    // Calculate angle from first few points...
  }
}
```

### 3. Ensure Path Points Are Valid

Add validation to ensure `pathPoints` has sufficient points for actual movement:

```text
// Only add direction if path has meaningful length
const pathLength = calculatePathLength(pathPoints);
if (pathLength > 0.3) { // At least 0.3 world units of travel
  rawDirections.push(...);
}
```

### 4. Deduplicate at the Source (Not as Post-Processing)

Instead of generating duplicates then filtering, prevent duplicates by:
- Using a `Set<number>` to track which segment indices have already been processed
- Ensuring each segment contributes exactly one direction per connected endpoint

---

## Implementation Steps

1. **Modify `src/game/SkeletonPolyline.ts`**:
   - Update `PolylineGraph` interface to include junction connectivity
   - Modify `extractPolylineSegments` to compute and store which segments connect to which junctions
   - Export this enhanced junction data

2. **Rewrite `findAvailableDirections` in `src/components/RailControls.tsx`**:
   - At junctions: Use the new `junction.connectedSegments` array directly
   - On segments: Keep existing forward/backward logic (this part works correctly)
   - Remove the angle-based deduplication (no longer needed)

3. **Add path length validation**:
   - Calculate total path distance before adding a direction
   - Filter out paths shorter than a minimum threshold (0.3 units)

4. **Fix "non-functional button" issue**:
   - Ensure path always starts with current position, not junction center
   - Validate that path has at least 3 points before enabling the button

---

## Technical Details

### Updated PolylineGraph Interface

```typescript
interface JunctionConnection {
  segmentIndex: number;
  atStart: boolean; // true = segment.points[0] connects here
}

interface Junction extends Point2D {
  connections: JunctionConnection[];
}

interface PolylineGraph {
  segments: PolylineSegment[];
  junctions: Junction[];  // Now with connections
  endpoints: Point2D[];
}
```

### Junction Connectivity Computation (in extractPolylineSegments)

```typescript
// After creating all segments, compute junction connections
for (const junction of junctions) {
  junction.connections = [];
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const firstPt = seg.points[0];
    const lastPt = seg.points[seg.points.length - 1];
    
    const firstDist = distance(firstPt, junction);
    const lastDist = distance(lastPt, junction);
    
    if (firstDist < 0.1) {
      junction.connections.push({ segmentIndex: segIdx, atStart: true });
    } else if (lastDist < 0.1) {
      junction.connections.push({ segmentIndex: segIdx, atStart: false });
    }
  }
}
```

### Rewritten findAvailableDirections (junction case)

```typescript
if (position.atJunction && junction) {
  const processedSegments = new Set<number>();
  
  for (const conn of junction.connections) {
    if (processedSegments.has(conn.segmentIndex)) continue;
    processedSegments.add(conn.segmentIndex);
    
    const seg = polylineGraph.segments[conn.segmentIndex];
    const points = conn.atStart ? seg.points : [...seg.points].reverse();
    
    // Calculate direction from first few points
    const lookAheadPt = points[Math.min(10, points.length - 1)];
    const angle = Math.atan2(
      lookAheadPt.x - junction.x,
      lookAheadPt.z - junction.z
    );
    
    // Build path starting from current position
    const pathPoints = [
      { x: position.x, z: position.z },
      ...points
    ];
    
    rawDirections.push({
      angle,
      targetX: points[points.length - 1].x,
      targetZ: points[points.length - 1].z,
      pathPoints,
      // ...
    });
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/game/SkeletonPolyline.ts` | Add `Junction` interface with `connections`, update `extractPolylineSegments` to populate it |
| `src/components/RailControls.tsx` | Rewrite `findAvailableDirections` to use junction connectivity, remove angle-based deduplication |

---

## Expected Outcome

- At a 3-way junction: exactly 3 direction buttons
- At a 4-way junction: exactly 4 direction buttons
- On a corridor (not at junction): exactly 2 buttons (forward/backward)
- All buttons trigger movement immediately (no "turn only" behavior)
- Arrows point in the actual direction of each path

