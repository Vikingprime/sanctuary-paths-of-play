

# Fix: Smooth Tangent Calculation to Eliminate Corner Vibrations

## Problem Analysis

The magnetism system experiences vibrations at corners because:

1. **Discrete skeleton grid**: The medial axis is computed on a 20x20 subcell grid, creating "stair-step" patterns at turns (e.g., a 90-degree corner becomes a series of diagonal steps rather than a smooth curve)

2. **Raw endpoint tangent calculation**: The current `computeTangentExtended` function walks ±5 steps along the skeleton but uses the **raw grid positions** of those endpoints to compute the tangent vector. At a corner, these endpoints are on different "stair steps", causing the tangent direction to jitter as the animal moves and the nearest skeleton point changes.

3. **No tangent smoothing**: While there's exponential smoothing for the **spine anchor position** (0.05s tau), the **tangent direction itself** (tx, tz) is computed fresh each frame with no temporal filtering.

## Solution: Add Exponential Smoothing to Tangent Direction

Add a smoothed tangent to the `MagnetismTurnState` that filters the raw tangent over time, preventing sudden angle jumps at jagged corners.

## Technical Changes

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Extend `MagnetismTurnState` to track smoothed tangent** (around line 125-142)

Add two new fields to store the smoothed tangent direction:

```typescript
export interface MagnetismTurnState {
  // ... existing fields ...
  
  /** Smoothed tangent X component (for stable corner navigation) */
  smoothedTangentX: number;
  /** Smoothed tangent Z component (for stable corner navigation) */
  smoothedTangentZ: number;
}
```

**Change 2: Initialize the new state fields** (around line 532-541)

In the state initialization block, add:

```typescript
if (!state.initialized) {
  state.currentCorrection = 0;
  state.committedSign = 1;
  state.lastNearestFx = -1;
  state.lastNearestFy = -1;
  state.lockDuration = 0;
  state.smoothedSpineX = 0;
  state.smoothedSpineZ = 0;
  state.smoothedTangentX = 0;  // ADD
  state.smoothedTangentZ = 0;  // ADD
  state.initialized = true;
}
```

**Change 3: Apply exponential smoothing to tangent after computing it** (after line 649, before cross-product calculation)

After getting the raw tangent from `computeTangentExtended`, apply smoothing:

```typescript
const { tx, tz, endpoint1, endpoint2 } = tangent;

// ============================================================================
// SMOOTH THE TANGENT DIRECTION TO ELIMINATE CORNER VIBRATION
// ============================================================================
// The raw tangent from discrete grid endpoints creates jagged angle changes at corners.
// Apply exponential smoothing to the tangent direction for stable curve navigation.
// Use a slightly longer tau (0.08s) than spine smoothing to prioritize stability.
// ============================================================================
const tangentSmoothingTau = 0.08;
const tangentAlpha = delta / (tangentSmoothingTau + delta);

let smoothedTx: number;
let smoothedTz: number;

if (state.smoothedTangentX === 0 && state.smoothedTangentZ === 0) {
  // Initialize to current raw tangent
  state.smoothedTangentX = tx;
  state.smoothedTangentZ = tz;
  smoothedTx = tx;
  smoothedTz = tz;
} else {
  // Exponential smoothing on the tangent components
  state.smoothedTangentX += (tx - state.smoothedTangentX) * tangentAlpha;
  state.smoothedTangentZ += (tz - state.smoothedTangentZ) * tangentAlpha;
  
  // Re-normalize after smoothing (important to maintain unit vector)
  const len = Math.sqrt(state.smoothedTangentX ** 2 + state.smoothedTangentZ ** 2);
  if (len > 0.001) {
    smoothedTx = state.smoothedTangentX / len;
    smoothedTz = state.smoothedTangentZ / len;
  } else {
    smoothedTx = tx;
    smoothedTz = tz;
  }
}
```

**Change 4: Use smoothed tangent for alignment calculations** (lines 697-747)

Replace `tx`/`tz` with `smoothedTx`/`smoothedTz` in the cross-product and angle calculations:

```typescript
// Step 1: Choose tangent direction with hysteresis
// Dot product: positive means vectors point in same general direction
const dotPositive = facingX * smoothedTx + facingZ * smoothedTz;  // USE SMOOTHED

// ... hysteresis logic unchanged ...

// Use the committed direction for alignment
let alignedTx = state.committedSign > 0 ? smoothedTx : -smoothedTx;  // USE SMOOTHED
let alignedTz = state.committedSign > 0 ? smoothedTz : -smoothedTz;  // USE SMOOTHED

// Step 2: Use cross product to determine turn direction
const crossProduct = facingX * alignedTz - facingZ * alignedTx;

// Step 3: Calculate the angle magnitude between them
const dotAligned = facingX * alignedTx + facingZ * alignedTz;
```

**Change 5: Reset smoothed tangent on skeleton point switch** (around line 590-609)

When switching to a new skeleton point, optionally reset or preserve the tangent. To maintain stability during transitions, we'll **preserve** the smoothed tangent (let it naturally blend):

```typescript
// Switching to new point - reset the tangent direction commitment but keep smoothed tangent
state.lastNearestFx = candidateNearest.fx;
state.lastNearestFy = candidateNearest.fy;
state.lockDuration = 0;
state.committedSign = 0; // Reset to neutral - will be set based on current facing
// NOTE: We intentionally do NOT reset smoothedTangentX/Z to allow smooth blending
```

**Change 6: Pass smoothed tangent to debug output** (lines 847-849)

Update the debug output to use the smoothed tangent:

```typescript
// Pass the ALIGNED SMOOTHED tangent to debug so compass shows correct direction
tangentX: alignedTx,  // Already using smoothed values after Change 4
tangentZ: alignedTz,
```

## Why This Works

| Before | After |
|--------|-------|
| Tangent computed fresh each frame from discrete grid endpoints | Tangent smoothed over ~0.08s (5+ frames at 60fps) |
| At a 90-degree corner: tangent snaps between stair-step angles | Tangent gradually rotates through the curve |
| Visible vibration as animal navigates corners | Smooth, continuous rotation through corners |

## Alternative Considered

**Catmull-Rom Spline Fitting**: Instead of smoothing, we could fit a spline to skeleton points. This was rejected because:
- Higher computational cost (would need to rebuild spline on each cache invalidation)
- More complex to implement correctly
- Exponential smoothing achieves similar visual result with minimal code

## Expected Behavior

- **Straight corridors**: No change (tangent is already stable)
- **Gradual curves**: Slightly smoother navigation
- **Sharp 90-degree corners**: Tangent rotates smoothly over ~80ms instead of jumping instantly
- **Full lock mode (strength 10)**: Animal follows a smoothed curve around corners rather than snapping to grid angles

