import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download, Trash2, Grid3X3, Plus, MessageSquare, X, User } from 'lucide-react';
import { toast } from 'sonner';

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

  function createEmptyGrid(w: number, h: number): CellType[][] {
    return Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return '#';
        if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) return '#';
        return ' ';
      })
    );
  }

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
    } else if (selectedTool === 'D') {
      // For dialogue cells, add to selected dialogue's cells WITHOUT changing the grid cell type
      // This allows dialogue triggers to overlay any cell type (including End cells)
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
        // DON'T change the grid - dialogue is just an overlay
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
  }, [selectedTool, selectedDialogueId]);

  const handleMouseDown = (x: number, y: number) => {
    // If placing a character, handle that first
    if (placingCharacterId) {
      // Remove character from previous position if it had one
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
    // Dialogues are now just metadata - no grid changes needed
    setDialogues(prev => prev.filter(d => d.id !== id));
    if (selectedDialogueId === id) {
      setSelectedDialogueId(null);
    }
    // Remove from required dialogues
    setConfig(c => ({
      ...c,
      requiredDialogues: c.requiredDialogues?.filter(did => did !== id) || []
    }));
  };

  // Character management
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
    // Remove from dialogues that reference this character
    setDialogues(prev => prev.map(d => 
      d.speakerCharacterId === id ? { ...d, speakerCharacterId: undefined } : d
    ));
  };

  const getCharacterAtCell = (x: number, y: number): CharacterConfig | undefined => {
    return characters.find(c => c.position?.x === x && c.position?.y === y);
  };

  const generateSchema = useCallback(() => {
    const gridStrings = grid.map(row => row.join('').replace(/D/g, ' ')); // Replace D with space in output
    
    // Characters schema
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
  id: ${Date.now()},
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
  }, [grid, config, dialogues]);

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

  // Validation warnings
  const getValidationWarnings = useCallback((): string[] => {
    const warnings: string[] = [];
    
    // Find end cells
    const endCells: { x: number; y: number }[] = [];
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 'E') {
          endCells.push({ x, y });
        }
      });
    });
    
    if (endCells.length === 0) {
      warnings.push('⚠️ No end (goal) position set');
    } else {
      // Check if the end farmer has dialogue associated (speakerCharacterId = 'endFarmer')
      const endFarmerDialogue = dialogues.find(d => d.speakerCharacterId === 'endFarmer');
      
      if (!endFarmerDialogue) {
        // Check if any dialogue triggers overlap with end cells
        const hasDialogueOnEndCells = endCells.some(ec => 
          dialogues.some(d => d.cells.some(c => c.x === ec.x && c.y === ec.y))
        );
        
        if (!hasDialogueOnEndCells) {
          warnings.push('⚠️ End Farmer has no dialogue. Add dialogue and set "Speaker" to "🧑‍🌾 End Farmer" or place dialogue triggers on end cells.');
        }
      } else {
        // Check if endFarmer dialogue has trigger cells that overlap with end cells
        const endFarmerDialogueCellsOnEnd = endFarmerDialogue.cells.some(c => 
          endCells.some(ec => ec.x === c.x && ec.y === c.y)
        );
        
        if (!endFarmerDialogueCellsOnEnd && endFarmerDialogue.cells.length > 0) {
          warnings.push('⚠️ End Farmer dialogue trigger cells should overlap with End tiles');
        }
        
        if (endFarmerDialogue.cells.length === 0) {
          warnings.push('⚠️ End Farmer dialogue has no trigger cells - place dialogue triggers on/around end cells');
        }
      }
    }
    
    // Check placed characters
    characters.forEach(char => {
      if (!char.position) {
        warnings.push(`⚠️ Character "${char.name}" is not placed on the grid`);
        return;
      }
      
      // Check if character has dialogue associated
      const charDialogue = dialogues.find(d => d.speakerCharacterId === char.id);
      
      if (!charDialogue) {
        warnings.push(`⚠️ Character "${char.name}" has no dialogue linked`);
      } else if (charDialogue.cells.length === 0) {
        warnings.push(`⚠️ Character "${char.name}" dialogue has no trigger cells`);
      } else {
        // Check if any trigger cells are near the character
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
                {placingCharacterId && (
                  <p className="text-xs text-amber-600 mt-1 text-center">
                    Click grid to place character
                  </p>
                )}
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
          <Card className="lg:col-span-2 overflow-auto">
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
                  row.map((cell, x) => {
                    const cellDialogue = getCellDialogue(x, y);
                    const cellCharacter = getCharacterAtCell(x, y);
                    const isSelectedDialogueCell = cellDialogue?.id === selectedDialogueId;
                    const dialogueIndex = cellDialogue ? getDialogueIndex(cellDialogue.id) + 1 : null;
                    const dialogueColor = cellDialogue ? getDialogueColor(cellDialogue.id) : null;
                    const isPlacingMode = !!placingCharacterId;
                    
                    // Always use the base cell color - dialogue/character are overlays
                    const bgColor = CELL_COLORS[cell];
                    
                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`w-5 h-5 border cursor-pointer transition-colors flex items-center justify-center text-[8px] font-bold relative ${
                          isSelectedDialogueCell 
                            ? 'border-2 border-white ring-2 ring-yellow-300 z-10' 
                            : isPlacingMode 
                              ? 'border-amber-400 hover:border-amber-600' 
                              : 'border-amber-900/20'
                        } ${bgColor}`}
                        onMouseDown={() => handleMouseDown(x, y)}
                        onMouseEnter={() => handleMouseEnter(x, y)}
                        title={
                          cellCharacter 
                            ? `${cellCharacter.emoji} ${cellCharacter.name}` 
                            : cellDialogue 
                              ? `#${dialogueIndex}: ${cellDialogue.speaker} - "${cellDialogue.message.slice(0, 30)}..."` 
                              : undefined
                        }
                      >
                        {/* Show character emoji if placed here */}
                        {cellCharacter ? (
                          <span className="text-sm">{cellCharacter.emoji}</span>
                        ) : (
                          <span className="text-white">{cell !== '#' && cell !== ' ' ? cell : ''}</span>
                        )}
                        
                        {/* Dialogue overlay badge */}
                        {dialogueIndex && dialogueColor && (
                          <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${dialogueColor} flex items-center justify-center text-[6px] text-white font-bold border border-white`}>
                            {dialogueIndex}
                          </div>
                        )}
                      </div>
                    );
                  })
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

          {/* Character Panel */}
          {showCharacterPanel && (
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Characters</span>
                  <Button size="sm" onClick={addCharacter}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                {/* Built-in End Farmer info */}
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-xs">
                  <span className="font-medium">🧑‍🌾 End Farmer</span> - Built-in character at end tiles
                </div>
                
                {characters.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No custom characters. Click "Add" to create one.
                  </p>
                ) : (
                  characters.map(char => (
                    <div 
                      key={char.id} 
                      className={`p-3 rounded-lg border-2 space-y-2 ${
                        selectedCharacterId === char.id 
                          ? 'ring-2 ring-blue-400 border-gray-400 bg-white' 
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{char.emoji}</span>
                          <span className="font-semibold text-sm">{char.name}</span>
                          {char.position && (
                            <span className="text-xs text-muted-foreground">
                              ({char.position.x}, {char.position.y})
                            </span>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => removeCharacter(char.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={char.name}
                            onChange={e => updateCharacter(char.id, { name: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Emoji</Label>
                          <Input
                            value={char.emoji}
                            onChange={e => updateCharacter(char.id, { emoji: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Model</Label>
                          <Select
                            value={char.model}
                            onValueChange={v => updateCharacter(char.id, { model: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_MODELS.map(model => (
                                <SelectItem key={model} value={model}>{model.replace('.glb', '')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Animation</Label>
                          <Select
                            value={char.animation}
                            onValueChange={v => updateCharacter(char.id, { animation: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_ANIMATIONS.map(anim => (
                                <SelectItem key={anim} value={anim}>{anim}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={placingCharacterId === char.id ? 'default' : 'outline'}
                        className="w-full h-7 text-xs"
                        onClick={() => {
                          setPlacingCharacterId(placingCharacterId === char.id ? null : char.id);
                          setSelectedCharacterId(char.id);
                        }}
                      >
                        {placingCharacterId === char.id ? 'Click grid to place...' : (char.position ? 'Reposition' : 'Place on Grid')}
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Dialogue Panel */}
          {showDialoguePanel && (
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Dialogues</span>
                  <Button size="sm" onClick={addDialogue}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
                {dialogues.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No dialogues yet. Click "Add" to create one.
                  </p>
                ) : (
                  dialogues.map((dialogue, index) => (
                    <div 
                      key={dialogue.id} 
                      className={`p-3 rounded-lg border-2 space-y-2 cursor-pointer ${
                        selectedDialogueId === dialogue.id 
                          ? 'ring-2 ring-yellow-400 border-gray-400 bg-white' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        setSelectedDialogueId(dialogue.id);
                        setSelectedTool('D');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-sm ${getDialogueColor(dialogue.id)}`}>
                            {index + 1}
                          </div>
                          <span className="font-semibold text-sm">{dialogue.speakerEmoji} {dialogue.speaker}</span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={(e) => { e.stopPropagation(); removeDialogue(dialogue.id); }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Cell count indicator */}
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className={`w-3 h-3 rounded ${getDialogueColor(dialogue.id)}`}></span>
                        {dialogue.cells.length} trigger cell{dialogue.cells.length !== 1 ? 's' : ''} placed
                        {selectedDialogueId === dialogue.id && (
                          <span className="ml-auto text-amber-600 font-medium">← Click grid to add cells</span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Speaker</Label>
                          <Input
                            value={dialogue.speaker}
                            onChange={e => updateDialogue(dialogue.id, { speaker: e.target.value })}
                            className="h-8 text-xs"
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Emoji</Label>
                          <Input
                            value={dialogue.speakerEmoji}
                            onChange={e => updateDialogue(dialogue.id, { speakerEmoji: e.target.value })}
                            className="h-8 text-xs"
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">First Message</Label>
                        <Textarea
                          value={dialogue.message}
                          onChange={e => updateDialogue(dialogue.id, { message: e.target.value })}
                          className="h-12 text-xs"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>

                      {/* Follow-up messages */}
                      {dialogue.messages && dialogue.messages.length > 0 && (
                        <div className="space-y-2 pl-3 border-l-2 border-gray-300">
                          {dialogue.messages.map((msg, msgIndex) => (
                            <div key={msgIndex} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs text-muted-foreground">Message {msgIndex + 2}</Label>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newMessages = [...(dialogue.messages || [])];
                                    newMessages.splice(msgIndex, 1);
                                    updateDialogue(dialogue.id, { messages: newMessages });
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <Input
                                  value={msg.speaker}
                                  onChange={e => {
                                    const newMessages = [...(dialogue.messages || [])];
                                    newMessages[msgIndex] = { ...msg, speaker: e.target.value };
                                    updateDialogue(dialogue.id, { messages: newMessages });
                                  }}
                                  className="h-6 text-xs"
                                  placeholder="Speaker"
                                  onClick={e => e.stopPropagation()}
                                />
                                <Input
                                  value={msg.speakerEmoji}
                                  onChange={e => {
                                    const newMessages = [...(dialogue.messages || [])];
                                    newMessages[msgIndex] = { ...msg, speakerEmoji: e.target.value };
                                    updateDialogue(dialogue.id, { messages: newMessages });
                                  }}
                                  className="h-6 text-xs"
                                  placeholder="Emoji"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              <Textarea
                                value={msg.message}
                                onChange={e => {
                                  const newMessages = [...(dialogue.messages || [])];
                                  newMessages[msgIndex] = { ...msg, message: e.target.value };
                                  updateDialogue(dialogue.id, { messages: newMessages });
                                }}
                                className="h-10 text-xs"
                                placeholder="Message text"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newMessage: DialogueMessage = {
                            speaker: dialogue.speaker,
                            speakerEmoji: dialogue.speakerEmoji,
                            message: 'Continue message...'
                          };
                          updateDialogue(dialogue.id, { 
                            messages: [...(dialogue.messages || []), newMessage] 
                          });
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add follow-up message
                      </Button>

                      {/* Speaker Character - which placed character to zoom to */}
                      <div>
                        <Label className="text-xs">Speaker (zoom to this character)</Label>
                        <Select
                          value={dialogue.speakerCharacterId || 'none'}
                          onValueChange={v => updateDialogue(dialogue.id, { 
                            speakerCharacterId: v === 'none' ? undefined : v
                          })}
                        >
                          <SelectTrigger className="h-8 text-xs" onClick={e => e.stopPropagation()}>
                            <SelectValue placeholder="None (spawn new character)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (spawn new character)</SelectItem>
                            <SelectItem value="endFarmer">🧑‍🌾 End Farmer (built-in)</SelectItem>
                            {characters.filter(c => c.position).map(char => (
                              <SelectItem key={char.id} value={char.id}>
                                {char.emoji} {char.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dialogue.speakerCharacterId && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Camera will zoom to this character during dialogue.
                          </p>
                        )}
                      </div>

                      {/* Only show model options if NOT using a persistent speaker */}
                      {!dialogue.speakerCharacterId && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Character Model</Label>
                            <Select
                              value={dialogue.characterModel || 'none'}
                              onValueChange={v => updateDialogue(dialogue.id, { characterModel: v === 'none' ? undefined : v })}
                            >
                              <SelectTrigger className="h-8 text-xs" onClick={e => e.stopPropagation()}>
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {AVAILABLE_MODELS.map(model => (
                                  <SelectItem key={model} value={model}>{model.replace('.glb', '')}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Animation</Label>
                            <Select
                              value={dialogue.characterAnimation || ''}
                              onValueChange={v => updateDialogue(dialogue.id, { characterAnimation: v })}
                            >
                              <SelectTrigger className="h-8 text-xs" onClick={e => e.stopPropagation()}>
                                <SelectValue placeholder="Select animation" />
                              </SelectTrigger>
                              <SelectContent>
                                {AVAILABLE_ANIMATIONS.map(anim => (
                                  <SelectItem key={anim} value={anim}>{anim}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="text-xs">Requires (other dialogue IDs)</Label>
                        <Select
                          value=""
                          onValueChange={v => {
                            if (v && !dialogue.requires?.includes(v)) {
                              updateDialogue(dialogue.id, { 
                                requires: [...(dialogue.requires || []), v] 
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs" onClick={e => e.stopPropagation()}>
                            <SelectValue placeholder="Add requirement..." />
                          </SelectTrigger>
                          <SelectContent>
                            {dialogues.filter(d => d.id !== dialogue.id).map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.speaker}: {d.message.slice(0, 20)}...</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dialogue.requires && dialogue.requires.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {dialogue.requires.map(req => (
                              <span 
                                key={req} 
                                className="text-xs bg-gray-200 px-2 py-0.5 rounded flex items-center gap-1"
                              >
                                {dialogues.find(d => d.id === req)?.speaker || req}
                                <X 
                                  className="w-3 h-3 cursor-pointer" 
                                  onClick={e => {
                                    e.stopPropagation();
                                    updateDialogue(dialogue.id, { 
                                      requires: dialogue.requires?.filter(r => r !== req) 
                                    });
                                  }}
                                />
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Cells: {dialogue.cells.length} {selectedDialogueId === dialogue.id && '(click grid to add)'}
                      </div>

                      {/* Toggle required for end */}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.requiredDialogues?.includes(dialogue.id) || false}
                          onChange={e => {
                            if (e.target.checked) {
                              setConfig(c => ({
                                ...c,
                                requiredDialogues: [...(c.requiredDialogues || []), dialogue.id]
                              }));
                            } else {
                              setConfig(c => ({
                                ...c,
                                requiredDialogues: c.requiredDialogues?.filter(d => d !== dialogue.id)
                              }));
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                        <Label className="text-xs">Required to complete maze</Label>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
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