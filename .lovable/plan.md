
# Fix Tangent Constraint: Clamp to Segment Instead of Infinite Line

## Problem

The current `constrainMovementToTangent` treats the tangent as an **infinite line**:

```typescript
// Current code (line 996-1000):
const dot = toFrontX * tx + toFrontZ * tz;  // UNCLAMPED - can be any value!
const projectedFrontX = spineX + dot * tx;  // Can project WAY off the segment
const projectedFrontZ = spineZ + dot * tz;
```

When the animal is off-axis, `dot` can be large, projecting the front point far along the corridor in either direction. This causes the animal to slide sideways into a wall before being pulled to the centerline.

```text
Wall ════════════════════════════════════════════

  n1 ●━━━━━━━━━━● S (spine) ━━━━━━━━━━● n2     ← actual segment (±5 steps)
                      │
                      │ tangent extends infinitely...
                      │
      P ●─────────────┘  ← projected point (way outside segment!)
        ↑
        │ offset pushes diagonally!
        │
        F (front point of animal)
```

## Solution

We already have the segment endpoints in `magnetismDebug.neighbor1X/Z` and `neighbor2X/Z`. We should:

1. Project the front point onto the **finite segment** between neighbor1 and neighbor2
2. Clamp the projection to stay within segment bounds
3. This keeps the animal within the local corridor section

### Implementation

**File: `src/game/CorridorMagnetism.ts`** (lines 986-1004)

Replace the infinite line projection with clamped segment projection:

```typescript
// Get segment endpoints from debug data (these are ±5 steps along skeleton)
const n1x = magnetismDebug.neighbor1X;
const n1z = magnetismDebug.neighbor1Z;
const n2x = magnetismDebug.neighbor2X;
const n2z = magnetismDebug.neighbor2Z;

// Segment vector (neighbor1 to neighbor2)
const segX = n2x - n1x;
const segZ = n2z - n1z;
const segLenSq = segX * segX + segZ * segZ;

// Early exit if segment is degenerate
if (segLenSq < 0.0001) {
  return { x: newX, z: newZ };
}

// Vector from segment start (neighbor1) to front point
const toFrontX = frontX - n1x;
const toFrontZ = frontZ - n1z;

// Project front onto segment: t = dot(toFront, seg) / |seg|²
// Clamp t to [0, 1] to stay within the segment
const t = Math.max(0, Math.min(1, (toFrontX * segX + toFrontZ * segZ) / segLenSq));

// Closest point on segment
const closestX = n1x + t * segX;
const closestZ = n1z + t * segZ;

// Offset to move front point onto the segment
const offsetX = closestX - frontX;
const offsetZ = closestZ - frontZ;
```

## Visual Result

```text
Wall ════════════════════════════════════════════

  n1 ●━━━━━━━━━━● S (spine) ━━━━━━━━━━● n2     ← segment
             ↑
             │ perpendicular pull (clamped to segment)
             │
             F (front point)

Result: Animal moves directly toward centerline within the local segment
```

## Why This Works

| Case | Before (infinite line) | After (clamped segment) |
|------|------------------------|-------------------------|
| Animal aligned with tangent | Projects correctly | Projects correctly |
| Animal off-axis, near segment | Projects off segment, diagonal push | Clamps to segment, perpendicular pull |
| Animal at curve entry | Can project into next corridor | Stays within current ±5 step window |

The clamping ensures the projection target is always within the local corridor section defined by the ±5 skeleton steps. This prevents the diagonal "slide into wall first" behavior.

## Files Modified

| File | Change |
|------|--------|
| `src/game/CorridorMagnetism.ts` | Replace infinite line projection (lines 986-1004) with clamped segment projection using neighbor1/neighbor2 endpoints |
