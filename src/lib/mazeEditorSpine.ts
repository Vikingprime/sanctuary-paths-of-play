import { createGrid } from '@/hooks/useMazeStorage';
import { computeMedialAxis } from '@/game/MedialAxis';
import { buildSmoothedPolylines, type PolylineGraph } from '@/game/SkeletonPolyline';
import { Maze } from '@/types/game';
import {
  applyDeletedSpineFineCells,
  createSpineFineCellSet,
  extractSpineFineCells,
  getSpineFineCellKey,
  SPINE_FINE_GRID_SCALE,
  type SpineFineCellCoordinate,
} from '@/lib/spineFineCells';

export type MazeEditorCell = '#' | ' ' | 'S' | 'E' | 'P' | 'H' | 'D';

export interface MazeEditorSpineAnalysis {
  maze: Maze;
  graph: PolylineGraph | null;
  traversedCellKeys: Set<string>;
  fineScale: number;
  fineSpineCells: SpineFineCellCoordinate[];
  fineSpineCellKeys: Set<string>;
  deletedFineCellKeys: Set<string>;
}

const SPINE_SAMPLE_SPACING = 0.05;

export const getMazeCellKey = (x: number, y: number) => `${x},${y}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function buildMazeFromEditorGrid(grid: MazeEditorCell[][]): Maze {
  const layout = grid.map((row) => row.map((cell) => (cell === 'D' ? ' ' : cell)).join(''));

  return {
    id: 0,
    name: 'Maze Editor Preview',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
    medalTimes: { gold: 0, silver: 0, bronze: 0 },
    grid: createGrid(layout),
  };
}

function addWorldPointToTraversedCells(
  x: number,
  z: number,
  gridWidth: number,
  gridHeight: number,
  traversedCellKeys: Set<string>
) {
  const cellX = clamp(Math.floor(x), 0, Math.max(0, gridWidth - 1));
  const cellY = clamp(Math.floor(z), 0, Math.max(0, gridHeight - 1));
  traversedCellKeys.add(getMazeCellKey(cellX, cellY));
}

function collectTraversedCells(
  graph: PolylineGraph | null,
  fallbackPoints: Array<{ x: number; z: number }>,
  gridWidth: number,
  gridHeight: number
) {
  const traversedCellKeys = new Set<string>();

  if (graph && graph.segments.length > 0) {
    for (const segment of graph.segments) {
      if (segment.points.length === 0) continue;

      const points = segment.points;
      addWorldPointToTraversedCells(points[0].x, points[0].z, gridWidth, gridHeight, traversedCellKeys);

      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const distance = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.ceil(distance / SPINE_SAMPLE_SPACING));

        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          addWorldPointToTraversedCells(
            start.x + dx * t,
            start.z + dz * t,
            gridWidth,
            gridHeight,
            traversedCellKeys
          );
        }
      }
    }

    return traversedCellKeys;
  }

  for (const point of fallbackPoints) {
    addWorldPointToTraversedCells(point.x, point.z, gridWidth, gridHeight, traversedCellKeys);
  }

  return traversedCellKeys;
}

export function buildMazeEditorSpine(
  grid: MazeEditorCell[][],
  deletedSpineFineCells: SpineFineCellCoordinate[] = []
): MazeEditorSpineAnalysis | null {
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length ?? 0;

  if (gridWidth === 0 || gridHeight === 0) {
    return null;
  }

  const maze = buildMazeFromEditorGrid(grid);
  const axisResult = computeMedialAxis(maze, SPINE_FINE_GRID_SCALE);
  const deletedFineCellKeys = applyDeletedSpineFineCells(axisResult.fineGrid, deletedSpineFineCells);
  const fineSpineCells = extractSpineFineCells(axisResult.fineGrid);
  const fineSpineCellKeys = createSpineFineCellSet(fineSpineCells);
  const fallbackPoints = fineSpineCells.map((cell) => ({
    x: (cell.x + 0.5) * axisResult.fineCellSize,
    z: (cell.y + 0.5) * axisResult.fineCellSize,
  }));

  const isWallFn = (worldX: number, worldZ: number): boolean => {
    const mazeX = Math.floor(worldX);
    const mazeY = Math.floor(worldZ);

    if (mazeY < 0 || mazeY >= maze.grid.length) return true;
    if (mazeX < 0 || mazeX >= maze.grid[0].length) return true;

    return maze.grid[mazeY][mazeX]?.isWall ?? true;
  };

  const fineWidth = gridWidth * axisResult.scale;
  const fineHeight = gridHeight * axisResult.scale;

  const graph = buildSmoothedPolylines(
    axisResult.fineGrid,
    fineWidth,
    fineHeight,
    axisResult.fineCellSize,
    { isWallFn }
  );

  return {
    maze,
    graph,
    traversedCellKeys: collectTraversedCells(graph, fallbackPoints, gridWidth, gridHeight),
    fineScale: axisResult.scale,
    fineSpineCells,
    fineSpineCellKeys,
    deletedFineCellKeys,
  };
}

export function cellsTouchSpine(
  cells: Array<{ x: number; y: number }>,
  traversedCellKeys: Set<string>
): boolean {
  return cells.some((cell) => traversedCellKeys.has(getMazeCellKey(cell.x, cell.y)));
}

export { getSpineFineCellKey };
