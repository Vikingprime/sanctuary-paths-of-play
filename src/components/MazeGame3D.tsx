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
          return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  };

  const startPos = findStart();
  const [playerPos, setPlayerPos] = useState(startPos);
  const [playerRotation, setPlayerRotation] = useState(0); // Player facing direction
  const [cameraRotation, setCameraRotation] = useState(0); // Independent camera orbit
  const [timeLeft, setTimeLeft] = useState(maze.timeLimit);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(maze.previewTime);
  const [isPreviewing, setIsPreviewing] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [collectedPowerUps, setCollectedPowerUps] = useState<Set<string>>(new Set());

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

  // Check cell interactions
  const checkCell = useCallback(
    (x: number, y: number) => {
      const cell = maze.grid[y]?.[x];
      if (!cell) return;

      // Power-up collection
      if (cell.isPowerUp && !collectedPowerUps.has(`${x},${y}`)) {
        setCollectedPowerUps((prev) => new Set([...prev, `${x},${y}`]));
        setTimeLeft((prev) => Math.min(prev + 15, maze.timeLimit + 30));
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

  // Movement - now based on camera direction, not player rotation
  const move = useCallback(
    (direction: 'forward' | 'back' | 'left' | 'right') => {
      if (isPreviewing || gameOver || showMiniMap) return;

      let dx = 0;
      let dy = 0;

      // Calculate movement based on camera rotation (player moves relative to view)
      const forward = {
        x: Math.sin(cameraRotation),
        y: Math.cos(cameraRotation),
      };
      const right = {
        x: Math.cos(cameraRotation),
        y: -Math.sin(cameraRotation),
      };

      switch (direction) {
        case 'forward':
          dx = Math.round(forward.x);
          dy = Math.round(forward.y);
          break;
        case 'back':
          dx = -Math.round(forward.x);
          dy = -Math.round(forward.y);
          break;
        case 'left':
          dx = -Math.round(right.x);
          dy = -Math.round(right.y);
          break;
        case 'right':
          dx = Math.round(right.x);
          dy = Math.round(right.y);
          break;
      }

      const newX = playerPos.x + dx;
      const newY = playerPos.y + dy;

      // Check bounds
      if (newY < 0 || newY >= maze.grid.length) return;
      if (newX < 0 || newX >= maze.grid[0].length) return;

      // Check wall
      if (maze.grid[newY][newX].isWall) return;

      setPlayerPos({ x: newX, y: newY });
      checkCell(newX, newY);
    },
    [playerPos, cameraRotation, isPreviewing, gameOver, showMiniMap, maze, checkCell]
  );

  const rotateCamera = useCallback(
    (direction: 'left' | 'right') => {
      if (isPreviewing || gameOver || showMiniMap) return;
      const rotationSpeed = Math.PI / 6; // 30 degrees for smoother rotation
      setCameraRotation((prev) =>
        direction === 'left' ? prev - rotationSpeed : prev + rotationSpeed
      );
    },
    [isPreviewing, gameOver, showMiniMap]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPreviewing || gameOver) return;

      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          move('forward');
          break;
        case 'arrowdown':
        case 's':
          move('back');
          break;
        case 'arrowleft':
        case 'a':
          move('left');
          break;
        case 'arrowright':
        case 'd':
          move('right');
          break;
        case 'q':
          rotateCamera('left');
          break;
        case 'e':
          rotateCamera('right');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move, rotateCamera, isPreviewing, gameOver]);

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
      // Bird: fly over one wall forward (based on camera direction)
      const forward = {
        x: Math.round(Math.sin(cameraRotation)),
        y: Math.round(Math.cos(cameraRotation)),
      };
      
      const wallX = playerPos.x + forward.x;
      const wallY = playerPos.y + forward.y;
      const beyondX = playerPos.x + forward.x * 2;
      const beyondY = playerPos.y + forward.y * 2;

      // Check if there's a wall ahead and a path beyond
      if (
        wallY >= 0 &&
        wallY < maze.grid.length &&
        wallX >= 0 &&
        wallX < maze.grid[0].length &&
        maze.grid[wallY][wallX].isWall &&
        beyondY >= 0 &&
        beyondY < maze.grid.length &&
        beyondX >= 0 &&
        beyondX < maze.grid[0].length &&
        !maze.grid[beyondY][beyondX].isWall
      ) {
        setPlayerPos({ x: beyondX, y: beyondY });
        checkCell(beyondX, beyondY);
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

  return (
    <div className="fixed inset-0 bg-sky">
      {/* 3D Scene */}
      <Maze3DCanvas
        maze={maze}
        animalType={animalType}
        playerPos={playerPos}
        playerRotation={playerRotation}
        cameraRotation={cameraRotation}
        onCameraRotationChange={setCameraRotation}
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
      <MobileControls onMove={move} onRotate={rotateCamera} />

      {/* Mini Map Overlay */}
      <MiniMap
        maze={maze}
        playerPos={playerPos}
        isVisible={showMiniMap}
        onClose={() => setShowMiniMap(false)}
      />
    </div>
  );
};
