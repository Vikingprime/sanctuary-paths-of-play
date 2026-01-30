
# Fix: Magnetism Turn Direction Flipping Incorrectly

## Problem Identified
The corridor magnetism system sometimes applies turn correction in the wrong direction. This happens because:

1. **Arbitrary tangent direction**: Each skeleton point's tangent is computed from `endpoint2 - endpoint1`, where the neighbor order is arbitrary (based on grid iteration order).

2. **Stale hysteresis state**: The `committedSign` variable (which chooses between tangent direction and its 180° opposite) persists across skeleton point switches. When the player moves to a new skeleton point with a different tangent orientation, the old `committedSign` may produce incorrect turn corrections.

3. **Insufficient reset on point switch**: When the system switches to a new skeleton point (lines 564-581), it resets `lockDuration` but not `committedSign`.

## Solution
Reset `committedSign` when switching to a new skeleton point. This ensures the tangent direction choice is re-evaluated fresh for each new point, using the current animal facing direction as reference.

## Implementation

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Reset committedSign when switching skeleton points**

In the sticky skeleton point selection logic, when we switch to a new point, also reset the `committedSign` to the neutral state (will be recalculated on next frame based on current facing):

```typescript
// Lines 564-569 (switching to new point)
} else {
  // Switching to new point - ALSO reset the tangent direction commitment
  state.lastNearestFx = candidateNearest.fx;
  state.lastNearestFy = candidateNearest.fy;
  state.lockDuration = 0;
  state.committedSign = 0; // Reset to neutral - will be set based on current facing
}
```

```typescript
// Lines 570-575 (locked point no longer exists)
} else {
  // Locked point no longer exists, use candidate
  state.lastNearestFx = candidateNearest.fx;
  state.lastNearestFy = candidateNearest.fy;
  state.lockDuration = 0;
  state.committedSign = 0; // Reset to neutral
}
```

```typescript
// Lines 576-581 (no locked point)
} else {
  // No locked point, use candidate
  state.lastNearestFx = candidateNearest.fx;
  state.lastNearestFy = candidateNearest.fy;
  state.lockDuration = 0;
  state.committedSign = 0; // Reset to neutral
}
```

**Change 2: Handle neutral committedSign in angle selection**

Update the hysteresis logic to initialize `committedSign` if it's neutral (0):

```typescript
// Around line 644-655, update the hysteresis logic:
// Hysteresis: only switch committed direction if the difference is significant (>15 degrees)
const hysteresisThreshold = 0.26; // ~15 degrees

// If committedSign is neutral (just switched points), immediately adopt the preferred direction
if (state.committedSign === 0) {
  state.committedSign = currentPreferredSign;
}

const currentAngleDiff = usePositive ? angleDiffPositive : angleDiffNegative;
const committedAngleDiff = state.committedSign > 0 ? angleDiffPositive : angleDiffNegative;

// Switch only if the new direction is significantly better
if (Math.abs(currentAngleDiff) < Math.abs(committedAngleDiff) - hysteresisThreshold) {
  state.committedSign = currentPreferredSign;
}
```

## Testing Steps
1. Navigate toward a wall at a sharp angle (like in the screenshot)
2. Verify the tangent arrow in the compass points toward the actual turn direction needed
3. Verify the animal is pushed in the correct direction (away from the wall, toward corridor center)
4. Test moving through multiple corridor segments to ensure the direction resets correctly at each transition

## Technical Notes
- The `committedSign` value of `0` is now used as a "neutral/uninitialized" state
- This ensures each new skeleton point gets a fresh evaluation of which tangent direction to use
- The 15° hysteresis threshold still applies once a direction is chosen, preventing flip-flopping within the same point
