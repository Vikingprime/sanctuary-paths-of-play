

# Fix: Preview Timer Freezes Due to Heavy Background Computation

## Problem

When the maze preview countdown starts (showing "15", "10", etc.), the 3D scene renders simultaneously in the background. The `buildMagnetismCache` function (which internally runs `computeMedialAxis`) executes synchronously during the React render cycle, blocking the main thread for 1-2+ seconds. During this time, the `requestAnimationFrame`-based timer cannot tick, causing the countdown to visually freeze before jumping ahead.

The console logs confirm this -- the MedialAxis computation runs 6+ times in rapid succession (~2 seconds), during which the timer is blocked.

## Solution

Defer the 3D scene rendering by a short delay after the preview starts. This lets the timer establish its ticking rhythm before the heavy computation kicks in. When the heavy work runs, the timestamp-based timer will jump slightly but recover -- much less jarring than freezing from the very start.

## Changes

### 1. `src/components/MazeGame3D.tsx` -- Delay 3D scene mount during preview

Add a `sceneRenderReady` state that becomes `true` 800ms after the component mounts or after a restart. Only render `Maze3DCanvas` when this flag is true. This gives the preview timer time to start ticking visibly before heavy computation begins.

```
// New state
const [sceneRenderReady, setSceneRenderReady] = useState(false);

// Delay scene rendering to let timer start ticking first
useEffect(() => {
  if (!isPreviewing) {
    setSceneRenderReady(true); // If not previewing, render immediately
    return;
  }
  setSceneRenderReady(false);
  const t = setTimeout(() => setSceneRenderReady(true), 800);
  return () => clearTimeout(t);
}, [isPreviewing, restartKey]);
```

Then conditionally render the canvas:
```
{sceneRenderReady && <Maze3DCanvas ... />}
```

### 2. `src/components/Maze3DScene.tsx` -- Stabilize `useMemo` dependencies

The `buildMagnetismCache` useMemo includes `onMagnetismCacheReady` in its dependency array (line 1195), which can cause unnecessary recomputation if the callback reference changes. Remove it from dependencies and call it via a ref pattern instead, similar to how the intro timer was fixed.

| File | Change |
|---|---|
| `src/components/MazeGame3D.tsx` | Add delayed scene rendering to prevent timer freeze |
| `src/components/Maze3DScene.tsx` | Stabilize `buildMagnetismCache` useMemo dependencies with ref pattern |

