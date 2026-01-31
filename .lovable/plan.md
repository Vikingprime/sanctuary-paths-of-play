
# Fix Vibration in Full Lock Mode: Smooth the Spine Anchor Point

## Problem Analysis

The "Full Lock" constraint (magnetism strength 10) projects the animal's front point onto a tangent line through the nearest spine node. While the tangent direction is now smoothed (via lookAhead=5), the **spine point itself is discrete** - it jumps from one grid node to the next as the animal moves.

When the nearest spine node changes, the tangent line shifts laterally by one grid cell (0.05 world units at scale 20), causing the animal to "snap" to the new line position. This creates the visible vibration effect at curves.

```text
Frame N:   Animal front → projected to tangent through SpineNode_A
Frame N+1: Nearest node switches to SpineNode_B (one grid cell away)
           Animal front → projected to tangent through SpineNode_B (jumps!)
Frame N+2: Nearest node switches back to SpineNode_A 
           Animal front → jumps again...
```

## Solution: Smooth the Spine Anchor Position

Instead of using the raw discrete spine point (`nearest.wx/wz`) directly, apply exponential smoothing to create a stable anchor position that moves continuously along the skeleton.

### Implementation Steps

### 1. Add Smoothed Spine State to MagnetismTurnState

**File: `src/game/CorridorMagnetism.ts`** (interface around line 123)

Add two new fields to track the smoothed spine position:
```typescript
export interface MagnetismTurnState {
  // ... existing fields ...
  
  /** Smoothed spine X position (for stable tangent line anchor) */
  smoothedSpineX: number;
  /** Smoothed spine Z position (for stable tangent line anchor) */
  smoothedSpineZ: number;
}
```

### 2. Initialize Smoothed Spine in createMagnetismTurnState

**File: `src/game/CorridorMagnetism.ts`** (around line 476)

Initialize the new fields to 0:
```typescript
export function createMagnetismTurnState(): MagnetismTurnState {
  return {
    currentCorrection: 0,
    initialized: false,
    committedSign: 0,
    lastNearestFx: -1,
    lastNearestFy: -1,
    lockDuration: 0,
    smoothedSpineX: 0,
    smoothedSpineZ: 0,
  };
}
```

### 3. Update Smoothed Spine in calculateMagnetismTurn

**File: `src/game/CorridorMagnetism.ts`** (in the main calculation function, around line 635)

After finding the nearest skeleton pixel, apply exponential smoothing to the spine position:
```typescript
// After: const { tx, tz, endpoint1, endpoint2 } = tangent;

// Smooth the spine anchor point to prevent vibration at curves
// Use a fast tau (0.05s) so it tracks quickly but eliminates single-frame jumps
const spineSmoothingTau = 0.05;
const spineAlpha = delta / (spineSmoothingTau + delta);

if (!state.initialized) {
  state.smoothedSpineX = nearest.wx;
  state.smoothedSpineZ = nearest.wz;
} else {
  state.smoothedSpineX += (nearest.wx - state.smoothedSpineX) * spineAlpha;
  state.smoothedSpineZ += (nearest.wz - state.smoothedSpineZ) * spineAlpha;
}

// Use smoothedSpine for debug output instead of raw nearest.wx/wz
```

### 4. Update Debug Output to Use Smoothed Spine

**File: `src/game/CorridorMagnetism.ts`** (in the return statement around line 780)

Change the debug output to use the smoothed values:
```typescript
debug: {
  // ... other fields ...
  spineX: state.smoothedSpineX,  // Was: nearest.wx
  spineZ: state.smoothedSpineZ,  // Was: nearest.wz
  // ... other fields ...
}
```

### 5. constrainMovementToTangent Now Uses Smooth Data

No changes needed to `constrainMovementToTangent` itself - it receives `magnetismDebug.spineX/Z` which will now be the smoothed values.

## How It Works

With these changes:

1. **Raw skeleton lookup** still finds the nearest discrete grid node
2. **Smoothed spine position** interpolates toward the raw position with tau=0.05s
3. **Tangent line** is anchored at the smooth position instead of the jumping discrete point
4. **Front point projection** snaps to this stable, smoothly-moving line
5. **No more vibration** - the anchor point moves continuously, not in discrete jumps

```text
With smoothing:
Frame N:   smoothedSpine ≈ (1.00, 2.00)
Frame N+1: Nearest jumps to (1.05, 2.05), but smoothedSpine → (1.01, 2.01)
Frame N+2: smoothedSpine → (1.02, 2.02)
...
           Smooth transition, no snapping!
```

## Technical Notes

- **Tau = 0.05s** is fast enough to track actual movement (animal moves ~3 units/sec max) but slow enough to filter out single-frame grid jumps
- The smoothed position naturally follows the skeleton path since raw positions are always on the skeleton
- At junctions, smoothing is irrelevant since magnetism is disabled there anyway

## Files Modified

| File | Changes |
|------|---------|
| `src/game/CorridorMagnetism.ts` | Add smoothedSpineX/Z to state, apply exponential smoothing, output smooth values to debug |
