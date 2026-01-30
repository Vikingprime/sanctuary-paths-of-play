

# Fix: NaN Corruption Root Cause in Corridor Magnetism

## Problem Summary

The magnetism system has a NaN corruption issue that wasn't properly fixed - we only added a band-aid guard. The user correctly identified that we should fix the root cause, not just patch the symptoms.

## Root Cause Analysis

The NaN values originate from **unguarded decay calculations** when `delta` is negative or zero.

### The Corruption Path

1. In certain browser timing edge cases, `delta` can be 0 or negative (tab switching, requestAnimationFrame quirks, etc.)
2. The code at lines 506 and 535 does: `state.currentCorrection *= Math.exp(-config.decayRate * delta)`
3. With negative `delta`:
   - `Math.exp(-5.0 * -0.001) = Math.exp(0.005) = 1.005` (small values are fine)
   - `Math.exp(-5.0 * -1.0) = Math.exp(5.0) = 148.4` (large negative delta causes explosion)
4. More critically, if `state.currentCorrection` is exactly 0 and delta becomes very negative:
   - `Math.exp(large_positive) = Infinity`
   - `0 * Infinity = NaN` (JavaScript behavior)
5. Once `state.currentCorrection` is NaN, it stays NaN forever and propagates through all subsequent calculations

### Unprotected Code Paths

```text
Line 506: state.currentCorrection *= Math.exp(-config.decayRate * delta);
Line 535: state.currentCorrection *= Math.exp(-config.decayRate * delta);
Line 596: state.currentCorrection *= Math.exp(-config.decayRate * delta);
```

These three locations perform decay on the state without checking if `delta` is valid. The guard we added at line 718 only protects the *main calculation* path, not these early-return decay paths.

---

## Solution

Add `delta` validation at the **start** of the function, before any state mutation occurs. This ensures all code paths are protected with a single guard.

### File: `src/game/CorridorMagnetism.ts`

**Change 1**: Move the delta guard to the very beginning of the function (after the noOpResult definition, around line 502)

```typescript
// EARLY GUARD: Validate delta before any calculations or state mutations
// This prevents NaN corruption from negative/zero/non-finite delta values
if (!Number.isFinite(delta) || delta <= 0) {
  // Return existing state unchanged - don't mutate anything
  return {
    turnCorrection: Number.isFinite(state.currentCorrection) ? state.currentCorrection : 0,
    debug: { ...noOpResult.debug },
  };
}
```

**Change 2**: Remove the duplicate guard at lines 717-736 (since we now handle it at the start)

**Change 3**: Simplify the later NaN check to just be a safety net, not the primary protection:

```typescript
// Safety net: Reset state if somehow still NaN (shouldn't happen with early guard)
if (!Number.isFinite(finalCorrection)) {
  console.warn('[Magnetism] Unexpected NaN - resetting state');
  state.currentCorrection = 0;
  return { turnCorrection: 0, debug: { ...debugData } };
}
state.currentCorrection = finalCorrection;
```

---

## Why This Properly Fixes the Issue

| Before | After |
|--------|-------|
| 3 unprotected decay paths could corrupt state | Single guard at function entry protects all paths |
| NaN detection was reactive (after corruption) | Prevention before any state mutation |
| Band-aid reset losing valid state | Early return preserving existing state |

The key insight is that by validating `delta` at the very start of the function, we prevent any code path from executing with invalid timing data. This eliminates the source of NaN rather than just detecting it after the fact.

