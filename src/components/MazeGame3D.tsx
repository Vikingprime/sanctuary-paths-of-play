import { useState, useEffect, useCallback, useRef } from 'react';
import { Maze, AnimalType } from '@/types/game';
import { Maze3DCanvas, PerformanceInfo } from './Maze3DScene';
import { MazePreview } from './MazePreview';
import { MiniMap } from './MiniMap';
import { GameHUD } from './GameHUD';
import { MobileControls } from './MobileControls';
import { Button } from '@/components/ui/button';
import { animals } from '@/data/animals';

// Import pure game logic (Unity-portable)
import {
  GameConfig,
  findStartPosition,
  findStartRotation,
  PlayerState,
  MovementInput,
  calculateMovement,
  checkCellInteraction,
  calculateScore,
  executeAbility,
} from '@/game';

interface MazeGame3DProps {
  maze: Maze;
  animalType: AnimalType;
  debugMode?: boolean;
  onComplete: (score: number, timeUsed: number) => void;
  onQuit: () => void;
}

export const MazeGame3D = ({
  maze,
  animalType,
  debugMode = false,
  onComplete,
  onQuit,
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
  const [previewTimeLeft, setPreviewTimeLeft] = useState(debugMode ? 0 : maze.previewTime);
  const [isPreviewing, setIsPreviewing] = useState(!debugMode);
  const [sceneReady, setSceneReady] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [collectedPowerUps, setCollectedPowerUps] = useState<Set<string>>(new Set());
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  // Corn optimization settings
  const [shadowOptEnabled, setShadowOptEnabled] = useState(true);
  const [distanceCullEnabled, setDistanceCullEnabled] = useState(true);
  const [dynamicFogEnabled, setDynamicFogEnabled] = useState(true);
  const [edgeCornCullEnabled, setEdgeCornCullEnabled] = useState(true); // Enabled for performance
  const [lowPixelRatio, setLowPixelRatio] = useState(false);
  const [rendererInfo, setRendererInfo] = useState<PerformanceInfo>({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, frameTime: 0 });
  const isMovingRef = useRef(false);
  const rotationIntensityRef = useRef(0);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  // Background music
  useEffect(() => {
    const music = new Audio('/sounds/background-music.mp3');
    music.loop = true;
    music.volume = 0.1; // Very quiet
    bgMusicRef.current = music;
    music.play().catch(() => {}); // Ignore autoplay errors
    
    return () => {
      music.pause();
      music.src = '';
    };
  }, []);

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

  // Game timer
  useEffect(() => {
    if (isPreviewing || gameOver) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setGameOver(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPreviewing, gameOver]);

  // Handle cell interactions (React-specific wrapper around pure logic)
  const handleCellInteraction = useCallback(
    (x: number, y: number) => {
      const result = checkCellInteraction(maze, x, y, collectedPowerUps);

      if (result.collectPowerUp && result.powerUpKey) {
        setCollectedPowerUps((prev) => new Set([...prev, result.powerUpKey!]));
        setSpeedBoostActive(true);
        setTimeout(() => setSpeedBoostActive(false), GameConfig.SPEED_BOOST_DURATION * 1000);
      }

      if (result.triggerStation) {
        setShowMiniMap(true);
      }

      if (result.reachedEnd) {
        setHasWon(true);
        setGameOver(true);
        const score = calculateScore(timeLeft);
        const timeUsed = maze.timeLimit - timeLeft;
        onComplete(score, timeUsed);
      }
    },
    [maze, collectedPowerUps, timeLeft, onComplete]
  );

  // Movement is now handled in Maze3DScene's useFrame for sync with rendering

  // Clear keys when focus changes or preview state changes
  useEffect(() => {
    keysPressed.current.clear();
  }, [isPreviewing, showMiniMap]);

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

  // Mobile controls - add/remove keys directly for continuous movement
  const handleMobileStart = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    const keyMap = {
      forward: 'arrowup',
      back: 'arrowdown',
      left: 'arrowleft',
      right: 'arrowright',
    };
    keysPressed.current.add(keyMap[direction]);
  }, []);

  const handleMobileEnd = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    const keyMap = {
      forward: 'arrowup',
      back: 'arrowdown',
      left: 'arrowleft',
      right: 'arrowright',
    };
    keysPressed.current.delete(keyMap[direction]);
  }, []);

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
        setShowMiniMap(true);
      }
    }
  };

  const animal = animals.find((a) => a.id === animalType)!;

  // Show preview overlay on top of the 3D scene (which renders in background)
  const showPreviewOverlay = isPreviewing && sceneReady;

  // Game over screen
  if (gameOver) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="text-8xl">{hasWon ? '🎉' : '😢'}</div>
          <h2 className="font-display text-4xl font-bold text-foreground">
            {hasWon ? 'You Made It!' : "Time's Up!"}
          </h2>
          {hasWon && (
            <div className="space-y-2">
              <p className="text-xl text-muted-foreground">
                Score: <span className="font-bold text-primary">{calculateScore(timeLeft)}</span> points
              </p>
              <p className="text-muted-foreground">
                {animal.emoji} {animal.name} is proud of you!
              </p>
            </div>
          )}
          {!hasWon && (
            <p className="text-muted-foreground">
              Don't give up! The sanctuary animals are counting on you!
            </p>
          )}
          <div className="flex gap-4 justify-center">
            <Button variant="outline" size="lg" onClick={onQuit}>
              Back to Home
            </Button>
            <Button variant="default" size="lg" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* 3D Scene - always renders, movement paused during preview */}
      <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        collectedPowerUps={collectedPowerUps}
        keysPressed={keysPressed}
        rotationIntensityRef={rotationIntensityRef}
        speedBoostActive={speedBoostActive}
        onCellInteraction={handleCellInteraction}
        isPaused={showMiniMap || isPreviewing}
        onSceneReady={() => setSceneReady(true)}
        lowPixelRatio={lowPixelRatio}
        onRendererInfo={setRendererInfo}
        debugMode={debugMode}
        cornOptimizationSettings={{
          shadowRadius: 8,
          cullDistance: 20,
          lodDistance: 8,
          farMaterialDistance: 5,
          enableShadowOptimization: shadowOptEnabled,
          enableDistanceCulling: distanceCullEnabled,
          enableLOD: true,
          enableFarMaterialOptimization: true,
          enableDynamicFog: dynamicFogEnabled,
          enableEdgeCornCulling: edgeCornCullEnabled,
        }}
      />

      {/* Preview overlay - shows on top while scene loads in background */}
      {isPreviewing && (
        <div className="absolute inset-0 z-10">
          <MazePreview
            maze={maze}
            timeLeft={previewTimeLeft}
            onPreviewEnd={() => setIsPreviewing(false)}
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
          debugMode={debugMode}
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
        />
      )}

      {/* Mobile Controls */}
      <MobileControls onMoveStart={handleMobileStart} onMoveEnd={handleMobileEnd} rotationIntensityRef={rotationIntensityRef} />

      {/* Mini Map Overlay */}
      <MiniMap
        maze={maze}
        playerPos={{ x: Math.floor(playerStateRef.current.x), y: Math.floor(playerStateRef.current.y) }}
        isVisible={showMiniMap}
        onClose={() => setShowMiniMap(false)}
      />
    </div>
  );
};
