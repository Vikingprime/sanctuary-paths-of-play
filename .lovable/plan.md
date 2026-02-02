

# Debug: Investigate Vibration Near Map Towers

## Problem Analysis

Based on the console logs and code investigation:

1. **The tangent divergence is `0.000`** in most frames - the tangent smoothing is working correctly
2. **The vibration occurs specifically near the map tower** (station)
3. **Map towers are NOT junctions** - they're placed on regular path cells, so `isJunctionSuppressed` stays `false`
4. **Two systems are fighting**:
   - The **collision system** pushes the animal away from the tower and applies slide boost
   - The **magnetism constraint** immediately pulls the animal back toward the corridor centerline
   - This creates an oscillating push/pull effect = vibration

## Root Cause

The `constrainMovementToTangent` function doesn't know about tower collisions:

```typescript
// In Maze3DScene.tsx
const newState = calculateMovement(...); // Returns collisionIntensity!
const constrained = constrainMovementToTangent(
  // ... doesn't receive collisionIntensity
);
// The constraint fights the collision pushback
```

## Debug Plan

To confirm this diagnosis and understand the exact timing, add debug logging that tracks:
1. **Collision state** when constraint is applied
2. **Perpendicular distance** being corrected
3. **Whether the correction is fighting a collision pushback**

### Step 1: Add collision-aware logging in constraint function

Add a parameter for collision intensity and log when constraint applies during collision:

```typescript
export function constrainMovementToTangent(
  prevX, prevZ, newX, newZ,
  magnetismDebug,
  strength,
  playerRotation,
  frontOffset,
  collisionIntensity = 0  // NEW: Add optional parameter
) {
  // ... existing guards ...
  
  // NEW: Debug log when constraint applies during collision
  const now = performance.now();
  if (collisionIntensity > 0.01) {
    if (!((globalThis as any).__lastConstraintCollisionLog) || 
        now - (globalThis as any).__lastConstraintCollisionLog > 500) {
      (globalThis as any).__lastConstraintCollisionLog = now;
      console.log(`[CONSTRAINT COLLISION] intensity=${collisionIntensity.toFixed(2)}, perpDist=${perpDist.toFixed(3)}, offset=(${offsetX.toFixed(3)}, ${offsetZ.toFixed(3)})`);
    }
  }
  
  // ... rest of function ...
}
```

### Step 2: Pass collision intensity from caller

Update the call site to pass `newState.collisionIntensity`:

```typescript
const constrained = constrainMovementToTangent(
  prev.x, prev.y,
  newState.x, newState.y,
  magnetismDebugRef?.current ?? null,
  magnetStrength,
  newState.rotation,
  DEFAULT_MAGNETISM_CONFIG.frontOffset,
  newState.collisionIntensity  // NEW: Pass collision state
);
```

### Step 3: Observe the logs

Navigate to a map tower and observe:
- If `[CONSTRAINT COLLISION]` logs appear with high `intensity` and non-zero `offset`, this confirms the constraint is fighting the collision
- The `perpDist` value will show how far off-centerline the collision pushed the animal
- The `offset` values show how much the constraint is trying to correct back

## Expected Log Output

When vibrating near tower:
```
[CONSTRAINT COLLISION] intensity=0.30, perpDist=-0.15, offset=(0.12, 0.08)
[CONSTRAINT COLLISION] intensity=0.45, perpDist=0.12, offset=(-0.09, -0.06)
[CONSTRAINT COLLISION] intensity=0.55, perpDist=-0.08, offset=(0.06, 0.04)
```

This oscillating `perpDist` sign (negative then positive) would confirm the push/pull fight.

## Future Fix (After Diagnosis Confirmed)

If the diagnosis is confirmed, the fix is simple:

```typescript
// In constrainMovementToTangent, weaken constraint based on collision
const collisionWeakening = 1 - (collisionIntensity ?? 0);
const weakenedOffsetX = offsetX * collisionWeakening;
const weakenedOffsetZ = offsetZ * collisionWeakening;
```

This would gradually disable the position constraint as collision intensity increases, allowing the collision system to take priority.

