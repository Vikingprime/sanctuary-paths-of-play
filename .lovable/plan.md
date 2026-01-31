

# Fix: Spur Trimming, Turn Smoothness, and Wobble

## Problems Identified

### 1. Spurs Not Being Trimmed (Visualization Only)
The visualization shows unpruned spurs because the UI slider values (e.g., `maxSpurLen: 5`) override the scale-dependent defaults. At scale=100:
- **Expected**: `maxSpurLen = 100` (1 cell of skeleton steps)
- **Actual**: UI passes `maxSpurLen = 5` (0.05 cells - way too small to catch any spurs)

The magnetism cache itself is fine because `buildMagnetismCache` is called **without** spurConfig, using correct scale defaults. The issue is only in the debug visualization.

**Fix**: Don't pass spurConfig to visualization when it equals the scale defaults (or reset the stored spurConfig when scale changes).

### 2. Turn Related Issues (Already Addressed in Last Edit)
The max correction was reduced to 15° and tangent extended to ±10. User wants:
- Tangent extended to ±20 (for even smoother direction calculation)
- Further reduce max correction magnitude

### 3. Additional Smoothing Suggestions
To reduce jerkiness and wobble:
- Increase smoothing time constant
- Add deadzone to prevent micro-corrections
- Add wobble suppression for small sign-flip oscillations

---

## Solution

### File: `src/game/CorridorMagnetism.ts`

**Change 1**: Add comment clarifying suppression radius = scale = 1 cell (line 172-173)
```typescript
// Suppression radius: 1 × scale (i.e., 1 real-world maze cell width in skeleton steps)
// At scale=100, this is 100 steps. DO NOT change this - scale IS 1 cell by definition.
const suppressionRadius = scale;
```

**Change 2**: Increase tangent look-ahead from 10 to 20 (line 600)
```typescript
// Get tangent at skeleton point using extended neighbors (±20 steps) for maximum stability
const tangent = computeTangentExtended(nearest, cache, 20);
```

**Change 3**: Reduce max correction from 15° to 10° (line 737)
```typescript
// Clamp correction magnitude - max 10 degrees to prevent sudden flips
const maxCorrection = Math.PI / 18; // 10 degrees (was 15)
```

**Change 4**: Increase smoothing and add wobble prevention (around line 720-730)
```typescript
// Increase smoothing time constant for less jerky response
const effectiveTau = config.smoothingTau * 2.5; // 0.10 → 0.25 effective

// Calculate smoothing factor
const alpha = delta / (effectiveTau + delta);
let smoothedCorrection = state.currentCorrection + (targetCorrection - state.currentCorrection) * alpha;

// Wobble prevention: suppress small sign changes that cause oscillation
const wobbleThreshold = 0.02; // ~1.2 degrees
if (state.currentCorrection !== 0 && 
    Math.sign(smoothedCorrection) !== Math.sign(state.currentCorrection) &&
    Math.abs(smoothedCorrection) < wobbleThreshold) {
  // Sign is flipping with tiny magnitude - decay instead of flip
  smoothedCorrection = state.currentCorrection * 0.8;
}
```

**Change 5**: Add wider deadzone in config (lines around 144-148)
```typescript
export const DEFAULT_MAGNETISM_CONFIG: MagnetismConfig = {
  // ... existing config
  deadzone: 0.08, // Increase from 0.05 to 0.08 (~4.5 degrees)
};
```

---

### File: `src/components/MedialAxisVisualization.tsx`

**Change 6**: Don't pass spurConfig if it's null, let computeMedialAxis use scale defaults (line 92)
This is already correct - the issue is the stored state. We need to invalidate stored spurConfig when defaults change.

---

### File: `src/components/MazeGame3D.tsx`

**Change 7**: Reset spurConfig when defaultSpurConfig changes significantly (lines 929-937)
```typescript
onDefaultSpurConfig={(config) => {
  // Always update the defaults
  setDefaultSpurConfig(config);
  
  // Reset spurConfig to match new defaults if:
  // 1. spurConfig was never set, OR
  // 2. The defaults changed significantly (scale changed)
  if (!spurConfig || 
      Math.abs(spurConfig.maxSpurLen - config.maxSpurLen) > 10) {
    setSpurConfig(config);
  }
}}
```

---

## Summary of Changes

| Issue | Fix | File |
|-------|-----|------|
| Spurs not trimmed | Reset spurConfig when scale defaults change | MazeGame3D.tsx |
| Clarify suppression radius | Add comment: scale = 1 cell, don't change | CorridorMagnetism.ts |
| Extend tangent for stability | ±10 → ±20 skeleton steps | CorridorMagnetism.ts |
| Reduce max turn magnitude | 15° → 10° | CorridorMagnetism.ts |
| Reduce jerkiness | Increase smoothing tau (×2.5) | CorridorMagnetism.ts |
| Prevent wobble oscillation | Add sign-flip suppression for small values | CorridorMagnetism.ts |
| Wider deadzone | 0.05 → 0.08 radians (~4.5°) | CorridorMagnetism.ts |

---

## Why These Changes Work

### Tangent ±20 Steps
At scale=100, ±20 steps means we're averaging direction over 40 skeleton pixels, which equals 0.4 cell widths of corridor. This provides excellent smoothness while still responding to curves within ~half a cell.

### Max Correction 10°
This prevents the jarring 180° flip scenario. Even if the system "wants" to flip the player around, it can only do so at 10° per frame maximum, giving the player time to react and the smoothing time to catch up.

### Wobble Prevention
When the correction oscillates between small positive and negative values (e.g., +0.01, -0.01, +0.01...), the sign-flip suppression catches these and decays toward zero instead, eliminating the visible wobble.

### Suppression Radius Comment
Adding a clear comment prevents future confusion: scale=100 means 100 skeleton steps per cell, so `suppressionRadius = scale` is exactly 1 cell - which is intentional.

