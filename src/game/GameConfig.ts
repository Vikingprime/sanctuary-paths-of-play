/**
 * Game Configuration Constants
 * 
 * UNITY PORTABLE: Copy these values directly to Unity C#
 * All values are in consistent units (seconds, units/second, radians)
 */

export const GameConfig = {
  // Movement
  BASE_MOVE_SPEED: 2.5,      // units per second
  BOOSTED_MOVE_SPEED: 4.5,   // speed when power-up active
  ROTATION_SPEED: 2.2,       // radians per second (default)
  ROTATION_SPEED_BIRD: 3.5,  // faster rotation for small chicken
  PLAYER_RADIUS: 0.3,        // collision radius for walls

  // Power-ups
  SPEED_BOOST_DURATION: 5.0, // seconds

  // Scoring
  SCORE_PER_SECOND_LEFT: 100,
  
  // Star thresholds (time in seconds)
  STAR_THRESHOLDS: {
    THREE_STARS: 30,  // Complete in under 30s = 3 stars
    TWO_STARS: 60,    // Complete in under 60s = 2 stars
    ONE_STAR: Infinity, // Complete at all = 1 star
  },

  // Cell size in world units
  CELL_SIZE: 1.0,
  WALL_HEIGHT: 3.0,
} as const;

/**
 * C# equivalent:
 * 
 * public static class GameConfig
 * {
 *     public const float BASE_MOVE_SPEED = 2.5f;
 *     public const float BOOSTED_MOVE_SPEED = 4.5f;
 *     public const float ROTATION_SPEED = 3.5f;
 *     public const float PLAYER_RADIUS = 0.25f;
 *     public const float SPEED_BOOST_DURATION = 5.0f;
 *     public const int SCORE_PER_SECOND_LEFT = 100;
 *     public const float CELL_SIZE = 1.0f;
 *     public const float WALL_HEIGHT = 3.0f;
 * }
 */
