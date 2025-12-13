/**
 * Game Logic - Pure functions for game mechanics
 * 
 * UNITY PORTABLE: All functions are pure and stateless
 * No React, no Three.js, no DOM - just math and logic
 */

import { Maze, AnimalType } from '@/types/game';
import { GameConfig } from './GameConfig';
import { isWall, getCell } from './MazeUtils';

// ============================================
// TYPES (duplicate in Unity as C# structs/classes)
// ============================================

export interface PlayerState {
  x: number;
  y: number;
  rotation: number; // radians, 0 = facing -Z (north)
}

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
}

export interface GameStateData {
  playerState: PlayerState;
  timeRemaining: number;
  isGameOver: boolean;
  hasWon: boolean;
  score: number;
  speedBoostActive: boolean;
  speedBoostEndTime: number;
  collectedPowerUps: Set<string>;
  abilityUsed: boolean;
}

// ============================================
// COLLISION DETECTION
// ============================================

/**
 * Check if a position collides with any wall
 * Uses player radius for more accurate collision
 */
export function checkCollision(
  maze: Maze,
  x: number,
  y: number,
  radius: number = GameConfig.PLAYER_RADIUS
): boolean {
  const gridX = Math.floor(x);
  const gridY = Math.floor(y);

  // Check bounds and current cell
  if (isWall(maze, gridX, gridY)) return true;

  // Check nearby cells based on player radius
  const checkRadius = radius + 0.1;
  const offsets = [
    [-checkRadius, 0],
    [checkRadius, 0],
    [0, -checkRadius],
    [0, checkRadius],
  ];

  for (const [dx, dy] of offsets) {
    const checkX = Math.floor(x + dx);
    const checkY = Math.floor(y + dy);
    if (isWall(maze, checkX, checkY)) {
      return true;
    }
  }

  return false;
}

// ============================================
// ROCK COLLISION
// ============================================

export interface RockPosition {
  x: number;
  z: number;
  radius: number;
}

/**
 * Generate rock positions for a maze (deterministic based on maze layout)
 * Rocks are placed near wall edges, not in path centers, and spaced apart
 */
export function generateRockPositions(maze: Maze): RockPosition[] {
  const rocks: RockPosition[] = [];
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  
  const mazeWidth = maze.grid[0].length;
  const mazeHeight = maze.grid.length;
  const MIN_ROCK_DISTANCE = 1.5; // Minimum distance between rocks
  
  // Helper to check if a position is too close to existing rocks
  const isTooClose = (rx: number, rz: number): boolean => {
    for (const rock of rocks) {
      const dx = rx - rock.x;
      const dz = rz - rock.z;
      if (Math.sqrt(dx * dx + dz * dz) < MIN_ROCK_DISTANCE) {
        return true;
      }
    }
    return false;
  };
  
  for (let y = 1; y < mazeHeight - 1; y++) {
    for (let x = 1; x < mazeWidth - 1; x++) {
      if (maze.grid[y][x].isWall) continue;
      
      const seed = x * 1000 + y;
      if (seededRandom(seed) > 0.88) { // 12% chance
        // Check which walls are adjacent to position rock near edge
        const wallLeft = x > 0 && maze.grid[y][x-1].isWall;
        const wallRight = x < mazeWidth - 1 && maze.grid[y][x+1].isWall;
        const wallUp = y > 0 && maze.grid[y-1][x].isWall;
        const wallDown = y < mazeHeight - 1 && maze.grid[y+1][x].isWall;
        
        // Only place rocks next to walls (at path edges)
        if (!wallLeft && !wallRight && !wallUp && !wallDown) continue;
        
        // Position rock at the very edge of the path, barely overlapping
        let rx = x + 0.5;
        let rz = y + 0.5;
        
        // Push rocks much closer to walls - barely on the path
        if (wallLeft) {
          rx = x + 0.02 + seededRandom(seed + 1) * 0.08; // Very close to left wall
          rz = y + 0.2 + seededRandom(seed + 2) * 0.6;
        } else if (wallRight) {
          rx = x + 0.90 + seededRandom(seed + 1) * 0.08; // Very close to right wall
          rz = y + 0.2 + seededRandom(seed + 2) * 0.6;
        } else if (wallUp) {
          rx = x + 0.2 + seededRandom(seed + 1) * 0.6;
          rz = y + 0.02 + seededRandom(seed + 2) * 0.08; // Very close to top wall
        } else if (wallDown) {
          rx = x + 0.2 + seededRandom(seed + 1) * 0.6;
          rz = y + 0.90 + seededRandom(seed + 2) * 0.08; // Very close to bottom wall
        }
        
        // Skip if too close to another rock
        if (isTooClose(rx, rz)) continue;
        
        const scale = 0.08 + seededRandom(seed + 3) * 0.10;
        rocks.push({
          x: rx,
          z: rz,
          radius: scale * 0.3, // Even smaller collision radius for minimal interaction
        });
      }
    }
  }
  return rocks;
}

