import { useState, useEffect, useCallback, useRef } from 'react';
import { Maze, AnimalType } from '@/types/game';
import { Maze3DCanvas } from './Maze3DScene';
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
  onComplete: (score: number, timeUsed: number) => void;
  onQuit: () => void;
}

export const MazeGame3D = ({
  maze,
  animalType,
  onComplete,
  onQuit,
}: MazeGame3DProps) => {
  // Initialize from pure game logic
  const startPos = findStartPosition(maze);
  
  // Use ref for real-time player state (avoids re-renders every frame)
  const playerStateRef = useRef<PlayerState>({
    x: startPos.x,
    y: startPos.y,
    rotation: 0,
  });
  
  // React state only for UI that needs re-renders
  const [playerStateForUI, setPlayerStateForUI] = useState<PlayerState>(playerStateRef.current);
  const [timeLeft, setTimeLeft] = useState(maze.timeLimit);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(maze.previewTime);
  const [isPreviewing, setIsPreviewing] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [collectedPowerUps, setCollectedPowerUps] = useState<Set<string>>(new Set());
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const isMovingRef = useRef(false);

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

  // Game loop - uses pure calculateMovement
  useEffect(() => {
    if (isPreviewing || gameOver || showMiniMap) return;

    let lastTime = performance.now();

    const gameLoop = (currentTime: number) => {
      // Clamp delta time to prevent jumps from frame drops (max ~30fps equivalent)
      const rawDelta = (currentTime - lastTime) / 1000;
      const deltaTime = Math.min(rawDelta, 0.033);
      lastTime = currentTime;

      // Build input from pressed keys
      const input: MovementInput = {
        forward: keysPressed.current.has('w') || keysPressed.current.has('arrowup'),
        backward: keysPressed.current.has('s') || keysPressed.current.has('arrowdown'),
        rotateLeft: keysPressed.current.has('a') || keysPressed.current.has('arrowleft'),
        rotateRight: keysPressed.current.has('d') || keysPressed.current.has('arrowright'),
      };
      
      // Update isMoving ref (no re-render)
      isMovingRef.current = input.forward || input.backward;

      // Use pure game logic for movement - update ref directly
      const prev = playerStateRef.current;
      const newState = calculateMovement(maze, prev, input, deltaTime, speedBoostActive);
      playerStateRef.current = newState;

      // Check interactions if position changed
      if (newState.x !== prev.x || newState.y !== prev.y) {
        handleCellInteraction(newState.x, newState.y);
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPreviewing, gameOver, showMiniMap, maze, speedBoostActive, handleCellInteraction]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mobile controls
  const handleMobileMove = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    const keyMap = {
      forward: 'w',
      back: 's',
      left: 'a',
      right: 'd',
    };
    const key = keyMap[direction];
    keysPressed.current.add(key);
    setTimeout(() => keysPressed.current.delete(key), 100);
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

  // Preview screen
  if (isPreviewing) {
    return (
      <MazePreview
        maze={maze}
        timeLeft={previewTimeLeft}
        onPreviewEnd={() => setIsPreviewing(false)}
      />
    );
  }

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
    <div className="fixed inset-0 bg-sky">
      {/* 3D Scene - pass ref for real-time updates */}
      <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        collectedPowerUps={collectedPowerUps}
      />

      {/* HUD */}
      <GameHUD
        animalType={animalType}
        timeLeft={timeLeft}
        mazeName={maze.name}
        abilityUsed={abilityUsed}
        onUseAbility={useAbility}
        onQuit={onQuit}
      />

      {/* Mobile Controls */}
      <MobileControls onMove={handleMobileMove} />

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
