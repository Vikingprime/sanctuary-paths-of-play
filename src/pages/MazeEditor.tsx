import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download, Grid3X3, Plus, MessageSquare, X, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useMazeStorage, createGrid, gridToLayout } from '@/hooks/useMazeStorage';
import { Maze } from '@/types/game';

type CellType = '#' | ' ' | 'S' | 'E' | 'P' | 'H' | 'D'; // D = Dialogue trigger

interface DialogueMessage {
  speaker: string;
  speakerEmoji: string;
  message: string;
}

interface CharacterConfig {
  id: string;
  name: string;
  emoji: string;
  model: string;
  animation: string;
  position: { x: number; y: number } | null;
}

interface DialogueConfig {
  id: string;
  speaker: string;
  speakerEmoji: string;
  message: string;
  messages?: DialogueMessage[]; // Additional messages in sequence
  cells: { x: number; y: number }[];
  characterModel?: string;
  characterAnimation?: string;
  requires?: string[];
  speakerCharacterId?: string; // ID of a placed character to zoom to
}

interface MazeConfig {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  previewTime: number;
  requiredDialogues?: string[];
}

const CELL_LABELS: Record<CellType, string> = {
  '#': 'Wall',
  ' ': 'Path',
  'S': 'Start',
  'E': 'End',
  'P': 'Power-Up',
  'H': 'Station',
  'D': 'Dialogue',
};

const CELL_COLORS: Record<CellType, string> = {
  '#': 'bg-amber-800 hover:bg-amber-700',
  ' ': 'bg-green-200 hover:bg-green-300',
  'S': 'bg-blue-500 hover:bg-blue-400',
  'E': 'bg-red-500 hover:bg-red-400',
  'P': 'bg-yellow-400 hover:bg-yellow-300',
  'H': 'bg-purple-500 hover:bg-purple-400',
  'D': 'bg-pink-500 hover:bg-pink-400',
};

// Different colors for each dialogue so you can distinguish them
const DIALOGUE_COLORS = [
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-lime-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-amber-500',
];

const AVAILABLE_MODELS = [
  'Farmer.glb',
  'Animated_Woman.glb',
  'Cow.glb',
  'Pig.glb',
  'Hen.glb',
  'Hen_idle.glb',
  'Hen_walk.glb',
];

const AVAILABLE_ANIMATIONS = [
  'idle',
  'walk',
  'talk',
  'wave',
  'point',
  'celebrate',
];

