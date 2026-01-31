

# Fix Stale Front Point in constrainMovementToTangent

## Problem Analysis

The `constrainMovementToTangent` function uses stale data from `magnetismDebug`:

```text
Frame Timeline:
1. Player at position (1.0, 2.0) with rotation θ
2. calculateMagnetismTurn() computes frontX/frontZ based on (1.0, 2.0)
3. Stores: frontX=1.35, frontZ=2.0 in magnetismDebug
4. Movement calculates new position (1.1, 2.1) ← Animal has moved!
5. constrainMovementToTangent() uses OLD frontX=1.35 from step 3
6. Calculates offset based on where front WAS, not where it IS NOW
7. Applies wrong offset → pushes animal incorrectly
```

The front sensing point stored in `magnetismDebug` was calculated from the **previous** player position and rotation, but it's being used to constrain the **new** position. When the animal turns or moves significantly in a frame, this mismatch can push it in the wrong direction.

## Solution: Recalculate Front Point from New Position

Pass the player's rotation and front offset to `constrainMovementToTangent` so it can calculate the **current** front point position based on the new position.

### Implementation Steps

### 1. Update Function Signature

**File: `src/game/CorridorMagnetism.ts`** (line ~945)

Add `playerRotation` and `frontOffset` parameters:

```typescript
export function constrainMovementToTangent(
  prevX: number,
  prevZ: number,
  newX: number,
  newZ: number,
  magnetismDebug: MagnetismTurnResult['debug'] | null,
  strength: number,
  playerRotation: number,    // NEW: Current player rotation
  frontOffset: number        // NEW: Distance from center to front sensing point
): { x: number; z: number }
```

### 2. Recalculate Front Point from New Position

**File: `src/game/CorridorMagnetism.ts`** (replace lines 977-985)

Instead of using stale `magnetismDebug.frontX/Z`, calculate fresh front point:

```typescript
// Calculate CURRENT front point from the NEW position (not stale debug data)
const facingX = Math.sin(playerRotation);
const facingZ = Math.cos(playerRotation);
const frontX = newX + facingX * frontOffset;
const frontZ = newZ + facingZ * frontOffset;

// Spine point is already smoothed in the debug data
const spineX = magnetismDebug.spineX;
const spineZ = magnetismDebug.spineZ;

// Vector from spine point to CURRENT front point
const toFrontX = frontX - spineX;
const toFrontZ = frontZ - spineZ;
```

### 3. Update Export in game/index.ts

**File: `src/game/index.ts`**

No changes needed - the function signature change is internal.

### 4. Update Call Site in Maze3DScene.tsx

**File: `src/components/Maze3DScene.tsx`** (where constrainMovementToTangent is called)

Pass the additional parameters:

```typescript
import { DEFAULT_MAGNETISM_CONFIG } from '@/game/CorridorMagnetism';

// ... in the movement calculation ...
const constrained = constrainMovementToTangent(
  prev.x,
  prev.y,
  newState.x,
  newState.y,
  magnetismDebugRef?.current ?? null,
  magnetStrength,
  playerRotation,                           // NEW: Pass current rotation
  DEFAULT_MAGNETISM_CONFIG.frontOffset      // NEW: Pass front offset (0.35)
);
```

## Why This Works

| Before | After |
|--------|-------|
| frontX from old position (1.0, 2.0) | frontX from new position (1.1, 2.1) |
| Offset calculated for wrong point | Offset calculated for actual current front |
| Mismatch pushes animal sideways | Correct projection onto tangent line |

```text
Correct frame flow:
1. Animal moves from (1.0, 2.0) to (1.1, 2.1)
2. constrainMovementToTangent receives newX=1.1, newZ=2.1
3. Calculates fresh frontX = 1.1 + sin(θ)*0.35
4. Projects THIS front point onto tangent line
5. Applies correct offset to newX/newZ
6. No wall clipping, no vibration
```

## Files Modified

| File | Changes |
|------|---------|
| `src/game/CorridorMagnetism.ts` | Add `playerRotation` and `frontOffset` params, recalculate front point from new position |
| `src/components/Maze3DScene.tsx` | Pass rotation and offset to `constrainMovementToTangent` call |

