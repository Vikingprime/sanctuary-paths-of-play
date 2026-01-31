# ✅ COMPLETED: Fix Stale Front Point in constrainMovementToTangent

## Summary

Fixed the Full Lock vibration/wall-clipping bug by recalculating the front sensing point from the animal's **current** position and rotation, instead of using stale data from the previous frame.

## Changes Made

### 1. `src/game/CorridorMagnetism.ts`
- Added `playerRotation` and `frontOffset` parameters to `constrainMovementToTangent`
- Replaced stale `magnetismDebug.frontX/Z` with fresh calculation:
  ```typescript
  const facingX = Math.sin(playerRotation);
  const facingZ = Math.cos(playerRotation);
  const frontX = newX + facingX * frontOffset;
  const frontZ = newZ + facingZ * frontOffset;
  ```

### 2. `src/components/Maze3DScene.tsx`
- Updated call site to pass `newState.rotation` and `DEFAULT_MAGNETISM_CONFIG.frontOffset`

## Result

The tangent projection now uses the correct front point position, preventing the mismatch that caused wall clipping and vibration in Full Lock mode.
