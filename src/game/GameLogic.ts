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
 * CAPSULE COLLIDER - Simplified collision shape for cow
 * Replaces multiple spheres with a single capsule (two endpoints + radius)
 */
export interface CapsuleCollider {
  // Capsule defined by two endpoints and a radius
  startOffset: number;  // Offset from center toward tail (negative)
  endOffset: number;    // Offset from center toward head (positive)
  radius: number;       // Capsule radius
  // Optional head sphere for extra forward collision
  headOffset?: number;
  headRadius?: number;
}

/**
 * Get capsule collider for animal type
 */
function getAnimalCapsule(animalType?: AnimalType): CapsuleCollider {
  switch (animalType) {
    case 'cow':
      return {
        startOffset: -0.40,  // Tail end
        endOffset: 0.85,     // Head/neck end  
        radius: 0.18,        // Body radius
        headOffset: 0.95,    // Extra head sphere
        headRadius: 0.15
      };
    case 'pig':
      return {
        startOffset: -0.18,
        endOffset: 0.20,
        radius: 0.12
      };
    case 'bird':
      return {
        startOffset: -0.05,
        endOffset: 0.05,
        radius: 0.08
      };
    default:
      return {
        startOffset: -0.20,
        endOffset: 0.25,
        radius: 0.12
      };
  }
}

/**
 * Get capsule endpoints in world space
 */
function getCapsuleEndpoints(
  x: number, 
  y: number, 
  rotation: number, 
  capsule: CapsuleCollider
): { start: { x: number; y: number }; end: { x: number; y: number }; head?: { x: number; y: number } } {
  const sinR = Math.sin(rotation);
  const cosR = Math.cos(rotation);
  
  return {
    start: {
      x: x + sinR * capsule.startOffset,
      y: y - cosR * capsule.startOffset
    },
    end: {
      x: x + sinR * capsule.endOffset,
      y: y - cosR * capsule.endOffset
    },
    head: capsule.headOffset ? {
      x: x + sinR * capsule.headOffset,
      y: y - cosR * capsule.headOffset
    } : undefined
  };
}

// ============================================
// COLLISION-SAFE MOTION SOLVER
// ============================================

// Solver constants
const SKIN_WIDTH = 0.01;           // Small gap to prevent touching
const ROTATION_STEP = 0.035;       // ~2 degrees per step for rotation sweep
const SWEEP_STEPS = 8;             // Binary search steps for swept collision
const MAX_DEPENETRATION = 0.02;    // Maximum push per frame
const OVERLAP_EPSILON = 0.005;     // Overlap threshold

// Persistent state for unstuck
let stuckTimer = 0;
let unstuckCooldown = 0;
let lastSafeTransform = { x: 0, y: 0, rotation: 0 };

/**
 * Check if a capsule overlaps any static collider (walls, rocks, characters)
 * Returns overlap info or null if no overlap
 */
function checkCapsuleOverlap(
  x: number,
  y: number,
  rotation: number,
  capsule: CapsuleCollider,
  maze: Maze,
  rocks: RockPosition[],
  characters: CharacterPosition[],
  animalType?: AnimalType
): { overlapping: boolean; mtv?: { x: number; y: number; depth: number } } {
  const endpoints = getCapsuleEndpoints(x, y, rotation, capsule);
  
  // Sample points along capsule
  const samplePoints = [
    { ...endpoints.start, radius: capsule.radius },
    { x: (endpoints.start.x + endpoints.end.x) / 2, y: (endpoints.start.y + endpoints.end.y) / 2, radius: capsule.radius },
    { ...endpoints.end, radius: capsule.radius }
  ];
  
  // Add head sphere if present
  if (endpoints.head && capsule.headRadius) {
    samplePoints.push({ ...endpoints.head, radius: capsule.headRadius });
  }
  
  let totalMtvX = 0;
  let totalMtvY = 0;
  let maxDepth = 0;
  
  for (const point of samplePoints) {
    // Check wall collision
    const wallPen = getWallPenetrationForPoint(maze, point.x, point.y, point.radius);
    if (wallPen) {
      totalMtvX += wallPen.x;
      totalMtvY += wallPen.y;
      if (wallPen.depth > maxDepth) maxDepth = wallPen.depth;
    }
    
    // Check rock collision
    for (const rock of rocks) {
      const dx = point.x - rock.x;
      const dy = point.y - rock.z;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = point.radius + rock.radius;
      
      if (dist < minDist && dist > 0.001) {
        const depth = minDist - dist;
        if (depth > maxDepth) maxDepth = depth;
        totalMtvX += (dx / dist) * depth;
        totalMtvY += (dy / dist) * depth;
      }
    }
    
    // Check character collision (stations, other animals)
    for (const char of characters) {
      const charX = char.x + 0.5;
      const charZ = char.y + 0.5;
      const dx = point.x - charX;
      const dy = point.y - charZ;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = point.radius + char.radius;
      
      if (dist < minDist && dist > 0.001) {
        const depth = minDist - dist;
        if (depth > maxDepth) maxDepth = depth;
        totalMtvX += (dx / dist) * depth;
        totalMtvY += (dy / dist) * depth;
      }
    }
  }
  
  if (maxDepth > OVERLAP_EPSILON) {
    return { 
      overlapping: true, 
      mtv: { x: totalMtvX, y: totalMtvY, depth: maxDepth } 
    };
  }
  
  return { overlapping: false };
}

