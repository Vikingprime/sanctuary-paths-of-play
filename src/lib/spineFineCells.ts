export interface SpineFineCellCoordinate {
  x: number;
  y: number;
}

export interface SpineFineBranchRange {
  start: SpineFineCellCoordinate;
  end: SpineFineCellCoordinate;
}

interface FineGridCellLike {
  isSkeleton: boolean;
  isSpur?: boolean;
}

export const SPINE_FINE_GRID_SCALE = 20;

const EIGHT_NEIGHBOR_OFFSETS: Array<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export const getSpineFineCellKey = (x: number, y: number) => `${x},${y}`;

const normalizeSpineFineCellCoordinate = (cell: SpineFineCellCoordinate): SpineFineCellCoordinate => ({
  x: Math.max(0, Math.floor(cell.x)),
  y: Math.max(0, Math.floor(cell.y)),
});

const compareSpineFineCellCoordinates = (a: SpineFineCellCoordinate, b: SpineFineCellCoordinate) => {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
};

const normalizeSpineFineCellSource = (
  source: SpineFineCellCoordinate[] | Set<string> = []
): Set<string> => (source instanceof Set ? source : createSpineFineCellSet(source));

const getNeighborSpineFineCells = (
  cell: SpineFineCellCoordinate,
  source: SpineFineCellCoordinate[] | Set<string>
): SpineFineCellCoordinate[] => {
  const sourceSet = normalizeSpineFineCellSource(source);

  return EIGHT_NEIGHBOR_OFFSETS.flatMap(([dx, dy]) => {
    const x = cell.x + dx;
    const y = cell.y + dy;
    return sourceSet.has(getSpineFineCellKey(x, y)) ? [{ x, y }] : [];
  }).sort(compareSpineFineCellCoordinates);
};

const walkToSpineBranchBoundary = (
  previousCell: SpineFineCellCoordinate,
  currentCell: SpineFineCellCoordinate,
  source: SpineFineCellCoordinate[] | Set<string>
): SpineFineCellCoordinate => {
  let prev = previousCell;
  let current = currentCell;
  const sourceSet = normalizeSpineFineCellSource(source);

  while (sourceSet.has(getSpineFineCellKey(current.x, current.y))) {
    const neighbors = getNeighborSpineFineCells(current, sourceSet);
    if (neighbors.length !== 2) {
      return current;
    }

    const nextCell = neighbors.find(
      (neighbor) => neighbor.x !== prev.x || neighbor.y !== prev.y
    );

    if (!nextCell) {
      return current;
    }

    prev = current;
    current = nextCell;
  }

  return prev;
};

const reconstructSpineFinePath = (
  previousByKey: Map<string, string>,
  startKey: string,
  endKey: string
): SpineFineCellCoordinate[] => {
  const pathKeys: string[] = [];
  let currentKey: string | undefined = endKey;

  while (currentKey) {
    pathKeys.push(currentKey);
    if (currentKey === startKey) break;
    currentKey = previousByKey.get(currentKey);
  }

  if (pathKeys[pathKeys.length - 1] !== startKey) {
    return [];
  }

  return pathKeys.reverse().map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });
};

const normalizeSpineBranchEndpoints = (
  start: SpineFineCellCoordinate,
  end: SpineFineCellCoordinate
): SpineFineBranchRange => {
  const normalizedStart = normalizeSpineFineCellCoordinate(start);
  const normalizedEnd = normalizeSpineFineCellCoordinate(end);

  return compareSpineFineCellCoordinates(normalizedStart, normalizedEnd) <= 0
    ? { start: normalizedStart, end: normalizedEnd }
    : { start: normalizedEnd, end: normalizedStart };
};

export function normalizeSpineFineCells(cells: SpineFineCellCoordinate[] = []): SpineFineCellCoordinate[] {
  const uniqueCells = new Map<string, SpineFineCellCoordinate>();

  for (const cell of cells) {
    const normalizedCell = normalizeSpineFineCellCoordinate(cell);
    uniqueCells.set(getSpineFineCellKey(normalizedCell.x, normalizedCell.y), normalizedCell);
  }

  return Array.from(uniqueCells.values()).sort(compareSpineFineCellCoordinates);
}

export function normalizeSpineFineBranches(branches: SpineFineBranchRange[] = []): SpineFineBranchRange[] {
  const uniqueBranches = new Map<string, SpineFineBranchRange>();

  for (const branch of branches) {
    const normalizedBranch = normalizeSpineBranchEndpoints(branch.start, branch.end);
    const branchKey = `${getSpineFineCellKey(normalizedBranch.start.x, normalizedBranch.start.y)}:${getSpineFineCellKey(normalizedBranch.end.x, normalizedBranch.end.y)}`;
    uniqueBranches.set(branchKey, normalizedBranch);
  }

  return Array.from(uniqueBranches.values()).sort((a, b) => {
    const startComparison = compareSpineFineCellCoordinates(a.start, b.start);
    if (startComparison !== 0) return startComparison;
    return compareSpineFineCellCoordinates(a.end, b.end);
  });
}

export function createSpineFineCellSet(cells: SpineFineCellCoordinate[] = []): Set<string> {
  return new Set(normalizeSpineFineCells(cells).map((cell) => getSpineFineCellKey(cell.x, cell.y)));
}

