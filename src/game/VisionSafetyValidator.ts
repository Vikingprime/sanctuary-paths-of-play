/**
 * Vision Safety Validator
 * 
 * Ensures that for every turning NPC in a maze, there exist safe waiting spots
 * that are NOT covered by ANY of the NPC's vision directions.
 * 
 * The key invariant: if a player must wait at cell X while an NPC's vision
 * points away (direction A), then when the NPC switches to direction B,
 * cell X must NOT be in the vision cone for direction B.
 * 
 * This prevents "trap" scenarios where the player has no safe cell to wait at
 * during vision transitions.
 */

import { MazeCharacter, ConeVisionConfig, CardinalDirection } from '@/types/game';
import { generateConeVisionOffsets } from './NPCRuntime';

interface VisionSafetyWarning {
  npcId: string;
  npcPosition: { x: number; y: number };
  type: 'no_safe_adjacent' | 'corridor_trap' | 'multi_npc_overlap';
  description: string;
  affectedCells: { x: number; y: number }[];
}

/**
 * For a single turning NPC, compute vision cells for each direction
 * and identify cells that are dangerous in ALL directions (permanent traps).
 */
function computeVisionPerDirection(
  npc: MazeCharacter,
  grid: { isWall?: boolean }[][]
): Map<CardinalDirection, Set<string>> {
  const result = new Map<CardinalDirection, Set<string>>();
  
  if (!npc.turning || !npc.coneVision) return result;
  
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length ?? 0;
  
  for (const dir of npc.turning.directions) {
    const offsets = generateConeVisionOffsets(npc.coneVision, dir);
    const cells = new Set<string>();
    
    for (const offset of offsets) {
      const x = npc.position.x + offset.dx;
      const y = npc.position.y + offset.dy;
      
      // Bounds check
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
      if (grid[y]?.[x]?.isWall) continue;
      
      // Simple wall-blocking: check if there's a wall between NPC and cell
      const dx = x - npc.position.x;
      const dy = y - npc.position.y;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      let blocked = false;
      
      for (let s = 1; s < steps; s++) {
        const cx = Math.round(npc.position.x + (dx * s) / steps);
        const cy = Math.round(npc.position.y + (dy * s) / steps);
        if (grid[cy]?.[cx]?.isWall) {
          blocked = true;
          break;
        }
      }
      
      if (!blocked) {
        cells.add(`${x},${y}`);
      }
    }
    
    result.set(dir, cells);
  }
  
  return result;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Get all walkable neighbors of a cell (4-directional).
 */
function getWalkableNeighbors(
  x: number, y: number,
  grid: { isWall?: boolean }[][]
): { x: number; y: number }[] {
  const neighbors: { x: number; y: number }[] = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length ?? 0;
  
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight && !grid[ny]?.[nx]?.isWall) {
      neighbors.push({ x: nx, y: ny });
    }
  }
  
  return neighbors;
}

/**
 * Validate a single turning NPC for vision safety.
 * Checks that for each direction transition, there exist "safe waiting spots" —
 * cells adjacent to the danger zone that are NOT in the next direction's vision.
 */
function validateSingleNPC(
  npc: MazeCharacter,
  grid: { isWall?: boolean }[][],
  allNPCVisionUnions: Map<string, Set<string>>
): VisionSafetyWarning[] {
  const warnings: VisionSafetyWarning[] = [];
  
  if (!npc.turning || !npc.coneVision || npc.turning.directions.length < 2) return warnings;
  
  const visionPerDir = computeVisionPerDirection(npc, grid);
  
  // Compute union of ALL directions for this NPC
  const allVisionUnion = new Set<string>();
  for (const cells of visionPerDir.values()) {
    for (const cell of cells) {
      allVisionUnion.add(cell);
    }
  }
  
  // Check: for each direction pair (d_i, d_{i+1} in ping-pong),
  // find cells that become newly dangerous. Ensure adjacent safe spots exist.
  const dirs = npc.turning.directions;
  
  for (let i = 0; i < dirs.length; i++) {
    const currentDir = dirs[i];
    const nextDir = dirs[(i + 1) % dirs.length];
    
    const currentVision = visionPerDir.get(currentDir) ?? new Set();
    const nextVision = visionPerDir.get(nextDir) ?? new Set();
    
    // Cells that are safe during currentDir but dangerous during nextDir
    // These are cells where the player might be waiting
    const newlyDangerous = new Set<string>();
    for (const cell of nextVision) {
      if (!currentVision.has(cell)) {
        newlyDangerous.add(cell);
      }
    }
    
    // For each newly dangerous cell, check if it has at least one walkable neighbor
    // that is NOT in ANY of this NPC's vision directions AND not in other NPCs' vision
    const trappedCells: { x: number; y: number }[] = [];
    
    for (const cellStr of newlyDangerous) {
      const { x, y } = parseKey(cellStr);
      const neighbors = getWalkableNeighbors(x, y, grid);
      
      // Does this cell have at least one neighbor that is ALWAYS safe from this NPC?
      const hasSafeNeighbor = neighbors.some(n => !allVisionUnion.has(cellKey(n.x, n.y)));
      
      if (!hasSafeNeighbor) {
        trappedCells.push({ x, y });
      }
    }
    
    if (trappedCells.length > 0) {
      warnings.push({
        npcId: npc.id,
        npcPosition: npc.position,
        type: 'no_safe_adjacent',
        description: `NPC "${npc.id}" at (${npc.position.x},${npc.position.y}): ` +
          `${trappedCells.length} cells become dangerous when turning from ${currentDir} to ${nextDir} ` +
          `with NO safe adjacent waiting spot. Affected: ${trappedCells.map(c => `(${c.x},${c.y})`).join(', ')}`,
        affectedCells: trappedCells,
      });
    }
  }
  
  return warnings;
}

