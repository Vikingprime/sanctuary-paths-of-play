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

  // Find start and end positions
  const { startCenter, endCenter, endCells } = useMemo(() => {
    const startCells: { x: number; y: number }[] = [];
    const endCells: { x: number; y: number }[] = [];
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isStart) startCells.push({ x, y });
        if (cell.isEnd) endCells.push({ x, y });
      });
    });
    
    // Calculate center of start region
    const startCenter = startCells.length > 0 ? {
      x: startCells.reduce((sum, c) => sum + c.x, 0) / startCells.length,
      y: startCells.reduce((sum, c) => sum + c.y, 0) / startCells.length,
    } : { x: 0, y: 0 };
    
    // Calculate center of end region
    const endCenter = endCells.length > 0 ? {
      x: endCells.reduce((sum, c) => sum + c.x, 0) / endCells.length,
      y: endCells.reduce((sum, c) => sum + c.y, 0) / endCells.length,
    } : { x: 0, y: 0 };
    
    return { startCenter, endCenter, endCells };
  }, [maze]);

  // Get animal emoji
  const animalEmoji = selectedAnimal?.emoji || '🐷';

  // Calculate cell size based on available space - responsive to viewport
  const gridWidth = maze.grid[0].length;
  const gridHeight = maze.grid.length;
  
  // In landscape, we rotate the map so swap dimensions for sizing
  const effectiveWidth = isLandscape ? gridHeight : gridWidth;
  const effectiveHeight = isLandscape ? gridWidth : gridHeight;
  
  // Use vh/vw to determine max size, accounting for padding and other UI elements
  const maxCellFromWidth = Math.floor((window.innerWidth - 64) / effectiveWidth);
  const maxCellFromHeight = Math.floor((window.innerHeight - 220) / effectiveHeight);
  const cellSize = Math.min(28, maxCellFromWidth, maxCellFromHeight);

  // Check if a cell is the center of start or end region
  const isStartCenter = (x: number, y: number) => 
    Math.round(startCenter.x) === x && Math.round(startCenter.y) === y;
  
  const isEndCenter = (x: number, y: number) => 
    Math.round(endCenter.x) === x && Math.round(endCenter.y) === y;

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
        className={cn(
          "bg-sage/30 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-warm-lg animate-fade-in flex-shrink-0",
          isLandscape && "rotate-90 origin-center"
        )}
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
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className={cn(
                  'relative border-[0.5px] border-sage/20',
                  cell.isWall ? 'bg-earth' : 'bg-wheat/60',
                  cell.isEnd && 'bg-primary/40'
                )}
                style={{ width: cellSize, height: cellSize }}
              >
                {/* Animal icon at start center only */}
                {isStartCenter(x, y) && (
                  <span 
                    className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-sm z-10"
                    style={isLandscape ? { transform: 'rotate(-90deg)' } : undefined}
                  >
                    {animalEmoji}
                  </span>
                )}
                {/* Single flag at end center only */}
                {isEndCenter(x, y) && (
                  <span 
                    className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-sm z-10"
                    style={isLandscape ? { transform: 'rotate(-90deg)' } : undefined}
                  >
                    🏁
                  </span>
                )}
                {cell.isPowerUp && (
                  <span 
                    className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs"
                    style={isLandscape ? { transform: 'rotate(-90deg)' } : undefined}
                  >
                    ⚡
                  </span>
                )}
                {cell.isStation && (
                  <span 
                    className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-xs"
                    style={isLandscape ? { transform: 'rotate(-90deg)' } : undefined}
                  >
                    📍
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div 
        className="mt-2 sm:mt-6 text-center text-[10px] sm:text-sm text-muted-foreground"
        style={isLandscape ? { marginTop: gridWidth * cellSize / 2 + 24 } : undefined}
      >
        <p>{animalEmoji} Start | 🏁 Exit | ⚡ Power-up | 📍 Map</p>
      </div>
    </div>
  );
};
