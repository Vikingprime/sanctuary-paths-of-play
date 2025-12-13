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
  // Functions
  checkCollision,
  calculateMovement,
  checkCellInteraction,
  calculateScore,
  calculateStars,
  executeAbility,
} from './GameLogic';