/**
 * Check for multi-NPC vision overlap traps.
 * If two NPCs' vision unions overlap such that a corridor segment has
 * no cell that's safe from BOTH NPCs simultaneously, it's a trap.
 */
function validateMultiNPCOverlap(
  npcs: MazeCharacter[],
  grid: { isWall?: boolean }[][]
): VisionSafetyWarning[] {
  const warnings: VisionSafetyWarning[] = [];
  const turningNPCs = npcs.filter(n => n.turning && n.coneVision);
  
  if (turningNPCs.length < 2) return warnings;
  
  // Compute vision union for each NPC
  const npcVisionUnions = new Map<string, Set<string>>();
  for (const npc of turningNPCs) {
    const perDir = computeVisionPerDirection(npc, grid);
    const union = new Set<string>();
    for (const cells of perDir.values()) {
      for (const cell of cells) union.add(cell);
    }
    npcVisionUnions.set(npc.id, union);
  }
  
  // Check pairs of NPCs
  for (let i = 0; i < turningNPCs.length; i++) {
    for (let j = i + 1; j < turningNPCs.length; j++) {
      const npc1 = turningNPCs[i];
      const npc2 = turningNPCs[j];
      const union1 = npcVisionUnions.get(npc1.id)!;
      const union2 = npcVisionUnions.get(npc2.id)!;
      
      // Find cells that are in BOTH unions
      const overlap = new Set<string>();
      for (const cell of union1) {
        if (union2.has(cell)) overlap.add(cell);
      }
      
      if (overlap.size > 0) {
        // Check if overlapping cells have any adjacent cell that's safe from BOTH
        const combinedUnion = new Set([...union1, ...union2]);
        const trappedOverlap: { x: number; y: number }[] = [];
        
        for (const cellStr of overlap) {
          const { x, y } = parseKey(cellStr);
          const neighbors = getWalkableNeighbors(x, y, grid);
          const hasSafeNeighbor = neighbors.some(n => !combinedUnion.has(cellKey(n.x, n.y)));
          
          if (!hasSafeNeighbor) {
            trappedOverlap.push({ x, y });
          }
        }
        
        if (trappedOverlap.length > 0) {
          warnings.push({
            npcId: `${npc1.id}+${npc2.id}`,
            npcPosition: npc1.position,
            type: 'multi_npc_overlap',
            description: `NPCs "${npc1.id}" and "${npc2.id}" have overlapping vision zones with ` +
              `${trappedOverlap.length} cells that have NO safe adjacent cell from either NPC. ` +
              `Trapped: ${trappedOverlap.map(c => `(${c.x},${c.y})`).join(', ')}`,
            affectedCells: trappedOverlap,
          });
        }
      }
    }
  }
  
  return warnings;
}

/**
 * Run full vision safety validation for a maze.
 * Returns all warnings found. Logs to console in development.
 */
export function validateMazeVisionSafety(
  mazeId: number,
  mazeName: string,
  characters: MazeCharacter[],
  grid: { isWall?: boolean }[][]
): VisionSafetyWarning[] {
  const allWarnings: VisionSafetyWarning[] = [];
  
  // Single NPC validation
  const npcVisionUnions = new Map<string, Set<string>>();
  for (const npc of characters) {
    if (!npc.turning || !npc.coneVision) continue;
    
    const perDir = computeVisionPerDirection(npc, grid);
    const union = new Set<string>();
    for (const cells of perDir.values()) {
      for (const cell of cells) union.add(cell);
    }
    npcVisionUnions.set(npc.id, union);
    
    const warnings = validateSingleNPC(npc, grid, npcVisionUnions);
    allWarnings.push(...warnings);
  }
  
  // Multi-NPC overlap validation
  const overlapWarnings = validateMultiNPCOverlap(characters, grid);
  allWarnings.push(...overlapWarnings);
  
  // Log warnings in development
  if (allWarnings.length > 0) {
    console.warn(`[VisionSafety] Maze ${mazeId} "${mazeName}" has ${allWarnings.length} vision safety warning(s):`);
    for (const w of allWarnings) {
      console.warn(`  ⚠️ ${w.description}`);
    }
  } else {
    console.log(`[VisionSafety] Maze ${mazeId} "${mazeName}" ✅ All vision zones have safe waiting spots`);
  }
  
  return allWarnings;
}
