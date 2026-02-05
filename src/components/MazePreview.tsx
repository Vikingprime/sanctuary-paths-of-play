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
   // In landscape, we rotate the maze 90deg so swap width/height for cell calculation
   // For landscape: the maze will be rotated, so calculate available space based on final visual dimensions
   const availableWidth = isLandscape ? window.innerWidth * 0.55 : window.innerWidth - 64;
   const availableHeight = isLandscape ? window.innerHeight - 80 : window.innerHeight - 220;
  
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

  // Transform coordinates for landscape mode (90° counter-clockwise rotation)
  // Original: (x, y) -> Rotated: (y, gridWidth - 1 - x)
  const transformCoord = (x: number, y: number) => {
    if (!isLandscape) return { tx: x, ty: y };
    return { tx: y, ty: gridWidth - 1 - x };
  };
  
  // In landscape, we swap grid dimensions for display
  const displayWidth = isLandscape ? gridHeight : gridWidth;
  const displayHeight = isLandscape ? gridWidth : gridHeight;

  const mazeGrid = (
    <div
       className="bg-sage/30 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-warm-lg animate-fade-in flex-shrink-0"
      style={{
        width: displayWidth * cellSize + 16,
        height: displayHeight * cellSize + 16,
      }}
    >
      <div
        className="grid gap-0 relative"
        style={{
          gridTemplateColumns: `repeat(${displayWidth}, ${cellSize}px)`,
        }}
      >
        {/* Render cells in transformed order for landscape */}
        {Array.from({ length: displayHeight }).map((_, displayY) =>
          Array.from({ length: displayWidth }).map((_, displayX) => {
            // Reverse transform to get original coordinates
            const origX = isLandscape ? gridWidth - 1 - displayY : displayX;
            const origY = isLandscape ? displayX : displayY;
            const cell = maze.grid[origY]?.[origX];
            if (!cell) return null;
            
            const inStart = isInStartRegion(origX, origY);
            const inEnd = isInEndRegion(origX, origY);
            
            return (
              <div
                key={`${displayX}-${displayY}`}
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
            style={(() => {
              const topLeft = transformCoord(startBounds.minX, startBounds.minY);
              const bottomRight = transformCoord(startBounds.maxX, startBounds.maxY);
              const left = Math.min(topLeft.tx, bottomRight.tx) * cellSize;
              const top = Math.min(topLeft.ty, bottomRight.ty) * cellSize;
              const width = (Math.abs(bottomRight.tx - topLeft.tx) + 1) * cellSize;
              const height = (Math.abs(bottomRight.ty - topLeft.ty) + 1) * cellSize;
              return {
                left, top, width, height,
                fontSize: Math.max(width, height) * 1.2,
              };
            })()}
          >
            {animalEmoji}
          </div>
        )}
        
        {/* Centered flag overlay for end region */}
        {endBounds && (
          <div
             className="absolute flex items-center justify-center pointer-events-none z-10"
            style={(() => {
              const topLeft = transformCoord(endBounds.minX, endBounds.minY);
              const bottomRight = transformCoord(endBounds.maxX, endBounds.maxY);
              const left = Math.min(topLeft.tx, bottomRight.tx) * cellSize;
              const top = Math.min(topLeft.ty, bottomRight.ty) * cellSize;
              const width = (Math.abs(bottomRight.tx - topLeft.tx) + 1) * cellSize;
              const height = (Math.abs(bottomRight.ty - topLeft.ty) + 1) * cellSize;
              return {
                left, top, width, height,
                fontSize: Math.min(width, height) * 0.7,
              };
            })()}
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
