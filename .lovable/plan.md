

# Remove Debug Logs & Fix FPS Drops

## Root Cause

The FPS drops are caused by **unconditional `console.log` statements in hot paths** that execute every frame:

1. **`src/game/CorridorMagnetism.ts`** - 5 logging locations inside the magnetism calculation loop
2. **`src/components/Maze3DScene.tsx`** - 2 logging locations in the movement/render loop

Each `console.log` with object serialization (`.toFixed()` calls, object creation) triggers garbage collection pressure and blocks the main thread for ~0.5-2ms per call. With 5+ logs per frame at 60fps, this adds up to significant frame drops.

## Changes

### File 1: `src/game/CorridorMagnetism.ts`

Remove all `[TANGENT-LOCK]` debug logging:

| Lines | Log Type | Action |
|-------|----------|--------|
| 672-680 | SPINE JUMP detection | Remove the `if` block and its log statement |
| 740-748 | SIGN FLIP detection | Remove the `if` block and its log statement |
| 993-998 | Entry conditions | Remove the log statement |
| 1046-1054 | Geometry data | Remove the log statement |
| 1068-1076 | Offset application | Remove the log statement |

### File 2: `src/components/Maze3DScene.tsx`

Remove all movement-related debug logging:

| Lines | Log Type | Action |
|-------|----------|--------|
| 1277-1296 | MOVE delta tracking | Remove the entire `if` block (lines 1277-1296) that calculates and logs position deltas |
| 1373-1385 | Periodic magnetism debug | Remove the `if (Math.random() < 0.016)` block and its log statement |

## Technical Details

The removed logs were added specifically for debugging the lateral overshoot issue (now fixed with raw spine anchor). Since that issue is resolved, these diagnostic logs are no longer needed.

**What stays:**
- The `console.warn('[Magnetism] Unexpected NaN...')` at line 834 stays - it's a safety warning that should rarely trigger and is important for catching edge cases
- All the actual magnetism logic remains unchanged
- The `debugLog`/`verboseLog` utilities in `src/lib/debug.ts` remain for future use (they're already gated behind debug flags)

## Expected Impact

Removing ~7 console.log calls per frame should:
- Eliminate random 10-50ms frame spikes
- Reduce garbage collection pressure
- Restore consistent frame timing

