import { useState, useEffect, useCallback, useRef } from 'react';
import { Maze, AnimalType, MedalType, DialogueTrigger } from '@/types/game';
import { Maze3DCanvas, PerformanceInfo } from './Maze3DScene';
import { MazePreview } from './MazePreview';
import { MiniMap } from './MiniMap';
import { GameHUD } from './GameHUD';
import { MobileControls } from './MobileControls';
import { MazeIntroSequence } from './MazeIntroSequence';
import { Button } from '@/components/ui/button';
import { Confetti } from '@/components/Confetti';
import { animals } from '@/data/animals';
import { formatTime } from '@/lib/utils';

// Import pure game logic (Unity-portable)
import {
  GameConfig,
  findStartPosition,
  findStartRotation,
  PlayerState,
  MovementInput,
  calculateMovement,
  checkCellInteraction,
  executeAbility,
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
  // Corn optimization settings
  const [shadowOptEnabled, setShadowOptEnabled] = useState(true);
  const [distanceCullEnabled, setDistanceCullEnabled] = useState(true);
  const [dynamicFogEnabled, setDynamicFogEnabled] = useState(true);
  const [edgeCornCullEnabled, setEdgeCornCullEnabled] = useState(true); // Enabled for performance
  const [lowPixelRatio, setLowPixelRatio] = useState(false);
  // Debug toggles
  const [topDownCamera, setTopDownCamera] = useState(false);
  const [groundLevelCamera, setGroundLevelCamera] = useState(false);
  const [showCollisionDebug, setShowCollisionDebug] = useState(debugMode);
  const [rendererInfo, setRendererInfo] = useState<PerformanceInfo>({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, frameTime: 0 });
  const isMovingRef = useRef(false);
  // Mobile controls - absolute target heading system
  const mobileTargetYawRef = useRef<number>(startRotation); // Always a number, initialized to start
  const mobileIsMovingRef = useRef(false);
  const mobileThrottleRef = useRef(0); // Throttle: -1 (reverse) to 1 (forward)
  const mobileTouchActiveRef = useRef(false); // Whether touch is currently active
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  
  // Dialogue state
  const [activeDialogue, setActiveDialogue] = useState<DialogueTrigger | null>(null);
  const [triggeredDialogues, setTriggeredDialogues] = useState<Set<string>>(new Set());
  const [dialogueMessageIndex, setDialogueMessageIndex] = useState(0); // For multi-message dialogues
  
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

  // Track pressed keys for smooth movement
  const keysPressed = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number>();

  // Preview countdown
  useEffect(() => {
    if (!isPreviewing) return;

    const timer = setInterval(() => {
      setPreviewTimeLeft((prev) => {
        if (prev <= 1) {
          setIsPreviewing(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPreviewing]);

  // Game timer (paused during dialogue) - precise timing with 100ms updates
  const dialoguePauseStartRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (isPreviewing || gameOver) return;
    
    // Track when dialogue starts to pause timer
    if (activeDialogue && dialoguePauseStartRef.current === null) {
      dialoguePauseStartRef.current = Date.now();
    }
    
    // When dialogue ends, add the paused duration
    if (!activeDialogue && dialoguePauseStartRef.current !== null) {
      pausedTimeRef.current += Date.now() - dialoguePauseStartRef.current;
      dialoguePauseStartRef.current = null;
    }
    
    if (activeDialogue) return; // Don't run timer during dialogue
    
    // Initialize start time on first run
    if (gameStartTimeRef.current === null) {
      gameStartTimeRef.current = Date.now();
    }

    // In debug mode, don't count down time
    if (debugMode) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - gameStartTimeRef.current! - pausedTimeRef.current) / 1000;
      const remaining = maze.timeLimit - elapsed;
      
      if (remaining <= 0) {
        setGameOver(true);
        setTimeLeft(0);
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 100); // Update every 100ms for precision

    return () => clearInterval(timer);
  }, [isPreviewing, gameOver, activeDialogue, maze.timeLimit, debugMode]);

  // Check if all required dialogues for a given dialogue are completed
  const areRequirementsMet = useCallback((dialogue: DialogueTrigger): boolean => {
    if (!dialogue.requires || dialogue.requires.length === 0) return true;
    return dialogue.requires.every(reqId => triggeredDialogues.has(reqId));
  }, [triggeredDialogues]);

  // Check if a dialogue can be triggered at the given cell
  const checkDialogueAtCell = useCallback((gridX: number, gridY: number, currentTriggered: Set<string>): DialogueTrigger | null => {
    if (!maze.dialogues) return null;
    
    for (const dialogue of maze.dialogues) {
      if (currentTriggered.has(dialogue.id)) continue;
      
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

      if (result.collectPowerUp && result.powerUpKey) {
        setCollectedPowerUps((prev) => new Set([...prev, result.powerUpKey!]));
        setSpeedBoostActive(true);
        setTimeout(() => setSpeedBoostActive(false), GameConfig.SPEED_BOOST_DURATION * 1000);
      }

      // Station triggering is now handled by proximity check, not cell interaction
      
      // Check for any dialogue at this cell (pass current triggered set for fresh check)
      const dialogue = checkDialogueAtCell(gridX, gridY, triggeredDialogues);
      
      if (dialogue) {
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
    [maze, collectedPowerUps, timeLeft, onComplete, checkDialogueAtCell, canEndLevel]
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
    
    // No more chained dialogues - close dialogue
    setActiveDialogue(null);
    setDialogueMessageIndex(0);
    
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
  }, [activeDialogue, dialogueMessageIndex, maze.grid, maze.timeLimit, timeLeft, onComplete, findNextChainedDialogue, canEndLevel]);

  // Movement is now handled in Maze3DScene's useFrame for sync with rendering

  // Clear keys when focus changes or preview state changes
  useEffect(() => {
    keysPressed.current.clear();
  }, [isPreviewing, showMiniMap]);

  // Map countdown timer (before viewing map)
  useEffect(() => {
    if (mapCountdown === null || mapCountdown <= 0) return;
    
    const timer = setInterval(() => {
      setMapCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Start showing the map for 10 seconds
          setShowMiniMap(true);
          setMapViewTimeLeft(10);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mapCountdown]);

  // Map view timer (auto-close after 10 seconds)
  useEffect(() => {
    if (mapViewTimeLeft === null || mapViewTimeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setMapViewTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setShowMiniMap(false);
          setMapStationAvailable(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
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
    
    // Check every 100ms for smooth response
    const interval = setInterval(checkProximity, 100);
    checkProximity(); // Initial check
    
    return () => clearInterval(interval);
  }, [isPreviewing, gameOver, showMiniMap, showMapOptions, mapCountdown]);

  // Dialogue is now checked via cell-based logic in handleCellInteraction, not proximity

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
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
  }, []);

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
    setTriggeredDialogues(new Set());
    
    // Reset timing refs
    gameStartTimeRef.current = null;
    pausedTimeRef.current = 0;
    dialoguePauseStartRef.current = null;
    
    // Record the restart attempt in persistent storage
    onRestartProp?.();
    
    // Increment restart key to force camera reset
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

  // Show preview overlay on top of the 3D scene (which renders in background)
  const showPreviewOverlay = isPreviewing && sceneReady;

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
        onComplete={() => setIsShowingIntro(false)}
        isMuted={isMuted}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* 3D Scene - always renders, movement paused during preview */}
      <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        collectedPowerUps={collectedPowerUps}
        keysPressed={keysPressed}
        mobileTargetYawRef={mobileTargetYawRef}
        mobileIsMovingRef={mobileIsMovingRef}
        mobileThrottleRef={mobileThrottleRef}
        mobileTouchActiveRef={mobileTouchActiveRef}
        speedBoostActive={speedBoostActive}
        onCellInteraction={handleCellInteraction}
        isPaused={showMiniMap || isPreviewing || showMapOptions || mapCountdown !== null || activeDialogue !== null}
        isMuted={isMuted}
        onSceneReady={() => setSceneReady(true)}
        lowPixelRatio={lowPixelRatio}
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
        cornOptimizationSettings={{
          shadowRadius: 8,
          cullDistance: 18,
          lodDistance: 6,
          farMaterialDistance: 5,
          enableShadowOptimization: shadowOptEnabled,
          enableDistanceCulling: distanceCullEnabled,
          enableLOD: true,
          enableFarMaterialOptimization: true,
          enableDynamicFog: dynamicFogEnabled,
          enableEdgeCornCulling: edgeCornCullEnabled,
        }}
        topDownCamera={topDownCamera}
        groundLevelCamera={groundLevelCamera}
        showCollisionDebug={showCollisionDebug}
      />

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
          shadowOptEnabled={shadowOptEnabled}
          distanceCullEnabled={distanceCullEnabled}
          onToggleShadowOpt={() => setShadowOptEnabled(prev => !prev)}
          onToggleDistanceCull={() => setDistanceCullEnabled(prev => !prev)}
          dynamicFogEnabled={dynamicFogEnabled}
          onToggleDynamicFog={() => setDynamicFogEnabled(prev => !prev)}
          edgeCornCullEnabled={edgeCornCullEnabled}
          onToggleEdgeCornCull={() => setEdgeCornCullEnabled(prev => !prev)}
          lowPixelRatio={lowPixelRatio}
          onTogglePixelRatio={() => setLowPixelRatio(prev => !prev)}
          performanceInfo={rendererInfo}
          topDownCamera={topDownCamera}
          onToggleTopDownCamera={() => setTopDownCamera(prev => !prev)}
          groundLevelCamera={groundLevelCamera}
          onToggleGroundLevelCamera={() => setGroundLevelCamera(prev => !prev)}
          showCollisionDebug={showCollisionDebug}
          onToggleCollisionDebug={() => setShowCollisionDebug(prev => !prev)}
        />
      )}

      {/* Mobile Controls */}
      <MobileControls 
        playerStateRef={playerStateRef}
        targetYawRef={mobileTargetYawRef}
        isMovingRef={mobileIsMovingRef}
        throttleRef={mobileThrottleRef}
        mobileTouchActiveRef={mobileTouchActiveRef}
        debugMode={debugMode}
      />

      {/* Map Station Button - appears when station is available but not viewing or in dialogue */}
      {mapStationAvailable && !showMiniMap && !showMapOptions && mapCountdown === null && !activeDialogue && (
        <button
          onClick={handleMapStationClick}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-40 bg-primary text-primary-foreground px-4 py-3 rounded-l-xl shadow-lg animate-pulse hover:animate-none hover:bg-primary/90 transition-colors font-display font-semibold flex items-center gap-2"
        >
          <span className="text-xl">🗺️</span>
          <span className="hidden sm:inline">View Map</span>
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
      {activeDialogue && (() => {
        // Determine current speaker/message based on dialogueMessageIndex
        const isFirstMessage = dialogueMessageIndex === 0;
        const currentMessage = isFirstMessage 
          ? { speaker: activeDialogue.speaker, speakerEmoji: activeDialogue.speakerEmoji, message: activeDialogue.message }
          : activeDialogue.messages?.[dialogueMessageIndex - 1] || { speaker: activeDialogue.speaker, speakerEmoji: activeDialogue.speakerEmoji, message: activeDialogue.message };
        
        return (
          <div className="fixed inset-0 z-30 flex items-end justify-center p-2 sm:p-4 pointer-events-none animate-fade-in">
            <div className="bg-card/95 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-warm-lg max-w-lg w-full mb-4 sm:mb-8 pointer-events-auto">
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
      />
    </div>
  );
};
