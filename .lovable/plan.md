
# Diagnosing and Fixing Animal Shaking During Rail Movement

## Problem Analysis

When the animal travels along the curved polyline in rail mode, it shakes/jitters. After exploring the codebase, I've identified several potential causes:

### Root Causes Identified

1. **Position Lerp in Rail Mode (Primary Cause)**
   - In `Maze3DScene.tsx` lines 1530-1537, position smoothing uses a fixed lerp of 0.3:
     ```typescript
     smoothPositionX.current += (targetX - smoothPositionX.current) * 0.3;
     smoothPositionZ.current += (targetZ - smoothPositionZ.current) * 0.3;
     ```
   - This same lerp is applied in rail mode, where the animal moves precisely along discrete waypoints
   - With Catmull-Rom resampling producing 8 points per original point (~200+ points per segment), the animal position "chases" each waypoint with a lag, causing oscillation as it catches up then overshoots

2. **Rotation vs Position Smoothing Mismatch**
   - Rail mode correctly uses `rotLerpFactor = 1.0` for instant rotation snap (line 1547)
   - But position uses `0.3` lerp regardless of mode
   - This creates a disconnect where the animal's visual rotation is locked to the path tangent but its position lags behind, causing a visual "wobble"

3. **Tangent Calculation Window**
   - Tangent is calculated by looking 5 points behind and 8 points ahead (lines 1232-1238)
   - With densely packed Catmull-Rom points (~0.05 world units apart), this window spans only ~0.65 world units
   - On sharp curves, this small window can cause the tangent to flip rapidly as new points enter/exit

4. **Waypoint Threshold**
   - The `waypointThreshold = 0.08` (line 1200) is very small
   - Combined with the high-density path points, the animal is constantly switching target waypoints mid-movement

## Solution Strategy

The fix needs to differentiate rail mode from joystick mode for position smoothing, and potentially adjust the path following algorithm to be smoother.

### Approach: Tighter Position Lock in Rail Mode

```text
+---------------------------+        +---------------------------+
|   CURRENT (Both modes)    |        |   PROPOSED (Rail mode)    |
+---------------------------+        +---------------------------+
| Position lerp: 0.3        |  -->   | Position lerp: 0.9-1.0    |
| Rotation lerp: 1.0 (rail) |        | Rotation lerp: 1.0        |
+---------------------------+        +---------------------------+
```

## Implementation Plan

### Step 1: Increase Position Lerp Factor in Rail Mode
**File:** `src/components/Maze3DScene.tsx`

Modify the position smoothing section (around line 1530-1537) to use a much tighter lerp when in rail mode:

```typescript
// Smooth position with mode-aware lerp factor
const targetX = playerStateRef.current.x;
const targetZ = playerStateRef.current.y;

// Rail mode: tight position lock to prevent jitter
// Joystick mode: gentle smoothing for natural movement
const posLerpFactor = railMode ? 0.9 : 0.3;

smoothPositionX.current += (targetX - smoothPositionX.current) * posLerpFactor;
smoothPositionZ.current += (targetZ - smoothPositionZ.current) * posLerpFactor;
```

### Step 2: Expand Tangent Calculation Window
**File:** `src/components/Maze3DScene.tsx`

Increase the look-behind and look-ahead indices for tangent calculation (around lines 1232-1238) to span a larger section of the path:

```typescript
// Look further behind and ahead for stable tangent on dense paths
// With ~8 points per original segment, this spans ~2.5 world units
const tangentBehindIdx = Math.max(0, pathIdx - 15);
const tangentAheadIdx = Math.min(path.length - 1, pathIdx + 20);
```

### Step 3: Increase Waypoint Threshold
**File:** `src/components/Maze3DScene.tsx`

Increase the waypoint threshold slightly to reduce rapid waypoint switching (around line 1200):

```typescript
const waypointThreshold = 0.12; // Was 0.08 - larger to reduce jitter
```

---

## Technical Details

### Why Position Lerp 0.3 Causes Jitter

The lerp-based smoothing creates an exponential approach to the target. With a 0.3 factor:
- Each frame closes 30% of the gap to target
- On a 60fps display, this creates a visible "trailing" effect
- When the target moves continuously (waypoint hopping), the position oscillates around the moving target

### Why Rail Mode Needs Tighter Lock

In joystick mode, smoothing is desirable because:
- Player input can be noisy
- Collision resolution may cause position jumps
- Camera lag creates a pleasant "follow" feel

In rail mode, the path is pre-computed and guaranteed to be smooth. The animal should travel directly along it without any visual lag.

### Expected Outcome

After these changes:
- Animal position will closely track the polyline path in rail mode
- Rotation will remain instant-locked to tangent (already working)
- Joystick mode behavior remains unchanged
- Shaking/jittering during rail travel should be eliminated

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Maze3DScene.tsx` | 3 line changes: position lerp, tangent window, waypoint threshold |

## Testing Recommendations

1. Enter rail mode and select a direction at a junction
2. Observe the animal traveling along a curved path segment
3. Verify no shaking or jittering occurs
4. Test at different frame rates (throttle to 30fps in browser) to ensure stability
5. Verify joystick mode still feels smooth and responsive
