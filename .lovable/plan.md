

# Debug Plan: Junction Lock Issue

## Problem Identified

The console logs reveal the root cause: **the magnetism system is failing to recognize junctions** because:

1. **Excessive sticky locking**: `lockDur=33.43` shows the player has been locked to the same skeleton pixel for 33+ seconds
2. **Missing junction detection in logs**: The current `[MAGNETISM DEBUG]` log doesn't include `isJunctionSuppressed` or `nearestDegree`, making it impossible to see junction transitions
3. **Threshold too sticky**: The 15% improvement threshold to switch skeleton points is preventing transitions to junction pixels

The BFS suppression radius marks pixels near junctions, but if the player is locked to a corridor pixel outside that radius, they never "see" the junction suppression.

## Solution: Add Junction-Aware Debug Logging

### Step 1: Update the MAGNETISM DEBUG log to include junction info

In `src/game/CorridorMagnetism.ts`, modify the debug log (around line 800-850) to include:
- `isJunction` flag
- `nearestDegree` (the degree of the locked skeleton pixel)
- `isSuppressed` (whether the pixel is in the suppression zone)

```typescript
console.log(
  `[MAGNETISM DEBUG] div=${divergence.toFixed(3)}, committedSign=${state.committedSign}, ` +
  `deg=${nearest.degree}, suppressed=${nearest.isSuppressed}, ` +
  `rawAligned=(${rawAlignedX.toFixed(2)},${rawAlignedZ.toFixed(2)}), ` +
  `lockDur=${state.lockDuration.toFixed(2)}`
);
```

### Step 2: Add junction transition logging

Add a one-time log when entering/leaving junction zones:

```typescript
// Track junction state transitions
const wasJunction = (globalThis as any).__wasAtJunction ?? false;
const isJunction = tangent === null || nearest.isSuppressed;
if (isJunction !== wasJunction) {
  console.log(`[JUNCTION TRANSITION] ${wasJunction ? 'LEAVING' : 'ENTERING'} junction, ` +
    `degree=${nearest.degree}, isSuppressed=${nearest.isSuppressed}, lockDur=${state.lockDuration.toFixed(2)}`);
  (globalThis as any).__wasAtJunction = isJunction;
}
```

### Step 3: Debug the sticky lock threshold

Add logging when a switch is considered but rejected:

```typescript
// Inside the sticky locking logic
if (!shouldSwitch) {
  // Log when we COULD have switched but didn't
  if (candidateNearest.degree >= 3 || candidateNearest.isSuppressed) {
    console.log(`[STICKY LOCK] Rejected junction switch: lockedDist=${lockedDist.toFixed(2)}, ` +
      `candidateDist=${candidateDist.toFixed(2)}, candidateDegree=${candidateNearest.degree}`);
  }
}
```

## Technical Implementation

### File: `src/game/CorridorMagnetism.ts`

**Change 1**: Update the throttled debug log (around line 800-850) to include junction-related fields:
- Add `deg=${nearest.degree}` to show the degree of the locked point
- Add `suppressed=${nearest.isSuppressed}` to show if we're in suppression zone

**Change 2**: Add junction transition logging after the `isSuppressed` check (around line 628-630):
- Log when transitioning into or out of junction suppression
- Include the degree and lockDuration for context

**Change 3**: Add sticky lock rejection logging in the skeleton point selection logic (around line 596-609):
- Log when a junction pixel is available but the sticky lock prevents switching to it
- This will reveal if the problem is the threshold or the suppression radius

## Expected Output

After these changes, navigating to a junction should show:
```
[MAGNETISM DEBUG] div=0.000, committedSign=-1, deg=2, suppressed=false, rawAligned=(0.00,-1.00), lockDur=5.00
[STICKY LOCK] Rejected junction switch: lockedDist=0.45, candidateDist=0.40, candidateDegree=3
[MAGNETISM DEBUG] div=0.000, committedSign=-1, deg=2, suppressed=false, rawAligned=(0.00,-1.00), lockDur=5.50
...
[JUNCTION TRANSITION] ENTERING junction, degree=3, isSuppressed=true, lockDur=0.00
```

The `[STICKY LOCK]` logs will confirm if the problem is the lock threshold preventing junction detection.

## Likely Fix (After Diagnosis)

If the logs confirm sticky locking is preventing junction detection, the fix is to **always allow switching to junction/suppressed pixels**:

```typescript
// Force switch if candidate is a junction/suppressed pixel (priority over sticky locking)
const candidateIsJunction = candidateNearest.degree >= 3 || candidateNearest.isSuppressed;
const shouldSwitch = candidateIsJunction || lockedDist > maxSearchRadius || candidateDist < lockedDist * switchThreshold;
```

This ensures the player is never "locked out" of junction detection.

