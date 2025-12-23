import { Maze, MazeCell } from '@/types/game';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';

interface MazePreviewProps {
  maze: Maze;
  timeLeft: number;
  onPreviewEnd: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const MazePreview = ({ 
  maze, 
  timeLeft, 
  onPreviewEnd,
  isMuted = false,
  onToggleMute 
}: MazePreviewProps) => {
  const cellSize = Math.min(28, Math.floor(400 / maze.grid[0].length));

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4">
      {/* Mute toggle in top right */}
      {onToggleMute && (
        <button
          onClick={onToggleMute}
          className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg font-display text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          <span>{isMuted ? 'Muted' : 'Sound'}</span>
        </button>
      )}

      <div className="text-center mb-6 animate-fade-in">
        <h2 className="font-display text-3xl font-bold text-foreground mb-2">
          Memorize the Path! 🧠
        </h2>
        <p className="text-muted-foreground">
          Study the maze carefully - you'll need to navigate it in 3D!
        </p>
      </div>

      {/* Timer */}
      <div className="mb-4">
        <div className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-display font-bold text-xl animate-pulse">
          Starting in {timeLeft}s
        </div>
      </div>

      {/* Maze Preview */}
      <div
        className="bg-sage/30 rounded-2xl p-4 shadow-warm-lg animate-fade-in"
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
                  'relative border-[0.5px] border-sage/20',
                  cell.isWall ? 'bg-earth' : 'bg-wheat/60',
                  cell.isEnd && 'bg-sage/70'
                )}
                style={{ width: cellSize, height: cellSize }}
              >
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
                  <span className="absolute inset-0 flex items-center justify-center text-xs">
                    ⚡
                  </span>
                )}
                {cell.isStation && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs">
                    📍
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p>🚩 = Start | 🏁 = Exit | ⚡ = Power-up | 📍 = Map Station</p>
      </div>
    </div>
  );
};
