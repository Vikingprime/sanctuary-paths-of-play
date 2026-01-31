
# Smooth Curve Movement for Full Magnetism Lock

## Problem Analysis

When magnetism is at full strength (10), the animal's front point is locked to the tangent line through the nearest skeleton node. However, the skeleton is computed on a discrete 20x20 subcell grid, creating **stair-step patterns at curves** instead of smooth arcs.

The current tangent calculation uses `lookAhead = 1`, meaning it only looks at the immediate 8-connected neighbors. This causes the tangent direction to abruptly change at each skeleton node, following the jagged grid pattern.

```text
Current skeleton at a curve (discrete grid):
        . . . . . . 
        . . . . X X    <-- stair-step pattern
        . . . X X .
        . . X X . .
        X X X . . .
        X . . . . .
```

## Solution: Smooth Tangent via Extended Neighbor Walk

Increase the `lookAhead` parameter in `computeTangentExtended()` to walk further along the skeleton (e.g., 5-10 steps in each direction). This averages out the local stair-steps by computing the tangent from points further apart, creating a smoother effective curve.

```text
With lookAhead = 5:
        Start point (5 steps back) ─────────► End point (5 steps ahead)
                                   ↑
                       Tangent computed from these distant points
```

### Why This Works

Instead of computing direction from immediate neighbors (which are offset by single grid cells), we compute direction from points 5-10 steps apart. The stair-stepping between individual nodes is averaged out in the final direction vector.

## Implementation

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Increase lookAhead for tangent calculation (line ~601)**
```typescript
// Current:
const tangent = computeTangentExtended(nearest, cache, 1);

// New:
const tangent = computeTangentExtended(nearest, cache, 5);
```

This single-line change walks 5 steps in each direction along the skeleton (total span of ~10 skeleton nodes), smoothing out short-range stair-stepping while still responding to actual corridor direction changes.

### Additional Enhancement: Configurable lookAhead

Add a `tangentLookAhead` parameter to `MagnetismConfig` so this can be tuned via the debug UI:

```typescript
// In MagnetismConfig interface:
tangentLookAhead: number;  // Steps to walk for tangent smoothing (1-10)

// In DEFAULT_MAGNETISM_CONFIG:
tangentLookAhead: 5,

// At call site:
const tangent = computeTangentExtended(nearest, cache, config.tangentLookAhead);
```

## Expected Behavior

| LookAhead | Movement Character |
|-----------|-------------------|
| 1 | Jagged - follows every stair-step in skeleton |
| 3 | Slightly smoother - minor jitter on tight curves |
| 5 | Smooth curves - good balance of responsiveness and smoothness |
| 10 | Very smooth - may feel sluggish to respond to direction changes |

## Technical Details

- At scale 20, each skeleton node is 0.0333 world units apart
- With `lookAhead = 5`, tangent spans ~0.33 world units (half a maze cell)
- This is enough to smooth out 45° stair-steps while still responding to actual corridor bends

## Alternative Approach (Not Recommended for Initial Fix)

A more complex solution would be to compute **spline interpolation** through the skeleton points, generating actual smooth curves. This would require:
- Catmull-Rom or Bezier spline fitting
- Storing smoothed positions as a separate data structure
- Finding nearest point on the curve (more complex than grid lookup)

The `lookAhead` increase achieves similar results with minimal code change.

## Summary

1. Change `lookAhead` from 1 to 5 in the tangent calculation call
2. Optionally add `tangentLookAhead` to config for debug tuning
3. Test full lock movement on curved corridors
