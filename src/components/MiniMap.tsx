import { Maze, Animal } from '@/types/game';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect, useRef } from 'react';
import { CompassRose } from './CompassRose';

interface MiniMapProps {
  maze: Maze;
  playerPos: { x: number; y: number };
  isVisible: boolean;
  onClose: () => void;
  timeLeft?: number | null;
  selectedAnimal?: Animal;
}

export const MiniMap = ({ maze, playerPos, isVisible, onClose, timeLeft, selectedAnimal }: MiniMapProps) => {
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  
  // Pulsing animation state
  const [pulseScale, setPulseScale] = useState(1);
  const animStartTimeRef = useRef<number>(Date.now());
  
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Pulse animation loop
  useEffect(() => {
    if (!isVisible) return;
    animStartTimeRef.current = Date.now();
    
    let animFrame: number;
    const animate = () => {
      const elapsed = Date.now() - animStartTimeRef.current;
      // Oscillate between 0.85 and 1.15 scale with 600ms period
      const t = (elapsed % 600) / 600;
      const scale = 0.85 + 0.3 * Math.sin(t * Math.PI);
      setPulseScale(scale);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [isVisible]);

  // Get animal emoji
  const animalEmoji = selectedAnimal?.emoji || '🐄';
  
  // Calculate cell size based on available space
  const gridWidth = maze.grid[0].length;
  const gridHeight = maze.grid.length;
  
  // In landscape: larger map display
  const availableWidth = isLandscape ? window.innerWidth * 0.6 : window.innerWidth - 100;
  const availableHeight = isLandscape ? window.innerHeight - 200 : window.innerHeight - 300;
  
  // In landscape, we swap dimensions due to 90° rotation
  const displayWidthForCalc = isLandscape ? gridHeight : gridWidth;
  const displayHeightForCalc = isLandscape ? gridWidth : gridHeight;
  
  const maxCellFromWidth = Math.floor(availableWidth / displayWidthForCalc);
  const maxCellFromHeight = Math.floor(availableHeight / displayHeightForCalc);
  const maxCellSize = isLandscape ? 40 : 24;
  const cellSize = Math.min(maxCellSize, maxCellFromWidth, maxCellFromHeight, 20);

  // Calculate bounding boxes for start and end regions
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
  
  // Find finish center
  const finishCenter = useMemo(() => {
    if (!endBounds) return null;
    return {
      centerX: (endBounds.minX + endBounds.maxX + 1) / 2,
      centerY: (endBounds.minY + endBounds.maxY + 1) / 2,
    };
  }, [endBounds]);
  
  // Find all station positions
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
  
  const isInEndRegion = (x: number, y: number) => 
    endBounds && x >= endBounds.minX && x <= endBounds.maxX && y >= endBounds.minY && y <= endBounds.maxY;

  // Transform coordinates for landscape mode (90° counter-clockwise rotation)
  const transformCoord = (x: number, y: number) => {
    if (!isLandscape) return { tx: x, ty: y };
    return { tx: y, ty: gridWidth - 1 - x };
  };
  
  // Transform for CENTER positions
  const transformCenter = (x: number, y: number) => {
    if (!isLandscape) return { tx: x, ty: y };
    return { tx: y, ty: gridWidth - x };
  };
  
  // In landscape, we swap grid dimensions for display
  const displayWidth = isLandscape ? gridHeight : gridWidth;
  const displayHeight = isLandscape ? gridWidth : gridHeight;

  // Player center for overlay positioning
  const playerCenter = {
    centerX: playerPos.x,
    centerY: playerPos.y,
  };
  
  // Early return after all hooks
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl p-6 shadow-warm-lg">
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

        <div className="flex items-center justify-center gap-4">
          {/* Compass rose to the left - rotated in landscape to match grid */}
          <CompassRose size={60} rotation={isLandscape ? -90 : 0} />
          
          <div
            className="bg-sage/30 rounded-xl p-2 relative"
            style={{
              width: displayWidth * cellSize + 16,
              height: displayHeight * cellSize + 16,
            }}
          >
            <div
              className="grid gap-0 relative"
              style={{
                gridTemplateColumns: `repeat(${displayWidth}, ${cellSize}px)`,
                margin: '8px',
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
                  
                  const inEnd = isInEndRegion(origX, origY);
                  
                  return (
                    <div
                      key={`${displayX}-${displayY}`}
                      className={cn(
                        'relative',
                        'border-[0.5px] border-sage/20',
                        cell.isWall ? 'bg-earth' : 'bg-wheat/60',
                        inEnd && 'bg-primary/40'
                      )}
                      style={{ width: cellSize, height: cellSize }}
                    />
                  );
                })
              )}
              
              {/* Player position overlay with emoji */}
              <div
                className="absolute flex items-center justify-center pointer-events-none z-10"
                style={(() => {
                  const transformed = transformCenter(playerCenter.centerX, playerCenter.centerY);
                  const centerX = transformed.tx * cellSize;
                  const centerY = transformed.ty * cellSize;
                  const iconSize = cellSize * 2.2;
                  return {
                    left: centerX - iconSize / 2,
                    top: centerY - iconSize / 2,
                    width: iconSize,
                    height: iconSize,
                    transform: `scale(${pulseScale})`,
                  };
                })()}
              >
                {/* Green circle indicator */}
                <div 
                  className="absolute rounded-full bg-secondary/40 border-2 border-secondary"
                  style={{
                    width: cellSize * 2.8,
                    height: cellSize * 2.8,
                  }}
                />
                <span style={{ fontSize: cellSize * 1.8 }}>{animalEmoji}</span>
              </div>
              
              {/* Finish flag overlay */}
              {finishCenter && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none z-10"
                  style={(() => {
                    const transformed = transformCenter(finishCenter.centerX, finishCenter.centerY);
                    const centerX = transformed.tx * cellSize;
                    const centerY = transformed.ty * cellSize;
                    const iconSize = cellSize * 2;
                    return {
                      left: centerX - iconSize / 2,
                      top: centerY - iconSize / 2,
                      width: iconSize,
                      height: iconSize,
                    };
                  })()}
                >
                  <span style={{ fontSize: cellSize * 1.6 }}>🏁</span>
                </div>
              )}
              
              {/* Station icons */}
              {stationPositions.map((pos, idx) => {
                const transformed = transformCoord(pos.x, pos.y);
                const iconSize = cellSize * 1.5;
                return (
                  <div
                    key={`station-${idx}`}
                    className="absolute flex items-center justify-center pointer-events-none z-10"
                    style={{
                      left: (transformed.tx + 0.5) * cellSize - iconSize / 2,
                      top: (transformed.ty + 0.5) * cellSize - iconSize / 2,
                      width: iconSize,
                      height: iconSize,
                    }}
                  >
                    <span style={{ fontSize: cellSize * 1.2 }}>🗺️</span>
                  </div>
                );
              })}
            </div>
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
