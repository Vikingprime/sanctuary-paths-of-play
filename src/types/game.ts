export type AnimalType = 'pig' | 'cow' | 'bird';

export interface Animal {
  id: AnimalType;
  name: string;
  emoji: string;
  color: string;
  ability: {
    name: string;
    description: string;
    icon: string;
  };
  mealProgress: number;
  mealsUnlocked: number;
}

export interface MazeCell {
  x: number;
  y: number;
  isWall: boolean;
  isPowerUp?: boolean;
  isStation?: boolean;
  isStart?: boolean;
  isEnd?: boolean;
  isBerry?: boolean; // Berry collectible location
  powerUpType?: 'speed' | 'time' | 'key';
  brand?: string;
}

export type MedalType = 'bronze' | 'silver' | 'gold' | null;

export interface MedalTimes {
  gold: number;    // seconds - only achievable on first completion
  silver: number;  // seconds
  bronze: number;  // seconds
}

export interface UnlockCondition {
  mazeId: number;
  requiredMedal: 'bronze' | 'silver'; // gold never required
}

export interface DialogueMessage {
  speaker: string;
  speakerEmoji: string;
  message: string;
}

// Direction-keyed vision zones for NPCs that turn
export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

// Vision cells defined relative to the NPC's position (offsets)
export interface RelativeVisionZone {
  cells: { dx: number; dy: number }[]; // Offsets from NPC position
}

// Directional vision: different zones per facing direction
export type DirectionalVision = Partial<Record<CardinalDirection, RelativeVisionZone>>;

// Turning behavior: ping-pong between directions
export interface TurningConfig {
  pattern: 'ping-pong';
  directions: CardinalDirection[]; // e.g., ['north', 'south'] — sweeps back and forth
  intervalMs: number; // Time spent facing each direction before turning
  initialDirection?: CardinalDirection; // Starting direction (defaults to first in list)
}

// Patrol waypoint config
export interface PatrolConfig {
  pattern: 'loop'; // Walks through waypoints then loops back to start
  waypoints: { x: number; y: number }[]; // Grid positions to walk through
  speedCellsPerSec: number; // Movement speed in grid cells per second
  pauseMs?: number; // Optional pause at each waypoint (ms)
}

// Triangle cone vision config: widens with distance
export interface ConeVisionConfig {
  range: number; // How many cells deep the cone extends
  spreadPerCell: number; // How many cells wider per row (e.g., 1 = grows 1 cell each side per row)
}

export interface MazeCharacter {
  id: string;
  name: string;
  emoji: string;
  model: string; // GLB file name (e.g., 'Farmer.glb')
  animation: string;
  position: { x: number; y: number };
  alwaysFacePlayer?: boolean; // If true, character always rotates to face player (default: false, only faces during dialogue)
  // Per-animal dialogue sequence - defines the order of apple and normal dialogues
  dialogueSequence?: DialogueSequenceItem[];
  // Legacy: absolute vision cells (for static NPCs without turning)
  visionCells?: { x: number; y: number }[];
  visionDialogueId?: string; // ID of dialogue triggered when player enters vision zone
  // Directional vision: different zones per facing direction (relative to NPC)
  directionalVision?: DirectionalVision;
  // Cone vision: triangle-shaped vision that widens with distance
  coneVision?: ConeVisionConfig;
  // Turning behavior
  turning?: TurningConfig;
  // Patrol behavior
  patrol?: PatrolConfig;
}

// Defines a single item in a per-animal dialogue sequence
export interface DialogueSequenceItem {
  type: 'apple' | 'normal';
  // For apple: the apple dialogue number (1, 2, 3, etc.)
  // For normal: the dialogue ID from maze.dialogues
  id: string | number;
}

export interface DialogueTrigger {
  id: string;
  speaker: string;
  speakerEmoji: string;
  message: string;
  messages?: DialogueMessage[]; // Optional array of sequential messages (after the initial message)
  cells: { x: number; y: number }[]; // All cells that trigger this dialogue
  speakerPosition?: { x: number; y: number }; // Where the speaker model appears (defaults to first cell center)
  requires?: string[]; // IDs of dialogues that must be completed before this one can trigger
  requiresNot?: string[]; // IDs of dialogues that must NOT be completed for this to trigger (for "wrong order" gates)
  characterModel?: string; // GLB model file name - used if speakerCharacterId not set
  characterAnimation?: string; // Animation to play during dialogue
  speakerCharacterId?: string; // ID of placed character to zoom camera to
  triggerType?: 'proximity' | 'click'; // How this dialogue is triggered (default: 'proximity')
  effect?: 'game_over'; // Effect triggered when this dialogue completes (e.g., watcher NPC catches player)
}

export interface IntroDialogue {
  characterId?: string; // ID of a placed character to focus on
  speaker: string;
  speakerEmoji: string;
  message: string;
  characterPosition?: { x: number; y: number }; // Manual position if no characterId
  characterModel?: string; // Manual model if no characterId
}

// Obstacle placed in the maze (e.g., logs that block LOS for small creatures)
export interface MazeObstacle {
  id: string;
  model: string; // GLB file name (e.g., 'Log.glb')
  position: { x: number; y: number }; // Grid position
  rotation?: number; // Y-axis rotation in degrees (default: 0)
}

export interface Maze {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  grid: MazeCell[][];
  timeLimit: number;
  previewTime: number;
  medalTimes: MedalTimes;
  unlockConditions?: UnlockCondition[]; // undefined = always unlocked
  currencyCost?: number; // optional currency cost to unlock special mazes
  characters?: MazeCharacter[]; // placed characters in the maze
  dialogues?: DialogueTrigger[]; // optional dialogue triggers
  introDialogues?: IntroDialogue[]; // optional intro sequence before maze starts
  endConditions?: {
    requiredDialogues?: string[]; // Dialogues that must be completed before end cell triggers level complete
    requireReturnToEnd?: boolean; // If true, player must walk back to end cell after completing required dialogues (no auto-complete)
  };
  goalCharacterId?: string; // ID of placed character that acts as the goal (reaching them completes the level)
  timerDisabled?: boolean; // If true, no countdown timer (free exploration)
  freeMapAccess?: boolean; // If true, map button is always visible (not just near map stations)
  deletedSpineBranches?: Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  }>; // Branch ranges removed from generated traversal paths
  deletedSpineFineCells?: { x: number; y: number }[]; // Optional per-cell spine overrides removed from generated traversal paths
}

export interface GameState {
  currentAnimal: AnimalType | null;
  currentLevel: number;
  score: number;
  timeRemaining: number;
  isPlaying: boolean;
  isPreviewing: boolean;
  showMaze: boolean;
  playerPosition: { x: number; y: number };
  unlockedAnimals: AnimalType[];
  totalMealsUnlocked: number;
}

export interface PowerUp {
  id: string;
  type: 'speed' | 'time' | 'key';
  brand?: string;
  value: number;
}
