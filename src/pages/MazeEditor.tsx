import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download, Trash2, Grid3X3, Plus, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';

type CellType = '#' | ' ' | 'S' | 'E' | 'P' | 'H' | 'D'; // D = Dialogue trigger

interface DialogueMessage {
  speaker: string;
  speakerEmoji: string;
  message: string;
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
  triggersOnEnd?: boolean; // Trigger on end tile before level complete
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
      // For dialogue cells, add to selected dialogue's cells if one is selected
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
        setGrid(prev => {
          const newGrid = prev.map(row => [...row]);
          newGrid[y][x] = newGrid[y][x] === 'D' ? ' ' : 'D';
          return newGrid;
        });
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
    // Remove dialogue cells from grid
    const dialogueToRemove = dialogues.find(d => d.id === id);
    if (dialogueToRemove) {
      setGrid(prev => {
        const newGrid = prev.map(row => [...row]);
        dialogueToRemove.cells.forEach(({ x, y }) => {
          if (newGrid[y]?.[x] === 'D') {
            newGrid[y][x] = ' ';
          }
        });
        return newGrid;
      });
    }
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

  const generateSchema = useCallback(() => {
    const gridStrings = grid.map(row => row.join('').replace(/D/g, ' ')); // Replace D with space in output
    
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
      ${d.characterModel ? `characterModel: '${d.characterModel}',` : ''}
      ${d.characterAnimation ? `characterAnimation: '${d.characterAnimation}',` : ''}
      ${d.triggersOnEnd ? `triggersOnEnd: true,` : ''}
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
  medalTimes: { gold: 15, silver: 25, bronze: 40 },${dialogueSchema}${endConditionsSchema}
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

              {/* Dialogues Toggle */}
              <div className="pt-2 border-t">
                <Button 
                  onClick={() => setShowDialoguePanel(!showDialoguePanel)} 
                  variant="outline" 
                  className="w-full"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Dialogues ({dialogues.length})
                </Button>
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
                    const isSelectedDialogueCell = cellDialogue?.id === selectedDialogueId;
                    const dialogueIndex = cellDialogue ? getDialogueIndex(cellDialogue.id) + 1 : null;
                    const dialogueColor = cellDialogue ? getDialogueColor(cellDialogue.id) : null;
                    
                    // Use dialogue-specific color for D cells
                    const bgColor = cell === 'D' && dialogueColor 
                      ? dialogueColor 
                      : CELL_COLORS[cell];
                    
                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`w-5 h-5 border cursor-pointer transition-colors flex items-center justify-center text-[8px] font-bold text-white ${
                          isSelectedDialogueCell 
                            ? 'border-2 border-white ring-2 ring-yellow-300 z-10' 
                            : 'border-amber-900/20'
                        } ${bgColor}`}
                        onMouseDown={() => handleMouseDown(x, y)}
                        onMouseEnter={() => handleMouseEnter(x, y)}
                        title={cellDialogue ? `#${dialogueIndex}: ${cellDialogue.speaker} - "${cellDialogue.message.slice(0, 30)}..."` : undefined}
                      >
                        {cell === 'D' && dialogueIndex ? dialogueIndex : (cell !== '#' && cell !== ' ' ? cell : '')}
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

                      {/* Triggers on End checkbox */}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={dialogue.triggersOnEnd || false}
                          onChange={e => {
                            updateDialogue(dialogue.id, { triggersOnEnd: e.target.checked });
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                        <Label className="text-xs">Triggers on End tile (before level complete)</Label>
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