export function getSpineBranchRangeForCell(
  cell: SpineFineCellCoordinate,
  source: SpineFineCellCoordinate[] | Set<string>
): SpineFineBranchRange | null {
  const normalizedCell = normalizeSpineFineCellCoordinate(cell);
  const sourceSet = normalizeSpineFineCellSource(source);
  const cellKey = getSpineFineCellKey(normalizedCell.x, normalizedCell.y);

  if (!sourceSet.has(cellKey)) {
    return null;
  }

  const neighbors = getNeighborSpineFineCells(normalizedCell, sourceSet);

  if (neighbors.length === 0) {
    return { start: normalizedCell, end: normalizedCell };
  }

  if (neighbors.length >= 3) {
    return null;
  }

  if (neighbors.length === 1) {
    return normalizeSpineBranchEndpoints(
      normalizedCell,
      walkToSpineBranchBoundary(normalizedCell, neighbors[0], sourceSet)
    );
  }

  return normalizeSpineBranchEndpoints(
    walkToSpineBranchBoundary(normalizedCell, neighbors[0], sourceSet),
    walkToSpineBranchBoundary(normalizedCell, neighbors[1], sourceSet)
  );
}

export function getSpineBranchCells(
  branch: SpineFineBranchRange,
  source: SpineFineCellCoordinate[] | Set<string>
): SpineFineCellCoordinate[] {
  const normalizedBranch = normalizeSpineBranchEndpoints(branch.start, branch.end);
  const sourceSet = normalizeSpineFineCellSource(source);
  const startKey = getSpineFineCellKey(normalizedBranch.start.x, normalizedBranch.start.y);
  const endKey = getSpineFineCellKey(normalizedBranch.end.x, normalizedBranch.end.y);

  if (!sourceSet.has(startKey) || !sourceSet.has(endKey)) {
    return [];
  }

  if (startKey === endKey) {
    return [{ ...normalizedBranch.start }];
  }

  const queue: string[] = [startKey];
  const visited = new Set<string>([startKey]);
  const previousByKey = new Map<string, string>();

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) continue;
    if (currentKey === endKey) break;

    const [x, y] = currentKey.split(',').map(Number);
    for (const neighbor of getNeighborSpineFineCells({ x, y }, sourceSet)) {
      const neighborKey = getSpineFineCellKey(neighbor.x, neighbor.y);
      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);
      previousByKey.set(neighborKey, currentKey);
      queue.push(neighborKey);
    }
  }

  return reconstructSpineFinePath(previousByKey, startKey, endKey);
}

export function expandDeletedSpineBranches(
  branches: SpineFineBranchRange[] = [],
  source: SpineFineCellCoordinate[] | Set<string>
): SpineFineCellCoordinate[] {
  const expandedCells: SpineFineCellCoordinate[] = [];

  for (const branch of normalizeSpineFineBranches(branches)) {
    expandedCells.push(...getSpineBranchCells(branch, source));
  }

  return normalizeSpineFineCells(expandedCells);
}

export function branchContainsFineCell(
  branch: SpineFineBranchRange,
  cell: SpineFineCellCoordinate,
  source: SpineFineCellCoordinate[] | Set<string>
): boolean {
  const target = normalizeSpineFineCellCoordinate(cell);
  return getSpineBranchCells(branch, source).some(
    (branchCell) => branchCell.x === target.x && branchCell.y === target.y
  );
}

export function applyDeletedSpineFineCells<T extends FineGridCellLike>(
  fineGrid: T[][],
  deletedCells: SpineFineCellCoordinate[] = [],
  deletedBranches: SpineFineBranchRange[] = []
): Set<string> {
  const sourceCells = extractSpineFineCells(fineGrid);
  const deletedCellKeys = createSpineFineCellSet(deletedCells);

  for (const cell of expandDeletedSpineBranches(deletedBranches, sourceCells)) {
    deletedCellKeys.add(getSpineFineCellKey(cell.x, cell.y));
  }

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

/**
 * Trim N fine cells from each branch endpoint (dead-end).
 * This prevents the player from starting/ending pressed against walls.
 * Only trims from endpoints (cells with exactly 1 neighbor), not from junction nodes.
 */
export function trimSpineEndpoints<T extends FineGridCellLike>(
  fineGrid: T[][],
  trimCount: number
): void {
  if (trimCount <= 0) return;
  
  const cells = extractSpineFineCells(fineGrid);
  if (cells.length === 0) return;
  
  const cellSet = createSpineFineCellSet(cells);
  
  // Find all endpoints (cells with exactly 1 skeleton neighbor)
  const endpoints: SpineFineCellCoordinate[] = [];
  for (const cell of cells) {
    const neighbors = getNeighborSpineFineCells(cell, cellSet);
    if (neighbors.length === 1) {
      endpoints.push(cell);
    }
  }
  
  // For each endpoint, walk inward and remove up to trimCount cells
  for (const endpoint of endpoints) {
    let current = endpoint;
    let prev: SpineFineCellCoordinate | null = null;
    
    for (let i = 0; i < trimCount; i++) {
      const key = getSpineFineCellKey(current.x, current.y);
      if (!cellSet.has(key)) break;
      
      // Get neighbors of current cell (excluding prev)
      const neighbors = getNeighborSpineFineCells(current, cellSet);
      const nextNeighbors = prev 
        ? neighbors.filter(n => n.x !== prev!.x || n.y !== prev!.y)
        : neighbors;
      
      // Remove current cell
      const fineCell = fineGrid[current.y]?.[current.x];
      if (fineCell) {
        fineCell.isSkeleton = false;
        if ('isSpur' in fineCell) fineCell.isSpur = false;
      }
      cellSet.delete(key);
      
      // Move to next cell (if it has exactly 1 remaining neighbor after removal, it's still a chain)
      if (nextNeighbors.length === 0) break;
      prev = current;
      current = nextNeighbors[0];
      
      // Stop if we've reached a junction (don't trim past junctions)
      const currentNeighbors = getNeighborSpineFineCells(current, cellSet);
      if (currentNeighbors.length > 1) break; // Junction - stop trimming
    }
  }
}