const MazeEditor: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mazeIdParam = searchParams.get('mazeId');
  
  const { getAllMazes, getMaze, isLoaded } = useMazeStorage();
  
  const [width, setWidth] = useState(16);
  const [height, setHeight] = useState(16);
  const [grid, setGrid] = useState<CellType[][]>(() => createEmptyGrid(16, 16));
  const [selectedTool, setSelectedTool] = useState<CellType>('#');
  const [config, setConfig] = useState<MazeConfig>({
    name: 'New Maze',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
    requiredDialogues: [],
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dialogues, setDialogues] = useState<DialogueConfig[]>([]);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [showDialoguePanel, setShowDialoguePanel] = useState(false);
  const [characters, setCharacters] = useState<CharacterConfig[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [placingCharacterId, setPlacingCharacterId] = useState<string | null>(null);
  const [loadedMazeId, setLoadedMazeId] = useState<number | null>(null);
  const [singleTileMode, setSingleTileMode] = useState(false);
  const [showMazeList, setShowMazeList] = useState(true);

  function createEmptyGrid(w: number, h: number): CellType[][] {
    return Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return '#';
        if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) return '#';
        return ' ';
      })
    );
  }

  // Load maze by ID
  const loadMaze = useCallback((mazeId: number, showToast = true) => {
    const maze = getMaze(mazeId);
    if (!maze) {
      toast.error(`Maze with ID ${mazeId} not found`);
      return;
    }

    // Convert maze grid to editor format
    const newGrid: CellType[][] = maze.grid.map(row => 
      row.map(cell => {
        if (cell.isWall) return '#';
        if (cell.isStart) return 'S';
        if (cell.isEnd) return 'E';
        if (cell.isPowerUp) return 'P';
        if (cell.isStation) return 'H';
        return ' ';
      })
    );
    
    setGrid(newGrid);
    setWidth(newGrid[0]?.length || 16);
    setHeight(newGrid.length);
    setConfig({
      name: maze.name,
      difficulty: maze.difficulty,
      timeLimit: maze.timeLimit,
      previewTime: maze.previewTime,
      requiredDialogues: maze.endConditions?.requiredDialogues || [],
    });
    
    // Load dialogues
    if (maze.dialogues) {
      setDialogues(maze.dialogues.map(d => ({
        id: d.id,
        speaker: d.speaker,
        speakerEmoji: d.speakerEmoji,
        message: d.message,
        cells: d.cells,
        characterModel: d.characterModel,
        characterAnimation: d.characterAnimation,
        requires: d.requires,
        speakerCharacterId: d.speakerCharacterId,
      })));
    } else {
      setDialogues([]);
    }
    
    // Load characters
    if (maze.characters) {
      setCharacters(maze.characters.map(c => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        model: c.model,
        animation: c.animation,
        position: c.position,
      })));
    } else {
      setCharacters([]);
    }
    
    setLoadedMazeId(mazeId);
    setSearchParams({ mazeId: String(mazeId) });
    if (showToast) {
      toast.success(`Loaded: ${maze.name}`);
    }
  }, [getMaze, setSearchParams]);

  // Load maze from URL param on mount
  const hasInitiallyLoaded = useRef(false);
  useEffect(() => {
    if (isLoaded && mazeIdParam && !hasInitiallyLoaded.current) {
      hasInitiallyLoaded.current = true;
      const mazeId = parseInt(mazeIdParam, 10);
      if (!isNaN(mazeId)) {
        loadMaze(mazeId);
      }
    }
  }, [isLoaded, mazeIdParam, loadMaze]);

  const resizeGrid = useCallback(() => {
    const evenWidth = width % 2 === 0 ? width : width + 1;
    const evenHeight = height % 2 === 0 ? height : height + 1;
    setGrid(createEmptyGrid(evenWidth, evenHeight));
    if (width !== evenWidth) setWidth(evenWidth);
    if (height !== evenHeight) setHeight(evenHeight);
    setDialogues([]);
  }, [width, height]);

  const paintCell = useCallback((x: number, y: number) => {
    if (selectedTool === 'S' || selectedTool === 'E') {
      if (singleTileMode) {
        setGrid(prev => {
          const newGrid = prev.map(row => [...row]);
          newGrid[y][x] = selectedTool;
          return newGrid;
        });
      } else {
        const startX = x % 2 === 0 ? x : x - 1;
        const startY = y % 2 === 0 ? y : y - 1;
        
        setGrid(prev => {
          const newGrid = prev.map(row => [...row]);
          for (let py = 0; py < newGrid.length; py++) {
            for (let px = 0; px < newGrid[py].length; px++) {
              if (newGrid[py][px] === selectedTool) {
                newGrid[py][px] = ' ';
              }
            }
          }
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
      }
    } else if (selectedTool === 'D') {
      if (selectedDialogueId) {
        setDialogues(prev => prev.map(d => {
          if (d.id === selectedDialogueId) {
            const cellExists = d.cells.some(c => c.x === x && c.y === y);
            if (cellExists) {
              return { ...d, cells: d.cells.filter(c => !(c.x === x && c.y === y)) };
            } else {
              return { ...d, cells: [...d.cells, { x, y }] };
            }
          }
          return d;
        }));
      } else {
        toast.error('Select or create a dialogue first!');
      }
    } else {
      setGrid(prev => {
        const newGrid = prev.map(row => [...row]);
        newGrid[y][x] = selectedTool;
        return newGrid;
      });
    }
  }, [selectedTool, selectedDialogueId, singleTileMode]);

  const handleMouseDown = (x: number, y: number) => {
    if (placingCharacterId) {
      const char = characters.find(c => c.id === placingCharacterId);
      if (char) {
        updateCharacter(placingCharacterId, { position: { x, y } });
        toast.success(`${char.name} placed at (${x}, ${y})`);
        setPlacingCharacterId(null);
      }
      return;
    }
    
    setIsDragging(true);
    paintCell(x, y);
  };

  const handleMouseEnter = (x: number, y: number) => {
    if (isDragging && !placingCharacterId) {
      paintCell(x, y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const addDialogue = () => {
    const newId = `dialogue_${Date.now()}`;
    const newDialogue: DialogueConfig = {
      id: newId,
      speaker: 'Farmer',
      speakerEmoji: '👨‍🌾',
      message: 'Hello there!',
      cells: [],
      characterModel: 'Farmer.glb',
      characterAnimation: 'idle',
    };
    setDialogues(prev => [...prev, newDialogue]);
    setSelectedDialogueId(newId);
    setShowDialoguePanel(true);
    toast.success('Dialogue created! Now click cells on the grid to add trigger zones.');
  };

  const updateDialogue = (id: string, updates: Partial<DialogueConfig>) => {
    setDialogues(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const removeDialogue = (id: string) => {
    setDialogues(prev => prev.filter(d => d.id !== id));
    if (selectedDialogueId === id) {
      setSelectedDialogueId(null);
    }
    setConfig(c => ({
      ...c,
      requiredDialogues: c.requiredDialogues?.filter(did => did !== id) || []
    }));
  };

  const addCharacter = () => {
    const newId = `char_${Date.now()}`;
    const newChar: CharacterConfig = {
      id: newId,
      name: 'New Character',
      emoji: '🧑',
      model: 'Farmer.glb',
      animation: 'idle',
      position: null,
    };
    setCharacters(prev => [...prev, newChar]);
    setSelectedCharacterId(newId);
    setPlacingCharacterId(newId);
    setShowCharacterPanel(true);
    toast.success('Character created! Click on the grid to place them.');
  };

  const updateCharacter = (id: string, updates: Partial<CharacterConfig>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCharacter = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    if (selectedCharacterId === id) {
      setSelectedCharacterId(null);
    }
    if (placingCharacterId === id) {
      setPlacingCharacterId(null);
    }
    setDialogues(prev => prev.map(d => 
      d.speakerCharacterId === id ? { ...d, speakerCharacterId: undefined } : d
    ));
  };

  const getCharacterAtCell = (x: number, y: number): CharacterConfig | undefined => {
    return characters.find(c => c.position?.x === x && c.position?.y === y);
  };

  const generateSchema = useCallback(() => {
    const gridStrings = grid.map(row => row.join('').replace(/D/g, ' '));
    
    const charactersSchema = characters.filter(c => c.position).length > 0 ? `
  characters: [
${characters.filter(c => c.position).map(c => `    {
      id: '${c.id}',
      name: '${c.name}',
      emoji: '${c.emoji}',
      model: '${c.model}',
      animation: '${c.animation}',
      position: { x: ${c.position!.x}, y: ${c.position!.y} },
    }`).join(',\n')}
  ],` : '';
    
    const dialogueSchema = dialogues.length > 0 ? `
  dialogues: [
${dialogues.map(d => {
  const messagesStr = d.messages && d.messages.length > 0 
    ? `\n      messages: [\n${d.messages.map(m => `        { speaker: '${m.speaker}', speakerEmoji: '${m.speakerEmoji}', message: '${m.message.replace(/'/g, "\\'")}' }`).join(',\n')}\n      ],`
    : '';
  return `    {
      id: '${d.id}',
      speaker: '${d.speaker}',
      speakerEmoji: '${d.speakerEmoji}',
      message: '${d.message.replace(/'/g, "\\'")}',${messagesStr}
      cells: [${d.cells.map(c => `{ x: ${c.x}, y: ${c.y} }`).join(', ')}],
      ${d.speakerCharacterId ? `speakerCharacterId: '${d.speakerCharacterId}',` : ''}
      ${!d.speakerCharacterId && d.characterModel ? `characterModel: '${d.characterModel}',` : ''}
      ${d.characterAnimation ? `characterAnimation: '${d.characterAnimation}',` : ''}
      ${d.requires && d.requires.length > 0 ? `requires: [${d.requires.map(r => `'${r}'`).join(', ')}],` : ''}
    }`;
}).join(',\n')}
  ],` : '';

    const endConditionsSchema = config.requiredDialogues && config.requiredDialogues.length > 0 
      ? `
  endConditions: {
    requiredDialogues: [${config.requiredDialogues.map(d => `'${d}'`).join(', ')}],
  },` 
      : '';

    const schema = `{
  id: ${loadedMazeId || Date.now()},
  name: '${config.name}',
  difficulty: '${config.difficulty}',
  timeLimit: ${config.timeLimit},
  previewTime: ${config.previewTime},
  medalTimes: { gold: 15, silver: 25, bronze: 40 },${charactersSchema}${dialogueSchema}${endConditionsSchema}
  grid: createGrid([
${gridStrings.map(row => `    '${row}',`).join('\n')}
  ]),
},`;
    
    return schema;
  }, [grid, config, dialogues, characters, loadedMazeId]);

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
    setDialogues([]);
    setSelectedDialogueId(null);
    toast.info('Grid cleared');
  };

  const getCellDialogue = (x: number, y: number): DialogueConfig | undefined => {
    return dialogues.find(d => d.cells.some(c => c.x === x && c.y === y));
  };

  const getDialogueIndex = (id: string): number => {
    return dialogues.findIndex(d => d.id === id);
  };

  const getDialogueColor = (id: string): string => {
    const index = getDialogueIndex(id);
    return DIALOGUE_COLORS[index % DIALOGUE_COLORS.length];
  };

  const getValidationWarnings = useCallback((): string[] => {
    const warnings: string[] = [];
    
    const endCells: { x: number; y: number }[] = [];
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 'E') {
          endCells.push({ x, y });
        }
      });
    });
    
    if (endCells.length === 0) {
      warnings.push('⚠️ No end (goal) tiles set');
    }
    
    characters.forEach(char => {
      if (!char.position) {
        warnings.push(`⚠️ Character "${char.name}" is not placed on the grid`);
        return;
      }
      
      const charDialogue = dialogues.find(d => d.speakerCharacterId === char.id);
      
      if (!charDialogue) {
        warnings.push(`⚠️ Character "${char.name}" has no dialogue linked`);
      } else if (charDialogue.cells.length === 0) {
        warnings.push(`⚠️ Character "${char.name}" dialogue has no trigger cells`);
      } else {
        const charX = char.position.x;
        const charY = char.position.y;
        const hasNearbyTrigger = charDialogue.cells.some(c => 
          Math.abs(c.x - charX) <= 2 && Math.abs(c.y - charY) <= 2
        );
        
        if (!hasNearbyTrigger) {
          warnings.push(`⚠️ Character "${char.name}" dialogue triggers are far from character position`);
        }
      }
    });
    
    return warnings;
  }, [grid, dialogues, characters]);

  const allMazes = isLoaded ? getAllMazes() : [];

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-amber-100 to-green-200 p-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="text-amber-900">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Game
          </Button>
          <h1 className="text-2xl font-bold text-amber-900 text-center flex-1">
            🌽 Maze Editor (Read-Only Preview)
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowMazeList(!showMazeList)}>
              {showMazeList ? 'Hide' : 'Show'} Mazes
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Maze List Sidebar */}
          {showMazeList && (
            <Card className="w-64 shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  All Mazes ({allMazes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {allMazes.map((maze) => (
                  <div
                    key={maze.id}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                      loadedMazeId === maze.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted border-transparent'
                    }`}
                    onClick={() => loadMaze(maze.id, false)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate">{maze.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: {maze.id} • {maze.difficulty}
                    </div>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground text-center">
                    Edit mazes here, then copy schema to update mazes.ts
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Editor Area */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Tools Panel */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
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
                        onClick={() => {
                          setSelectedTool(cell);
                          if (cell === 'D') setShowDialoguePanel(true);
                        }}
                        className={`text-xs ${selectedTool === cell ? '' : CELL_COLORS[cell]}`}
                      >
                        {CELL_LABELS[cell]}
                      </Button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="singleTileMode"
                      checked={singleTileMode}
                      onChange={e => setSingleTileMode(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="singleTileMode" className="text-xs cursor-pointer">
                      Single tile mode (Start/End)
                    </Label>
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

                {/* Characters Toggle */}
                <div className="pt-2 border-t">
                  <Button 
                    onClick={() => setShowCharacterPanel(!showCharacterPanel)} 
                    variant={placingCharacterId ? 'default' : 'outline'}
                    className="w-full"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Characters ({characters.length})
                  </Button>
                </div>

                {/* Dialogues Toggle */}
                <div className="pt-2">
                  <Button 
                    onClick={() => setShowDialoguePanel(!showDialoguePanel)} 
                    variant="outline" 
                    className="w-full"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Dialogues ({dialogues.length})
                  </Button>
                </div>

                {/* Validation Warnings */}
                {(() => {
                  const warnings = getValidationWarnings();
                  if (warnings.length === 0) return null;
                  return (
                    <div className="p-2 bg-yellow-100 rounded-lg border border-yellow-400 space-y-1">
                      <div className="text-xs font-bold text-yellow-800">Validation Issues:</div>
                      {warnings.map((w, i) => (
                        <div key={i} className="text-xs text-yellow-700">{w}</div>
                      ))}
                    </div>
                  );
                })()}

                {/* Quick Actions */}
                <div className="pt-2 border-t flex gap-2">
                  <Button onClick={clearGrid} size="sm" variant="destructive" className="flex-1">
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Grid Editor */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Grid ({grid[0]?.length || 0} x {grid.length})</span>
                  {placingCharacterId && (
                    <span className="text-sm text-primary animate-pulse">
                      Click to place character...
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="overflow-auto max-h-[60vh] border rounded-lg p-2 bg-white"
                  style={{ touchAction: 'none' }}
                >
                  <div 
                    className="inline-grid gap-[1px]"
                    style={{ 
                      gridTemplateColumns: `repeat(${grid[0]?.length || 0}, minmax(16px, 1fr))`,
                    }}
                  >
                    {grid.map((row, y) =>
                      row.map((cell, x) => {
                        const dialogue = getCellDialogue(x, y);
                        const character = getCharacterAtCell(x, y);
                        const isDialogueCell = !!dialogue;
                        const dialogueColor = dialogue ? getDialogueColor(dialogue.id) : '';
                        const isSelectedDialogue = dialogue?.id === selectedDialogueId;
                        
                        return (
                          <div
                            key={`${x}-${y}`}
                            className={`
                              w-4 h-4 md:w-5 md:h-5 cursor-crosshair transition-colors relative
                              ${character ? 'ring-2 ring-purple-600' : ''}
                              ${isDialogueCell ? dialogueColor : CELL_COLORS[cell]}
                              ${isSelectedDialogue ? 'ring-2 ring-offset-1 ring-black' : ''}
                            `}
                            onMouseDown={() => handleMouseDown(x, y)}
                            onMouseEnter={() => handleMouseEnter(x, y)}
                            title={`(${x}, ${y}) ${CELL_LABELS[cell]}${dialogue ? ` - ${dialogue.speaker}` : ''}${character ? ` - ${character.name}` : ''}`}
                          >
                            {character && (
                              <span className="absolute inset-0 flex items-center justify-center text-[10px]">
                                {character.emoji}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview Panel */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Schema Output</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={copyToClipboard} title="Copy to clipboard">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={downloadSchema} title="Download">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={generateSchema()}
                  readOnly
                  className="font-mono text-xs h-[50vh] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Copy this schema and paste it into src/data/mazes.ts
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Character Panel */}
        {showCharacterPanel && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Characters</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addCharacter}>
                    <Plus className="w-4 h-4 mr-1" /> Add Character
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setShowCharacterPanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {characters.length === 0 ? (
                <p className="text-muted-foreground text-sm">No characters yet. Add one to place on the grid.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {characters.map(char => (
                    <Card 
                      key={char.id} 
                      className={`p-3 ${selectedCharacterId === char.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedCharacterId(char.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl">{char.emoji}</span>
                        <Button size="icon" variant="ghost" onClick={() => removeCharacter(char.id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Input
                          placeholder="Name"
                          value={char.name}
                          onChange={e => updateCharacter(char.id, { name: e.target.value })}
                          className="text-sm"
                        />
                        <Input
                          placeholder="Emoji"
                          value={char.emoji}
                          onChange={e => updateCharacter(char.id, { emoji: e.target.value })}
                          className="text-sm"
                        />
                        <Select
                          value={char.model}
                          onValueChange={v => updateCharacter(char.id, { model: v })}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_MODELS.map(m => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={char.animation}
                          onValueChange={v => updateCharacter(char.id, { animation: v })}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_ANIMATIONS.map(a => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant={placingCharacterId === char.id ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => setPlacingCharacterId(placingCharacterId === char.id ? null : char.id)}
                          >
                            {char.position ? `(${char.position.x}, ${char.position.y})` : 'Place'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialogue Panel */}
        {showDialoguePanel && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Dialogues</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addDialogue}>
                    <Plus className="w-4 h-4 mr-1" /> Add Dialogue
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setShowDialoguePanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dialogues.length === 0 ? (
                <p className="text-muted-foreground text-sm">No dialogues yet. Add one and click cells to set trigger zones.</p>
              ) : (
                <div className="space-y-4">
                  {/* Required dialogues selector */}
                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="text-sm font-semibold">Required for Completion:</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {dialogues.map(d => (
                        <Button
                          key={d.id}
                          size="sm"
                          variant={config.requiredDialogues?.includes(d.id) ? 'default' : 'outline'}
                          onClick={() => {
                            const isRequired = config.requiredDialogues?.includes(d.id);
                            setConfig(c => ({
                              ...c,
                              requiredDialogues: isRequired
                                ? c.requiredDialogues?.filter(id => id !== d.id)
                                : [...(c.requiredDialogues || []), d.id]
                            }));
                          }}
                        >
                          {d.speaker}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {dialogues.map((dialogue, index) => (
                      <Card 
                        key={dialogue.id} 
                        className={`p-3 ${selectedDialogueId === dialogue.id ? 'ring-2 ring-primary' : ''} ${DIALOGUE_COLORS[index % DIALOGUE_COLORS.length].replace('bg-', 'border-l-4 border-')}`}
                        onClick={() => {
                          setSelectedDialogueId(dialogue.id);
                          setSelectedTool('D');
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{dialogue.speaker}</span>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); removeDialogue(dialogue.id); }}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Speaker"
                              value={dialogue.speaker}
                              onChange={e => updateDialogue(dialogue.id, { speaker: e.target.value })}
                              className="flex-1 text-sm"
                              onClick={e => e.stopPropagation()}
                            />
                            <Input
                              placeholder="🧑"
                              value={dialogue.speakerEmoji}
                              onChange={e => updateDialogue(dialogue.id, { speakerEmoji: e.target.value })}
                              className="w-16 text-sm"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <Textarea
                            placeholder="Message..."
                            value={dialogue.message}
                            onChange={e => updateDialogue(dialogue.id, { message: e.target.value })}
                            className="text-sm"
                            rows={2}
                            onClick={e => e.stopPropagation()}
                          />
                          <div className="flex gap-2">
                            <Select
                              value={dialogue.speakerCharacterId || 'none'}
                              onValueChange={v => updateDialogue(dialogue.id, { 
                                speakerCharacterId: v === 'none' ? undefined : v,
                                characterModel: v === 'none' ? dialogue.characterModel : undefined
                              })}
                            >
                              <SelectTrigger className="text-sm" onClick={e => e.stopPropagation()}>
                                <SelectValue placeholder="Link to character..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No linked character</SelectItem>
                                {characters.filter(c => c.position).map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.emoji} {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {!dialogue.speakerCharacterId && (
                            <Select
                              value={dialogue.characterModel || 'Farmer.glb'}
                              onValueChange={v => updateDialogue(dialogue.id, { characterModel: v })}
                            >
                              <SelectTrigger className="text-sm" onClick={e => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVAILABLE_MODELS.map(m => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Trigger cells: {dialogue.cells.length === 0 ? 'Click grid to add' : dialogue.cells.map(c => `(${c.x},${c.y})`).join(' ')}
                          </div>
                          <div className="flex gap-2">
                            <Select
                              value={dialogue.requires?.join(',') || 'none'}
                              onValueChange={v => updateDialogue(dialogue.id, { 
                                requires: v === 'none' ? undefined : v.split(',').filter(Boolean)
                              })}
                            >
                              <SelectTrigger className="text-sm" onClick={e => e.stopPropagation()}>
                                <SelectValue placeholder="Requires..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No prerequisites</SelectItem>
                                {dialogues.filter(d => d.id !== dialogue.id).map(d => (
                                  <SelectItem key={d.id} value={d.id}>
                                    After: {d.speaker}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MazeEditor;
