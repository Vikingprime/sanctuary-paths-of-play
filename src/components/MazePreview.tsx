import { Maze, Animal } from '@/types/game';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { CompassRose } from './CompassRose';

interface MazePreviewProps {
  maze: Maze;
  timeLeft: number;
  onPreviewEnd: () => void;
  onQuit?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  selectedAnimal?: Animal;
  isStoryMode?: boolean;
}

export const MazePreview = ({ 
  maze, 
  timeLeft, 
  onPreviewEnd,
  onQuit,
  isMuted = false,
  onToggleMute,
  selectedAnimal,
  isStoryMode = false,
}: MazePreviewProps) => {
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  // Tutorial animation phase: 'player' | 'finish' | 'stations' | 'done'
  type TutorialPhase = 'player' | 'finish' | 'stations' | 'done';
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('player');
  const phaseStartTimeRef = useRef<number>(Date.now());

  // Pulsing animation state (for scale effect)
  const [pulseScale, setPulseScale] = useState(1);

  // Check if maze has any stations (moved up before useEffect that uses it)
  const hasStations = useMemo(() => {
    return maze.grid.some(row => row.some(cell => cell.isStation));
  }, [maze]);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tutorial phase progression: 1.5s per phase
  // 2.5s per phase for better visibility
  useEffect(() => {
    phaseStartTimeRef.current = Date.now();
    
    const advancePhase = () => {
      setTutorialPhase(prev => {
        if (prev === 'player') return 'finish';
        if (prev === 'finish') return hasStations ? 'stations' : 'done';
        return 'done';
      });
    };

    const timer = setTimeout(advancePhase, 2500);
    return () => clearTimeout(timer);
  }, [tutorialPhase, hasStations]);

  // Pulse animation loop (runs during active phases)
  useEffect(() => {
    if (tutorialPhase === 'done') {
      setPulseScale(1);
      return;
    }

    let animFrame: number;
    const animate = () => {
      const elapsed = Date.now() - phaseStartTimeRef.current;
      // Oscillate between 0.7 and 1.4 scale with 500ms period for more dramatic effect
      const t = (elapsed % 500) / 500;
      const scale = 0.7 + 0.7 * Math.sin(t * Math.PI);
      setPulseScale(scale);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [tutorialPhase]);

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

  // Find a 2x2 block of path cells near the start for player positioning
  // The animal will be centered at the intersection of these 4 cells
  const playerBlock = useMemo(() => {
    if (!startBounds) return null;
    
    // Helper to check if a cell is a valid path (not wall, not start, not end)
    const isPath = (x: number, y: number) => {
      const cell = maze.grid[y]?.[x];
      return cell && !cell.isWall;
    };
    
    // Helper to check if a 2x2 block starting at (x,y) is all path cells
    const isValid2x2 = (x: number, y: number) => {
      return isPath(x, y) && isPath(x + 1, y) && isPath(x, y + 1) && isPath(x + 1, y + 1);
    };
    
    // Search for a valid 2x2 block, starting from within/adjacent to start region
    // Priority: cells adjacent to start region first, then expanding outward
    const searchRadius = 5;
    for (let r = 0; r <= searchRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only check perimeter at each radius
          const testX = startBounds.minX + dx;
          const testY = startBounds.minY + dy;
          if (isValid2x2(testX, testY)) {
            return {
              // Return the 4 cells and the center position
              cells: [
                { x: testX, y: testY },
                { x: testX + 1, y: testY },
                { x: testX, y: testY + 1 },
                { x: testX + 1, y: testY + 1 },
              ],
              // Center is at the intersection of all 4 cells
              centerX: testX + 1,
              centerY: testY + 1,
            };
          }
        }
      }
    }
    
    // Fallback: just use center of start bounds
    return {
      cells: [],
      centerX: (startBounds.minX + startBounds.maxX + 1) / 2,
      centerY: (startBounds.minY + startBounds.maxY + 1) / 2,
    };
  }, [maze, startBounds]);

  // Find the center of the end region for finish positioning
  // Unlike player, we want to center on the actual end cells
  const finishBlock = useMemo(() => {
    if (!endBounds) return null;
    
    // Collect all end cells
    const endCells: { x: number; y: number }[] = [];
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isEnd) {
          endCells.push({ x, y });
        }
      });
    });
    
    // Calculate true center of all end cells
    // For a 2x3 region, this will be at the center intersection
    return {
      cells: endCells,
      // Center at the middle of the end region
      // +1 accounts for cell width (left edge to right edge)
      centerX: (endBounds.minX + endBounds.maxX + 1) / 2,
      centerY: (endBounds.minY + endBounds.maxY + 1) / 2,
    };
  }, [maze, endBounds]);

  // Check if a cell is part of the player highlight block
  const isInPlayerBlock = (x: number, y: number) => {
    if (!playerBlock) return false;
    return playerBlock.cells.some(c => c.x === x && c.y === y);
  };

  // Check if a cell is part of the finish highlight block
  const isInFinishBlock = (x: number, y: number) => {
    if (!finishBlock) return false;
    return finishBlock.cells.some(c => c.x === x && c.y === y);
  };

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
  
  // Transform for CENTER positions (not cell indices) - uses gridWidth instead of gridWidth-1
  const transformCenter = (x: number, y: number) => {
    if (!isLandscape) return { tx: x, ty: y };
    return { tx: y, ty: gridWidth - x };
  };
  
  // In landscape, we swap grid dimensions for display
  const displayWidth = isLandscape ? gridHeight : gridWidth;
  const displayHeight = isLandscape ? gridWidth : gridHeight;

  const mazeGrid = (
    <div className="flex flex-col items-center gap-2 animate-fade-in">
      {/* Maze grid - no wrapper padding/border */}
      <div
        className="grid gap-0 relative rounded-lg overflow-hidden shadow-warm-lg flex-shrink-0"
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
                    🗺️
                  </span>
                )}
              </div>
            );
          })
        )}
        
        {/* Centered animal icon overlay for start region */}
        {playerBlock && (
          <div
            className="absolute flex flex-col items-center justify-center pointer-events-none z-10"
            style={(() => {
              // Transform center position to display coordinates using center transform
              const transformed = transformCenter(playerBlock.centerX, playerBlock.centerY);
              const centerX = transformed.tx * cellSize;
              const centerY = transformed.ty * cellSize;
              const iconSize = cellSize * 2;
              return {
                left: centerX - iconSize / 2,
                top: centerY - iconSize / 2,
                width: iconSize,
                height: iconSize,
                transform: tutorialPhase === 'player' ? `scale(${pulseScale})` : 'scale(0.7)',
                transition: tutorialPhase === 'player' ? 'none' : 'transform 0.3s ease-out',
              };
            })()}
          >
            {/* Green circle indicator like map tower */}
            {tutorialPhase === 'player' && (
              <div 
                className="absolute rounded-full bg-secondary/40 border-2 border-secondary"
                style={{
                  width: cellSize * 2.8,
                  height: cellSize * 2.8,
                }}
              />
            )}
            <span style={{ fontSize: cellSize * 2.2 }}>{animalEmoji}</span>
          </div>
        )}

        {/* "You" label for player */}
        {tutorialPhase === 'player' && playerBlock && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-3 py-1 rounded-lg shadow-md"
            style={(() => {
              const transformed = transformCenter(playerBlock.centerX, playerBlock.centerY);
              const centerX = transformed.tx * cellSize;
              const centerY = transformed.ty * cellSize;
              return {
                left: centerX,
                top: centerY - cellSize * 1.8,
                transform: `translateX(-50%) scale(${pulseScale * 0.8 + 0.2})`,
                fontSize: Math.max(16, cellSize * 0.7),
              };
            })()}
          >
            You
          </div>
        )}
        
        {/* Centered flag overlay for end region */}
        {finishBlock && (
          <div
            className="absolute flex items-center justify-center pointer-events-none z-10"
            style={(() => {
              const transformed = transformCenter(finishBlock.centerX, finishBlock.centerY);
              const centerX = transformed.tx * cellSize;
              const centerY = transformed.ty * cellSize;
              const iconSize = cellSize * 2;
              return {
                left: centerX - iconSize / 2,
                top: centerY - iconSize / 2,
                width: iconSize,
                height: iconSize,
                transform: tutorialPhase === 'finish' ? `scale(${pulseScale})` : 'scale(1)',
                transition: tutorialPhase === 'finish' ? 'none' : 'transform 0.3s ease-out',
              };
            })()}
          >
            {/* Green circle indicator like map tower */}
            {tutorialPhase === 'finish' && (
              <div 
                className="absolute rounded-full bg-secondary/40 border-2 border-secondary"
                style={{
                  width: cellSize * 2.8,
                  height: cellSize * 2.8,
                }}
              />
            )}
            <span style={{ fontSize: cellSize * 2 }}>🏁</span>
          </div>
        )}

        {/* "Finish" label */}
        {tutorialPhase === 'finish' && finishBlock && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-3 py-1 rounded-lg shadow-md"
            style={(() => {
              const transformed = transformCenter(finishBlock.centerX, finishBlock.centerY);
              const centerX = transformed.tx * cellSize;
              const centerY = transformed.ty * cellSize;
              return {
                left: centerX,
                top: centerY - cellSize * 1.8,
                transform: `translateX(-50%) scale(${pulseScale * 0.8 + 0.2})`,
                fontSize: Math.max(16, cellSize * 0.7),
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
          const iconSize = cellSize * 2;
          return (
            <div
              key={`station-${idx}`}
              className="absolute flex items-center justify-center pointer-events-none z-10"
              style={{
                left: (transformed.tx + 0.5) * cellSize - iconSize / 2,
                top: (transformed.ty + 0.5) * cellSize - iconSize / 2,
                width: iconSize,
                height: iconSize,
                transform: isAnimating ? `scale(${pulseScale})` : 'scale(1)',
                transition: isAnimating ? 'none' : 'transform 0.3s ease-out',
              }}
            >
              {isAnimating && (
                <div 
                  className="absolute rounded-full bg-secondary/50 border-2 border-secondary"
                  style={{
                    width: '120%',
                    height: '120%',
                    opacity: 0.6 + 0.4 * Math.sin((pulseScale - 0.8) / 0.5 * Math.PI),
                  }}
                />
              )}
              <span style={{ fontSize: cellSize * 1.5 }}>🗺️</span>
            </div>
          );
        })}

        {/* "Map towers" label - show above first station */}
        {tutorialPhase === 'stations' && hasStations && stationPositions.length > 0 && (
          <div
            className="absolute pointer-events-none z-20 font-display font-bold text-secondary-foreground bg-secondary/90 px-3 py-1 rounded-lg shadow-md whitespace-nowrap"
            style={(() => {
              const transformed = transformCoord(stationPositions[0].x, stationPositions[0].y);
              return {
                left: (transformed.tx + 0.5) * cellSize,
                top: (transformed.ty + 0.5) * cellSize - cellSize * 1.8,
                transform: `translateX(-50%) scale(${pulseScale * 0.8 + 0.2})`,
                fontSize: Math.max(16, cellSize * 0.7),
              };
            })()}
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

        {/* Story mode header - shown in landscape only for story mode */}
        {isStoryMode && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-center">
            <h2 className="font-display text-sm font-bold text-foreground">
              Memorize the Path! 🧠
            </h2>
            <div className="bg-primary text-primary-foreground px-3 py-0.5 rounded-full font-display font-bold text-sm animate-pulse mt-0.5">
              Starting in {timeLeft}s
            </div>
          </div>
        )}

        {/* Left side: Compass only */}
        <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0 w-[12%] min-w-[80px]">
          {/* Compass rose for orientation - rotated 90° CCW to match landscape grid rotation */}
          <CompassRose size={70} rotation={-90} />
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

      {/* Maze Preview with Compass */}
      <div className="flex items-center gap-4">
        <CompassRose size={60} />
        {mazeGrid}
      </div>

      <div className="mt-2 sm:mt-6 text-center text-[10px] sm:text-sm text-muted-foreground">
        <p>{animalEmoji} Start | 🏁 Exit | ⚡ Power-up | 🗺️ Map</p>
      </div>
    </div>
  );
};
