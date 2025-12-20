import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Download, Trash2, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';

type CellType = '#' | ' ' | 'S' | 'E' | 'P' | 'H';

interface MazeConfig {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  previewTime: number;
}

const CELL_LABELS: Record<CellType, string> = {
  '#': 'Wall',
  ' ': 'Path',
  'S': 'Start',
  'E': 'End',
  'P': 'Power-Up',
  'H': 'Station',
};

const CELL_COLORS: Record<CellType, string> = {
  '#': 'bg-amber-800 hover:bg-amber-700',
  ' ': 'bg-green-200 hover:bg-green-300',
  'S': 'bg-blue-500 hover:bg-blue-400',
  'E': 'bg-red-500 hover:bg-red-400',
  'P': 'bg-yellow-400 hover:bg-yellow-300',
  'H': 'bg-purple-500 hover:bg-purple-400',
};

const MazeEditor: React.FC = () => {
  const [width, setWidth] = useState(16);
  const [height, setHeight] = useState(16);
  const [grid, setGrid] = useState<CellType[][]>(() => createEmptyGrid(16, 16));
  const [selectedTool, setSelectedTool] = useState<CellType>('#');
  const [config, setConfig] = useState<MazeConfig>({
    name: 'New Maze',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
  });
  const [isDragging, setIsDragging] = useState(false);

  function createEmptyGrid(w: number, h: number): CellType[][] {
    // Create grid with walls on borders
    return Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return '#';
        if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) return '#';
        return ' ';
      })
    );
  }

  const resizeGrid = useCallback(() => {
    // Ensure even dimensions for 2x2 block system
    const evenWidth = width % 2 === 0 ? width : width + 1;
    const evenHeight = height % 2 === 0 ? height : height + 1;
    setGrid(createEmptyGrid(evenWidth, evenHeight));
    if (width !== evenWidth) setWidth(evenWidth);
    if (height !== evenHeight) setHeight(evenHeight);
  }, [width, height]);

  const paintCell = useCallback((x: number, y: number) => {
    // For S and E, paint 2x2 blocks starting at even coordinates
    if (selectedTool === 'S' || selectedTool === 'E') {
      const startX = x % 2 === 0 ? x : x - 1;
      const startY = y % 2 === 0 ? y : y - 1;
      
      setGrid(prev => {
        const newGrid = prev.map(row => [...row]);
        // Clear any existing S or E blocks first
        for (let py = 0; py < newGrid.length; py++) {
          for (let px = 0; px < newGrid[py].length; px++) {
            if (newGrid[py][px] === selectedTool) {
              newGrid[py][px] = ' ';
            }
          }
        }
        // Paint 2x2 block
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const nx = startX + dx;
            const ny = startY + dy;
            if (ny >= 0 && ny < newGrid.length && nx >= 0 && nx < newGrid[0].length) {
              newGrid[ny][nx] = selectedTool;
            }
          }
        }
        return newGrid;
      });
    } else {
      setGrid(prev => {
        const newGrid = prev.map(row => [...row]);
        newGrid[y][x] = selectedTool;
        return newGrid;
      });
    }
  }, [selectedTool]);

  const handleMouseDown = (x: number, y: number) => {
    setIsDragging(true);
    paintCell(x, y);
  };

  const handleMouseEnter = (x: number, y: number) => {
    if (isDragging) {
      paintCell(x, y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const generateSchema = useCallback(() => {
    const gridStrings = grid.map(row => row.join(''));
    
    const schema = `{
  id: ${Date.now()},
  name: '${config.name}',
  difficulty: '${config.difficulty}',
  timeLimit: ${config.timeLimit},
  previewTime: ${config.previewTime},
  grid: createGrid([
${gridStrings.map(row => `    '${row}',`).join('\n')}
  ]),
},`;
    
    return schema;
  }, [grid, config]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateSchema());
    toast.success('Schema copied to clipboard!');
  };

  const downloadSchema = () => {
    const blob = new Blob([generateSchema()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.toLowerCase().replace(/\s+/g, '-')}-maze.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Schema downloaded!');
  };

  const clearGrid = () => {
    setGrid(createEmptyGrid(width, height));
    toast.info('Grid cleared');
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-amber-100 to-green-200 p-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-amber-900 mb-6 text-center">
          🌽 Maze Editor
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Tools Panel */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cell Type Tools */}
              <div className="space-y-2">
                <Label>Paint Tool</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CELL_LABELS) as CellType[]).map(cell => (
                    <Button
                      key={cell}
                      variant={selectedTool === cell ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTool(cell)}
                      className={`text-xs ${selectedTool === cell ? '' : CELL_COLORS[cell]}`}
                    >
                      {CELL_LABELS[cell]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Grid Size */}
              <div className="space-y-2">
                <Label>Grid Size</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={width}
                    onChange={e => setWidth(Math.max(8, Math.min(50, parseInt(e.target.value) || 8)))}
                    min={8}
                    max={50}
                    className="w-20"
                  />
                  <span className="self-center">x</span>
                  <Input
                    type="number"
                    value={height}
                    onChange={e => setHeight(Math.max(8, Math.min(50, parseInt(e.target.value) || 8)))}
                    min={8}
                    max={50}
                    className="w-20"
                  />
                </div>
                <Button onClick={resizeGrid} size="sm" variant="outline" className="w-full">
                  <Grid3X3 className="w-4 h-4 mr-2" />
                  Apply Size
                </Button>
              </div>

              {/* Maze Config */}
              <div className="space-y-2">
                <Label>Maze Name</Label>
                <Input
                  value={config.name}
                  onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select
                  value={config.difficulty}
                  onValueChange={(v: 'easy' | 'medium' | 'hard') => setConfig(c => ({ ...c, difficulty: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Time Limit</Label>
                  <Input
                    type="number"
                    value={config.timeLimit}
                    onChange={e => setConfig(c => ({ ...c, timeLimit: parseInt(e.target.value) || 60 }))}
                    min={10}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preview Time</Label>
                  <Input
                    type="number"
                    value={config.previewTime}
                    onChange={e => setConfig(c => ({ ...c, previewTime: parseInt(e.target.value) || 5 }))}
                    min={1}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-4 border-t">
                <Button onClick={copyToClipboard} className="w-full" variant="default">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Schema
                </Button>
                <Button onClick={downloadSchema} className="w-full" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button onClick={clearGrid} className="w-full" variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Grid
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Grid Editor */}
          <Card className="lg:col-span-3 overflow-auto">
            <CardHeader>
              <CardTitle className="text-lg">Grid ({width}x{height})</CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="inline-grid gap-0 border border-amber-800 select-none"
                style={{ 
                  gridTemplateColumns: `repeat(${grid[0]?.length || 0}, minmax(0, 1fr))`,
                }}
              >
                {grid.map((row, y) =>
                  row.map((cell, x) => (
                    <div
                      key={`${x}-${y}`}
                      className={`w-5 h-5 border border-amber-900/20 cursor-pointer transition-colors ${CELL_COLORS[cell]} flex items-center justify-center text-[8px] font-bold text-white/80`}
                      onMouseDown={() => handleMouseDown(x, y)}
                      onMouseEnter={() => handleMouseEnter(x, y)}
                    >
                      {cell !== '#' && cell !== ' ' ? cell : ''}
                    </div>
                  ))
                )}
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {(Object.keys(CELL_LABELS) as CellType[]).map(cell => (
                  <div key={cell} className="flex items-center gap-1">
                    <div className={`w-4 h-4 ${CELL_COLORS[cell]} border border-amber-900/30`} />
                    <span>{CELL_LABELS[cell]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Schema Preview */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">Generated Schema</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto text-xs max-h-64">
              {generateSchema()}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MazeEditor;