/**
 * Check if position collides with any rock
 */
export function checkRockCollision(
  x: number,
  y: number,
  rocks: RockPosition[],
  playerRadius: number = GameConfig.PLAYER_RADIUS
): boolean {
  for (const rock of rocks) {
    const dx = x - rock.x;
    const dy = y - rock.z;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < playerRadius + rock.radius) {
      return true;
    }
  }
  return false;
}

// ============================================
// MOVEMENT
// ============================================

/**
 * Calculate new player position based on input
 * Returns new state without mutation
 */
export function calculateMovement(
  maze: Maze,
  currentState: PlayerState,
  input: MovementInput,
  deltaTime: number,
  speedBoostActive: boolean,
  rocks: RockPosition[] = []
): PlayerState {
  const moveSpeed = speedBoostActive
    ? GameConfig.BOOSTED_MOVE_SPEED
    : GameConfig.BASE_MOVE_SPEED;

  // Calculate rotation and normalize to 0-2π to prevent floating-point issues
  let newRotation = currentState.rotation;
  if (input.rotateLeft) {
    newRotation -= GameConfig.ROTATION_SPEED * deltaTime;
  }
  if (input.rotateRight) {
    newRotation += GameConfig.ROTATION_SPEED * deltaTime;
  }
  // Normalize rotation to prevent accumulation of large values
  newRotation = ((newRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Calculate movement vector based on facing direction
  let moveX = 0;
  let moveY = 0;

  if (input.forward) {
    moveX += Math.sin(newRotation) * moveSpeed * deltaTime;
    moveY -= Math.cos(newRotation) * moveSpeed * deltaTime;
  }
  if (input.backward) {
    moveX -= Math.sin(newRotation) * moveSpeed * deltaTime;
    moveY += Math.cos(newRotation) * moveSpeed * deltaTime;
  }

  // Helper to check both wall and rock collision
  const hasCollision = (x: number, y: number) => 
    checkCollision(maze, x, y) || checkRockCollision(x, y, rocks);

  // Try combined movement first
  let newX = currentState.x + moveX;
  let newY = currentState.y + moveY;

  if (hasCollision(newX, newY)) {
    // Wall sliding: try X and Y separately
    if (!hasCollision(currentState.x + moveX, currentState.y)) {
      newX = currentState.x + moveX;
      newY = currentState.y;
    } else if (!hasCollision(currentState.x, currentState.y + moveY)) {
      newX = currentState.x;
      newY = currentState.y + moveY;
    } else {
      // Can't move at all
      newX = currentState.x;
      newY = currentState.y;
    }
  }

  return { x: newX, y: newY, rotation: newRotation };
}

// ============================================
// CELL INTERACTIONS
// ============================================

export interface CellInteractionResult {
  collectPowerUp: boolean;
  powerUpKey: string | null;
  triggerStation: boolean;
  reachedEnd: boolean;
}

/**
 * Check what the player interacts with at current position
 */
export function checkCellInteraction(
  maze: Maze,
  x: number,
  y: number,
  collectedPowerUps: Set<string>
): CellInteractionResult {
  const gridX = Math.floor(x);
  const gridY = Math.floor(y);
  const cell = getCell(maze, gridX, gridY);

  const result: CellInteractionResult = {
    collectPowerUp: false,
    powerUpKey: null,
    triggerStation: false,
    reachedEnd: false,
  };

  if (!cell) return result;

  const powerUpKey = `${gridX},${gridY}`;

  if (cell.isPowerUp && !collectedPowerUps.has(powerUpKey)) {
    result.collectPowerUp = true;
    result.powerUpKey = powerUpKey;
  }

  if (cell.isStation) {
    result.triggerStation = true;
  }

  if (cell.isEnd) {
    result.reachedEnd = true;
  }

  return result;
}

// ============================================
// SCORING
// ============================================

/**
 * Calculate score based on time remaining
 */
export function calculateScore(timeRemaining: number): number {
  return Math.round(timeRemaining * GameConfig.SCORE_PER_SECOND_LEFT);
}

/**
 * Calculate stars based on completion time
 */
export function calculateStars(timeUsed: number): number {
  const thresholds = GameConfig.STAR_THRESHOLDS;
  if (timeUsed < thresholds.THREE_STARS) return 3;
  if (timeUsed < thresholds.TWO_STARS) return 2;
  return 1;
}

// ============================================
// ABILITIES
// ============================================

export interface AbilityResult {
  newPlayerState: PlayerState | null; // null = no position change
  showMap: boolean;
  success: boolean;
}

/**
 * Execute animal ability
 */
export function executeAbility(
  animalType: AnimalType,
  maze: Maze,
  playerState: PlayerState
): AbilityResult {
  switch (animalType) {
    case 'pig':
      // Pig reveals nearby power-ups (show map)
      return { newPlayerState: null, showMap: true, success: true };

    case 'cow':
      // Cow shows full map
      return { newPlayerState: null, showMap: true, success: true };

    case 'bird':
      // Bird flies over one wall
      const forwardX = Math.sin(playerState.rotation);
      const forwardY = -Math.cos(playerState.rotation);

      const wallGridX = Math.floor(playerState.x + forwardX);
      const wallGridY = Math.floor(playerState.y + forwardY);
      const beyondX = playerState.x + forwardX * 2;
      const beyondY = playerState.y + forwardY * 2;
      const beyondGridX = Math.floor(beyondX);
      const beyondGridY = Math.floor(beyondY);

      // Check: wall ahead and path beyond
      if (
        isWall(maze, wallGridX, wallGridY) &&
        !isWall(maze, beyondGridX, beyondGridY)
      ) {
        return {
          newPlayerState: { ...playerState, x: beyondX, y: beyondY },
          showMap: false,
          success: true,
        };
      }

      // No wall to fly over or no safe landing
      return { newPlayerState: null, showMap: false, success: false };

    default:
      return { newPlayerState: null, showMap: false, success: false };
  }
}

/**
 * C# equivalent structure:
 * 
 * public static class GameLogic
 * {
 *     public static bool CheckCollision(Maze maze, float x, float y, float radius) { ... }
 *     public static PlayerState CalculateMovement(Maze maze, PlayerState current, MovementInput input, float deltaTime, bool speedBoost) { ... }
 *     public static CellInteractionResult CheckCellInteraction(Maze maze, float x, float y, HashSet<string> collected) { ... }
 *     public static int CalculateScore(float timeRemaining) { ... }
 *     public static int CalculateStars(float timeUsed) { ... }
 *     public static AbilityResult ExecuteAbility(AnimalType type, Maze maze, PlayerState state) { ... }
 * }
 */