/**
 * Get wall penetration for a single point
 */
function getWallPenetrationForPoint(
  maze: Maze,
  x: number,
  y: number,
  radius: number
): { x: number; y: number; depth: number } | null {
  const gridX = Math.floor(x);
  const gridY = Math.floor(y);
  
  let totalX = 0;
  let totalY = 0;
  let maxDepth = 0;
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const checkX = gridX + dx;
      const checkY = gridY + dy;
      
      if (isWall(maze, checkX, checkY)) {
        // Find nearest point on wall box
        const nearestX = Math.max(checkX, Math.min(checkX + 1, x));
        const nearestY = Math.max(checkY, Math.min(checkY + 1, y));
        
        const distX = x - nearestX;
        const distY = y - nearestY;
        const dist = Math.sqrt(distX * distX + distY * distY);
        
        if (dist < radius && dist > 0.001) {
          const depth = radius - dist;
          if (depth > maxDepth) maxDepth = depth;
          totalX += (distX / dist) * depth;
          totalY += (distY / dist) * depth;
        } else if (dist < 0.001) {
          // Inside wall cell
          const pushX = x - (checkX + 0.5);
          const pushY = y - (checkY + 0.5);
          const pushLen = Math.sqrt(pushX * pushX + pushY * pushY);
          if (pushLen > 0.001) {
            const depth = radius;
            if (depth > maxDepth) maxDepth = depth;
            totalX += (pushX / pushLen) * depth;
            totalY += (pushY / pushLen) * depth;
          }
        }
      }
    }
  }
  
  if (maxDepth > 0) {
    return { x: totalX, y: totalY, depth: maxDepth };
  }
  return null;
}

/**
 * Swept capsule translation - binary search to find safe position
 * Returns the furthest safe position along the movement vector
 */
function sweepTranslation(
  startX: number,
  startY: number,
  moveX: number,
  moveY: number,
  rotation: number,
  capsule: CapsuleCollider,
  maze: Maze,
  rocks: RockPosition[],
  characters: CharacterPosition[],
  animalType?: AnimalType
): { x: number; y: number; blocked: boolean; normal?: { x: number; y: number } } {
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
  if (moveLen < 0.0001) {
    return { x: startX, y: startY, blocked: false };
  }
  
  // Normalize movement
  const dirX = moveX / moveLen;
  const dirY = moveY / moveLen;
  
  // Check if end position is clear
  const endX = startX + moveX;
  const endY = startY + moveY;
  const endOverlap = checkCapsuleOverlap(endX, endY, rotation, capsule, maze, rocks, characters, animalType);
  
  if (!endOverlap.overlapping) {
    // Full movement is safe
    return { x: endX, y: endY, blocked: false };
  }
  
  // Binary search to find safe distance
  let lo = 0;
  let hi = moveLen;
  let safeX = startX;
  let safeY = startY;
  
  for (let i = 0; i < SWEEP_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const testX = startX + dirX * mid;
    const testY = startY + dirY * mid;
    
    const overlap = checkCapsuleOverlap(testX, testY, rotation, capsule, maze, rocks, characters, animalType);
    
    if (overlap.overlapping) {
      hi = mid;
    } else {
      lo = mid;
      safeX = testX;
      safeY = testY;
    }
  }
  
  // Apply skin width (back off slightly from collision)
  if (lo > SKIN_WIDTH) {
    safeX = startX + dirX * (lo - SKIN_WIDTH);
    safeY = startY + dirY * (lo - SKIN_WIDTH);
  }
  
  // Compute approximate normal for sliding
  const normalX = endOverlap.mtv ? endOverlap.mtv.x : -dirX;
  const normalY = endOverlap.mtv ? endOverlap.mtv.y : -dirY;
  const normalLen = Math.sqrt(normalX * normalX + normalY * normalY);
  
  return { 
    x: safeX, 
    y: safeY, 
    blocked: true,
    normal: normalLen > 0.001 ? { x: normalX / normalLen, y: normalY / normalLen } : undefined
  };
}

