

# Smoother Magnetism: Higher Resolution + Wider Tangent + Gentler Corrections

## Overview

Three changes to make magnetism corrections feel smooth and gradual instead of jerky:

1. **Increase skeleton resolution from 10 to 30** - More skeleton points means smaller steps between them, reducing jumps
2. **Widen tangent sampling window from 1 to 3 steps** - Averages direction over a longer section for stability  
3. **Reduce correction strength and increase smoothing time** - Gentler, slower corrections

---

## Changes Summary

| Setting | Before | After | Effect |
|---------|--------|-------|--------|
| Skeleton scale | 10×10 subcells/cell | 30×30 subcells/cell | 9× more skeleton points, smaller position jumps |
| Tangent lookAhead | ±1 step | ±3 steps | Smoother tangent direction, less jitter |
| maxStrength | 0.8 (80%) | 0.5 (50%) | Smaller individual corrections |
| smoothingTau | 0.15s (150ms) | 0.30s (300ms) | Slower ramp-up, gentler feel |

---

## Technical Details

### File: `src/game/CorridorMagnetism.ts`

**Change 1: Increase skeleton resolution (line 163)**
```typescript
// Before:
const result = computeMedialAxis(maze, 10, spurConfig);

// After:
const result = computeMedialAxis(maze, 30, spurConfig);
```

**Change 2: Widen tangent sampling window (line 587)**
```typescript
// Before:
const tangent = computeTangentExtended(nearest, cache, 1);

// After:
const tangent = computeTangentExtended(nearest, cache, 3);
```

**Change 3: Reduce strength and increase smoothing (lines 143-144)**
```typescript
// Before:
maxStrength: 0.8,
smoothingTau: 0.15,

// After:
maxStrength: 0.5,
smoothingTau: 0.30,
```

---

## How Each Change Helps

**Higher Resolution (30×30)**
- Currently there are ~10 skeleton points per maze cell width
- Increasing to 30 means skeleton points are 3× closer together
- When the "nearest point" switches, the tangent direction changes less dramatically
- Result: Smoother transitions when moving along corridors

**Wider Tangent Window (±3 steps)**  
- Currently the tangent is computed from 2 skeleton points (±1 step from current)
- Widening to ±3 steps averages direction over 6 skeleton points
- Local geometry variations get smoothed out
- Result: More stable tangent that doesn't jump as the nearest point changes

**Reduced Strength + Slower Smoothing**
- 50% max strength means each correction is smaller
- 300ms smoothing time means corrections ramp up over twice as long
- Result: Gentle nudges instead of sudden jerks

---

## Expected Behavior After Changes

- Magnetism cache will have ~9× more skeleton pixels (may slightly increase initialization time)
- Turn corrections will feel like subtle guidance rather than forceful steering
- The animal will smoothly align with corridor curves over several frames
- Suppression zones near junctions will also scale appropriately (radius = 30 steps instead of 10)

