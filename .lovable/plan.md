

# Debug Logging Plan: Diagnose Bounceback on Lock-On

## Problem Summary

When magnetism locks on (strength ~10), the animal experiences a "bounceback" where it gets pulled in the opposite direction briefly before being pulled into the correct line. This causes camera shake and bouncing motion.

## Suspected Root Causes

Based on code analysis, there are several potential causes:

1. **1-Frame Lag in Constraint Data**: `constrainMovementToTangent` (line 1266-1275) uses `magnetismDebugRef.current` which contains the *previous frame's* spine/tangent data. The current frame's data isn't updated until line 1390, AFTER the constraint is applied.

2. **Tangent Direction Flip**: The `committedSign` hysteresis (lines 689-713) may flip when transitioning from non-locked to locked mode, causing the tangent to point the opposite direction for a frame.

3. **Smoothed Spine Jump**: The smoothed spine anchor (`state.smoothedSpineX/Z`) may jump when the nearest skeleton pixel changes, causing the perpendicular offset to swing wildly.

4. **Perpendicular Offset Sign**: The sign of `perpDist` and its application (`-perpDist * perpX`) may behave unexpectedly when the animal approaches the corridor from certain angles.

## Debug Logging Strategy

Add targeted logging at key decision points to capture the exact moment of bounceback:

### Location 1: `constrainMovementToTangent` Entry (CorridorMagnetism.ts ~955-960)

Log when constraint activates and with what data:

```typescript
// After line 956 (early exit check)
console.log('[TANGENT-LOCK] Entry:', {
  isActive: magnetismDebug.isActive,
  strength,
  willApply: !(!magnetismDebug || !magnetismDebug.isActive || strength < 9.9),
});
```

### Location 2: Spine and Tangent Data (CorridorMagnetism.ts ~986-997)

Log the spine anchor and tangent being used for constraint:

```typescript
// After line 997 (perpZ assignment)
console.log('[TANGENT-LOCK] Geometry:', {
  spineX: spineX.toFixed(3),
  spineZ: spineZ.toFixed(3),
  tangentAngle: (Math.atan2(tx, tz) * 180 / Math.PI).toFixed(1),
  frontX: frontX.toFixed(3),
  frontZ: frontZ.toFixed(3),
  perpDist: perpDist.toFixed(4),
});
```

### Location 3: Offset Application (CorridorMagnetism.ts ~1003-1008)

Log the actual offset being applied:

```typescript
// After line 1008 (constrainedZ)
console.log('[TANGENT-LOCK] Offset:', {
  offsetX: offsetX.toFixed(4),
  offsetZ: offsetZ.toFixed(4),
  offsetMag: Math.sqrt(offsetX*offsetX + offsetZ*offsetZ).toFixed(4),
  lockBlend: lockBlend.toFixed(3),
  deltaX: (constrained.x - newX).toFixed(4),
  deltaZ: (constrained.z - newZ).toFixed(4),
});
```

### Location 4: Committed Sign Changes (CorridorMagnetism.ts ~702-713)

Log when tangent direction commitment changes:

```typescript
// Before line 709 (committedSign switch logic)
const prevSign = state.committedSign;

// After line 713 (after switch logic)
if (state.committedSign !== prevSign) {
  console.log('[TANGENT-LOCK] SIGN FLIP:', {
    prevSign,
    newSign: state.committedSign,
    dotPositive: dotPositive.toFixed(3),
    threshold: hysteresisThreshold,
  });
}
```

### Location 5: Smoothed Spine Jump Detection (CorridorMagnetism.ts ~660-662)

Log when the raw spine vs smoothed spine differs significantly:

```typescript
// After line 662 (smoothing update)
const spineDelta = Math.sqrt(
  (nearest.wx - state.smoothedSpineX) ** 2 + 
  (nearest.wz - state.smoothedSpineZ) ** 2
);
if (spineDelta > 0.1) { // Threshold for "significant" jump
  console.log('[TANGENT-LOCK] SPINE JUMP:', {
    rawX: nearest.wx.toFixed(3),
    rawZ: nearest.wz.toFixed(3),
    smoothedX: state.smoothedSpineX.toFixed(3),
    smoothedZ: state.smoothedSpineZ.toFixed(3),
    delta: spineDelta.toFixed(4),
  });
}
```

### Location 6: Movement Loop Frame Comparison (Maze3DScene.tsx ~1277)

Log position delta to detect bounceback:

```typescript
// After line 1277 (constrained applied)
const positionDelta = {
  dx: constrained.x - prev.x,
  dz: constrained.z - prev.y,
};
const deltaMag = Math.sqrt(positionDelta.dx ** 2 + positionDelta.dz ** 2);
if (deltaMag > 0.01 && magnetStrength >= 9.9) {
  console.log('[TANGENT-LOCK] MOVE:', {
    prevX: prev.x.toFixed(3),
    prevZ: prev.y.toFixed(3),
    newX: newState.x.toFixed(3),
    newZ: newState.y.toFixed(3),
    constrainedX: constrained.x.toFixed(3),
    constrainedZ: constrained.z.toFixed(3),
    deltaMag: deltaMag.toFixed(4),
  });
}
```

## Files Modified

| File | Change |
|------|--------|
| `src/game/CorridorMagnetism.ts` | Add debug logging in `constrainMovementToTangent` (entry, geometry, offset), committed sign flip detection, and spine jump detection |
| `src/components/Maze3DScene.tsx` | Add frame-by-frame position delta logging when lock is active |

## How to Use the Logs

1. Enable full magnetism (strength 10) in debug settings
2. Move the animal into a corridor from an angle (not aligned)
3. Watch console for `[TANGENT-LOCK]` prefixed logs
4. Look for:
   - **SIGN FLIP** logs indicating tangent direction reversal
   - **SPINE JUMP** logs indicating the anchor moved suddenly
   - **Offset** logs showing large magnitude changes frame-to-frame
   - **MOVE** logs showing position jumping backward

## Expected Findings

The logs should reveal one of:
- A `SIGN FLIP` happening exactly when the bounceback occurs (tangent direction bug)
- A `SPINE JUMP` with high delta correlating with bounceback (smoothing insufficient)
- Large `perpDist` swings in `Geometry` logs (perpendicular calculation issue)
- `MOVE` showing `constrained` position going backward then forward (1-frame lag bug)

