import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Maze, AnimalType, MedalType, DialogueTrigger, MazeCharacter } from '@/types/game';
import { StoryProgress } from '@/types/quest';
import { StoryMaze, StoryDialogue } from '@/data/storyMazes';
import { AppleDialogueMessage, canBeFedApples } from '@/types/appleDialogue';
import { Maze3DCanvas, PerformanceInfo } from './Maze3DScene';
import { MazePreview } from './MazePreview';
import { MiniMap } from './MiniMap';
import { GameHUD, SensitivityConfig, DEFAULT_SENSITIVITY } from './GameHUD';
import { MobileControls } from './MobileControls';
import { toast } from 'sonner';
import { RailControls } from './RailControls';
import { MazeIntroSequence } from './MazeIntroSequence';
import { CompassOverlay } from './CompassOverlay';
import { QuestLogOverlay } from './QuestLogOverlay';
import { ItemPanel } from './ItemPanel';
import { Button } from '@/components/ui/button';
import { Confetti } from '@/components/Confetti';
import { animals } from '@/data/animals';
import { formatTime } from '@/lib/utils';
import { setAutopushEnabled as setDebugAutopush, setLOSFaderEnabled as setDebugLOSFader, setVerboseLogging as setDebugVerbose } from '@/lib/debug';
import { useBackButton } from '@/hooks/useBackButton';
import { Point2D } from '@/game/SkeletonPolyline';
import { MagnetismCache } from '@/game/CorridorMagnetism';

// Import pure game logic (Unity-portable)
import {
  GameConfig,
  findStartPosition,
  findStartRotation,
  PlayerState,
  checkCellInteraction,
  executeAbility,
  DEFAULT_MAGNETISM_CONFIG,
  MagnetismConfig,
  MagnetismTurnResult,
} from '@/game';

// Completion result returned from parent after saving
interface CompletionResult {
  medal: MedalType;
  currencyEarned: number;
  isBestTime: boolean;
  bestTime: number | null;
}

interface MazeGame3DProps {
  maze: Maze;
  animalType: AnimalType;
  debugMode?: boolean;
  isMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  onComplete: (timeUsed: number) => Promise<CompletionResult>;
  onQuit: () => void;
  onBackToLevels: () => void;
  onRestart?: () => Promise<void>; // Called to record restart attempt
  // Story mode props
  isStoryMode?: boolean;
  storyMaze?: StoryMaze | null;
  storyProgress?: StoryProgress;
  onObjectiveComplete?: (objectiveId: string) => void;
  // Apple system props
  appleCount?: number;
  onAppleCollect?: (count?: number) => void;
  onAppleFeed?: (characterId: string, appleDialogueIndex?: number) => { 
    success: boolean; 
    dialogue?: AppleDialogueMessage[]; 
    dialogueId?: string;
    reason?: string;
    noDialogueLeft?: boolean;
  };
  canFeedApple?: (characterId: string) => { canFeed: boolean; reason?: string };
  getApplesGivenCount?: (characterId: string) => number;
  pendingAppleDialogue?: {
    animalId: string; // NPC character ID
    messages: AppleDialogueMessage[];
    dialogueId: string;
  } | null;
  onAppleDialogueComplete?: () => void;
  friendshipProgress?: {
    currentTier: { id: string; name: string; pointsRequired: number };
    nextTier: { id: string; name: string; pointsRequired: number } | null;
    progress: number;
  };
}

