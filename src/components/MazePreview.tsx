import { Maze, Animal } from '@/types/game';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';

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

  // Tutorial animation phase: 'player' | 'finish' | 'stations' | 'done'
  type TutorialPhase = 'player' | 'finish' | 'stations' | 'done';
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('player');
  const phaseStartTimeRef = useRef<number>(Date.now());

  // Pulsing animation state (for scale effect)
  const [pulseScale, setPulseScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tutorial phase progression: 1.5s per phase
  useEffect(() => {
    phaseStartTimeRef.current = Date.now();
    
    const advancePhase = () => {
      setTutorialPhase(prev => {
        if (prev === 'player') return 'finish';
        if (prev === 'finish') return 'stations';
        return 'done';
      });
    };

    const timer = setTimeout(advancePhase, 1500);
    return () => clearTimeout(timer);
  }, [tutorialPhase]);

  // Pulse animation loop (runs during active phases)
  useEffect(() => {
    if (tutorialPhase === 'done') {
      setPulseScale(1);
      return;
    }

    let animFrame: number;
    const animate = () => {
      const elapsed = Date.now() - phaseStartTimeRef.current;
      // Oscillate between 0.8 and 1.3 scale with 400ms period
      const t = (elapsed % 400) / 400;
      const scale = 0.8 + 0.5 * Math.sin(t * Math.PI);
      setPulseScale(scale);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [tutorialPhase]);

  // Check if maze has any stations
  const hasStations = useMemo(() => {
    return maze.grid.some(row => row.some(cell => cell.isStation));
  }, [maze]);

  // Get animal emoji
  const animalEmoji = selectedAnimal?.emoji || '🐷';

  // Calculate cell size based on available space
  const gridWidth = maze.grid[0].length;
  const gridHeight = maze.grid.length;
  
  // In landscape: give 88% of width to the maze for a much larger display
  const availableWidth = isLandscape ? window.innerWidth * 0.88 : window.innerWidth - 64;
  const availableHeight = isLandscape ? window.innerHeight - 24 : window.innerHeight - 220;
  
  // In landscape, we swap dimensions due to 90° rotation
  const displayWidthForCalc = isLandscape ? gridHeight : gridWidth;
  const displayHeightForCalc = isLandscape ? gridWidth : gridHeight;
  
  const maxCellFromWidth = Math.floor(availableWidth / displayWidthForCalc);
  const maxCellFromHeight = Math.floor(availableHeight / displayHeightForCalc);
  // Allow larger cells in landscape mode (up to 56px for bigger map)
  const maxCellSize = isLandscape ? 56 : 28;
  const cellSize = Math.min(maxCellSize, maxCellFromWidth, maxCellFromHeight);

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

  // Find a path cell near start for player icon positioning
  const playerPathPosition = useMemo(() => {
    if (!startBounds) return null;
    
    // Search for a path cell adjacent to or within the start region
    const searchCells: { x: number; y: number }[] = [];
    
    // First, check cells within the start region
    for (let y = startBounds.minY; y <= startBounds.maxY; y++) {
      for (let x = startBounds.minX; x <= startBounds.maxX; x++) {
        if (!maze.grid[y]?.[x]?.isWall && !maze.grid[y]?.[x]?.isStart) {
          searchCells.push({ x, y });
        }
      }
    }
    
    // Then check cells adjacent to start region
    for (let y = startBounds.minY - 1; y <= startBounds.maxY + 1; y++) {
      for (let x = startBounds.minX - 1; x <= startBounds.maxX + 1; x++) {
        const cell = maze.grid[y]?.[x];
        if (cell && !cell.isWall && !cell.isStart && !cell.isEnd) {
          searchCells.push({ x, y });
        }
      }
    }
    
    // Return first valid path cell, or center of start region as fallback
    if (searchCells.length > 0) {
      return searchCells[0];
    }
    
    // Fallback to center of start bounds
    return {
      x: (startBounds.minX + startBounds.maxX) / 2,
      y: (startBounds.minY + startBounds.maxY) / 2,
    };
  }, [maze, startBounds]);

  // Find all station positions for the tutorial
  const stationPositions = useMemo(() => {
    const positions: { x: number; y: number }[] = [];
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isStation) {
          positions.push({ x, y });
        }
      });
    });
    return positions;
  }, [maze]);

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
        {playerPathPosition && (
          <div
            className="absolute flex flex-col items-center justify-center pointer-events-none z-10"
            style={{
              left: transformCoord(playerPathPosition.x, playerPathPosition.y).tx * cellSize,
              top: transformCoord(playerPathPosition.x, playerPathPosition.y).ty * cellSize,
              width: cellSize,
              height: cellSize,
              transform: tutorialPhase === 'player' ? `scale(${pulseScale})` : 'scale(0.8)',
              transition: tutorialPhase === 'player' ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            {/* Green circle indicator */}
            {tutorialPhase === 'player' && (
              <div 
                className="absolute rounded-full bg-secondary/50 border-2 border-secondary"
                style={{
                  width: cellSize * 1.8,
                  height: cellSize * 1.8,
                  opacity: 0.6 + 0.4 * Math.sin((pulseScale - 0.8) / 0.5 * Math.PI),
                }}
              />
            )}
            <span style={{ fontSize: cellSize * 0.7 }}>{animalEmoji}</span>
          </div>
        )}

        {/* "You" label for player */}
        {tutorialPhase === 'player' && playerPathPosition && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-2 py-0.5 rounded-lg shadow-md"
            style={{
              left: transformCoord(playerPathPosition.x, playerPathPosition.y).tx * cellSize + cellSize / 2,
              top: transformCoord(playerPathPosition.x, playerPathPosition.y).ty * cellSize - cellSize * 0.8,
              transform: 'translateX(-50%)',
              fontSize: Math.max(10, cellSize * 0.35),
            }}
          >
            You
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
                transform: tutorialPhase === 'finish' ? `scale(${pulseScale})` : 'scale(1)',
                transition: tutorialPhase === 'finish' ? 'none' : 'transform 0.3s ease-out',
              };
            })()}
          >
            {/* Green circle indicator for finish */}
            {tutorialPhase === 'finish' && (
              <div 
                className="absolute rounded-full bg-secondary/50 border-2 border-secondary"
                style={{
                  width: Math.min(
                    (Math.abs(transformCoord(endBounds.maxX, endBounds.maxY).tx - transformCoord(endBounds.minX, endBounds.minY).tx) + 1) * cellSize,
                    (Math.abs(transformCoord(endBounds.maxX, endBounds.maxY).ty - transformCoord(endBounds.minX, endBounds.minY).ty) + 1) * cellSize
                  ) * 1.5,
                  height: Math.min(
                    (Math.abs(transformCoord(endBounds.maxX, endBounds.maxY).tx - transformCoord(endBounds.minX, endBounds.minY).tx) + 1) * cellSize,
                    (Math.abs(transformCoord(endBounds.maxX, endBounds.maxY).ty - transformCoord(endBounds.minX, endBounds.minY).ty) + 1) * cellSize
                  ) * 1.5,
                  opacity: 0.6 + 0.4 * Math.sin((pulseScale - 0.8) / 0.5 * Math.PI),
                }}
              />
            )}
            🏁
          </div>
        )}

        {/* "Finish" label */}
        {tutorialPhase === 'finish' && endBounds && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-2 py-0.5 rounded-lg shadow-md"
            style={(() => {
              const topLeft = transformCoord(endBounds.minX, endBounds.minY);
              const bottomRight = transformCoord(endBounds.maxX, endBounds.maxY);
              const centerX = (Math.min(topLeft.tx, bottomRight.tx) + (Math.abs(bottomRight.tx - topLeft.tx) + 1) / 2) * cellSize;
              const top = Math.min(topLeft.ty, bottomRight.ty) * cellSize - cellSize * 0.6;
              return {
                left: centerX,
                top,
                transform: 'translateX(-50%)',
                fontSize: Math.max(10, cellSize * 0.35),
              };
            })()}
          >
            Finish
          </div>
        )}

        {/* Station icons with tutorial animation */}
        {stationPositions.map((pos, idx) => {
          const transformed = transformCoord(pos.x, pos.y);
          const isAnimating = tutorialPhase === 'stations';
          return (
            <div
              key={`station-${idx}`}
              className="absolute flex items-center justify-center pointer-events-none z-10"
              style={{
                left: transformed.tx * cellSize,
                top: transformed.ty * cellSize,
                width: cellSize,
                height: cellSize,
                transform: isAnimating ? `scale(${pulseScale})` : 'scale(1)',
                transition: isAnimating ? 'none' : 'transform 0.3s ease-out',
              }}
            >
              {isAnimating && (
                <div 
                  className="absolute rounded-full bg-secondary/50 border-2 border-secondary"
                  style={{
                    width: cellSize * 1.5,
                    height: cellSize * 1.5,
                    opacity: 0.6 + 0.4 * Math.sin((pulseScale - 0.8) / 0.5 * Math.PI),
                  }}
                />
              )}
              <span style={{ fontSize: cellSize * 0.6 }}>📍</span>
            </div>
          );
        })}

        {/* "Map towers" label - show above first station */}
        {tutorialPhase === 'stations' && hasStations && stationPositions.length > 0 && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-2 py-0.5 rounded-lg shadow-md whitespace-nowrap"
            style={{
              left: transformCoord(stationPositions[0].x, stationPositions[0].y).tx * cellSize + cellSize / 2,
              top: transformCoord(stationPositions[0].x, stationPositions[0].y).ty * cellSize - cellSize * 0.6,
              transform: 'translateX(-50%)',
              fontSize: Math.max(10, cellSize * 0.35),
            }}
          >
            Map towers
          </div>
        )}
      </div>
    </div>
  );

  // Landscape layout: side by side
  if (isLandscape) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-1 gap-2">
        {/* Top right controls */}
        <div className="absolute top-1 right-1 flex flex-row gap-1 z-10">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="bg-card/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg font-display text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            </button>
          )}
          {onQuit && (
            <button
              onClick={onQuit}
              className="bg-card/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg font-display text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Left side: Header + Timer */}
        <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0 w-[12%] min-w-[80px]">
          <div className="text-center animate-fade-in px-1">
            <h2 className="font-display text-sm font-bold text-foreground leading-tight">
              🧠
            </h2>
          </div>
          
          <div className="bg-primary text-primary-foreground px-3 py-0.5 rounded-full font-display font-bold text-base animate-pulse">
            {timeLeft}s
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
