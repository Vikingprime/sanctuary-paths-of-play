/**
 * NPC Runtime - Turning, patrol, and directional vision resolution
 * 
 * Pure game logic, portable to Unity.
 */

import { MazeCharacter, CardinalDirection, ConeVisionConfig, MazeObstacle } from '@/types/game';
import { getCharacterHeight } from './CharacterConfig';

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
 * Generate triangle cone vision cells for a given direction.
 * The cone starts 1 cell in front and widens by `spreadPerCell` each row.
 * Returns relative offsets (dx, dy) from NPC position.
 */
export function generateConeVisionOffsets(
  config: ConeVisionConfig,
  direction: CardinalDirection
): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [];
  
  for (let depth = 1; depth <= config.range; depth++) {
    // Width at this depth: 1 + 2 * spreadPerCell * (depth - 1)
    // e.g., spread=1: depth1=1wide, depth2=3wide, depth3=5wide
    const halfWidth = config.spreadPerCell * (depth - 1);
    
    for (let lateral = -halfWidth; lateral <= halfWidth; lateral++) {
      // Generate in "north" frame (dy negative = forward)
      let dx: number, dy: number;
      switch (direction) {
        case 'north': dx = lateral; dy = -depth; break;
        case 'south': dx = -lateral; dy = depth; break;
        case 'east': dx = depth; dy = lateral; break;
        case 'west': dx = -depth; dy = -lateral; break;
      }
      offsets.push({ dx, dy });
    }
  }
  
  return offsets;
}

/**
 * Resolve active vision cells for an NPC given its current state.
 * Handles coneVision and directionalVision.
 * Returns absolute grid coordinates.
 */
export function resolveVisionCells(
  character: MazeCharacter, 
  npcState?: NPCRuntimeState,
  isWallFn?: (x: number, y: number) => boolean
): { x: number; y: number }[] {
  const pos = npcState?.patrolPosition ?? character.position;
  const direction = npcState?.currentDirection ?? 'south';
  
  // Cone vision (primary)
  if (character.coneVision) {
    const offsets = generateConeVisionOffsets(character.coneVision, direction);
    const cells = offsets.map(o => ({ x: pos.x + o.dx, y: pos.y + o.dy }));
    // Filter by walls - walls block all vision behind them
    if (isWallFn) {
      return filterVisionByWalls(pos, cells, isWallFn);
    }
    return cells;
  }
  
  // If directional vision is defined and we have a runtime state, use that
  if (character.directionalVision && npcState) {
    const zone = character.directionalVision[npcState.currentDirection];
    if (zone) {
      const cells = zone.cells.map(cell => ({
        x: pos.x + cell.dx,
        y: pos.y + cell.dy,
      }));
      if (isWallFn) {
        return filterVisionByWalls(pos, cells, isWallFn);
      }
      return cells;
    }
    return [];
  }
  
  // No vision configuration found
  return [];
}

/**
 * Filter vision cells by wall blocking.
 * A wall cell blocks all cells behind it from the observer's perspective.
 * Uses ray-marching: walk from observer to each target cell, stop if we hit a wall.
 */
function filterVisionByWalls(
  observer: { x: number; y: number },
  cells: { x: number; y: number }[],
  isWall: (x: number, y: number) => boolean
): { x: number; y: number }[] {
  return cells.filter(cell => {
    // Walk from observer toward cell, check for walls in between
    const dx = cell.x - observer.x;
    const dy = cell.y - observer.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 0) return true;
    
    for (let s = 1; s <= steps; s++) {
      const cx = Math.round(observer.x + (dx * s) / steps);
      const cy = Math.round(observer.y + (dy * s) / steps);
      if (isWall(cx, cy)) return false;
    }
    return true;
  });
}

/**
 * Check if a line of sight from NPC to a target cell is blocked by an obstacle.
 * Uses height-based check: if the observer's eye height < obstacle height, LOS is blocked.
 * 
 * @param npcPos - NPC grid position
 * @param targetCell - Target grid cell to check
 * @param obstacles - List of maze obstacles
 * @param observerHeight - Height of the observing creature (from CharacterConfig)
 * @returns true if the line of sight is blocked
 */
export function isLOSBlockedByObstacle(
  npcPos: { x: number; y: number },
  targetCell: { x: number; y: number },
  obstacles: MazeObstacle[],
  observerHeight: number
): boolean {
  // Check each obstacle
  for (const obstacle of obstacles) {
    const obstacleHeight = getCharacterHeight(obstacle.model);
    
    // Only blocks if obstacle is taller than the observer
    if (obstacleHeight < observerHeight) continue;
    
    // Check if obstacle is between NPC and target (simple grid-based check)
    // The obstacle blocks if it's on the line between NPC and target
    const ox = obstacle.position.x;
    const oy = obstacle.position.y;
    
    // Parametric line from npc to target
    const dx = targetCell.x - npcPos.x;
    const dy = targetCell.y - npcPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue; // Target is at NPC position
    
    // Check if obstacle cell lies on (or very near) the line from NPC to target
    // and is between them (not behind NPC or past target)
    const t = ((ox - npcPos.x) * dx + (oy - npcPos.y) * dy) / (len * len);
    
    if (t <= 0.1 || t >= 0.9) continue; // Not between NPC and target
    
    // Distance from obstacle to the line
    const projX = npcPos.x + t * dx;
    const projY = npcPos.y + t * dy;
    const distToLine = Math.sqrt((ox - projX) ** 2 + (oy - projY) ** 2);
    
    if (distToLine < 0.6) {
      // Obstacle is on the line and taller than observer - blocks LOS
      return true;
    }
  }
  
  return false;
}

/**
 * Resolve vision cells with LOS blocking from obstacles.
 * Small creatures (determined by their model height) can't see past tall obstacles.
 */
export function resolveVisionCellsWithLOS(
  character: MazeCharacter,
  npcState: NPCRuntimeState | undefined,
  obstacles: MazeObstacle[],
  isWallFn?: (x: number, y: number) => boolean
): { x: number; y: number }[] {
  const rawCells = resolveVisionCells(character, npcState);
  
  if (obstacles.length === 0) return rawCells;
  
  const pos = npcState?.patrolPosition ?? character.position;
  const observerHeight = getCharacterHeight(character.model);
  
  return rawCells.filter(cell => {
    // Check wall blocking (optional)
    if (isWallFn && isWallFn(cell.x, cell.y)) return false;
    // Check obstacle LOS blocking
    return !isLOSBlockedByObstacle(pos, cell, obstacles, observerHeight);
  });
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
