

# Fix: Tangent Direction Using Simple Dot Product

## Problem

The current tangent direction logic uses a complex "committed sign" system with hysteresis that can lead to the tangent being flipped to the wrong direction. Both the HUD compass and 3D visualization show inconsistent directions.

**The correct approach is simple**: Use the dot product to determine if the tangent makes a large angle (>90 degrees) with the animal's facing direction. If it does, flip the tangent. No state, no hysteresis - just pure geometric selection of the closer direction.

## Solution

### Simplified Tangent Alignment Logic

```text
Raw tangent vector: (tx, tz)
Animal facing vector: (facingX, facingZ)

dot = facingX * tx + facingZ * tz

if (dot < 0):
    alignedTx = -tx
    alignedTz = -tz
else:
    alignedTx = tx
    alignedTz = tz
```

This always chooses the tangent direction that makes the **smaller angle** with the animal's facing direction.

---

## File Changes

### 1. `src/game/CorridorMagnetism.ts`

**Remove**: The `committedSign` hysteresis logic (lines 668-692)

**Replace with** simple dot product selection:

```typescript
// Step 1: Choose tangent direction using dot product
// Always pick the direction that makes the smaller angle with facing
// Dot product < 0 means angle > 90°, so flip the tangent
const dot = facingX * tx + facingZ * tz;
const alignedTx = dot >= 0 ? tx : -tx;
const alignedTz = dot >= 0 ? tz : -tz;
```

This removes:
- `committedSign` state variable
- Hysteresis threshold logic
- All the complex state tracking

**Also update** the debug export to consistently use neighbor positions that reflect the aligned direction:

```typescript
// Export neighbors in consistent order (aligned with tangent direction)
// neighbor1 is "behind", neighbor2 is "ahead" relative to tangent
neighbor1X: dot >= 0 ? endpoint1.wx : endpoint2.wx,
neighbor1Z: dot >= 0 ? endpoint1.wz : endpoint2.wz,
neighbor2X: dot >= 0 ? endpoint2.wx : endpoint1.wx,
neighbor2Z: dot >= 0 ? endpoint2.wz : endpoint1.wz,
```

### 2. `src/components/GameHUD.tsx`

No changes needed - it already uses `debug.tangentX/Z` which will now be correctly aligned.

### 3. `src/components/MedialAxisVisualization.tsx`

No changes needed - it uses `neighbor1/neighbor2` which will now be exported in the correct order to match the aligned tangent.

---

## Why This Works

The dot product is the simplest way to determine angle relationship:

| Dot Product | Angle Between Vectors | Action |
|-------------|----------------------|--------|
| > 0 | < 90° | Keep tangent as-is |
| = 0 | = 90° | Either direction is equally valid |
| < 0 | > 90° | Flip tangent to get smaller angle |

By removing the hysteresis and committed state, we get:
- Instant, correct direction selection
- No state to get out of sync
- Consistent behavior regardless of history
- HUD and 3D visualization automatically agree

---

## Technical Notes

### State Cleanup

The `committedSign` field in `MagnetismTurnState` can be removed entirely:

```typescript
interface MagnetismTurnState {
  // Remove: committedSign: number;
  currentCorrection: number;
  // ... other fields
}
```

### Edge Case: Exactly 90 Degrees

When the dot product is exactly 0, the `>=` comparison will keep the tangent unchanged. This is fine because:
1. Both directions are equidistant from the animal's facing
2. The turn correction will be calculated correctly either way
3. This case is extremely rare in practice

