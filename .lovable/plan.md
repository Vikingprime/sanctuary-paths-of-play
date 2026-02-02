

# Fix: Violent Vibrations at Corners When Pressing in Certain Direction

## Problem Analysis

After adding tangent smoothing, the system has a new issue: when pressing in a certain direction at corners, violent vibrations occur. This is caused by a **mismatch between the smoothed tangent and the raw skeleton direction**.

### Root Cause

At a sharp corner:
1. **Raw tangent** changes direction sharply (e.g., from Z-forward to X-right at a 90° corner)
2. **Smoothed tangent** (0.08s tau) still points in the old direction, taking ~5 frames to catch up
3. **`constrainMovementToTangent`** uses this stale smoothed tangent to compute the perpendicular offset
4. The perpendicular projection is against the **wrong line direction**, pulling the animal off-course
5. On the next frame, the smoothed tangent rotates slightly, changing the projection direction again
6. This creates oscillating corrections that manifest as violent vibrations

### Key Insight

The smoothing was intended to prevent vibrations from discrete grid jumps, but it created a **worse problem**: the constraint function projects against a lagging tangent direction, causing the animal to be pulled in rapidly changing directions at corners.

## Solution

Two changes are needed:

### Change 1: Use Raw Tangent for Position Constraint

The `constrainMovementToTangent` function should use the **raw tangent** (from debug data) rather than the smoothed tangent for computing perpendicular offset. The smoothed tangent is good for rotation/alignment, but position constraint needs instantaneous direction.

Add `rawTangentX` and `rawTangentZ` to the debug output, and use them in the constraint function.

### Change 2: Add Debug Logging

Add targeted logging to confirm the diagnosis and prevent future issues.

## Technical Changes

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Add raw tangent to debug output** (update type definition and return statements)

Add `rawTangentX` and `rawTangentZ` to the `MagnetismTurnResult['debug']` interface:

```typescript
debug: {
  // ... existing fields ...
  tangentX: number;    // Aligned smoothed tangent (for rotation)
  tangentZ: number;
  rawTangentX: number; // Raw tangent from skeleton (for position constraint)
  rawTangentZ: number;
  // ...
};
```

**Change 2: Populate raw tangent in debug output** (lines 878-900 area)

After computing the aligned smoothed tangent, also pass the raw tangent:

```typescript
return {
  turnCorrection: state.currentCorrection,
  debug: {
    // ... existing ...
    tangentX: alignedTx,           // Smoothed (for rotation alignment)
    tangentZ: alignedTz,
    rawTangentX: state.committedSign > 0 ? tx : -tx,  // Raw (for position constraint)
    rawTangentZ: state.committedSign > 0 ? tz : -tz,
    // ...
  },
};
```

**Change 3: Use raw tangent in constraint function** (lines 1020-1032)

Update `constrainMovementToTangent` to prefer raw tangent for perpendicular calculation:

```typescript
// Use RAW tangent for position constraint (prevents lag-induced vibration at corners)
// The smoothed tangent is good for rotation alignment, but position needs instant direction
const tangentX = magnetismDebug.rawTangentX ?? magnetismDebug.tangentX;
const tangentZ = magnetismDebug.rawTangentZ ?? magnetismDebug.tangentZ;
```

**Change 4: Add conditional debug logging** (after smoothing calculation ~line 690)

Add logging gated behind `verboseLog` to help diagnose corner issues without FPS impact:

```typescript
// Debug: Log tangent divergence at corners for diagnostics
import { verboseLog } from '@/lib/debug';

// After smoothed tangent calculation:
const tangentDivergence = 1 - (tx * smoothedTx + tz * smoothedTz); // 0 = same, 2 = opposite
if (tangentDivergence > 0.1) {
  verboseLog('MAGNETISM', `Tangent divergence: ${tangentDivergence.toFixed(3)}, raw=(${tx.toFixed(2)},${tz.toFixed(2)}), smoothed=(${smoothedTx.toFixed(2)},${smoothedTz.toFixed(2)})`);
}
```

This log only fires when:
1. Verbose logging is enabled in debug settings
2. The tangent divergence exceeds 0.1 (indicating a corner transition)

### File: `src/components/Maze3DScene.tsx`

**Change 5: Update state initialization** (line 1124)

No changes needed - the debug object is already being passed through correctly.

## Why This Fixes the Vibration

| Before | After |
|--------|-------|
| Position constraint uses smoothed tangent | Position constraint uses raw tangent |
| At corners, perpendicular projection is against stale direction | Perpendicular projection is always against current skeleton direction |
| Smoothed tangent rotates over 5 frames, changing projection each frame | Raw tangent is stable (same discrete direction until skeleton point changes) |
| Vibration from oscillating projection direction | Stable correction directly toward current centerline |

## What Stays the Same

- **Rotation alignment** still uses smoothed tangent (prevents angle jitter from grid discretization)
- **Spine anchor** still uses raw position (fixes overshoot from previous fix)
- **All other magnetism logic** unchanged

## Expected Behavior After Fix

- **Straight corridors**: No change
- **Corners with forward input**: Smooth curve following (smoothed tangent guides rotation)
- **Corners with perpendicular input**: Stable correction toward centerline (raw tangent for position)
- **Debug logging**: Only fires when verbose mode is enabled AND at significant corner transitions

