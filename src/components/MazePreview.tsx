import { Maze, MazeCell, Animal } from '@/types/game';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

interface MazePreviewProps {
  maze: Maze;
  timeLeft: number;
  onPreviewEnd: () => void;
  onQuit?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  selectedAnimal?: Animal;
}

export const MazePreview = ({ 
  maze, 
  timeLeft, 
  onPreviewEnd,
  onQuit,
  isMuted = false,
  onToggleMute,
  selectedAnimal
}: MazePreviewProps) => {
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get animal emoji
  const animalEmoji = selectedAnimal?.emoji || '🐷';

  // Calculate cell size based on available space
  const gridWidth = maze.grid[0].length;
  const gridHeight = maze.grid.length;
  
  // In landscape, give more space to the maze (header is on left side)
  const availableWidth = isLandscape ? window.innerWidth * 0.6 - 32 : window.innerWidth - 64;
  const availableHeight = isLandscape ? window.innerHeight - 48 : window.innerHeight - 220;
  
  const maxCellFromWidth = Math.floor(availableWidth / gridWidth);
  const maxCellFromHeight = Math.floor(availableHeight / gridHeight);
  const cellSize = Math.min(28, maxCellFromWidth, maxCellFromHeight);

  // Calculate bounding box for start and end regions
  const { startBounds, endBounds } = useMemo(() => {
    const startCells: { x: number; y: number }[] = [];
    const endCells: { x: number; y: number }[] = [];
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isStart) startCells.push({ x, y });
        if (cell.isEnd) endCells.push({ x, y });
      });
    });
    
    const getBounds = (cells: { x: number; y: number }[]) => {
      if (cells.length === 0) return null;
      return {
        minX: Math.min(...cells.map(c => c.x)),
        maxX: Math.max(...cells.map(c => c.x)),
        minY: Math.min(...cells.map(c => c.y)),
        maxY: Math.max(...cells.map(c => c.y)),
      };
    };
    
    return { startBounds: getBounds(startCells), endBounds: getBounds(endCells) };
  }, [maze]);

  const isInStartRegion = (x: number, y: number) => 
    startBounds && x >= startBounds.minX && x <= startBounds.maxX && y >= startBounds.minY && y <= startBounds.maxY;
  
  const isInEndRegion = (x: number, y: number) => 
    endBounds && x >= endBounds.minX && x <= endBounds.maxX && y >= endBounds.minY && y <= endBounds.maxY;

  const mazeGrid = (
    <div
      className="bg-sage/30 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-warm-lg animate-fade-in flex-shrink-0"
      style={{
        width: gridWidth * cellSize + 16,
        height: gridHeight * cellSize + 16,
      }}
    >
      <div
        className="grid gap-0 relative"
        style={{
          gridTemplateColumns: `repeat(${gridWidth}, ${cellSize}px)`,
        }}
      >
        {maze.grid.map((row, y) =>
          row.map((cell, x) => {
            const inStart = isInStartRegion(x, y);
            const inEnd = isInEndRegion(x, y);
            
            return (
              <div
                key={`${x}-${y}`}
                className={cn(
                  'relative',
                  // No borders for start/end regions, subtle borders elsewhere
                  !inStart && !inEnd && 'border-[0.5px] border-sage/20',
                  cell.isWall ? 'bg-earth' : 'bg-wheat/60',
                  inStart && 'bg-sage/50',
                  inEnd && 'bg-primary/40'
                )}
                style={{ width: cellSize, height: cellSize }}
              >
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
            );
          })
        )}
        
        {/* Centered animal icon overlay for start region */}
        {startBounds && (
          <div
            className="absolute flex items-center justify-center pointer-events-none z-10"
            style={{
              left: startBounds.minX * cellSize,
              top: startBounds.minY * cellSize,
              width: (startBounds.maxX - startBounds.minX + 1) * cellSize,
              height: (startBounds.maxY - startBounds.minY + 1) * cellSize,
              fontSize: Math.max((startBounds.maxX - startBounds.minX + 1), (startBounds.maxY - startBounds.minY + 1)) * cellSize * 1.2,
            }}
          >
            {animalEmoji}
          </div>
        )}
        
        {/* Centered flag overlay for end region */}
        {endBounds && (
          <div
            className="absolute flex items-center justify-center pointer-events-none z-10"
            style={{
              left: endBounds.minX * cellSize,
              top: endBounds.minY * cellSize,
              width: (endBounds.maxX - endBounds.minX + 1) * cellSize,
              height: (endBounds.maxY - endBounds.minY + 1) * cellSize,
              fontSize: Math.min((endBounds.maxX - endBounds.minX + 1), (endBounds.maxY - endBounds.minY + 1)) * cellSize * 0.7,
            }}
          >
            🏁
          </div>
        )}
      </div>
    </div>
  );

  // Landscape layout: side by side
  if (isLandscape) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4 gap-6">
        {/* Top right controls */}
        <div className="absolute top-2 right-2 flex flex-row gap-2 z-10">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-lg font-display text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
          {onQuit && (
            <button
              onClick={onQuit}
              className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-lg font-display text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕ Quit
            </button>
          )}
        </div>

        {/* Left side: Header + Timer */}
        <div className="flex flex-col items-center justify-center gap-4 flex-shrink-0">
          <div className="text-center animate-fade-in">
            <h2 className="font-display text-xl font-bold text-foreground mb-1">
              Memorize the Path! 🧠
            </h2>
            <p className="text-xs text-muted-foreground">
              Study carefully!
            </p>
          </div>
          
          <div className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full font-display font-bold text-base animate-pulse">
            Starting in {timeLeft}s
          </div>

          <div className="text-center text-[10px] text-muted-foreground mt-2">
            <p>{animalEmoji} Start</p>
            <p>🏁 Exit</p>
            <p>⚡ Power-up</p>
            <p>📍 Map</p>
          </div>
        </div>

        {/* Right side: Maze */}
        {mazeGrid}
      </div>
    );
  }

  // Portrait layout: stacked
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-2 sm:p-4 overflow-auto">
      {/* Top right controls */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col gap-1 sm:gap-2 z-10">
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 sm:gap-2"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound'}</span>
          </button>
        )}
        {onQuit && (
          <button
            onClick={onQuit}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ Quit
          </button>
        )}
      </div>

      {/* Header */}
      <div className="text-center mb-2 sm:mb-6 animate-fade-in">
        <h2 className="font-display text-xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
          Memorize the Path! 🧠
        </h2>
        <p className="text-xs sm:text-base text-muted-foreground">
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
      {mazeGrid}

      <div className="mt-2 sm:mt-6 text-center text-[10px] sm:text-sm text-muted-foreground">
        <p>{animalEmoji} Start | 🏁 Exit | ⚡ Power-up | 📍 Map</p>
      </div>
    </div>
  );
};
