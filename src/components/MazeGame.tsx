import { useState, useEffect, useCallback } from 'react';
import { Maze, MazeCell, AnimalType } from '@/types/game';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { animals } from '@/data/animals';

interface MazeGameProps {
  maze: Maze;
  animalType: AnimalType;
  onComplete: (score: number) => void;
  onQuit: () => void;
}

export const MazeGame = ({ maze, animalType, onComplete, onQuit }: MazeGameProps) => {
  const animal = animals.find((a) => a.id === animalType)!;
  const startPos = findStart(maze.grid);

  const [playerPos, setPlayerPos] = useState(startPos);
  const [timeLeft, setTimeLeft] = useState(maze.timeLimit);
  const [isPreviewing, setIsPreviewing] = useState(true);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(maze.previewTime);
  const [showMaze, setShowMaze] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());

  // Find start position
  function findStart(grid: MazeCell[][]): { x: number; y: number } {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x].isStart) return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  // Preview timer
  useEffect(() => {
    if (!isPreviewing) return;

    const timer = setInterval(() => {
      setPreviewTimeLeft((prev) => {
        if (prev <= 1) {
          setIsPreviewing(false);
          setShowMaze(false);
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

  // Movement handler
  const move = useCallback(
    (dx: number, dy: number) => {
      if (isPreviewing || gameOver) return;

      const newX = playerPos.x + dx;
      const newY = playerPos.y + dy;

      // Check bounds
      if (newY < 0 || newY >= maze.grid.length) return;
      if (newX < 0 || newX >= maze.grid[0].length) return;

      const cell = maze.grid[newY][newX];

      // Check wall
      if (cell.isWall) return;

      setPlayerPos({ x: newX, y: newY });

      // Check for power-up
      if (cell.isPowerUp) {
        setTimeLeft((prev) => Math.min(prev + 10, maze.timeLimit + 20));
      }

      // Check for help station
      if (cell.isStation) {
        setShowMaze(true);
        setTimeout(() => setShowMaze(false), 2000);
      }

      // Check for end
      if (cell.isEnd) {
        setHasWon(true);
        setGameOver(true);
        const score = Math.round(timeLeft * 100);
        onComplete(score);
      }
    },
    [playerPos, isPreviewing, gameOver, maze, onComplete, timeLeft]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          move(0, -1);
          break;
        case 'ArrowDown':
        case 's':
          move(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
          move(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
          move(1, 0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  // Use ability
  const useAbility = () => {
    if (abilityUsed) return;
    setAbilityUsed(true);

    if (animalType === 'pig') {
      // Reveal power-ups
      const powerUpCells = new Set<string>();
      maze.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell.isPowerUp || cell.isStation) {
            powerUpCells.add(`${x},${y}`);
          }
        });
      });
      setRevealedCells(powerUpCells);
    } else if (animalType === 'cow') {
      // Show maze briefly
      setShowMaze(true);
      setTimeout(() => setShowMaze(false), 3000);
    } else if (animalType === 'bird') {
      // Find and fly over nearest wall
      const directions = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dx, dy] of directions) {
        const wallX = playerPos.x + dx;
        const wallY = playerPos.y + dy;
        const beyondX = playerPos.x + dx * 2;
        const beyondY = playerPos.y + dy * 2;

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
          break;
        }
      }
    }
  };

  const cellSize = Math.min(32, Math.floor(320 / maze.grid[0].length));

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-md">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{animal.emoji}</span>
          <div>
            <div className="font-display font-bold text-foreground">
              {maze.name}
            </div>
            <div className="text-xs text-muted-foreground capitalize">
              {maze.difficulty}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'px-4 py-2 rounded-full font-display font-bold text-lg',
            timeLeft <= 10
              ? 'bg-destructive text-destructive-foreground animate-pulse'
              : 'bg-sage text-cream'
          )}
        >
          {isPreviewing ? `👀 ${previewTimeLeft}s` : `⏱️ ${timeLeft}s`}
        </div>
      </div>

      {/* Instructions during preview */}
      {isPreviewing && (
        <div className="bg-accent/20 text-accent-foreground px-4 py-2 rounded-full text-sm font-medium animate-pulse">
          Memorize the path! Game starts in {previewTimeLeft}s...
        </div>
      )}

      {/* Maze */}
      <div
        className="relative bg-sage/30 rounded-2xl p-4 shadow-warm-lg"
        style={{
          width: maze.grid[0].length * cellSize + 32,
          height: maze.grid.length * cellSize + 32,
        }}
      >
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `repeat(${maze.grid[0].length}, ${cellSize}px)`,
          }}
        >
          {maze.grid.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className={cn(
                  'maze-cell relative',
                  cell.isWall && 'bg-earth',
                  !cell.isWall && 'bg-wheat/40',
                  cell.isEnd && 'bg-sage/50'
                )}
                style={{ width: cellSize, height: cellSize }}
              >
                {/* Show maze elements based on visibility */}
                {(showMaze || isPreviewing) && (
                  <>
                    {cell.isStart && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs">
                        🚩
                      </span>
                    )}
                    {cell.isEnd && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs">
                        🏁
                      </span>
                    )}
                    {cell.isPowerUp && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs animate-pulse">
                        ⚡
                      </span>
                    )}
                    {cell.isStation && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs">
                        📺
                      </span>
                    )}
                  </>
                )}

                {/* Always show revealed cells (from pig ability) */}
                {!showMaze &&
                  !isPreviewing &&
                  revealedCells.has(`${x},${y}`) && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs animate-pulse">
                      {cell.isPowerUp ? '⚡' : '📺'}
                    </span>
                  )}

                {/* Always show end */}
                {!showMaze && !isPreviewing && cell.isEnd && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs">
                    🏁
                  </span>
                )}

                {/* Player */}
                {playerPos.x === x && playerPos.y === y && (
                  <span
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-all duration-150',
                      !isPreviewing && 'animate-hop'
                    )}
                    style={{ fontSize: cellSize * 0.7 }}
                  >
                    {animal.emoji}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Controls */}
      {!isPreviewing && !gameOver && (
        <div className="flex flex-col items-center gap-4">
          {/* D-pad for mobile */}
          <div className="grid grid-cols-3 gap-1">
            <div />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => move(0, -1)}
              className="rounded-lg"
            >
              ↑
            </Button>
            <div />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => move(-1, 0)}
              className="rounded-lg"
            >
              ←
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => move(0, 1)}
              className="rounded-lg"
            >
              ↓
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => move(1, 0)}
              className="rounded-lg"
            >
              →
            </Button>
          </div>

          {/* Ability button */}
          <Button
            variant={abilityUsed ? 'ghost' : 'sunset'}
            onClick={useAbility}
            disabled={abilityUsed}
            className="gap-2"
          >
            <span>{animal.ability.icon}</span>
            {abilityUsed ? 'Ability Used' : animal.ability.name}
          </Button>
        </div>
      )}

      {/* Game Over */}
      {gameOver && (
        <div className="text-center space-y-4 animate-fade-in">
          <div className="text-6xl">{hasWon ? '🎉' : '😢'}</div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {hasWon ? 'Amazing!' : 'Time\'s Up!'}
          </h2>
          {hasWon && (
            <p className="text-muted-foreground">
              Score: {Math.round(timeLeft * 100)} points
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={onQuit}>
              Back to Home
            </Button>
            <Button variant="default" onClick={() => window.location.reload()}>
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
