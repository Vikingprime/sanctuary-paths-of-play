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
  // Functions
  checkCollision,
  calculateMovement,
  checkCellInteraction,
  calculateScore,
  calculateStars,
  executeAbility,
} from './GameLogic';

// Corridor edge utilities
export {
  type CorridorEdge,
  type EdgeProximityResult,
  computeCorridorEdges,
  findNearestCorridorEdge,
  calculateBorderAvoidance,
  getUniqueCorridorEdgeSegments,
} from './CorridorEdges';
