/**
 * Game Module - Pure game logic, portable to Unity
 * 
 * This module contains all game logic that is independent of:
 * - React
 * - Three.js
 * - DOM/Browser APIs
 * 
 * Everything here can be directly ported to C# for Unity.
 */

// Configuration
export { GameConfig } from './GameConfig';
export { FogConfig, FOG_COLOR, getFogColorGLSL } from './FogConfig';

// Maze utilities
export {
  findStartPosition,
  findStartRotation,
  findEndPosition,
  getCell,
  isWall,
  getPowerUpPositions,
  getStationPositions,
  parseMazeLayout,
} from './MazeUtils';

// Game logic
export {
  // Types
  type PlayerState,
  type MovementInput,
  type GameStateData,
  type CellInteractionResult,
  type AbilityResult,
  type MovementResult,
  // Functions
  checkCollision,
  calculateMovement,
  checkCellInteraction,
  calculateScore,
  calculateStars,
  executeAbility,
} from './GameLogic';

// Medial axis (skeleton) computation
export {
  computeMedialAxis,
  type MedialAxisResult,
} from './MedialAxis';

// Corridor magnetism system (turn-based alignment)
export {
  calculateMagnetismTurn,
  buildMagnetismCache,
  filterTargetPoint,
  constrainMovementToTangent,
  DEFAULT_MAGNETISM_CONFIG,
  type MagnetismConfig,
  type MagnetismCache,
  type MagnetismTurnResult,
  type MagnetismTurnState,
  // Legacy exports for compatibility
  calculateMagnetism,
  type MagnetismResult,
  type MagnetismFilterState,
} from './CorridorMagnetism';
