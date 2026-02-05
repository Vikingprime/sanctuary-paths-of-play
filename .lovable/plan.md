
# Fix: Timer Stuck at 15 Before Jumping to 10

## Problem Summary

The 15-second countdown timer in the intro sequence freezes at "15" for several seconds before suddenly jumping to "10". This happens because the timer keeps restarting every time the parent component re-renders.

## Root Cause

The countdown timer in `MazeIntroSequence.tsx` has `onComplete` as a dependency in its `useEffect`. However, in `MazeGame3D.tsx`, the `onComplete` callback is passed as an **inline arrow function**:

```typescript
onComplete={() => {
  setIsShowingIntro(false);
  setIsPreviewing(false);
}}
```

Every parent re-render creates a new function reference, which triggers the timer's `useEffect` to restart, resetting the start time and effectively freezing the display.

---

## Solution

### Step 1: Stabilize the callback in `MazeGame3D.tsx`

Wrap the `onComplete` callback in `useCallback` to ensure it has a stable reference across re-renders:

```typescript
const handleIntroComplete = useCallback(() => {
  setIsShowingIntro(false);
  setIsPreviewing(false);
}, []);
```

Then pass this stable reference:

```typescript
<MazeIntroSequence
  maze={maze}
  introDialogues={maze.introDialogues}
  onComplete={handleIntroComplete}  // Stable reference
  isMuted={isMuted}
/>
```

### Step 2: Remove `onComplete` from timer dependencies (defensive fix)

In `MazeIntroSequence.tsx`, the timer effect should not depend on `onComplete` since it only calls it once at the end. Use a ref to store the callback:

```typescript
const onCompleteRef = useRef(onComplete);

// Keep ref updated
useEffect(() => {
  onCompleteRef.current = onComplete;
}, [onComplete]);

// Timer effect - no longer depends on onComplete
useEffect(() => {
  if (!isShowingMazePreview) return;

  const startTime = Date.now();
  const duration = maze.previewTime;
  
  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, duration - elapsed);
    
    setMazePreviewCountdown(remaining);
    
    if (remaining <= 0) {
      clearInterval(timer);
      onCompleteRef.current();  // Call via ref
    }
  }, 100);

  return () => clearInterval(timer);
}, [isShowingMazePreview, maze.previewTime]);  // onComplete removed
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/MazeGame3D.tsx` | Wrap intro completion handler in `useCallback` |
| `src/components/MazeIntroSequence.tsx` | Use ref pattern to avoid timer restart on callback change |

---

## Technical Details

**Why both fixes?**

1. **`useCallback` in parent** - Prevents unnecessary re-creations of the callback function
2. **Ref pattern in child** - Makes the timer robust against any future callback instability (defensive programming)

Together, these ensure the countdown ticks reliably every second without restarts or jumps.
