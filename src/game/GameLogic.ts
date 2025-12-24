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
  rotationRadius?: number; // Optional smaller radius for rotation checks (allows turning near object)
  isStation?: boolean; // If true, this is a map station
}

/**
 * Check if position collides with any character (simple circle check)
 * @param useRotationRadius - if true, use the smaller rotationRadius for collision (for rotation checks)
 */
export function checkCharacterCollision(
  x: number,
  y: number,
  characters: CharacterPosition[],
  playerRadius: number = GameConfig.PLAYER_RADIUS,
  useRotationRadius: boolean = false,
  debugLabel?: string
): boolean {
  for (const char of characters) {
    // Characters are rendered at grid position + 0.5 (center of cell)
    const charX = char.x + 0.5;
    const charZ = char.y + 0.5;
    const dx = x - charX;
    const dy = y - charZ;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Use rotation radius if specified and available, otherwise use normal radius
    const effectiveRadius = useRotationRadius && char.rotationRadius !== undefined 
      ? char.rotationRadius 
      : char.radius;
    const collisionDist = playerRadius + effectiveRadius;
    
    // Debug logging for stations
    if (char.isStation && dist < 1.5 && debugLabel) {
      console.log(`[${debugLabel}] Station collision check: dist=${dist.toFixed(3)}, threshold=${collisionDist.toFixed(3)}, collides=${dist < collisionDist}`);
    }
    
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
function getAnimalCollisionOffsets(animalType?: AnimalType): { 
  head: number; 
  tail: number; 
  pointRadius: number;
  neckLength?: number; // For cow - distance from center to neck checkpoint
  upperNeckLength?: number; // For cow - upper neck checkpoint
  spinePoints?: number[]; // Additional spine collision points (offset from center)
} {
  switch (animalType) {
    case 'pig':
      // Pig's snout extends forward - keep small gap from characters
      return { head: 0.22, tail: 0.20, pointRadius: 0.10 };
    case 'cow':
      // Cow collision - spine points from head to tail
      // Increased rear radii to prevent getting trapped in walls
      return { 
        head: 0.95,
        tail: 0.45,
        pointRadius: 0.15, // Increased from 0.12 to cover gaps better
        neckLength: 0.50,
        upperNeckLength: 0.72,
        // Spine points between center and neck/tail
        spinePoints: [-0.22, 0.25] // Negative is toward tail, positive toward head
      };
    case 'bird':
      // Chicken - larger negative head offset allows beak to get much closer
      return { head: -0.35, tail: 0.001, pointRadius: 0.001 };
    default:
      return { head: 0.30, tail: 0.25, pointRadius: 0.10 };
  }
}

/**
 * Check character collision using multiple sample points (head, center, tail, and horns for cow)
 * This accounts for the animal model extending beyond center point
 * @param useRotationRadius - if true, use smaller rotation radius for collision checks
 */
export function checkCharacterCollisionMultiPoint(
  x: number,
  y: number,
  rotation: number,
  characters: CharacterPosition[],
  animalType?: AnimalType,
  useRotationRadius: boolean = false
): boolean {
  const offsets = getAnimalCollisionOffsets(animalType);
  
  // Calculate head position (forward from center based on rotation)
  const headX = x + Math.sin(rotation) * offsets.head;
  const headY = y - Math.cos(rotation) * offsets.head;
  
  // Calculate tail position (backward from center)
  const tailX = x - Math.sin(rotation) * offsets.tail;
  const tailY = y + Math.cos(rotation) * offsets.tail;
  
  // Check center, head, tail with debug labels
  if (checkCharacterCollision(x, y, characters, offsets.pointRadius, useRotationRadius, 'CENTER') ||
      checkCharacterCollision(headX, headY, characters, offsets.pointRadius, useRotationRadius, 'HEAD') ||
      checkCharacterCollision(tailX, tailY, characters, offsets.pointRadius, useRotationRadius, 'TAIL')) {
    return true;
  }
  
  // For cow, check neck positions (lower and upper)
  if (offsets.neckLength) {
    // Lower neck position
    const neckX = x + Math.sin(rotation) * offsets.neckLength;
    const neckY = y - Math.cos(rotation) * offsets.neckLength;
    
    if (checkCharacterCollision(neckX, neckY, characters, offsets.pointRadius, useRotationRadius)) {
      return true;
    }
  }
  
  // Upper neck position (higher on neck toward head)
  if (offsets.upperNeckLength) {
    const upperNeckX = x + Math.sin(rotation) * offsets.upperNeckLength;
    const upperNeckY = y - Math.cos(rotation) * offsets.upperNeckLength;
    
    if (checkCharacterCollision(upperNeckX, upperNeckY, characters, offsets.pointRadius, useRotationRadius)) {
      return true;
    }
  }
  
  // Check additional spine points
  if (offsets.spinePoints) {
    for (const spineOffset of offsets.spinePoints) {
      const spineX = x + Math.sin(rotation) * spineOffset;
      const spineY = y - Math.cos(rotation) * spineOffset;
      if (checkCharacterCollision(spineX, spineY, characters, offsets.pointRadius, useRotationRadius)) {
        return true;
      }
    }
  }
  
  return false;
}

// ============================================
// MOVEMENT
// ============================================

// Unstuck failsafe state (module-level for persistence across frames)
let stuckTimer = 0;
let unstuckCooldown = 0;
let lastStablePosition = { x: 0, y: 0 };

// Constants for stable collision
const STUCK_THRESHOLD = 0.5;        // seconds before unstuck triggers
const UNSTUCK_COOLDOWN = 1.5;       // seconds between unstuck attempts  
const MOVEMENT_EPSILON = 0.001;     // movements smaller than this are treated as zero
const DEPENETRATION_MAX = 0.03;     // max depenetration per frame (prevents overshoot)
const STUCK_DISTANCE_THRESHOLD = 0.005; // minimum movement to not be considered stuck

/**
 * Get the nearest wall collision point and compute push-out vector
 * Returns clamped, monotonic depenetration (small steps only)
 */
function getWallPenetration(
  maze: Maze,
  x: number,
  y: number,
  radius: number = GameConfig.PLAYER_RADIUS
): { penetration: { x: number; y: number }; depth: number } | null {
  const gridX = Math.floor(x);
  const gridY = Math.floor(y);
  
  let totalPenX = 0;
  let totalPenY = 0;
  let maxDepth = 0;
  
  // Check all 8 neighboring cells + current
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const checkX = gridX + dx;
      const checkY = gridY + dy;
      
      if (isWall(maze, checkX, checkY)) {
        const boxMinX = checkX;
        const boxMaxX = checkX + 1;
        const boxMinY = checkY;
        const boxMaxY = checkY + 1;
        
        const nearestX = Math.max(boxMinX, Math.min(boxMaxX, x));
        const nearestY = Math.max(boxMinY, Math.min(boxMaxY, y));
        
        const distX = x - nearestX;
        const distY = y - nearestY;
        const dist = Math.sqrt(distX * distX + distY * distY);
        
        if (dist < radius && dist > 0.001) {
          const depth = radius - dist;
          if (depth > maxDepth) maxDepth = depth;
          
          const pushX = distX / dist;
          const pushY = distY / dist;
          totalPenX += pushX * depth;
          totalPenY += pushY * depth;
        } else if (dist < 0.001) {
          // Center inside wall
          const pushX = x - (checkX + 0.5);
          const pushY = y - (checkY + 0.5);
          const pushLen = Math.sqrt(pushX * pushX + pushY * pushY);
          if (pushLen > 0.001) {
            const depth = radius * 0.5;
            if (depth > maxDepth) maxDepth = depth;
            totalPenX += (pushX / pushLen) * depth;
            totalPenY += (pushY / pushLen) * depth;
          }
        }
      }
    }
  }
  
  if (maxDepth > 0) {
    return { penetration: { x: totalPenX, y: totalPenY }, depth: maxDepth };
  }
  return null;
}

