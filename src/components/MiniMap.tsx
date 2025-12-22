import { Maze } from '@/types/game';
import { cn } from '@/lib/utils';

interface MiniMapProps {
  maze: Maze;
  playerPos: { x: number; y: number };
  isVisible: boolean;
  onClose: () => void;
  timeLeft?: number | null;
}

export const MiniMap = ({ maze, playerPos, isVisible, onClose, timeLeft }: MiniMapProps) => {
  if (!isVisible) return null;

  const cellSize = Math.min(20, Math.floor(280 / maze.grid[0].length));

  return (
    <div className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl p-6 shadow-warm-lg max-w-md">
        <div className="text-center mb-4">
          <h3 className="font-display text-xl font-bold text-foreground">
            📍 Map Station
          </h3>
          <p className="text-sm text-muted-foreground">
            {timeLeft !== null && timeLeft !== undefined 
              ? `Study it quickly! ${timeLeft}s remaining`
              : 'You found a map! Study it quickly!'
            }
          </p>
        </div>

        <div
          className="bg-sage/20 rounded-xl p-3 mx-auto"
          style={{
            width: maze.grid[0].length * cellSize + 24,
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
                    'relative',
                    cell.isWall ? 'bg-earth' : 'bg-wheat/50',
                    cell.isEnd && 'bg-sage/70'
                  )}
                  style={{ width: cellSize, height: cellSize }}
                >
                  {playerPos.x === x && playerPos.y === y && (
                    <span
                      className="absolute inset-0 flex items-center justify-center animate-pulse"
                      style={{ fontSize: cellSize * 0.7 }}
                    >
                      📍
                    </span>
                  )}
                  {cell.isEnd && playerPos.x !== x && playerPos.y !== y && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ fontSize: cellSize * 0.6 }}
                    >
                      🏁
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full bg-primary text-primary-foreground py-2 rounded-full font-display font-semibold hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
