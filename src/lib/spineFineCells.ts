export interface SpineFineCellCoordinate {
  x: number;
  y: number;
}

interface FineGridCellLike {
  isSkeleton: boolean;
  isSpur?: boolean;
}

export const SPINE_FINE_GRID_SCALE = 20;

export const getSpineFineCellKey = (x: number, y: number) => `${x},${y}`;

export function normalizeSpineFineCells(cells: SpineFineCellCoordinate[] = []): SpineFineCellCoordinate[] {
  const uniqueCells = new Map<string, SpineFineCellCoordinate>();

  for (const cell of cells) {
    const x = Math.max(0, Math.floor(cell.x));
    const y = Math.max(0, Math.floor(cell.y));
    uniqueCells.set(getSpineFineCellKey(x, y), { x, y });
  }

  return Array.from(uniqueCells.values()).sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}

export function createSpineFineCellSet(cells: SpineFineCellCoordinate[] = []): Set<string> {
  return new Set(normalizeSpineFineCells(cells).map((cell) => getSpineFineCellKey(cell.x, cell.y)));
}

export function applyDeletedSpineFineCells<T extends FineGridCellLike>(
  fineGrid: T[][],
  deletedCells: SpineFineCellCoordinate[] = []
): Set<string> {
  const deletedCellKeys = createSpineFineCellSet(deletedCells);

  for (const key of deletedCellKeys) {
    const [xString, yString] = key.split(',');
    const x = Number(xString);
    const y = Number(yString);
    const fineCell = fineGrid[y]?.[x];

    if (!fineCell) continue;

    fineCell.isSkeleton = false;
    if ('isSpur' in fineCell) {
      fineCell.isSpur = false;
    }
  }

  return deletedCellKeys;
}

export function extractSpineFineCells<T extends FineGridCellLike>(fineGrid: T[][]): SpineFineCellCoordinate[] {
  const fineCells: SpineFineCellCoordinate[] = [];

  for (let y = 0; y < fineGrid.length; y += 1) {
    for (let x = 0; x < (fineGrid[y]?.length ?? 0); x += 1) {
      const fineCell = fineGrid[y]?.[x];
      if (!fineCell?.isSkeleton || fineCell.isSpur) continue;
      fineCells.push({ x, y });
    }
  }

  return fineCells;
}