/**
 * Get sliding vector: project movement onto surface tangent
 */
function getSlideVector(
  moveX: number,
  moveY: number,
  normalX: number,
  normalY: number
): { x: number; y: number } {
  const tangentX = -normalY;
  const tangentY = normalX;
  const dot = moveX * tangentX + moveY * tangentY;
  return { x: tangentX * dot, y: tangentY * dot };
}

/**
 * Calculate new player position based on input
 * 
 * STABLE COLLISION SYSTEM:
 * - No per-frame backward impulses
 * - Stop or slide when blocked (never reverse unless player inputs backward)
 * - Small, clamped depenetration (monotonic, no overshoot)
 * - Unstuck only as last resort with cooldown
 * - Hysteresis: tiny movements treated as zero
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
  // Update cooldown
  if (unstuckCooldown > 0) {
    unstuckCooldown -= deltaTime;
  }

  const moveSpeed = speedBoostActive
    ? GameConfig.BOOSTED_MOVE_SPEED
    : GameConfig.BASE_MOVE_SPEED;

  const rotationSpeed = animalType === 'bird' 
    ? GameConfig.ROTATION_SPEED_BIRD 
    : GameConfig.ROTATION_SPEED;

  // Calculate rotation
  const isMoving = input.forward || input.backward;
  const baseMultiplier = isMoving ? 0.5 : 1.0;
  const intensity = input.rotationIntensity ?? 1.0;
  const rotationMultiplier = baseMultiplier * intensity;
  
  let desiredRotation = currentState.rotation;
  if (input.rotateLeft) {
    desiredRotation -= rotationSpeed * rotationMultiplier * deltaTime;
  }
  if (input.rotateRight) {
    desiredRotation += rotationSpeed * rotationMultiplier * deltaTime;
  }
  desiredRotation = ((desiredRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  
  // Collision helpers
  const hasWallOrRockCollision = (x: number, y: number) => 
    checkCollision(maze, x, y) || checkRockCollision(x, y, rocks);
  
  const hasCharacterCollision = (x: number, y: number, rot: number) => 
    checkCharacterCollisionMultiPoint(x, y, rot, characters, animalType);
  
  const offsets = getAnimalCollisionOffsets(animalType);
  
  // Get total penetration depth for all collision points
  const getTotalPenetration = (x: number, y: number, rot: number): { x: number; y: number; depth: number } => {
    const points = getCollisionPointsForAnimal(x, y, rot, offsets);
    let totalX = 0, totalY = 0, maxDepth = 0;
    
    for (const point of points) {
      const pen = getWallPenetration(maze, point.x, point.y, point.radius);
      if (pen) {
        totalX += pen.penetration.x;
        totalY += pen.penetration.y;
        if (pen.depth > maxDepth) maxDepth = pen.depth;
      }
    }
    return { x: totalX, y: totalY, depth: maxDepth };
  };
  
  // Check if ANY collision point would hit a wall - this is the key fix!
  // Must check all collision spheres, not just center point
  const hasAnyCollisionPointBlocked = (x: number, y: number, rot: number): boolean => {
    // First check center (fast path)
    if (hasWallOrRockCollision(x, y)) return true;
    
    // Check all collision points
    const points = getCollisionPointsForAnimal(x, y, rot, offsets);
    for (const point of points) {
      // Check if this point's position is in a wall cell
      if (checkCollision(maze, point.x, point.y, point.radius)) return true;
      if (checkRockCollision(point.x, point.y, rocks, point.radius)) return true;
      
      // Also check penetration depth
      const pen = getWallPenetration(maze, point.x, point.y, point.radius);
      if (pen && pen.depth > 0.02) return true;
    }
    return false;
  };
  
  // Check if rotation makes wall penetration worse
  const currentPen = getTotalPenetration(currentState.x, currentState.y, currentState.rotation);
  const newRotPen = getTotalPenetration(currentState.x, currentState.y, desiredRotation);
  
  const currentCharCollision = checkCharacterCollisionMultiPoint(
    currentState.x, currentState.y, currentState.rotation, characters, animalType, true
  );
  const newCharCollision = checkCharacterCollisionMultiPoint(
    currentState.x, currentState.y, desiredRotation, characters, animalType, true
  );
  
  // Block rotation only if it makes things strictly worse
  const rotationMakesWorse = newRotPen.depth > currentPen.depth + 0.01;
  const rotationMakesCharWorse = !currentCharCollision && newCharCollision;
  const newRotation = (rotationMakesWorse || rotationMakesCharWorse) 
    ? currentState.rotation 
    : desiredRotation;

  // Calculate intended movement vector (only from player input)
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

  // Apply epsilon: treat tiny movements as zero (hysteresis)
  if (Math.abs(moveX) < MOVEMENT_EPSILON) moveX = 0;
  if (Math.abs(moveY) < MOVEMENT_EPSILON) moveY = 0;

  const hasInput = input.forward || input.backward || input.rotateLeft || input.rotateRight;
  
  // Start from current position
  let newX = currentState.x;
  let newY = currentState.y;
  
  // ========================================
  // STEP 1: CLAMPED DEPENETRATION
  // Small, monotonic push - never overshoot
  // ========================================
  const pen = getTotalPenetration(newX, newY, newRotation);
  
  if (pen.depth > 0.001) {
    const penLen = Math.sqrt(pen.x * pen.x + pen.y * pen.y);
    if (penLen > 0.001) {
      // Clamp depenetration to small step (prevents bounce/overshoot)
      const pushAmount = Math.min(pen.depth, DEPENETRATION_MAX);
      const pushX = (pen.x / penLen) * pushAmount;
      const pushY = (pen.y / penLen) * pushAmount;
      
      // Only apply if it actually reduces penetration (monotonic)
      const testX = newX + pushX;
      const testY = newY + pushY;
      const testPen = getTotalPenetration(testX, testY, newRotation);
      
      if (testPen.depth < pen.depth) {
        newX = testX;
        newY = testY;
      }
    }
  }
  
  // ========================================
  // STEP 2: APPLY MOVEMENT (stop or slide)
  // Use multi-point collision for ALL checks
  // ========================================
  if (moveX !== 0 || moveY !== 0) {
    const targetX = newX + moveX;
    const targetY = newY + moveY;
    
    // Check if target is clear - must check ALL collision points!
    const targetBlocked = hasAnyCollisionPointBlocked(targetX, targetY, newRotation);
    
    if (!targetBlocked) {
      // Clear path - apply full movement
      newX = targetX;
      newY = targetY;
    } else {
      // Blocked - try sliding along the wall
      // Find which axis is blocked using multi-point check
      const testDist = 0.05;
      const xTestPos = { x: newX + Math.sign(moveX) * testDist, y: newY };
      const yTestPos = { x: newX, y: newY + Math.sign(moveY) * testDist };
      
      const xBlocked = moveX !== 0 && hasAnyCollisionPointBlocked(xTestPos.x, xTestPos.y, newRotation);
      const yBlocked = moveY !== 0 && hasAnyCollisionPointBlocked(yTestPos.x, yTestPos.y, newRotation);
      
      if (xBlocked && !yBlocked && moveY !== 0) {
        // Slide along Y axis only
        const slideX = newX;
        const slideY = newY + moveY;
        if (!hasAnyCollisionPointBlocked(slideX, slideY, newRotation)) {
          newY = slideY;
        }
      } else if (yBlocked && !xBlocked && moveX !== 0) {
        // Slide along X axis only
        const slideX = newX + moveX;
        const slideY = newY;
        if (!hasAnyCollisionPointBlocked(slideX, slideY, newRotation)) {
          newX = slideX;
        }
      }
      // Both blocked or corner: stay at current position (no movement, no bounce)
    }
  }
  
  // ========================================
  // STEP 3: CHARACTER COLLISION
  // ========================================
  if (hasCharacterCollision(newX, newY, newRotation)) {
    // Revert to current position (no bounce)
    newX = currentState.x;
    newY = currentState.y;
  }
  
  // ========================================
  // STEP 4: UNSTUCK FAILSAFE (with cooldown)
  // Only triggers after 0.5s of no movement while input active
  // Then has 1.5s cooldown before next attempt
  // ========================================
  const actualMovement = Math.sqrt(
    Math.pow(newX - currentState.x, 2) + 
    Math.pow(newY - currentState.y, 2)
  );
  
  if (hasInput && actualMovement < STUCK_DISTANCE_THRESHOLD && unstuckCooldown <= 0) {
    stuckTimer += deltaTime;
    
    if (stuckTimer > STUCK_THRESHOLD) {
      // Single unstuck attempt - try to find nearest non-colliding position
      // Try small lateral nudges (not backward - player didn't input backward!)
      const nudgeAmount = 0.08; // Small nudge
      const nudgeDirections = [
        { x: Math.cos(newRotation), y: Math.sin(newRotation) },   // left
        { x: -Math.cos(newRotation), y: -Math.sin(newRotation) }, // right
        { x: -Math.sin(newRotation), y: Math.cos(newRotation) },  // backward (as last resort)
      ];
      
      for (const dir of nudgeDirections) {
        const testX = currentState.x + dir.x * nudgeAmount;
        const testY = currentState.y + dir.y * nudgeAmount;
        const testPen = getTotalPenetration(testX, testY, newRotation);
        
        if (!hasWallOrRockCollision(testX, testY) && testPen.depth < 0.01) {
          newX = testX;
          newY = testY;
          break;
        }
      }
      
      // Reset timer and start cooldown regardless of success
      stuckTimer = 0;
      unstuckCooldown = UNSTUCK_COOLDOWN;
    }
  } else if (actualMovement >= STUCK_DISTANCE_THRESHOLD) {
    // Moving successfully - reset stuck timer
    stuckTimer = 0;
    lastStablePosition = { x: newX, y: newY };
  }

  return { x: newX, y: newY, rotation: newRotation };
}

/**
 * Get collision points for an animal at a position/rotation
 */