/**
 * Incremental rotation sweep - apply rotation in small steps
 * Returns the maximum safe rotation
 */
function sweepRotation(
  x: number,
  y: number,
  currentRotation: number,
  targetRotation: number,
  capsule: CapsuleCollider,
  maze: Maze,
  rocks: RockPosition[],
  characters: CharacterPosition[],
  animalType?: AnimalType
): number {
  // Normalize rotation difference
  let rotDiff = targetRotation - currentRotation;
  while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
  while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
  
  if (Math.abs(rotDiff) < 0.001) {
    return currentRotation;
  }
  
  const rotDir = Math.sign(rotDiff);
  const totalRotation = Math.abs(rotDiff);
  const steps = Math.ceil(totalRotation / ROTATION_STEP);
  
  let safeRotation = currentRotation;
  
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(i * ROTATION_STEP, totalRotation);
    const testRotation = currentRotation + rotDir * t;
    
    const overlap = checkCapsuleOverlap(x, y, testRotation, capsule, maze, rocks, characters, animalType);
    
    if (overlap.overlapping) {
      // This step causes overlap - stop at previous safe rotation
      break;
    }
    
    safeRotation = testRotation;
  }
  
  // Normalize result
  return ((safeRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/**
 * Resolve overlap by pushing outward (MTV resolution)
 * Only pushes outward, never through obstacles
 */
function resolveOverlap(
  x: number,
  y: number,
  rotation: number,
  capsule: CapsuleCollider,
  maze: Maze,
  rocks: RockPosition[],
  characters: CharacterPosition[],
  animalType?: AnimalType
): { x: number; y: number } {
  const overlap = checkCapsuleOverlap(x, y, rotation, capsule, maze, rocks, characters, animalType);
  
  if (!overlap.overlapping || !overlap.mtv) {
    return { x, y };
  }
  
  const mtvLen = Math.sqrt(overlap.mtv.x * overlap.mtv.x + overlap.mtv.y * overlap.mtv.y);
  if (mtvLen < 0.001) {
    return { x, y };
  }
  
  // Clamp push amount
  const pushAmount = Math.min(overlap.mtv.depth, MAX_DEPENETRATION);
  const pushX = (overlap.mtv.x / mtvLen) * pushAmount;
  const pushY = (overlap.mtv.y / mtvLen) * pushAmount;
  
  // Verify push reduces overlap (monotonic)
  const newX = x + pushX;
  const newY = y + pushY;
  const newOverlap = checkCapsuleOverlap(newX, newY, rotation, capsule, maze, rocks, characters, animalType);
  
  if (!newOverlap.overlapping || (newOverlap.mtv && newOverlap.mtv.depth < overlap.mtv.depth)) {
    return { x: newX, y: newY };
  }
  
  // Push made things worse - don't apply
  return { x, y };
}

/**
 * MAIN MOVEMENT FUNCTION - Collision-Safe Motion Solver
 * 
 * All motion goes through this solver. Guarantees:
 * 1. No direct transform moves - all via swept/validated motion
 * 2. Translation is swept with binary search
 * 3. Rotation is applied in small incremental steps
 * 4. Depenetration only pushes outward (monotonic)
 * 5. Post-step validation with revert if still overlapping
 * 
 * Files: src/game/GameLogic.ts
 * Function: calculateMovement
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

  const capsule = getAnimalCapsule(animalType);
  
  const moveSpeed = speedBoostActive
    ? GameConfig.BOOSTED_MOVE_SPEED
    : GameConfig.BASE_MOVE_SPEED;

  const rotationSpeed = animalType === 'bird' 
    ? GameConfig.ROTATION_SPEED_BIRD 
    : GameConfig.ROTATION_SPEED;

  // ========================================
  // STEP 1: RESOLVE ANY EXISTING OVERLAP
  // Before processing input, ensure we start non-overlapping
  // ========================================
  let resolved = resolveOverlap(
    currentState.x, 
    currentState.y, 
    currentState.rotation, 
    capsule, 
    maze, 
    rocks, 
    characters, 
    animalType
  );
  
  let newX = resolved.x;
  let newY = resolved.y;
  let newRotation = currentState.rotation;

  // ========================================
  // STEP 2: SWEPT ROTATION
  // Apply rotation in small increments, stop if overlap
  // ========================================
  const isMoving = input.forward || input.backward;
  const baseMultiplier = isMoving ? 0.5 : 1.0;
  const intensity = input.rotationIntensity ?? 1.0;
  const rotationMultiplier = baseMultiplier * intensity;
  
  let desiredRotation = newRotation;
  if (input.rotateLeft) {
    desiredRotation -= rotationSpeed * rotationMultiplier * deltaTime;
  }
  if (input.rotateRight) {
    desiredRotation += rotationSpeed * rotationMultiplier * deltaTime;
  }
  
  // Sweep rotation to find safe angle
  newRotation = sweepRotation(
    newX, 
    newY, 
    newRotation, 
    desiredRotation, 
    capsule, 
    maze, 
    rocks, 
    characters, 
    animalType
  );

  // ========================================
  // STEP 3: SWEPT TRANSLATION
  // Use binary search to find safe position along movement
  // ========================================
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

  if (moveX !== 0 || moveY !== 0) {
    const sweepResult = sweepTranslation(
      newX, 
      newY, 
      moveX, 
      moveY, 
      newRotation, 
      capsule, 
      maze, 
      rocks, 
      characters, 
      animalType
    );
    
    if (!sweepResult.blocked) {
      // Full movement allowed
      newX = sweepResult.x;
      newY = sweepResult.y;
    } else {
      // Blocked - try to slide
      newX = sweepResult.x;
      newY = sweepResult.y;
      
      // Attempt slide along tangent
      if (sweepResult.normal) {
        const remainingX = (moveX - (sweepResult.x - (newX - moveX)));
        const remainingY = (moveY - (sweepResult.y - (newY - moveY)));
        
        // Project remaining onto tangent
        const tangentX = -sweepResult.normal.y;
        const tangentY = sweepResult.normal.x;
        const dot = remainingX * tangentX + remainingY * tangentY;
        const slideX = tangentX * dot * 0.8; // Slight friction
        const slideY = tangentY * dot * 0.8;
        
        if (Math.abs(slideX) > 0.001 || Math.abs(slideY) > 0.001) {
          const slideResult = sweepTranslation(
            newX, 
            newY, 
            slideX, 
            slideY, 
            newRotation, 
            capsule, 
            maze, 
            rocks, 
            characters, 
            animalType
          );
          newX = slideResult.x;
          newY = slideResult.y;
        }
      }
    }
  }

  // ========================================
  // STEP 4: POST-STEP VALIDATION
  // If still overlapping, revert to previous safe transform
  // ========================================
  const finalOverlap = checkCapsuleOverlap(newX, newY, newRotation, capsule, maze, rocks, characters, animalType);
  
  if (finalOverlap.overlapping) {
    // Try one more depenetration push
    const finalResolved = resolveOverlap(newX, newY, newRotation, capsule, maze, rocks, characters, animalType);
    newX = finalResolved.x;
    newY = finalResolved.y;
    
    // Check again
    const stillOverlapping = checkCapsuleOverlap(newX, newY, newRotation, capsule, maze, rocks, characters, animalType);
    
    if (stillOverlapping.overlapping) {
      // Revert to last known safe transform
      newX = lastSafeTransform.x || currentState.x;
      newY = lastSafeTransform.y || currentState.y;
      newRotation = lastSafeTransform.rotation || currentState.rotation;
    }
  }

  // ========================================
  // STEP 5: UNSTUCK FAILSAFE
  // Only if truly stuck for extended period
  // ========================================
  const hasInput = input.forward || input.backward || input.rotateLeft || input.rotateRight;
  const actualMovement = Math.sqrt(
    Math.pow(newX - currentState.x, 2) + 
    Math.pow(newY - currentState.y, 2)
  );
  
  if (hasInput && actualMovement < 0.002 && unstuckCooldown <= 0) {
    stuckTimer += deltaTime;
    
    if (stuckTimer > 0.5) {
      // Try small nudges to escape
      const nudgeAmount = 0.06;
      const nudgeAngles = [0, Math.PI/2, Math.PI, -Math.PI/2];
      
      for (const angle of nudgeAngles) {
        const testX = currentState.x + Math.cos(angle) * nudgeAmount;
        const testY = currentState.y + Math.sin(angle) * nudgeAmount;
        
        const overlap = checkCapsuleOverlap(testX, testY, newRotation, capsule, maze, rocks, characters, animalType);
        if (!overlap.overlapping) {
          newX = testX;
          newY = testY;
          break;
        }
      }
      
      stuckTimer = 0;
      unstuckCooldown = 1.5;
    }
  } else if (actualMovement >= 0.002) {
    stuckTimer = 0;
    // Update safe transform when moving successfully
    lastSafeTransform = { x: newX, y: newY, rotation: newRotation };
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