export const MazeGame3D = ({
  maze,
  animalType,
  debugMode = false,
  isMuted: initialMuted = false,
  onMuteChange,
  onComplete,
  onQuit,
  onBackToLevels,
  onRestart: onRestartProp,
  // Story mode props
  isStoryMode = false,
  storyMaze = null,
  storyProgress,
  onObjectiveComplete,
  // Apple system props
  appleCount = 0,
  onAppleCollect,
  onAppleFeed,
  canFeedApple,
  getApplesGivenCount,
  pendingAppleDialogue,
  onAppleDialogueComplete,
  friendshipProgress,
}: MazeGame3DProps) => {
  // Initialize from pure game logic
  const startPos = findStartPosition(maze);
  const startRotation = findStartRotation(maze);
  
  // Use ref for real-time player state (avoids re-renders every frame)
  const playerStateRef = useRef<PlayerState>({
    x: startPos.x,
    y: startPos.y,
    rotation: startRotation,
  });
  
  // React state only for UI that needs re-renders
  const [playerStateForUI, setPlayerStateForUI] = useState<PlayerState>(playerStateRef.current);
  const [timeLeft, setTimeLeft] = useState(debugMode ? 9999 : maze.timeLimit);
  const gameStartTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number>(0); // Accumulated paused time
  const [previewTimeLeft, setPreviewTimeLeft] = useState(debugMode ? 0 : maze.previewTime);
  const [isPreviewing, setIsPreviewing] = useState(!debugMode);
  const [isShowingIntro, setIsShowingIntro] = useState(!debugMode && (maze.introDialogues?.length ?? 0) > 0);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneRenderReady, setSceneRenderReady] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [mapStationAvailable, setMapStationAvailable] = useState(false);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [mapCountdown, setMapCountdown] = useState<number | null>(null);
  const [mapViewTimeLeft, setMapViewTimeLeft] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [collectedPowerUps, setCollectedPowerUps] = useState<Set<string>>(new Set());
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [restartKey, setRestartKey] = useState(0); // Increment to force camera reset
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const [finalTime, setFinalTime] = useState(0); // Time used to complete
  const [showCompass, setShowCompass] = useState(false); // Show compass at game start
  // Debug toggles
  const [topDownCamera, setTopDownCamera] = useState(false);
  const [groundLevelCamera, setGroundLevelCamera] = useState(false);
  const [showCollisionDebug, setShowCollisionDebug] = useState(false); // Default OFF even in debug mode
  const [autopushEnabled, setAutopushEnabled] = useState(true);
  const [losFaderEnabled, setLosFaderEnabled] = useState(true);
  const [verboseLogging, setVerboseLogging] = useState(false);
  // Feature toggles for performance testing
  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const [grassEnabled, setGrassEnabled] = useState(true);
  const [rocksEnabled, setRocksEnabled] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [opacityFadeEnabled, setOpacityFadeEnabled] = useState(true);
  const [cornEnabled, setCornEnabled] = useState(true);
  const [simpleGroundEnabled, setSimpleGroundEnabled] = useState(false);
  const [cornCullingEnabled, setCornCullingEnabled] = useState(true);
  const [skyEnabled, setSkyEnabled] = useState(true);
  const [shaderFadeEnabled, setShaderFadeEnabled] = useState(true);
  const [skeletonEnabled, setSkeletonEnabled] = useState(false);
  const [overlayGridEnabled, setOverlayGridEnabled] = useState(false);
  const [showPrunedSpurs, setShowPrunedSpurs] = useState(false); // Debug only
  const [spurConfig, setSpurConfig] = useState<{ maxSpurLen: number; minSpurDistance: number; maxBranchLen: number } | null>(null);
  const [defaultSpurConfig, setDefaultSpurConfig] = useState<{ maxSpurLen: number; minSpurDistance: number; maxBranchLen: number } | null>(null);
  
  // Magnetism configuration state
  const [magnetismConfig, setMagnetismConfig] = useState<MagnetismConfig>(DEFAULT_MAGNETISM_CONFIG);
  const [showMagnetTarget, setShowMagnetTarget] = useState(false); // Debug only
  const [showMagnetVector, setShowMagnetVector] = useState(false); // Debug only
  
  // Polyline smoothing configuration for debug tuning
  const [polylineConfig, setPolylineConfig] = useState<{
    chaikinIterations: number;
    chaikinCornerExtraIterations: number;
    chaikinFactor: number;
    cornerPushStrength: number;
  }>({
    chaikinIterations: 1,
    chaikinCornerExtraIterations: 0,
    chaikinFactor: 0.2,
    cornerPushStrength: 0,
  });
  
  // Magnetism debug ref - shared between canvas and HUD for real-time visualization
  const magnetismDebugRef = useRef<MagnetismTurnResult['debug'] | null>(null);
  
  // Magnetism debug freeze state - for taking screenshots
  // Using state (not ref) for frozen data so React re-renders when it changes
  const [magnetismDebugFrozen, setMagnetismDebugFrozen] = useState(false);
  const [frozenMagnetismData, setFrozenMagnetismData] = useState<MagnetismTurnResult['debug'] | null>(null);
  const [frozenPlayerRotation, setFrozenPlayerRotation] = useState<number>(0);
  const lastSpacebarTimeRef = useRef<number>(0); // Debounce spacebar to prevent double-firing
  
  const [lowShadowRes, setLowShadowRes] = useState(false); // Default high-res (2048), toggle to 512
  const [sensitivityConfig, setSensitivityConfig] = useState<SensitivityConfig>(DEFAULT_SENSITIVITY);
  // Per-animal rim light: 0.3 for cow/pig, 0 for chicken (uses defaults in PlayerCube)
  const [rendererInfo, setRendererInfo] = useState<PerformanceInfo>({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, frameTime: 0 });
  const isMovingRef = useRef(false);
  // Mobile controls - 2D joystick system (Summer Afternoon style)
  const joystickXRef = useRef(0); // Joystick X: -1 (left) to 1 (right)
  const joystickYRef = useRef(0); // Joystick Y: -1 (toward camera) to 1 (away from camera)
  const mobileIsMovingRef = useRef(false);
  const mobileTouchActiveRef = useRef(false); // Whether touch is currently active
  // Camera orbit yaw - controlled by joystick X, used for orbit camera
  const cameraYawRef = useRef(startRotation); // Camera yaw angle (orbits around player)
  
  // Control mode: 'joystick' or 'rail' (on-rail navigation)
  // Rail mode is the default for all modes
  type ControlMode = 'joystick' | 'rail';
  const [controlMode, setControlMode] = useState<ControlMode>('rail');
  
  // Rail control state
  const [isRailMoving, setIsRailMoving] = useState(false);
  const [railTurnSpeed, setRailTurnSpeed] = useState(4.0); // Radians per second for pre-turn phase
  const railPathRef = useRef<Point2D[]>([]);
  const railPathIndexRef = useRef(0);
  const railFractionalIndexRef = useRef(0); // For smooth arc-length traversal
  const railTurnPhaseRef = useRef(false); // True during pre-turn phase before movement starts
  const railTargetAngleRef = useRef(0); // Target angle to turn toward before moving
  const magnetismCacheRef = useRef<MagnetismCache | null>(null);
  
  // Debug toggle to completely disable mobile controls (WASD only mode)
  const [mobileControlsEnabled, setMobileControlsEnabled] = useState(true);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  
  // Dialogue state
  const [activeDialogue, setActiveDialogue] = useState<DialogueTrigger | null>(null);
  const [triggeredDialogues, setTriggeredDialogues] = useState<Set<string>>(new Set());
  const [dialogueMessageIndex, setDialogueMessageIndex] = useState(0); // For multi-message dialogues
  const [postDialoguePause, setPostDialoguePause] = useState(false); // Pause after dialogue ends until player clicks to resume
  
  // Apple dialogue state (separate from maze dialogues)
  const [activeAppleDialogue, setActiveAppleDialogue] = useState<{
    messages: AppleDialogueMessage[];
    currentIndex: number;
  } | null>(null);
  
  // Quest objective tracking for story mode
  const [completedObjectives, setCompletedObjectives] = useState<Set<string>>(new Set());
  
  // Helper to find the speaker position for a dialogue
  const findSpeakerPositionForDialogue = useCallback((dialogue: DialogueTrigger | null): { x: number; y: number } | null => {
    if (!dialogue || !maze.dialogues) return null;
    
    // Check for speakerCharacterId first
    if (dialogue.speakerCharacterId) {
      // Look up character in maze.characters array
      const character = maze.characters?.find(c => c.id === dialogue.speakerCharacterId);
      if (character) {
        return { x: character.position.x, y: character.position.y };
      }
    }
    
    // If this dialogue has a speaker position, use it
    if (dialogue.speakerPosition) {
      return dialogue.speakerPosition;
    }
    
    // If this dialogue has cells, use the first cell
    if (dialogue.cells.length > 0) {
      return { x: dialogue.cells[0].x, y: dialogue.cells[0].y };
    }
    
    // This is a chained dialogue - find the parent dialogue it requires
    if (dialogue.requires && dialogue.requires.length > 0) {
      const parentId = dialogue.requires[0];
      const parentDialogue = maze.dialogues.find(d => d.id === parentId);
      if (parentDialogue) {
        return findSpeakerPositionForDialogue(parentDialogue);
      }
    }
    
    return null;
  }, [maze.dialogues, maze.grid, maze.characters]);

  // Find all station positions in the maze
  const stationPositions = useRef<Array<{ x: number; y: number }>>([]);
  useEffect(() => {
    const positions: Array<{ x: number; y: number }> = [];
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isStation) {
          positions.push({ x: x + 0.5, y: y + 0.5 }); // Center of cell
        }
      });
    });
    stationPositions.current = positions;
  }, [maze]);

  // Background music
  useEffect(() => {
    const music = new Audio('/sounds/background-music.mp3');
    music.loop = true;
    music.volume = 0.1; // Very quiet
    music.muted = initialMuted; // Apply initial mute state
    bgMusicRef.current = music;
    music.play().catch(() => {}); // Ignore autoplay errors
    
    return () => {
      music.pause();
      music.src = '';
    };
  }, [initialMuted]);

  // Handle mute toggle
  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = newMuted;
      }
      // Persist to save
      onMuteChange?.(newMuted);
      return newMuted;
    });
  }, [onMuteChange]);

  // Sync debug toggles to debug module
  useEffect(() => {
    setDebugAutopush(autopushEnabled);
  }, [autopushEnabled]);
  
  useEffect(() => {
    setDebugLOSFader(losFaderEnabled);
  }, [losFaderEnabled]);

  useEffect(() => {
    setDebugVerbose(verboseLogging);
  }, [verboseLogging]);
  const keysPressed = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number>();

  // Delay 3D scene mount during preview to let timer start ticking first
  useEffect(() => {
    if (!isPreviewing) {
      setSceneRenderReady(true);
      return;
    }
    setSceneRenderReady(false);
    const t = setTimeout(() => setSceneRenderReady(true), 800);
    return () => clearTimeout(t);
  }, [isPreviewing, restartKey]);

  // Preview countdown - use timestamp-based approach for reliable timing
  const previewAnimFrameRef = useRef<number | null>(null);
  const previewStartTimeRef = useRef<number | null>(null);
  const previewDurationRef = useRef<number>(0);
  
  useEffect(() => {
    // Cancel any existing animation frame first
    if (previewAnimFrameRef.current) {
      cancelAnimationFrame(previewAnimFrameRef.current);
      previewAnimFrameRef.current = null;
    }
    
    if (!isPreviewing) {
      previewStartTimeRef.current = null;
      return;
    }

    // Initialize start time and duration
    const duration = debugMode ? 0 : maze.previewTime;
    previewStartTimeRef.current = Date.now();
    previewDurationRef.current = duration;

    // Use requestAnimationFrame for reliable timing that won't be throttled
    const tick = () => {
      if (previewStartTimeRef.current === null) return;
      
      const elapsedMs = Date.now() - previewStartTimeRef.current;
      const elapsedSeconds = elapsedMs / 1000;
      // Use floor for proper countdown (10, 9, 8... not ceiling which delays the first tick)
      const remaining = Math.max(0, Math.floor(previewDurationRef.current - elapsedSeconds + 1));
      
      setPreviewTimeLeft(prev => {
        // Only update state if value actually changed (prevents unnecessary re-renders)
        if (prev !== remaining) return remaining;
        return prev;
      });
      
      if (elapsedSeconds >= previewDurationRef.current) {
        setIsPreviewing(false);
      } else {
        previewAnimFrameRef.current = requestAnimationFrame(tick);
      }
    };
    
    previewAnimFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (previewAnimFrameRef.current) {
        cancelAnimationFrame(previewAnimFrameRef.current);
        previewAnimFrameRef.current = null;
      }
    };
  }, [isPreviewing, debugMode, maze.previewTime]);

  // Game timer (paused during dialogue) - precise timing with 100ms updates
  const dialoguePauseStartRef = useRef<number | null>(null);
  const gameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    // Clear any existing timer first
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    
    if (isPreviewing || gameOver) return;
    
    // Track when any dialogue starts to pause timer (including apple dialogue)
    const isInDialogue = activeDialogue !== null || activeAppleDialogue !== null || postDialoguePause;
    
    if (isInDialogue && dialoguePauseStartRef.current === null) {
      dialoguePauseStartRef.current = Date.now();
    }
    
    // When all dialogues end, add the paused duration
    if (!isInDialogue && dialoguePauseStartRef.current !== null) {
      pausedTimeRef.current += Date.now() - dialoguePauseStartRef.current;
      dialoguePauseStartRef.current = null;
    }
    
    if (isInDialogue) return; // Don't run timer during any dialogue
    
    // Initialize start time on first run
    if (gameStartTimeRef.current === null) {
      gameStartTimeRef.current = Date.now();
    }

    // In debug mode or when timer is disabled, don't count down time
    if (debugMode || maze.timerDisabled) return;
    
    gameTimerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - gameStartTimeRef.current! - pausedTimeRef.current) / 1000;
      const remaining = maze.timeLimit - elapsed;
      
      if (remaining <= 0) {
        if (gameTimerRef.current) {
          clearInterval(gameTimerRef.current);
          gameTimerRef.current = null;
        }
        setGameOver(true);
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    }, 100); // Update every 100ms for precision

    return () => {
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
    };
  }, [isPreviewing, gameOver, activeDialogue, activeAppleDialogue, postDialoguePause, maze.timeLimit, debugMode]);

  // Show compass when game starts (preview ends)
  useEffect(() => {
    if (!isPreviewing && !isShowingIntro && !gameOver) {
      setShowCompass(true);
    }
  }, [isPreviewing, isShowingIntro, gameOver]);

  // Screen Wake Lock to prevent dimming during gameplay
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && !isPreviewing && !gameOver) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Wake lock request failed - silently ignore
      }
    };
    
    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
    
    if (!isPreviewing && !gameOver) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    
    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isPreviewing && !gameOver) {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPreviewing, gameOver]);

  // Check if all required dialogues for a given dialogue are completed
  const areRequirementsMet = useCallback((dialogue: DialogueTrigger): boolean => {
    if (!dialogue.requires || dialogue.requires.length === 0) return true;
    return dialogue.requires.every(reqId => triggeredDialogues.has(reqId));
  }, [triggeredDialogues]);

  // Check if a dialogue can be triggered at the given cell (proximity-based only)
  const checkDialogueAtCell = useCallback((gridX: number, gridY: number, currentTriggered: Set<string>): DialogueTrigger | null => {
    if (!maze.dialogues) return null;
    
    for (const dialogue of maze.dialogues) {
      if (currentTriggered.has(dialogue.id)) continue;
      // Skip click-triggered dialogues - they're handled by character clicks
      if (dialogue.triggerType === 'click') continue;
      
      // Check requirements inline to avoid stale closure
      if (dialogue.requires && dialogue.requires.length > 0) {
        const requirementsMet = dialogue.requires.every(reqId => currentTriggered.has(reqId));
        if (!requirementsMet) continue;
      }
      
      // Check if this cell is in the dialogue's trigger cells
      const isInCells = dialogue.cells.some(cell => cell.x === gridX && cell.y === gridY);
      if (isInCells) {
        return dialogue;
      }
    }
    return null;
  }, [maze.dialogues]);

  // Handle click-triggered dialogue for a specific character
  const handleCharacterClick = useCallback((characterId: string) => {
    if (!maze.dialogues || activeDialogue || activeAppleDialogue) return;
    
    // Find a click-triggered dialogue linked to this character
    for (const dialogue of maze.dialogues) {
      if (triggeredDialogues.has(dialogue.id)) continue;
      if (dialogue.triggerType !== 'click') continue;
      if (dialogue.speakerCharacterId !== characterId) continue;
      
      // Check requirements
      if (dialogue.requires && dialogue.requires.length > 0) {
        const requirementsMet = dialogue.requires.every(reqId => triggeredDialogues.has(reqId));
        if (!requirementsMet) continue;
      }
      
      console.log('[Dialogue] Click-triggered:', dialogue.id, 'speaker:', dialogue.speaker);
      setActiveDialogue(dialogue);
      setDialogueMessageIndex(0);
      setTriggeredDialogues(prev => new Set([...prev, dialogue.id]));
      return;
    }
  }, [maze.dialogues, triggeredDialogues, activeDialogue, activeAppleDialogue]);

  // Check if all required dialogues for end are completed
  const canEndLevel = useCallback((): boolean => {
    if (!maze.endConditions?.requiredDialogues) return true;
    return maze.endConditions.requiredDialogues.every(id => triggeredDialogues.has(id));
  }, [maze.endConditions, triggeredDialogues]);

  // Track if we should end after dialogue - use ref directly for immediate access
  const pendingEndGameRef = useRef(false);

  // Handle cell interactions (React-specific wrapper around pure logic)
  const handleCellInteraction = useCallback(
    (x: number, y: number) => {
      const result = checkCellInteraction(maze, x, y, collectedPowerUps);
      const gridX = Math.floor(x);
      const gridY = Math.floor(y);

      // Check if player reached the goal character (if configured)
      if (maze.goalCharacterId && maze.characters) {
        const goalChar = maze.characters.find(c => c.id === maze.goalCharacterId);
        if (goalChar) {
          const goalGridX = Math.floor(goalChar.position.x);
          const goalGridY = Math.floor(goalChar.position.y);
          if (gridX === goalGridX && gridY === goalGridY) {
            result.reachedEnd = true;
          }
        }
      }

      if (result.collectPowerUp && result.powerUpKey) {
        setCollectedPowerUps((prev) => new Set([...prev, result.powerUpKey!]));
        setSpeedBoostActive(true);
        setTimeout(() => setSpeedBoostActive(false), GameConfig.SPEED_BOOST_DURATION * 1000);
      }

      // Station triggering is now handled by proximity check, not cell interaction
      
      // If there's a pending apple dialogue, show it before any regular dialogue
      if (pendingAppleDialogue && !activeAppleDialogue) {
        setActiveAppleDialogue({
          messages: pendingAppleDialogue.messages,
          currentIndex: 0,
        });
        
        // If this is also an end cell, mark pending end
        if (result.reachedEnd) {
          pendingEndGameRef.current = true;
        }
        return;
      }
      
      // Check for any dialogue at this cell
      const dialogue = checkDialogueAtCell(gridX, gridY, triggeredDialogues);
      
      if (dialogue) {
        console.log('[Dialogue] Triggered:', dialogue.id, 'speaker:', dialogue.speaker, 'at cell:', gridX, gridY);
        setActiveDialogue(dialogue);
        setDialogueMessageIndex(0); // Reset to first message
        setTriggeredDialogues(prev => new Set([...prev, dialogue.id]));
        
        // If this is also an end cell, mark pending end
        if (result.reachedEnd) {
          pendingEndGameRef.current = true;
        } else {
          // Check if the cell is an end cell directly
          const cell = maze.grid[gridY]?.[gridX];
          if (cell?.isEnd) {
            pendingEndGameRef.current = true;
          }
        }
        return;
      }

      // Check if reached end and all conditions are met
      if (result.reachedEnd && canEndLevel()) {
        setHasWon(true);
        setGameOver(true);
        const timeUsed = maze.timeLimit - timeLeft;
        setFinalTime(timeUsed);
        onComplete(timeUsed).then(setCompletionResult);
      }
    },
    [maze, collectedPowerUps, timeLeft, onComplete, checkDialogueAtCell, canEndLevel, pendingAppleDialogue, activeAppleDialogue]
  );
  
  // Find the next chained dialogue after the current one
  const findNextChainedDialogue = useCallback((currentDialogueId: string): DialogueTrigger | null => {
    if (!maze.dialogues) return null;
    
    // Find dialogues that:
    // 1. Require the current dialogue
    // 2. Have empty cells (meaning they chain from Continue, not location-based)
    // 3. Haven't been triggered yet
    for (const dialogue of maze.dialogues) {
      if (triggeredDialogues.has(dialogue.id)) continue;
      if (!dialogue.requires?.includes(currentDialogueId)) continue;
      if (dialogue.cells.length === 0) {
        return dialogue;
      }
    }
    return null;
  }, [maze.dialogues, triggeredDialogues]);

  // Handle continue button click - check for multi-message, then chained dialogues
  const handleDialogueContinue = useCallback(() => {
    if (!activeDialogue) return;
    
    // Check if there are more messages in this dialogue's messages array
    const totalMessages = 1 + (activeDialogue.messages?.length || 0); // First message + additional messages
    if (dialogueMessageIndex < totalMessages - 1) {
      // Advance to next message in the same dialogue
      setDialogueMessageIndex(prev => prev + 1);
      return;
    }
    
    // Process quest action if this is a story dialogue
    if (isStoryMode && storyMaze) {
      const storyDialogue = storyMaze.dialogues.find(d => d.id === activeDialogue.id) as StoryDialogue | undefined;
      if (storyDialogue?.questAction) {
        const action = storyDialogue.questAction;
        if (action.type === 'complete_objective' && action.objectiveId) {
          // Mark objective as complete locally
          setCompletedObjectives(prev => new Set([...prev, action.objectiveId!]));
          // Notify parent
          onObjectiveComplete?.(action.objectiveId);
        }
      }
    }
    
    // All messages in this dialogue shown, check for chained dialogue
    const currentDialogueId = activeDialogue.id;
    const nextDialogue = findNextChainedDialogue(currentDialogueId);
    if (nextDialogue) {
      // Show the next dialogue in the chain
      setActiveDialogue(nextDialogue);
      setTriggeredDialogues(prev => new Set([...prev, nextDialogue.id]));
      setDialogueMessageIndex(0); // Reset to first message
      return;
    }
    
    // No more chained dialogues - close dialogue and enter post-dialogue pause
    setActiveDialogue(null);
    setDialogueMessageIndex(0);
    setPostDialoguePause(true);
    
    // For story mode: check if all required dialogues are now complete
    // If so, end the chapter immediately (no need to reach end cell)
    if (isStoryMode && maze.endConditions?.requiredDialogues) {
      // Check if we just completed the last required dialogue
      const allDialoguesTriggered = maze.endConditions.requiredDialogues.every(
        id => triggeredDialogues.has(id) || id === currentDialogueId
      );
      
      if (allDialoguesTriggered) {
        setHasWon(true);
        setGameOver(true);
        const timeUsed = maze.timeLimit - timeLeft;
        setFinalTime(timeUsed);
        onComplete(timeUsed).then(setCompletionResult);
        return;
      }
    }
    
    // After dialogue ends, check if player is currently on an end cell
    const playerX = Math.floor(playerStateRef.current.x);
    const playerY = Math.floor(playerStateRef.current.y);
    const currentCell = maze.grid[playerY]?.[playerX];
    
    // If player is on end cell (or was on one when dialogue started), and can end level
    if ((currentCell?.isEnd || pendingEndGameRef.current) && canEndLevel()) {
      setHasWon(true);
      setGameOver(true);
      const timeUsed = maze.timeLimit - timeLeft;
      setFinalTime(timeUsed);
      onComplete(timeUsed).then(setCompletionResult);
      pendingEndGameRef.current = false;
    }
  }, [activeDialogue, dialogueMessageIndex, maze.grid, maze.timeLimit, timeLeft, onComplete, findNextChainedDialogue, canEndLevel, isStoryMode, storyMaze, onObjectiveComplete]);

  // Rail control handlers
  const handleRailDirectionSelect = useCallback((targetX: number, targetZ: number, pathPoints: Point2D[]) => {
    if (pathPoints.length < 2) return;
    
    // Calculate initial path direction to turn toward
    const lookAheadIdx = Math.min(10, pathPoints.length - 1);
    const dirX = pathPoints[lookAheadIdx].x - pathPoints[0].x;
    const dirZ = pathPoints[lookAheadIdx].z - pathPoints[0].z;
    const pathAngle = Math.atan2(dirX, dirZ);
    
    // Convert to player rotation format: targetRotation = -visualAngle + PI
    let targetRotation = -pathAngle + Math.PI;
    while (targetRotation < 0) targetRotation += Math.PI * 2;
    while (targetRotation >= Math.PI * 2) targetRotation -= Math.PI * 2;
    
    railPathRef.current = pathPoints;
    railPathIndexRef.current = 0;
    railFractionalIndexRef.current = 0;
    railTurnPhaseRef.current = true;
    railTargetAngleRef.current = targetRotation;
    setIsRailMoving(true);
  }, []);
  
  const handleRailStop = useCallback(() => {
    setIsRailMoving(false);
    railPathRef.current = [];
    railPathIndexRef.current = 0;
    // Sync UI state with current player position for direction calculation
    setPlayerStateForUI({ ...playerStateRef.current });
  }, []);
  
  const handleRailTurnAround = useCallback(() => {
    // Reverse current path
    if (railPathRef.current.length > 1) {
      railPathRef.current = [...railPathRef.current].reverse();
      railPathIndexRef.current = 0;
      setIsRailMoving(true);
    }
  }, []);
  
  // Find nearby feedable animal character (within proximity range)
  const findNearbyFeedableAnimal = useCallback((): { character: MazeCharacter; animalId: string } | null => {
    const FEED_PROXIMITY_RADIUS = 4.5; // Must be within 4.5 units to feed (3x original)
    const playerX = playerStateRef.current.x;
    const playerY = playerStateRef.current.y;
    
    // Check maze.characters for nearby feedable animals
    const characters = maze.characters || [];
    for (const character of characters) {
      // Check if this character is a feedable NPC (not player animals, not humans)
      if (!canBeFedApples(character.id)) continue;
      
      // Check proximity
      const dx = playerX - character.position.x;
      const dy = playerY - character.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= FEED_PROXIMITY_RADIUS) {
        return { character, animalId: character.id };
      }
    }
    
    return null;
  }, [maze.characters]);
  
  // Calculate the apple dialogue index based on interleaved ordering
  // This uses the character's dialogueSequence to determine which apple dialogue should trigger next
  // based on which normal dialogues have already been completed
  const calculateAppleDialogueIndex = useCallback((targetAnimalId: string, targetCharacter: MazeCharacter): number => {
    const sequence = targetCharacter.dialogueSequence;
    
    // If no sequence defined, fall back to simple applesGiven count
    if (!sequence || sequence.length === 0) {
      const applesGiven = getApplesGivenCount?.(targetAnimalId) ?? 0;
      return applesGiven;
    }
    
    // Walk through the sequence to find the next apple slot the player should trigger.
    // An item is "done" if:
    //   - type 'apple': the cumulative apple count so far is < applesGiven
    //   - type 'normal': the dialogue id has been triggered
    // The first un-done 'apple' item gives us the appleDialogueIndex (its 0-based apple ordinal).
    // If we hit an un-done 'normal' item, we block — the player needs to do that dialogue first,
    // but we still return the next apple index so feeding shows "get closer" / proximity gate.
    
    const applesGiven = getApplesGivenCount?.(targetAnimalId) ?? 0;
    let appleOrdinal = 0; // counts apple-type items encountered so far
    
    for (const item of sequence) {
      if (item.type === 'apple') {
        if (appleOrdinal < applesGiven) {
          // This apple was already fed — skip it
          appleOrdinal++;
          continue;
        }
        // This is the next apple to give — return its ordinal
        return appleOrdinal;
      } else {
        // Normal dialogue — check if it's been triggered
        const isTriggered = triggeredDialogues.has(item.id.toString());
        if (!isTriggered) {
          // Normal dialogue not yet done — but still return the next apple ordinal
          // so the system can show "talk to them first" or allow feeding if desired
          return appleOrdinal;
        }
        // Normal dialogue already done — skip it and continue
      }
    }
    
    // Exhausted the entire sequence — return total apple count (will be rejected as "no more dialogues")
    return appleOrdinal;
  }, [getApplesGivenCount, triggeredDialogues]);
  
  // Handle apple drop - attempt to feed apple to nearby animal and trigger dialogue
  const handleAppleDrop = useCallback(() => {
    // Don't allow feeding during active dialogue
    if (activeDialogue || activeAppleDialogue) {
      console.log('[Apple] Cannot feed during active dialogue');
      toast.error("Can't feed while talking!");
      return;
    }
    
    // Find nearby feedable animal
    const nearbyAnimal = findNearbyFeedableAnimal();
    if (!nearbyAnimal) {
      console.log('[Apple] No feedable animal nearby');
      toast.error("Get closer to an animal to feed them!");
      return;
    }
    
    const { character, animalId } = nearbyAnimal;
    
    // Check if can feed
    const canFeedResult = canFeedApple?.(animalId);
    if (!canFeedResult?.canFeed) {
      console.log('[Apple] Cannot feed:', canFeedResult?.reason);
      toast.error(canFeedResult?.reason || "Can't feed right now");
      return;
    }
    
    // Calculate which apple dialogue to trigger (interleaved ordering)
    const appleDialogueIndex = calculateAppleDialogueIndex(animalId, character);
    
    // Try to feed the apple
    const result = onAppleFeed?.(animalId, appleDialogueIndex);
    if (!result?.success) {
      console.log('[Apple] Feed failed:', result?.reason);
      // Show specific message if no dialogue left
      if (result?.noDialogueLeft) {
        toast.info(result.reason || "This animal doesn't want more apples");
      } else {
        toast.error(result?.reason || "Couldn't feed apple");
      }
      return;
    }
    
    // If there's dialogue to show, set it up
    if (result.dialogue && result.dialogue.length > 0) {
      setActiveAppleDialogue({
        messages: result.dialogue,
        currentIndex: 0,
      });
    }
  }, [activeDialogue, activeAppleDialogue, canFeedApple, onAppleFeed, findNearbyFeedableAnimal, calculateAppleDialogueIndex]);
  
  // Callback to receive magnetism cache from Maze3DScene
  // In rail control mode, snap the animal to the nearest polyline
  const handleMagnetismCacheReady = useCallback((cache: MagnetismCache) => {
    magnetismCacheRef.current = cache;
    
    // In rail control mode, snap to nearest polyline and face away from nearby endpoints
    if (controlMode === 'rail' && cache?.polylineGraph) {
      const { polylineGraph, polylineSpatialHash, polylineBucketSize } = cache;
      const playerX = playerStateRef.current.x;
      const playerZ = playerStateRef.current.y;
      
      // Find nearest polyline point
      const bucketsToCheck = 5;
      const centerBx = Math.floor(playerX / polylineBucketSize);
      const centerBz = Math.floor(playerZ / polylineBucketSize);
      
      let nearestSegIdx = -1;
      let nearestPtIdx = -1;
      let nearestDistSq = Infinity;
      let nearestX = playerX;
      let nearestZ = playerZ;
      
      for (let dbx = -bucketsToCheck; dbx <= bucketsToCheck; dbx++) {
        for (let dbz = -bucketsToCheck; dbz <= bucketsToCheck; dbz++) {
          const bucketKey = `${centerBx + dbx},${centerBz + dbz}`;
          const bucket = polylineSpatialHash.get(bucketKey);
          if (!bucket) continue;
          
          for (const point of bucket.points) {
            const dx = playerX - point.wx;
            const dz = playerZ - point.wz;
            const distSq = dx * dx + dz * dz;
            
            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearestSegIdx = point.segmentIndex;
              nearestPtIdx = point.pointIndex;
              nearestX = point.wx;
              nearestZ = point.wz;
            }
          }
        }
      }
      
      if (nearestSegIdx >= 0) {
        const segment = polylineGraph.segments[nearestSegIdx];
        if (segment && segment.points.length > 1) {
          // Snap position to nearest polyline point
          playerStateRef.current.x = nearestX;
          playerStateRef.current.y = nearestZ;
          
          // Check both directions for nearby endpoints (within 3 world units)
          const ENDPOINT_CHECK_DISTANCE = 3.0;
          
          // Calculate distance to endpoints
          const startPt = segment.points[0];
          const endPt = segment.points[segment.points.length - 1];
          
          const distToStart = Math.sqrt(
            (nearestX - startPt.x) ** 2 + (nearestZ - startPt.z) ** 2
          );
          const distToEnd = Math.sqrt(
            (nearestX - endPt.x) ** 2 + (nearestZ - endPt.z) ** 2
          );
          
          // Determine which direction to face (away from nearby endpoints)
          let faceForward = true; // Default: face toward end of segment
          
          if (segment.startIsEndpoint && distToStart < ENDPOINT_CHECK_DISTANCE) {
            // Nearby endpoint at start - face toward end
            faceForward = true;
          } else if (segment.endIsEndpoint && distToEnd < ENDPOINT_CHECK_DISTANCE) {
            // Nearby endpoint at end - face toward start
            faceForward = false;
          }
          
          // Calculate facing direction
          const lookAheadIdx = faceForward 
            ? Math.min(nearestPtIdx + 10, segment.points.length - 1)
            : Math.max(nearestPtIdx - 10, 0);
          const lookPt = segment.points[lookAheadIdx];
          const dirX = lookPt.x - nearestX;
          const dirZ = lookPt.z - nearestZ;
          const visualAngle = Math.atan2(dirX, dirZ);
          
          // Convert to player rotation format: rotation = -visualAngle + PI
          let rotation = -visualAngle + Math.PI;
          while (rotation < 0) rotation += Math.PI * 2;
          while (rotation >= Math.PI * 2) rotation -= Math.PI * 2;
          
          playerStateRef.current.rotation = rotation;
          
          // Ensure we start in stopped state so direction arrows are shown
          setIsRailMoving(false);
          railPathRef.current = [];
          railFractionalIndexRef.current = 0;
          railTurnPhaseRef.current = false;
          
          // Update UI state
          setPlayerStateForUI({ ...playerStateRef.current });
          
          if (debugMode) {
            console.log(`[Rail] Snapped to polyline seg=${nearestSegIdx} pt=${nearestPtIdx}, facing=${faceForward ? 'forward' : 'backward'}`);
          }
        }
      }
    }
  }, [debugMode, controlMode]);

  // Movement is now handled in Maze3DScene's useFrame for sync with rendering

  // Clear keys when focus changes or preview state changes
  useEffect(() => {
    keysPressed.current.clear();
  }, [isPreviewing, showMiniMap]);

  // Map countdown timer (before viewing map)
  const mapCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    if (mapCountdownTimerRef.current) {
      clearInterval(mapCountdownTimerRef.current);
      mapCountdownTimerRef.current = null;
    }
    
    if (mapCountdown === null || mapCountdown <= 0) return;
    
    mapCountdownTimerRef.current = setInterval(() => {
      setMapCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (mapCountdownTimerRef.current) {
            clearInterval(mapCountdownTimerRef.current);
            mapCountdownTimerRef.current = null;
          }
          // Start showing the map for 10 seconds
          setShowMiniMap(true);
          setMapViewTimeLeft(10);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (mapCountdownTimerRef.current) {
        clearInterval(mapCountdownTimerRef.current);
        mapCountdownTimerRef.current = null;
      }
    };
  }, [mapCountdown]);

  // Map view timer (auto-close after 10 seconds)
  const mapViewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    if (mapViewTimerRef.current) {
      clearInterval(mapViewTimerRef.current);
      mapViewTimerRef.current = null;
    }
    
    if (mapViewTimeLeft === null || mapViewTimeLeft <= 0) return;
    
    mapViewTimerRef.current = setInterval(() => {
      setMapViewTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (mapViewTimerRef.current) {
            clearInterval(mapViewTimerRef.current);
            mapViewTimerRef.current = null;
          }
          setShowMiniMap(false);
          setMapStationAvailable(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (mapViewTimerRef.current) {
        clearInterval(mapViewTimerRef.current);
        mapViewTimerRef.current = null;
      }
    };
  }, [mapViewTimeLeft]);

  // Proximity check for map stations (runs continuously)
  useEffect(() => {
    if (isPreviewing || gameOver || showMiniMap || showMapOptions || mapCountdown !== null) return;
    
    const checkProximity = () => {
      const playerX = playerStateRef.current.x;
      const playerY = playerStateRef.current.y;
      const playerRot = playerStateRef.current.rotation;
      const STATION_RADIUS = 1.2; // Slightly larger radius for head reach
      
      // Calculate head position based on animal type
      // Cow head offset is 0.65 forward
      const headOffset = animalType === 'cow' ? 0.65 : animalType === 'pig' ? 0.22 : 0.15;
      const headX = playerX + Math.sin(playerRot) * headOffset;
      const headY = playerY - Math.cos(playerRot) * headOffset;
      
      let nearStation = false;
      for (const station of stationPositions.current) {
        // Check if head OR center is near station
        const dxHead = headX - station.x;
        const dyHead = headY - station.y;
        const distanceHead = Math.sqrt(dxHead * dxHead + dyHead * dyHead);
        
        const dxCenter = playerX - station.x;
        const dyCenter = playerY - station.y;
        const distanceCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
        
        if (distanceHead <= STATION_RADIUS || distanceCenter <= STATION_RADIUS) {
          nearStation = true;
          break;
        }
      }
      
      setMapStationAvailable(nearStation);
    };
    
    // If freeMapAccess is enabled, always show map button
    if (maze.freeMapAccess) {
      setMapStationAvailable(true);
      return;
    }
    
    // Check every 100ms for smooth response
    const interval = setInterval(checkProximity, 100);
    checkProximity(); // Initial check
    
    return () => clearInterval(interval);
  }, [isPreviewing, gameOver, showMiniMap, showMapOptions, mapCountdown, maze.freeMapAccess]);

  // Dialogue is now checked via cell-based logic in handleCellInteraction, not proximity

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore repeated keydown events (key held down)
      if (e.repeat) return;
      
      keysPressed.current.add(e.key.toLowerCase());
      
      // Spacebar: Capture magnetism debug snapshot (works in debug mode regardless of skeleton visibility)
      // First press: freeze and capture, subsequent presses: update frozen data
      if (e.key === ' ' && debugMode) {
        e.preventDefault();
        e.stopPropagation();
        
        // Debounce to prevent double firing
        const now = Date.now();
        if (now - lastSpacebarTimeRef.current < 200) {
          return;
        }
        lastSpacebarTimeRef.current = now;
        
        // Toggle frozen state: if frozen, unpause; if live, freeze
        if (magnetismDebugFrozen) {
          console.log('[FREEZE] Spacebar - returning to live mode');
          setMagnetismDebugFrozen(false);
          setFrozenMagnetismData(null);
        } else {
          // Capture current data as state (triggers re-render)
          const current = magnetismDebugRef.current;
          const snapshot = current ? JSON.parse(JSON.stringify(current)) : null;
          setFrozenMagnetismData(snapshot);
          setFrozenPlayerRotation(playerStateRef.current.rotation);
          console.log('[FREEZE] Spacebar - entering frozen mode', snapshot);
          setMagnetismDebugFrozen(true);
        }
      }
      
      // Escape: Return to live mode (unfreeze)
      if (e.key === 'Escape' && debugMode && magnetismDebugFrozen) {
        e.preventDefault();
        console.log('[FREEZE] Escape - returning to live mode');
        setMagnetismDebugFrozen(false);
        setFrozenMagnetismData(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    // Clear all keys when window loses focus
    const handleBlur = () => {
      keysPressed.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [debugMode, magnetismDebugFrozen]);

  // Mobile controls now handled by MobileControls component with refs

  // Use ability - wraps pure executeAbility
  const useAbility = () => {
    if (abilityUsed || gameOver) return;

    const result = executeAbility(animalType, maze, playerStateRef.current);

    if (result.success) {
      setAbilityUsed(true);

      if (result.newPlayerState) {
        playerStateRef.current = result.newPlayerState;
        handleCellInteraction(result.newPlayerState.x, result.newPlayerState.y);
      }

      if (result.showMap) {
        setMapStationAvailable(true);
      }
    }
  };

  // Restart the maze (reset all game state)
  const handleRestart = useCallback(() => {
    
    // Reset player position
    playerStateRef.current = {
      x: startPos.x,
      y: startPos.y,
      rotation: startRotation,
    };
    setPlayerStateForUI(playerStateRef.current);
    
    // Reset rail movement state so player starts stopped with direction arrows
    setIsRailMoving(false);
    railPathRef.current = [];
    railFractionalIndexRef.current = 0;
    railTurnPhaseRef.current = false;
    
    // Reset game state
    setTimeLeft(debugMode ? 9999 : maze.timeLimit);
    setPreviewTimeLeft(debugMode ? 0 : maze.previewTime);
    setIsPreviewing(!debugMode);
    setGameOver(false);
    setHasWon(false);
    setAbilityUsed(false);
    setCollectedPowerUps(new Set());
    setSpeedBoostActive(false);
    setShowMiniMap(false);
    setMapStationAvailable(false);
    setShowMapOptions(false);
    setMapCountdown(null);
    setMapViewTimeLeft(null);
    setActiveDialogue(null);
    setActiveAppleDialogue(null);
    setTriggeredDialogues(new Set());
    setCompletedObjectives(new Set());
    setDialogueMessageIndex(0);
    setPostDialoguePause(false);
    pendingEndGameRef.current = false;
    
    // Reset timing refs
    gameStartTimeRef.current = null;
    pausedTimeRef.current = 0;
    dialoguePauseStartRef.current = null;
    
    // Record the restart attempt in persistent storage
    onRestartProp?.();
    
    // Increment restart key to force scene rebuild and re-trigger magnetism cache ready
    // which will snap the player to the polyline
    setRestartKey(prev => prev + 1);
    
    // Clear keys
    keysPressed.current.clear();
  }, [startPos, startRotation, debugMode, maze.timeLimit, maze.previewTime, onRestartProp]);

  // Handle map station button click
  const handleMapStationClick = () => {
    setShowMapOptions(true);
  };

  // Handle countdown option selection
  const handleStartCountdown = () => {
    setShowMapOptions(false);
    setMapCountdown(10);
  };

  const animal = animals.find((a) => a.id === animalType)!;

  // Hardware back button - quits game and goes back to home
  useBackButton(onQuit, !gameOver);

  // Show preview overlay on top of the 3D scene (which renders in background)
  const showPreviewOverlay = isPreviewing && sceneReady;

  // Stable callback for intro sequence completion - prevents timer restarts
  const handleIntroComplete = useCallback(() => {
    setIsShowingIntro(false);
    // Skip the preview since intro sequence already showed a preview
    setIsPreviewing(false);
  }, []);

  // Medal emoji mapping
  const medalEmoji: Record<string, string> = {
    gold: '🥇',
    silver: '🥈', 
    bronze: '🥉',
  };

  // Check if gold medal was earned
  const isGoldMedal = completionResult?.medal === 'gold';

  // Game over screen
  if (gameOver) {
    return (
      <>
        {/* Confetti for gold medal */}
        <Confetti active={hasWon && isGoldMedal} />
        
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
          <div className="text-center space-y-6 animate-fade-in">
            {hasWon ? (
              <>
                {/* Show medal if earned */}
                <div className={`text-8xl ${isGoldMedal ? 'animate-bounce' : ''}`}>
                  {completionResult?.medal ? medalEmoji[completionResult.medal] : '🎉'}
                </div>
                <h2 className="font-display text-4xl font-bold text-foreground">
                  {completionResult?.medal 
                    ? `${completionResult.medal.charAt(0).toUpperCase() + completionResult.medal.slice(1)} Medal!`
                    : 'You Made It!'}
                </h2>
                <div className="space-y-3">
                  {/* Time display */}
                  <div className="bg-card rounded-xl p-4 inline-block">
                    <p className="text-2xl font-display font-bold text-foreground">
                      ⏱️ {formatTime(finalTime)}s
                    </p>
                    {completionResult?.isBestTime ? (
                      <p className="text-sm text-primary font-semibold mt-1">
                        🎯 New Best Time!
                      </p>
                    ) : completionResult?.bestTime ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        Best: {formatTime(completionResult.bestTime)}s
                      </p>
                    ) : null}
                  </div>
                  
                  {/* Stars earned */}
                  {completionResult?.currencyEarned ? (
                    <p className="text-lg font-semibold text-primary">
                      +{completionResult.currencyEarned} ⭐
                      {completionResult.isBestTime && <span className="text-sm text-muted-foreground ml-1">(includes best time bonus!)</span>}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground">
                    {animal.emoji} {animal.name} is proud of you!
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-8xl">😢</div>
                <h2 className="font-display text-4xl font-bold text-foreground">
                  Time's Up!
                </h2>
                <p className="text-muted-foreground">
                  Don't give up! The sanctuary animals are counting on you!
                </p>
              </>
            )}
            <div className="flex gap-4 justify-center flex-wrap">
              <Button variant="outline" size="lg" onClick={onBackToLevels}>
                ← Back to Mazes
              </Button>
              <Button variant="default" size="lg" onClick={handleRestart}>
                Try Again
              </Button>
            </div>
            
            {/* Sound toggle */}
            <button
              onClick={handleToggleMute}
              className="mt-4 text-muted-foreground hover:text-foreground transition-colors text-sm flex items-center gap-2 mx-auto"
            >
              {isMuted ? '🔇 Sound Off' : '🔊 Sound On'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // Show intro sequence if maze has intro dialogues
  if (isShowingIntro && maze.introDialogues && maze.introDialogues.length > 0) {
    return (
      <MazeIntroSequence
        maze={maze}
        introDialogues={maze.introDialogues}
        onComplete={handleIntroComplete}
        isMuted={isMuted}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* 3D Scene - deferred during preview to let timer tick first */}
      {sceneRenderReady && <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        collectedPowerUps={collectedPowerUps}
        keysPressed={keysPressed}
        joystickXRef={joystickXRef}
        joystickYRef={joystickYRef}
        mobileIsMovingRef={mobileIsMovingRef}
        mobileTouchActiveRef={mobileTouchActiveRef}
        cameraYawRef={cameraYawRef}
        speedBoostActive={speedBoostActive}
        onCellInteraction={handleCellInteraction}
        onCharacterClick={handleCharacterClick}
        isPaused={showMiniMap || isPreviewing || showMapOptions || mapCountdown !== null || activeDialogue !== null || postDialoguePause}
        isMuted={isMuted}
        onSceneReady={() => setSceneReady(true)}
        onRendererInfo={setRendererInfo}
        debugMode={debugMode}
        restartKey={restartKey}
        dialogueTarget={activeDialogue ? (() => {
          const pos = findSpeakerPositionForDialogue(activeDialogue);
          return {
            speakerX: pos?.x ?? playerStateRef.current.x, 
            speakerZ: pos?.y ?? playerStateRef.current.y 
          };
        })() : null}
        topDownCamera={topDownCamera}
        groundLevelCamera={groundLevelCamera}
        showCollisionDebug={showCollisionDebug}
        shadowsEnabled={shadowsEnabled}
        grassEnabled={grassEnabled}
        rocksEnabled={rocksEnabled}
        animationsEnabled={animationsEnabled}
        opacityFadeEnabled={opacityFadeEnabled}
        cornEnabled={cornEnabled}
        simpleGroundEnabled={simpleGroundEnabled}
        cornCullingEnabled={cornCullingEnabled}
        skyEnabled={skyEnabled}
        shaderFadeEnabled={shaderFadeEnabled}
        lowShadowRes={lowShadowRes}
        skeletonEnabled={skeletonEnabled}
        overlayGridEnabled={overlayGridEnabled}
        showPrunedSpurs={showPrunedSpurs}
        spurConfig={spurConfig}
        magnetismConfig={magnetismConfig}
        magnetismDebugRef={magnetismDebugRef}
        showMagnetTarget={showMagnetTarget}
        showMagnetVector={showMagnetVector}
        polylineConfig={polylineConfig}
        onDefaultSpurConfig={(config) => {
          // Always update the defaults
          setDefaultSpurConfig(config);
          
          // Reset spurConfig to match new defaults if:
          // 1. spurConfig was never set, OR
          // 2. The defaults changed significantly (scale changed)
          if (!spurConfig || 
              Math.abs(spurConfig.maxSpurLen - config.maxSpurLen) > 10) {
            setSpurConfig(config);
          }
        }}
        onMagnetismCacheReady={handleMagnetismCacheReady}
        railMode={controlMode === 'rail'}
        railPathRef={railPathRef}
        railPathIndexRef={railPathIndexRef}
        railFractionalIndexRef={railFractionalIndexRef}
        railTurnPhaseRef={railTurnPhaseRef}
        railTargetAngleRef={railTargetAngleRef}
        railTurnSpeed={railTurnSpeed}
        onRailMoveComplete={handleRailStop}
      />}

      {/* Preview overlay - shows on top while scene loads in background */}
      {isPreviewing && (
        <div className="absolute inset-0 z-10">
          <MazePreview
            maze={maze}
            timeLeft={previewTimeLeft}
            onPreviewEnd={() => setIsPreviewing(false)}
            onQuit={onQuit}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            selectedAnimal={animals.find(a => a.id === animalType)}
            isStoryMode={isStoryMode}
          />
        </div>
      )}

      {/* HUD - only show after preview ends */}
      {!isPreviewing && (
        <GameHUD
          animalType={animalType}
          timeLeft={timeLeft}
          mazeName={maze.name}
          abilityUsed={abilityUsed}
          onUseAbility={useAbility}
          onQuit={onQuit}
          onRestart={handleRestart}
          debugMode={debugMode}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          performanceInfo={rendererInfo}
          topDownCamera={topDownCamera}
          onToggleTopDownCamera={() => setTopDownCamera(prev => !prev)}
          groundLevelCamera={groundLevelCamera}
          onToggleGroundLevelCamera={() => setGroundLevelCamera(prev => !prev)}
          showCollisionDebug={showCollisionDebug}
          onToggleCollisionDebug={() => setShowCollisionDebug(prev => !prev)}
          autopushEnabled={autopushEnabled}
          onToggleAutopush={() => setAutopushEnabled(prev => !prev)}
          losFaderEnabled={losFaderEnabled}
          onToggleLOSFader={() => setLosFaderEnabled(prev => !prev)}
          verboseLogging={verboseLogging}
          onToggleVerboseLogging={() => setVerboseLogging(prev => !prev)}
          // Feature toggles
          shadowsEnabled={shadowsEnabled}
          onToggleShadows={() => setShadowsEnabled(prev => !prev)}
          grassEnabled={grassEnabled}
          onToggleGrass={() => setGrassEnabled(prev => !prev)}
          rocksEnabled={rocksEnabled}
          onToggleRocks={() => setRocksEnabled(prev => !prev)}
          animationsEnabled={animationsEnabled}
          onToggleAnimations={() => setAnimationsEnabled(prev => !prev)}
          opacityFadeEnabled={opacityFadeEnabled}
          onToggleOpacityFade={() => setOpacityFadeEnabled(prev => !prev)}
          cornEnabled={cornEnabled}
          onToggleCorn={() => setCornEnabled(prev => !prev)}
          simpleGroundEnabled={simpleGroundEnabled}
          onToggleSimpleGround={() => setSimpleGroundEnabled(prev => !prev)}
          cornCullingEnabled={cornCullingEnabled}
          onToggleCornCulling={() => setCornCullingEnabled(prev => !prev)}
          skyEnabled={skyEnabled}
          onToggleSky={() => setSkyEnabled(prev => !prev)}
          shaderFadeEnabled={shaderFadeEnabled}
          onToggleShaderFade={() => setShaderFadeEnabled(prev => !prev)}
          lowShadowRes={lowShadowRes}
          onToggleLowShadowRes={() => setLowShadowRes(prev => !prev)}
          sensitivityConfig={sensitivityConfig}
          onSensitivityChange={setSensitivityConfig}
          mobileControlsEnabled={mobileControlsEnabled}
          onToggleMobileControls={() => setMobileControlsEnabled(prev => !prev)}
          skeletonEnabled={skeletonEnabled}
          onToggleSkeleton={() => setSkeletonEnabled(prev => !prev)}
          overlayGridEnabled={overlayGridEnabled}
          onToggleOverlayGrid={() => setOverlayGridEnabled(prev => !prev)}
          showPrunedSpurs={showPrunedSpurs}
          onToggleShowPrunedSpurs={() => setShowPrunedSpurs(prev => !prev)}
          spurConfig={spurConfig ?? undefined}
          defaultSpurConfig={defaultSpurConfig ?? undefined}
          onSpurConfigChange={setSpurConfig}
          magnetismConfig={magnetismConfig}
          onMagnetismConfigChange={setMagnetismConfig}
          showMagnetTarget={showMagnetTarget}
          onToggleShowMagnetTarget={() => setShowMagnetTarget(prev => !prev)}
          showMagnetVector={showMagnetVector}
          onToggleShowMagnetVector={() => setShowMagnetVector(prev => !prev)}
          magnetismDebugRef={magnetismDebugRef}
          magnetismDebugFrozen={magnetismDebugFrozen}
          frozenMagnetismData={frozenMagnetismData}
          playerRotation={magnetismDebugFrozen ? frozenPlayerRotation : playerStateRef.current.rotation}
          onUnpauseMagnetism={() => {
            setMagnetismDebugFrozen(false);
            setFrozenMagnetismData(null);
          }}
          polylineConfig={polylineConfig}
          onPolylineConfigChange={setPolylineConfig}
          railTurnSpeed={railTurnSpeed}
          onRailTurnSpeedChange={setRailTurnSpeed}
          // Apple/Item system
          appleCount={appleCount}
          onAppleDrop={handleAppleDrop}
          friendshipProgress={friendshipProgress}
        />
      )}

      {/* Compass overlay - shows briefly when game starts */}
      {!isPreviewing && (
        <CompassOverlay 
          show={showCompass} 
          duration={5000}
          onHide={() => setShowCompass(false)}
          playerStateRef={playerStateRef}
        />
      )}

      {/* Item Panel is now rendered within GameHUD */}

      {/* Quest Log Overlay - only in story mode */}
      {!isPreviewing && isStoryMode && storyMaze && (
        <QuestLogOverlay
          quest={storyMaze.quest}
          completedObjectives={completedObjectives}
        />
      )}

      {/* Mobile/Rail Controls - only render after preview ends AND if enabled */}
      {!isPreviewing && mobileControlsEnabled && controlMode === 'joystick' && (
        <MobileControls
          playerStateRef={playerStateRef}
          joystickXRef={joystickXRef}
          joystickYRef={joystickYRef}
          isMovingRef={mobileIsMovingRef}
          mobileTouchActiveRef={mobileTouchActiveRef}
          debugMode={debugMode}
        />
      )}
      
      {/* Rail Controls - on-rail navigation mode */}
      {!isPreviewing && mobileControlsEnabled && controlMode === 'rail' && (
        <RailControls
          cache={magnetismCacheRef.current}
          playerX={playerStateForUI.x}
          playerZ={playerStateForUI.y}
          animalRotation={playerStateForUI.rotation}
          onDirectionSelect={handleRailDirectionSelect}
          onStop={handleRailStop}
          onTurnAround={handleRailTurnAround}
          isMoving={isRailMoving}
          enabled={controlMode === 'rail'}
        />
      )}
      
      {/* Control Mode Toggle - only shows in debug mode */}
      {debugMode && !isPreviewing && mobileControlsEnabled && (
        <button
          onClick={() => {
            setControlMode(prev => {
              const newMode = prev === 'joystick' ? 'rail' : 'joystick';
              // Sync UI state when switching to rail mode
              if (newMode === 'rail') {
                setPlayerStateForUI({ ...playerStateRef.current });
              }
              return newMode;
            });
          }}
          className="fixed top-20 right-4 z-40 bg-card/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg font-display text-base transition-all hover:bg-primary hover:text-primary-foreground border border-border"
        >
          {controlMode === 'joystick' ? '🎮 Joystick' : '🛤️ Rail'}
        </button>
      )}

      {/* Map Button - always visible with freeMapAccess, otherwise only near stations */}
      {mapStationAvailable && !showMiniMap && !showMapOptions && mapCountdown === null && !activeDialogue && (
        <button
          onClick={handleMapStationClick}
          className={cn(
            "fixed right-4 top-1/2 -translate-y-1/2 z-40 bg-primary text-primary-foreground px-4 py-3 rounded-l-xl shadow-lg transition-colors font-display font-semibold flex items-center gap-2",
            !maze.freeMapAccess && "animate-pulse hover:animate-none",
            "hover:bg-primary/90"
          )}
        >
          <span className="text-xl">🗺️</span>
          <span className="hidden sm:inline">{maze.freeMapAccess ? 'Map' : 'View Map'}</span>
        </button>
      )}

      {/* Map Options Modal */}
      {showMapOptions && (
        <div className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card rounded-2xl p-6 shadow-warm-lg max-w-sm w-full">
            <div className="text-center mb-6">
              <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                🗺️ Map Station
              </h3>
              <p className="text-muted-foreground">
                Choose how to unlock the map
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleStartCountdown}
                className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-xl font-display font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <span>⏱️</span>
                <span>10s Countdown</span>
              </button>
              <button
                onClick={handleStartCountdown}
                className="w-full bg-secondary text-secondary-foreground py-3 px-4 rounded-xl font-display font-semibold hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2"
              >
                <span>📺</span>
                <span>Watch 10s Ad</span>
              </button>
              <button
                onClick={() => setShowMapOptions(false)}
                className="w-full text-muted-foreground py-2 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Countdown Overlay */}
      {mapCountdown !== null && (
        <div className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card rounded-2xl p-8 shadow-warm-lg text-center">
            <p className="text-muted-foreground mb-2">Map unlocking in...</p>
            <div className="text-7xl font-display font-bold text-primary animate-pulse">
              {mapCountdown}
            </div>
          </div>
        </div>
      )}

      {/* Dialogue Overlay - supports multi-message dialogues via messages array */}
      {activeDialogue && !isPreviewing && !gameOver && (() => {
        // Determine current speaker/message based on dialogueMessageIndex
        const isFirstMessage = dialogueMessageIndex === 0;
        const currentMessage = isFirstMessage 
          ? { speaker: activeDialogue.speaker, speakerEmoji: activeDialogue.speakerEmoji, message: activeDialogue.message }
          : activeDialogue.messages?.[dialogueMessageIndex - 1] || { speaker: activeDialogue.speaker, speakerEmoji: activeDialogue.speakerEmoji, message: activeDialogue.message };
        
        return (
          <div className="fixed inset-0 z-30 flex items-end justify-center p-2 sm:p-4 pointer-events-none animate-fade-in">
            <div className="bg-card/80 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-warm-lg max-w-lg w-full mb-4 sm:mb-8 pointer-events-auto">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="text-3xl sm:text-4xl flex-shrink-0">
                  {currentMessage.speakerEmoji}
                </div>
                <div className="flex-1">
                  <h4 className="font-display font-bold text-foreground text-sm sm:text-base mb-1 sm:mb-2">
                    {currentMessage.speaker}
                  </h4>
                  <p className="text-foreground/90 text-sm sm:text-lg leading-relaxed">
                    {currentMessage.message}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleDialogueContinue}
                className="mt-3 sm:mt-4 w-full py-2 sm:py-3"
              >
                Continue
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Apple Dialogue Overlay - for feeding animals */}
      {activeAppleDialogue && !isPreviewing && !gameOver && (() => {
        const currentMessage = activeAppleDialogue.messages[activeAppleDialogue.currentIndex];
        if (!currentMessage) return null;
        
        return (
          <div className="fixed inset-0 z-30 flex items-end justify-center p-2 sm:p-4 pointer-events-none animate-fade-in">
            <div className="bg-card/80 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-warm-lg max-w-lg w-full mb-4 sm:mb-8 pointer-events-auto border-2 border-primary/30">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="text-3xl sm:text-4xl flex-shrink-0">
                  {currentMessage.speakerEmoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 sm:mb-2">
                    <h4 className="font-display font-bold text-foreground text-sm sm:text-base">
                      {currentMessage.speaker}
                    </h4>
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">🍎 +1 Friend</span>
                  </div>
                  <p className="text-foreground/90 text-sm sm:text-lg leading-relaxed">
                    {currentMessage.message}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  // Check if there are more messages
                  if (activeAppleDialogue.currentIndex < activeAppleDialogue.messages.length - 1) {
                    setActiveAppleDialogue({
                      ...activeAppleDialogue,
                      currentIndex: activeAppleDialogue.currentIndex + 1,
                    });
                  } else {
                    // All messages shown, complete the dialogue and enter post-dialogue pause
                    setActiveAppleDialogue(null);
                    setPostDialoguePause(true);
                    onAppleDialogueComplete?.();
                  }
                }}
                className="mt-3 sm:mt-4 w-full py-2 sm:py-3"
              >
                Continue
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Post-Dialogue Resume Overlay */}
      {postDialoguePause && !gameOver && (
        <div className="fixed inset-0 z-30 flex items-end justify-center p-2 sm:p-4 pointer-events-none animate-fade-in">
          <div className="mb-4 sm:mb-8 pointer-events-auto">
            <Button
              onClick={() => setPostDialoguePause(false)}
              size="lg"
              className="px-8 py-4 text-lg gap-2 shadow-warm-lg"
            >
              Continue
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      )}

      {/* Mini Map Overlay */}
      <MiniMap
        maze={maze}
        playerPos={{ x: Math.floor(playerStateRef.current.x), y: Math.floor(playerStateRef.current.y) }}
        isVisible={showMiniMap}
        onClose={() => {
          setShowMiniMap(false);
          setMapStationAvailable(false);
          setMapViewTimeLeft(null);
        }}
        timeLeft={mapViewTimeLeft}
        selectedAnimal={animals.find(a => a.id === animalType)}
      />
    </div>
  );
};
