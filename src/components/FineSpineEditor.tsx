import { type SpineFineCellCoordinate, getSpineFineCellKey } from '@/lib/spineFineCells';

interface FineSpineEditorProps {
  mazeWidth: number;
  mazeHeight: number;
  fineScale: number;
  fineSpineCells: SpineFineCellCoordinate[];
  deletedFineCellKeys: Set<string>;
  editable: boolean;
  editMode: 'cell' | 'branch';
  onToggleFineCell: (cell: SpineFineCellCoordinate) => void;
}

const FINE_CELL_RENDER_SIZE = 4;

const getBranchActionLabel = (cell: SpineFineCellCoordinate, isDeleted: boolean) =>
  `${isDeleted ? 'Restore' : 'Delete'} spine branch containing (${cell.x}, ${cell.y})`;

const getCellActionLabel = (cell: SpineFineCellCoordinate, isDeleted: boolean) =>
  `${isDeleted ? 'Restore' : 'Delete'} fine spine cell (${cell.x}, ${cell.y})`;

export function FineSpineEditor({
  mazeWidth,
  mazeHeight,
  fineScale,
  fineSpineCells,
  deletedFineCellKeys,
  editable,
  editMode,
  onToggleFineCell,
}: FineSpineEditorProps) {
  const fineWidth = mazeWidth * fineScale;
  const fineHeight = mazeHeight * fineScale;

  if (mazeWidth === 0 || mazeHeight === 0 || fineScale <= 0) {
    return null;
  }

  return (
    <div className="overflow-auto rounded-lg border bg-muted/20">
      <svg
        viewBox={`0 0 ${fineWidth} ${fineHeight}`}
        style={{
          width: fineWidth * FINE_CELL_RENDER_SIZE,
          height: fineHeight * FINE_CELL_RENDER_SIZE,
        }}
        className="block"
        aria-label="Fine spine editor"
      >
        <rect width={fineWidth} height={fineHeight} fill="hsl(var(--background))" />

        {Array.from({ length: mazeWidth + 1 }, (_, index) => {
          const x = index * fineScale;
          return (
            <line
              key={`vertical-${index}`}
              x1={x}
              y1={0}
              x2={x}
              y2={fineHeight}
              stroke="hsl(var(--border) / 0.7)"
              strokeWidth={0.18}
            />
          );
        })}

        {Array.from({ length: mazeHeight + 1 }, (_, index) => {
          const y = index * fineScale;
          return (
            <line
              key={`horizontal-${index}`}
              x1={0}
              y1={y}
              x2={fineWidth}
              y2={y}
              stroke="hsl(var(--border) / 0.7)"
              strokeWidth={0.18}
            />
          );
        })}

        {fineSpineCells.map((cell) => {
          const fineKey = getSpineFineCellKey(cell.x, cell.y);
          const isDeleted = deletedFineCellKeys.has(fineKey);

          return (
            <rect
              key={fineKey}
              x={cell.x}
              y={cell.y}
              width={1}
              height={1}
              onClick={() => onToggleFineCell(cell)}
              style={{
                fill: isDeleted ? 'hsl(var(--destructive) / 0.95)' : 'hsl(var(--primary) / 0.9)',
                cursor: editable ? 'pointer' : 'default',
                pointerEvents: editable ? 'auto' : 'none',
              }}
            >
              <title>
                {editMode === 'branch'
                  ? getBranchActionLabel(cell, isDeleted)
                  : getCellActionLabel(cell, isDeleted)}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
