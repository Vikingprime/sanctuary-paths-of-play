import { useState, useEffect, useCallback, useRef } from 'react';
import { Maze, AnimalType } from '@/types/game';
import { Maze3DCanvas } from './Maze3DScene';
import { MazePreview } from './MazePreview';
import { MiniMap } from './MiniMap';
import { GameHUD } from './GameHUD';
import { MobileControls } from './MobileControls';
import { Button } from '@/components/ui/button';
import { animals } from '@/data/animals';

interface MazeGame3DProps {
  maze: Maze;
  animalType: AnimalType;
  onComplete: (score: number) => void;
  onQuit: () => void;
}

// Player state with continuous position and rotation
interface PlayerState {
  x: number;
  y: number;
  rotation: number; // radians, 0 = facing -Z (up)
}

export const MazeGame3D = ({
  maze,
  animalType,
  onComplete,
  onQuit,
}: MazeGame3DProps) => {
  // Find start position
  const findStart = () => {
    for (let y = 0; y < maze.grid.length; y++) {
      for (let x = 0; x < maze.grid[y].length; x++) {
        if (maze.grid[y][x].isStart) {
          return { x: x + 0.5, y: y + 0.5 }; // Center of cell
        }
      }
    }
    return { x: 1.5, y: 1.5 };
  };

  const startPos = findStart();
  const [playerState, setPlayerState] = useState<PlayerState>({
    x: startPos.x,
    y: startPos.y,
    rotation: 0,
  });
  const [timeLeft, setTimeLeft] = useState(maze.timeLimit);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(maze.previewTime);
  const [isPreviewing, setIsPreviewing] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [collectedPowerUps, setCollectedPowerUps] = useState<Set<string>>(new Set());
  const [speedBoost, setSpeedBoost] = useState(false);

  // Track pressed keys for smooth movement
  const keysPressed = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number>();

  // Movement settings
  const BASE_MOVE_SPEED = 2.5; // units per second
  const BOOSTED_MOVE_SPEED = 4.5; // boosted speed
  const MOVE_SPEED = speedBoost ? BOOSTED_MOVE_SPEED : BASE_MOVE_SPEED;
  const ROTATION_SPEED = 3.5; // radians per second
  const PLAYER_RADIUS = 0.25; // collision radius

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

  // Check if position collides with wall
  const checkCollision = useCallback(
    (x: number, y: number): boolean => {
      // Check the grid cell at this position
      const gridX = Math.floor(x);
      const gridY = Math.floor(y);

      // Check bounds
      if (gridY < 0 || gridY >= maze.grid.length) return true;
      if (gridX < 0 || gridX >= maze.grid[0].length) return true;

      // Check current cell
      if (maze.grid[gridY][gridX].isWall) return true;

      // Check nearby cells based on player radius
      const checkRadius = PLAYER_RADIUS + 0.1;
      const offsets = [
        [-checkRadius, 0],
        [checkRadius, 0],
        [0, -checkRadius],
        [0, checkRadius],
      ];

      for (const [dx, dy] of offsets) {
        const checkX = Math.floor(x + dx);
        const checkY = Math.floor(y + dy);
        if (
          checkY >= 0 &&
          checkY < maze.grid.length &&
          checkX >= 0 &&
          checkX < maze.grid[0].length &&
          maze.grid[checkY][checkX].isWall
        ) {
          return true;
        }
      }

      return false;
    },
    [maze]
  );

  // Check cell interactions
  const checkCell = useCallback(
    (x: number, y: number) => {
      const gridX = Math.floor(x);
      const gridY = Math.floor(y);
      const cell = maze.grid[gridY]?.[gridX];
      if (!cell) return;

      // Power-up collection - speed boost
      if (cell.isPowerUp && !collectedPowerUps.has(`${gridX},${gridY}`)) {
        setCollectedPowerUps((prev) => new Set([...prev, `${gridX},${gridY}`]));
        setSpeedBoost(true);
        // Speed boost lasts 5 seconds
        setTimeout(() => setSpeedBoost(false), 5000);
      }

      // Map station
      if (cell.isStation) {
        setShowMiniMap(true);
      }

      // Win condition
      if (cell.isEnd) {
        setHasWon(true);
        setGameOver(true);
        const score = Math.round(timeLeft * 100);
        onComplete(score);
      }
    },
    [maze, collectedPowerUps, timeLeft, onComplete]
  );

  // Game loop for smooth movement
  useEffect(() => {
    if (isPreviewing || gameOver || showMiniMap) return;

    let lastTime = performance.now();

    const gameLoop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      setPlayerState((prev) => {
        let newRotation = prev.rotation;
        let moveX = 0;
        let moveY = 0;

        // Rotation
        if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) {
          newRotation -= ROTATION_SPEED * deltaTime;
        }
        if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) {
          newRotation += ROTATION_SPEED * deltaTime;
        }

        // Forward/backward movement in facing direction
        if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) {
          moveX += Math.sin(newRotation) * MOVE_SPEED * deltaTime;
          moveY -= Math.cos(newRotation) * MOVE_SPEED * deltaTime;
        }
        if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) {
          moveX -= Math.sin(newRotation) * MOVE_SPEED * deltaTime;
          moveY += Math.cos(newRotation) * MOVE_SPEED * deltaTime;
        }

        // Try to move
        let newX = prev.x + moveX;
        let newY = prev.y + moveY;

        // Wall sliding: try X and Y separately if combined fails
        if (checkCollision(newX, newY)) {
          // Try just X
          if (!checkCollision(prev.x + moveX, prev.y)) {
            newX = prev.x + moveX;
            newY = prev.y;
          }
          // Try just Y
          else if (!checkCollision(prev.x, prev.y + moveY)) {
            newX = prev.x;
            newY = prev.y + moveY;
          }
          // Can't move
          else {
            newX = prev.x;
            newY = prev.y;
          }
        }

        // Check cell interactions at new position
        if (newX !== prev.x || newY !== prev.y) {
          checkCell(newX, newY);
        }

        return { x: newX, y: newY, rotation: newRotation };
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPreviewing, gameOver, showMiniMap, checkCollision, checkCell]);

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

  // Mobile controls - now for rotation and forward/back
  const handleMobileMove = useCallback((direction: 'forward' | 'back' | 'left' | 'right') => {
    // Simulate key press briefly for mobile
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

  // Use ability
  const useAbility = () => {
    if (abilityUsed || gameOver) return;
    setAbilityUsed(true);

    if (animalType === 'pig') {
      // Pig: reveal nearby power-ups for a few seconds (show minimap)
      setShowMiniMap(true);
    } else if (animalType === 'cow') {
      // Cow: show full map
      setShowMiniMap(true);
    } else if (animalType === 'bird') {
      // Bird: fly over one wall in the direction player is facing
      setPlayerState((prev) => {
        const forwardX = Math.sin(prev.rotation);
        const forwardY = -Math.cos(prev.rotation);
        
        // Check one unit ahead (wall) and two units ahead (landing)
        const wallX = Math.floor(prev.x + forwardX);
        const wallY = Math.floor(prev.y + forwardY);
        const beyondX = prev.x + forwardX * 2;
        const beyondY = prev.y + forwardY * 2;
        const beyondGridX = Math.floor(beyondX);
        const beyondGridY = Math.floor(beyondY);

        // Check if there's a wall ahead and a path beyond
        if (
          wallY >= 0 &&
          wallY < maze.grid.length &&
          wallX >= 0 &&
          wallX < maze.grid[0].length &&
          maze.grid[wallY][wallX].isWall &&
          beyondGridY >= 0 &&
          beyondGridY < maze.grid.length &&
          beyondGridX >= 0 &&
          beyondGridX < maze.grid[0].length &&
          !maze.grid[beyondGridY][beyondGridX].isWall
        ) {
          checkCell(beyondX, beyondY);
          return { ...prev, x: beyondX, y: beyondY };
        }
        return prev;
      });
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
                Score: <span className="font-bold text-primary">{Math.round(timeLeft * 100)}</span> points
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

  // Convert playerState to the format expected by child components
  const playerPos = { x: playerState.x - 0.5, y: playerState.y - 0.5 };

  return (
    <div className="fixed inset-0 bg-sky">
      {/* 3D Scene */}
      <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerPos={playerState}
        playerRotation={playerState.rotation}
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
        playerPos={{ x: Math.floor(playerState.x), y: Math.floor(playerState.y) }}
        isVisible={showMiniMap}
        onClose={() => setShowMiniMap(false)}
      />
    </div>
  );
};
