/**
 * NPC Runtime - Turning, patrol, and directional vision resolution
 * 
 * Pure game logic, portable to Unity.
 */

import { MazeCharacter, CardinalDirection } from '@/types/game';

// Runtime state for a single NPC
export interface NPCRuntimeState {
  characterId: string;
  currentDirection: CardinalDirection;
  // Ping-pong state
  pingPongIndex: number; // Current index in directions array
  pingPongForward: boolean; // true = going forward through array, false = reversing
  elapsedMs: number; // Time elapsed in current direction
  // Patrol state (future)
  patrolWaypointIndex: number;
  patrolPosition: { x: number; y: number }; // Current world position (for moving NPCs)
  patrolPauseElapsed: number;
  isPatrolPaused: boolean;
}

/**
 * Initialize runtime state for all NPCs that have turning or patrol configs
 */
export function initNPCRuntimeStates(characters: MazeCharacter[]): Map<string, NPCRuntimeState> {
  const states = new Map<string, NPCRuntimeState>();
  
  for (const char of characters) {
    if (!char.turning && !char.patrol) continue;
    
    const initialDir: CardinalDirection = char.turning?.initialDirection 
      ?? char.turning?.directions[0] 
      ?? 'south';
    
    states.set(char.id, {
      characterId: char.id,
      currentDirection: initialDir,
      pingPongIndex: 0,
      pingPongForward: true,
      elapsedMs: 0,
      patrolWaypointIndex: 0,
      patrolPosition: { x: char.position.x, y: char.position.y },
      patrolPauseElapsed: 0,
      isPatrolPaused: false,
    });
  }
  
  return states;
}

/**
 * Advance NPC turning state by deltaMs.
 * Returns true if direction changed.
 */
export function updateNPCTurning(state: NPCRuntimeState, character: MazeCharacter, deltaMs: number): boolean {
  if (!character.turning) return false;
  
  const { directions, intervalMs } = character.turning;
  if (directions.length < 2) return false;
  
  state.elapsedMs += deltaMs;
  
  if (state.elapsedMs >= intervalMs) {
    state.elapsedMs -= intervalMs;
    
    // Ping-pong: bounce back and forth through the directions array
    if (state.pingPongForward) {
      state.pingPongIndex++;
      if (state.pingPongIndex >= directions.length - 1) {
        state.pingPongForward = false;
      }
    } else {
      state.pingPongIndex--;
      if (state.pingPongIndex <= 0) {
        state.pingPongForward = true;
      }
    }
    
    state.currentDirection = directions[state.pingPongIndex];
    return true;
  }
  
  return false;
}

/**
 * Get the world-space rotation (Y-axis) for a cardinal direction.
 * 0 = facing +Z (south in grid coords), PI = facing -Z (north)
 */
export function directionToRotation(direction: CardinalDirection): number {
  switch (direction) {
    case 'south': return 0;
    case 'west': return Math.PI / 2;
    case 'north': return Math.PI;
    case 'east': return -Math.PI / 2;
  }
}

/**
 * Resolve active vision cells for an NPC given its current state.
 * Handles both legacy absolute visionCells and new directionalVision.
 * Returns absolute grid coordinates.
 */
export function resolveVisionCells(
  character: MazeCharacter, 
  npcState?: NPCRuntimeState
): { x: number; y: number }[] {
  // If directional vision is defined and we have a runtime state, use that
  if (character.directionalVision && npcState) {
    const zone = character.directionalVision[npcState.currentDirection];
    if (zone) {
      // Convert relative offsets to absolute positions
      const pos = npcState.patrolPosition ?? character.position;
      return zone.cells.map(cell => ({
        x: pos.x + cell.dx,
        y: pos.y + cell.dy,
      }));
    }
    return [];
  }
  
  // Legacy: return absolute vision cells
  return character.visionCells ?? [];
}

/**
 * Update patrol movement for an NPC.
 * Returns true if position changed.
 */
export function updateNPCPatrol(
  state: NPCRuntimeState, 
  character: MazeCharacter, 
  deltaSec: number,
  isWall: (x: number, y: number) => boolean
): boolean {
  if (!character.patrol) return false;
  
  const { waypoints, speedCellsPerSec, pauseMs } = character.patrol;
  if (waypoints.length < 2) return false;
  
  // Handle pause at waypoint
  if (state.isPatrolPaused) {
    state.patrolPauseElapsed += deltaSec * 1000;
    if (state.patrolPauseElapsed >= (pauseMs ?? 0)) {
      state.isPatrolPaused = false;
      state.patrolPauseElapsed = 0;
    }
    return false;
  }
  
  // Move toward current target waypoint
  const targetWP = waypoints[state.patrolWaypointIndex];
  const dx = targetWP.x - state.patrolPosition.x;
  const dy = targetWP.y - state.patrolPosition.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 0.05) {
    // Reached waypoint
    state.patrolPosition.x = targetWP.x;
    state.patrolPosition.y = targetWP.y;
    state.patrolWaypointIndex = (state.patrolWaypointIndex + 1) % waypoints.length;
    
    if (pauseMs && pauseMs > 0) {
      state.isPatrolPaused = true;
      state.patrolPauseElapsed = 0;
    }
    return true;
  }
  
  // Move toward target
  const moveAmount = speedCellsPerSec * deltaSec;
  const ratio = Math.min(moveAmount / dist, 1.0);
  state.patrolPosition.x += dx * ratio;
  state.patrolPosition.y += dy * ratio;
  
  // Update facing direction based on movement
  if (Math.abs(dx) > Math.abs(dy)) {
    state.currentDirection = dx > 0 ? 'east' : 'west';
  } else {
    state.currentDirection = dy > 0 ? 'south' : 'north';
  }
  
  return true;
}
