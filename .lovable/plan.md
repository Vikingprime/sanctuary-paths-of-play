
# Rail Movement Shaking Fix - Implementation Complete

## Root Cause Identified

The shaking was caused by the animal moving **toward** waypoints in straight lines rather than following the actual curved path. This created a zigzag pattern as the animal took shortcuts between densely-packed path points.

## Solution Implemented

Replaced the "move toward waypoint" approach with **arc-length traversal**:

1. **Fractional index interpolation**: Instead of moving toward the next point, we maintain a fractional path index and advance it based on speed/segment length
2. **Linear interpolation between points**: Position is calculated as `lerp(pathPoint[i], pathPoint[i+1], fractionalPart)`
3. **Instant position lock**: Position lerp factor of 1.0 in rail mode eliminates all smoothing lag

## Changes Made

### src/components/Maze3DScene.tsx
- Added `railFractionalIndexRef` prop for smooth arc-length traversal
- Replaced movement-toward-waypoint logic with interpolation-along-path logic
- Position now stays exactly on the path curve at all times

### src/components/MazeGame3D.tsx
- Added `railFractionalIndexRef = useRef(0)` for fractional path tracking
- Passed new ref to Maze3DCanvas

## Technical Details

Old approach (caused jitter):
```
direction = normalize(targetWaypoint - currentPosition)
newPosition = currentPosition + direction * speed * dt
```

New approach (smooth):
```
fractionalIndex += (speed * dt) / segmentLength
t = fractionalIndex - floor(fractionalIndex)
newPosition = lerp(path[floor(idx)], path[floor(idx)+1], t)
```

The animal now glides smoothly along the exact curve defined by the path points.
