
# Fix: Use Raw Spine Anchor to Eliminate Lateral Overshoot

## Problem Confirmed

The logs showed the root cause clearly:

```
SPINE JUMP: { rawZ: "4.075", smoothedZ: "4.209" }
```

The **smoothed spine** (used as the anchor for perpendicular correction) lags behind the **raw spine** (actual nearest skeleton point). When the animal moves laterally, the smoothed anchor "overshoots" the animal's position, causing the perpendicular distance calculation to flip signs and pull the animal back the other way.

## Solution

Use the **raw** nearest skeleton point as the anchor for the perpendicular projection, not the smoothed one. The smoothing is still valuable for the **tangent direction** (to prevent angle jitter), but the **anchor position** should be instantaneous.

## Changes

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Add raw spine to debug output** (lines 854-877)

Add `rawSpineX` and `rawSpineZ` fields to the debug object returned from `calculateMagnetismTurn`:

```typescript
return {
  turnCorrection: state.currentCorrection,
  debug: {
    backX,
    backZ,
    frontX,
    frontZ,
    spineX: state.smoothedSpineX,
    spineZ: state.smoothedSpineZ,
    rawSpineX: nearest.wx,     // ADD THIS
    rawSpineZ: nearest.wz,     // ADD THIS
    targetX: state.smoothedSpineX,
    // ... rest unchanged
  },
};
```

**Change 2: Update type definition** (lines 50-91)

Add the new fields to the `MagnetismTurnResult['debug']` interface:

```typescript
debug: {
  // ... existing fields ...
  spineX: number;
  spineZ: number;
  rawSpineX: number;  // ADD
  rawSpineZ: number;  // ADD
  // ...
};
```

**Change 3: Use raw spine in constraint function** (lines 1021-1023)

```typescript
// OLD (uses lagging smoothed spine):
const spineX = magnetismDebug.spineX;
const spineZ = magnetismDebug.spineZ;

// NEW (uses instantaneous raw spine):
const spineX = magnetismDebug.rawSpineX ?? magnetismDebug.spineX;
const spineZ = magnetismDebug.rawSpineZ ?? magnetismDebug.spineZ;
```

## Why This Fixes the Overshoot

| Before | After |
|--------|-------|
| Smoothed spine lags behind animal movement | Raw spine is always at nearest grid point |
| Perpendicular anchor overshoots, flipping `perpDist` sign | Anchor stays put, `perpDist` remains stable |
| Animal pulled right, then left (overshoot bounce) | Animal pulled directly toward centerline |

## What Stays the Same

- Tangent direction still uses smoothed calculation (prevents angle jitter)
- All other magnetism logic unchanged
- Debug visualization continues to work (now shows both raw and smoothed)