function getCollisionPointsForAnimal(
  x: number, 
  y: number, 
  rotation: number,
  offsets: ReturnType<typeof getAnimalCollisionOffsets>
): Array<{ x: number; y: number; radius: number }> {
  const points: Array<{ x: number; y: number; radius: number }> = [];
  
  // Center
  points.push({ x, y, radius: offsets.pointRadius });
  
  // Head
  const headX = x + Math.sin(rotation) * offsets.head;
  const headY = y - Math.cos(rotation) * offsets.head;
  points.push({ x: headX, y: headY, radius: offsets.pointRadius });
  
  // Tail
  const tailX = x - Math.sin(rotation) * offsets.tail;
  const tailY = y + Math.cos(rotation) * offsets.tail;
  points.push({ x: tailX, y: tailY, radius: offsets.pointRadius });
  
  // Neck points
  if (offsets.neckLength) {
    const neckX = x + Math.sin(rotation) * offsets.neckLength;
    const neckY = y - Math.cos(rotation) * offsets.neckLength;
    points.push({ x: neckX, y: neckY, radius: offsets.pointRadius });
  }
  
  if (offsets.upperNeckLength) {
    const upperNeckX = x + Math.sin(rotation) * offsets.upperNeckLength;
    const upperNeckY = y - Math.cos(rotation) * offsets.upperNeckLength;
    points.push({ x: upperNeckX, y: upperNeckY, radius: offsets.pointRadius });
  }
  
  // Spine points
  if (offsets.spinePoints) {
    for (const spineOffset of offsets.spinePoints) {
      const spineX = x + Math.sin(rotation) * spineOffset;
      const spineY = y - Math.cos(rotation) * spineOffset;
      points.push({ x: spineX, y: spineY, radius: offsets.pointRadius });
    }
  }
  
  return points;
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
