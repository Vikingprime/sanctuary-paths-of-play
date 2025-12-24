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
  rotationIntensity?: number; // 0-1, for proportional mobile rotation
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

  const ROCK_SIZE_MIN = 0.06;  // Slightly bigger rocks
  const ROCK_SIZE_MAX = 0.14;  // Max size increased
  const ROCK_EDGE_INSET = 0.04; // Closer to wall edge (more into corn)
  const ROCK_SPACING = 0.5; // Minimum distance between rocks
  const MIN_PLACEMENT_CHANCE = 0.10; // Chance of placing a rock

  // Find all non-wall cells (paths) and place rocks near edges
  const mazeWidth = maze.grid[0].length;
  const mazeHeight = maze.grid.length;

  // Track placed rock positions to ensure spacing
  const placedRocks: { x: number; z: number }[] = [];

  for (let y = 1; y < mazeHeight - 1; y++) {
    for (let x = 1; x < mazeWidth - 1; x++) {
      const cell = maze.grid[y][x];
      // Only place rocks on path cells
      if (cell.isWall) continue;
      // Don't place rocks on special cells
      if (cell.isStart || cell.isEnd || cell.isPowerUp || cell.isStation) continue;

      // Check which sides have walls
      const wallAbove = maze.grid[y - 1]?.[x]?.isWall;
      const wallBelow = maze.grid[y + 1]?.[x]?.isWall;
      const wallLeft = maze.grid[y][x - 1]?.isWall;
      const wallRight = maze.grid[y][x + 1]?.isWall;

      const seed = x * 1000 + y;
      const placeChance = seededRandom(seed);

      // Place rock near wall edge with some randomness
      if (placeChance < MIN_PLACEMENT_CHANCE) {
        let rockX = x + 0.5;
        let rockZ = y + 0.5;

        // Position near wall edges - keep very close to walls
        if (wallAbove) rockZ = y + ROCK_EDGE_INSET + seededRandom(seed + 1) * 0.05;
        else if (wallBelow) rockZ = y + 1 - ROCK_EDGE_INSET - seededRandom(seed + 2) * 0.05;
        
        if (wallLeft) rockX = x + ROCK_EDGE_INSET + seededRandom(seed + 3) * 0.05;
        else if (wallRight) rockX = x + 1 - ROCK_EDGE_INSET - seededRandom(seed + 4) * 0.05;

        // Skip if in center with no adjacent walls
        if (!wallAbove && !wallBelow && !wallLeft && !wallRight) continue;

        // Check spacing from other rocks
        const tooClose = placedRocks.some((r) => {
          const dx = r.x - rockX;
          const dz = r.z - rockZ;
          return Math.sqrt(dx * dx + dz * dz) < ROCK_SPACING;
        });
        if (tooClose) continue;

        const size = ROCK_SIZE_MIN + seededRandom(seed + 5) * (ROCK_SIZE_MAX - ROCK_SIZE_MIN);
        rocks.push({ x: rockX, z: rockZ, radius: size });
        placedRocks.push({ x: rockX, z: rockZ });
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
// CHARACTER COLLISION
// ============================================

export interface CharacterPosition {
  x: number;  // Grid x position (character is at x + 0.5)
  y: number;  // Grid y position (character is at y + 0.5)
  radius: number;
}

/**
 * Check if position collides with any character (simple circle check)
 */
export function checkCharacterCollision(
  x: number,
  y: number,
  characters: CharacterPosition[],
  playerRadius: number = GameConfig.PLAYER_RADIUS
): boolean {
  for (const char of characters) {
    // Characters are rendered at grid position + 0.5 (center of cell)
    const charX = char.x + 0.5;
    const charZ = char.y + 0.5;
    const dx = x - charX;
    const dy = y - charZ;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const collisionDist = playerRadius + char.radius;
    if (dist < collisionDist) {
      return true;
    }
  }
  return false;
}

/**
 * Get animal-specific collision offsets
 * Pig has shorter snout at ground level, cow has tall horns, bird is small
 */
function getAnimalCollisionOffsets(animalType?: AnimalType): { head: number; tail: number; pointRadius: number } {
  switch (animalType) {
    case 'pig':
      // Pig's snout extends forward - keep small gap from characters
      return { head: 0.22, tail: 0.20, pointRadius: 0.10 };
    case 'cow':
      // Cow has horns that extend forward more
      return { head: 0.42, tail: 0.35, pointRadius: 0.12 };
    case 'bird':
      // Chicken's beak extends forward visually - match collision to visual
      return { head: 0.18, tail: 0.02, pointRadius: 0.02 };
    default:
      return { head: 0.30, tail: 0.25, pointRadius: 0.10 };
  }
}

/**
 * Check character collision using multiple sample points (head, center, tail)
 * This accounts for the animal model extending beyond center point
 */
export function checkCharacterCollisionMultiPoint(
  x: number,
  y: number,
  rotation: number,
  characters: CharacterPosition[],
  animalType?: AnimalType
): boolean {
  const offsets = getAnimalCollisionOffsets(animalType);
  
  // Calculate head position (forward from center based on rotation)
  const headX = x + Math.sin(rotation) * offsets.head;
  const headY = y - Math.cos(rotation) * offsets.head;
  
  // Calculate tail position (backward from center)
  const tailX = x - Math.sin(rotation) * offsets.tail;
  const tailY = y + Math.cos(rotation) * offsets.tail;
  
  // Check all three points
  return checkCharacterCollision(x, y, characters, offsets.pointRadius) ||
         checkCharacterCollision(headX, headY, characters, offsets.pointRadius) ||
         checkCharacterCollision(tailX, tailY, characters, offsets.pointRadius);
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
  rocks: RockPosition[] = [],
  animalType?: AnimalType,
  characters: CharacterPosition[] = []
): PlayerState {
  const moveSpeed = speedBoostActive
    ? GameConfig.BOOSTED_MOVE_SPEED
    : GameConfig.BASE_MOVE_SPEED;

  // Use animal-specific rotation speed
  const rotationSpeed = animalType === 'bird' 
    ? GameConfig.ROTATION_SPEED_BIRD 
    : GameConfig.ROTATION_SPEED;

  // Calculate rotation - use intensity for proportional control (mobile)
  // or full speed for keyboard input
  const isMoving = input.forward || input.backward;
  const baseMultiplier = isMoving ? 0.5 : 1.0; // Slower while moving
  // Use intensity if provided (0-1), otherwise full intensity for keyboard
  const intensity = input.rotationIntensity ?? 1.0;
  const rotationMultiplier = baseMultiplier * intensity;
  
  let desiredRotation = currentState.rotation;
  if (input.rotateLeft) {
    desiredRotation -= rotationSpeed * rotationMultiplier * deltaTime;
  }
  if (input.rotateRight) {
    desiredRotation += rotationSpeed * rotationMultiplier * deltaTime;
  }
  // Normalize rotation to prevent accumulation of large values
  desiredRotation = ((desiredRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  
  // Check if rotation would cause character collision - if so, don't rotate
  const rotationCausesCollision = checkCharacterCollisionMultiPoint(
    currentState.x, currentState.y, desiredRotation, characters, animalType
  );
  const newRotation = rotationCausesCollision ? currentState.rotation : desiredRotation;

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

  // Helper to check wall and rock collision (uses center point with radius)
  const hasWallOrRockCollision = (x: number, y: number) => 
    checkCollision(maze, x, y) || 
    checkRockCollision(x, y, rocks);
  
  // Helper for character collision (uses multi-point: head, center, tail)
  // But allow movement if it increases distance from the character (escape when stuck)
  const hasCharacterCollision = (x: number, y: number, rot: number) => {
    // First check if new position collides
    const wouldCollide = checkCharacterCollisionMultiPoint(x, y, rot, characters, animalType);
    if (!wouldCollide) return false;
    
    // If we would collide, check if we're already colliding (stuck)
    const alreadyColliding = checkCharacterCollisionMultiPoint(
      currentState.x, currentState.y, currentState.rotation, characters, animalType
    );
    
    // If already stuck, allow movement that increases distance from any character
    if (alreadyColliding) {
      for (const char of characters) {
        const charX = char.x + 0.5;
        const charZ = char.y + 0.5;
        const currentDist = Math.sqrt((currentState.x - charX) ** 2 + (currentState.y - charZ) ** 2);
        const newDist = Math.sqrt((x - charX) ** 2 + (y - charZ) ** 2);
        // If moving away from this character, allow it
        if (newDist > currentDist + 0.01) {
          return false; // Allow this movement
        }
      }
    }
    
    return true; // Block movement
  };
  
  // Combined collision check
  const hasCollision = (x: number, y: number, rot: number) => 
    hasWallOrRockCollision(x, y) || hasCharacterCollision(x, y, rot);

  // Try combined movement first
  let newX = currentState.x + moveX;
  let newY = currentState.y + moveY;

  if (hasCollision(newX, newY, newRotation)) {
    // Wall sliding: try X and Y separately
    if (!hasCollision(currentState.x + moveX, currentState.y, newRotation)) {
      newX = currentState.x + moveX;
      newY = currentState.y;
    } else if (!hasCollision(currentState.x, currentState.y + moveY, newRotation)) {
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
