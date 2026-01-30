
# Fix Magnetism Turn Direction Logic

## Problem Analysis

The magnetism system is choosing the wrong turn direction because it's using flawed logic to decide which tangent direction to use. 

**Current (broken) approach:**
1. Compute tangent as `endpoint2 - endpoint1` (arbitrary order based on grid iteration)
2. Choose between `tangent` and `-tangent` based on which is "closer" to the animal's current facing
3. Apply correction to reduce the angle difference

**Why this fails:**
- The animal is facing left (see screenshot)
- The corridor curves to the right
- But the system picks the tangent direction that makes the smallest angle with the animal's facing, which could be wrong
- The result: it suggests turning left when it should suggest turning right

## Solution: Use Cross Product for Turn Direction

The correct approach:
1. Compute the animal's facing vector (already done)
2. Compute the corridor tangent (two possible directions)
3. Choose the tangent direction that has the **smaller angle** to the animal facing (this is the forward direction)
4. Use the **cross product** to determine if the tangent is to the left or right of the animal
5. The cross product sign directly tells us which way to turn

```text
Animal Vector (A)           Tangent Vector (T)
      ↑                           ↗
      |                          /
      |                         /
    (0,0)───────────────────(0,0)

Cross product (A × T) = Ax*Tz - Az*Tx
  - Positive: T is to the RIGHT of A → turn RIGHT
  - Negative: T is to the LEFT of A → turn LEFT
```

## Technical Implementation

### File: `src/game/CorridorMagnetism.ts`

**Step 1: Replace the angle-based direction selection with cross-product approach**

Remove the complex hysteresis logic and replace with:

```typescript
// Calculate animal's facing direction (already have facingX, facingZ)
// facingX, facingZ = sin(visualRotation), cos(visualRotation)

// Spine tangent is tx, tz (computed from endpoint2 - endpoint1, normalized)

// Step 1: Choose tangent direction that points "more forward" (smaller angle)
// Use dot product to determine alignment
const dotPositive = facingX * tx + facingZ * tz;
const dotNegative = facingX * (-tx) + facingZ * (-tz);  // = -dotPositive

// If dotPositive >= 0, the tangent roughly points in our direction
// If dotNegative > dotPositive (i.e., dotPositive < 0), flip the tangent
let alignedTx = tx;
let alignedTz = tz;
if (dotPositive < 0) {
  alignedTx = -tx;
  alignedTz = -tz;
}

// Step 2: Use cross product to determine turn direction
// Cross product in 2D: A × T = Ax*Tz - Az*Tx
// Positive = T is clockwise from A (turn right)
// Negative = T is counter-clockwise from A (turn left)
const crossProduct = facingX * alignedTz - facingZ * alignedTx;

// Step 3: Calculate the angle magnitude between them
// Using the already-aligned tangent, so angle will be < 90°
const angleMagnitude = Math.acos(Math.max(-1, Math.min(1, 
  facingX * alignedTx + facingZ * alignedTz
)));

// Step 4: Apply the signed angle (cross product sign determines turn direction)
const angleDiff = crossProduct > 0 ? angleMagnitude : -angleMagnitude;
```

**Step 2: Update debug output to use the correctly-oriented tangent**

Pass `alignedTx, alignedTz` to the debug output instead of raw `tx, tz`.

**Step 3: Simplify the hysteresis (may no longer be needed)**

Since we now use a mathematically consistent approach:
- Dot product picks the forward-ish tangent direction
- Cross product determines left/right turn

The old `committedSign` hysteresis may be unnecessary, but we can keep a simpler version to prevent jitter at the exact 90° boundary (when the animal is perfectly perpendicular to the tangent).

### File: `src/components/GameHUD.tsx`

**Update compass display:**
The compass already converts to animal-relative space. Now that the debug output contains the correctly-oriented tangent (`alignedTx, alignedTz`), the compass should display correctly. The key change is that `tangentX, tangentZ` in debug will now always point "forward-ish" relative to the animal.

## Summary of Changes

| Change | File | Description |
|--------|------|-------------|
| Use cross product for turn direction | CorridorMagnetism.ts | Replace angle comparison with dot+cross product approach |
| Align tangent to forward direction | CorridorMagnetism.ts | Use dot product to flip tangent if it points backward |
| Pass aligned tangent to debug | CorridorMagnetism.ts | Update debug output with correctly-oriented tangent |
| Simplify/remove hysteresis | CorridorMagnetism.ts | Old `committedSign` logic may be unnecessary |
