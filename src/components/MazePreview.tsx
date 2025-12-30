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
  // Calculate cell size based on available space - responsive to viewport
  const gridWidth = maze.grid[0].length;
  const gridHeight = maze.grid.length;
  
  // Use vh/vw to determine max size, accounting for padding and other UI elements
  const maxCellFromWidth = Math.floor((window.innerWidth - 64) / gridWidth);
  const maxCellFromHeight = Math.floor((window.innerHeight - 220) / gridHeight);
  const cellSize = Math.min(28, maxCellFromWidth, maxCellFromHeight);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-2 sm:p-4 overflow-auto">
      {/* Mute toggle in top right */}
      {onToggleMute && (
        <button
          onClick={onToggleMute}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 sm:gap-2"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound'}</span>
        </button>
      )}

      {/* Header - compact in landscape */}
      <div className="text-center mb-2 sm:mb-6 animate-fade-in">
        <h2 className="font-display text-xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
          Memorize the Path! 🧠
        </h2>
        <p className="text-xs sm:text-base text-muted-foreground hidden portrait:block sm:block">
          Study the maze carefully - you'll need to navigate it in 3D!
        </p>
      </div>

      {/* Timer */}
      <div className="mb-2 sm:mb-4">
        <div className="bg-primary text-primary-foreground px-4 py-1.5 sm:px-6 sm:py-2 rounded-full font-display font-bold text-base sm:text-xl animate-pulse">
          Starting in {timeLeft}s
        </div>
      </div>

      {/* Maze Preview */}
      <div
        className="bg-sage/30 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-warm-lg animate-fade-in flex-shrink-0"
        style={{
          width: gridWidth * cellSize + 16,
          height: gridHeight * cellSize + 16,
        }}
      >
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `repeat(${gridWidth}, ${cellSize}px)`,
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
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs">
                    🚩
                  </span>
                )}
                {cell.isEnd && (
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs">
                    🏁
                  </span>
                )}
                {cell.isPowerUp && (
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs">
                    ⚡
                  </span>
                )}
                {cell.isStation && (
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs">
                    📍
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-2 sm:mt-6 text-center text-[10px] sm:text-sm text-muted-foreground">
        <p>🚩 Start | 🏁 Exit | ⚡ Power-up | 📍 Map</p>
      </div>
    </div>
  );
};
