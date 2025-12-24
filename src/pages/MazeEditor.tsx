import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download, Trash2, Grid3X3, Plus, MessageSquare, X, User, ArrowLeft, Save, Upload, FileDown, RotateCcw, Check, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useMazeStorage, createGrid, gridToLayout } from '@/hooks/useMazeStorage';
import { Maze } from '@/types/game';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// Sortable maze item component for drag-and-drop
interface SortableMazeItemProps {
  maze: Maze;
  isSelected: boolean;
  isCustomized: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const SortableMazeItem: React.FC<SortableMazeItemProps> = ({
  maze,
  isSelected,
  isCustomized,
  onSelect,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: maze.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/10 border-primary'
          : 'hover:bg-muted border-transparent'
      } ${isDragging ? 'shadow-lg z-50' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium truncate">{maze.name}</span>
          {isCustomized && (
            <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded shrink-0">
              edited
            </span>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive hover:bg-destructive/10 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground ml-7">
        ID: {maze.id} • {maze.difficulty}
      </div>
    </div>
  );
};

const MazeEditor: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mazeIdParam = searchParams.get('mazeId');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    getAllMazes, 
    getMaze, 
    saveMaze, 
    deleteMaze, 
    createNewMaze, 
    isCustomized,
    resetToDefault,
    exportAllMazes,
    importMazes,
    reorderMazes,
    isLoaded 
  } = useMazeStorage();
  
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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
    setHasUnsavedChanges(false);
    setSearchParams({ mazeId: String(mazeId) });
    if (showToast) {
      toast.success(`Loaded: ${maze.name}`);
    }
  }, [getMaze, setSearchParams]);

  // Delete any maze by ID
  const handleDeleteMazeById = useCallback((mazeId: number, mazeName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${mazeName}"?`)) return;
    
    deleteMaze(mazeId);
    
    // If we deleted the currently loaded maze, clear the editor
    if (loadedMazeId === mazeId) {
      setLoadedMazeId(null);
      setSearchParams({});
      setGrid(createEmptyGrid(16, 16));
      setConfig({
        name: 'New Maze',
        difficulty: 'easy',
        timeLimit: 60,
        previewTime: 5,
        requiredDialogues: [],
      });
      setDialogues([]);
      setCharacters([]);
      setHasUnsavedChanges(false);
    }
    toast.success('Maze deleted');
  }, [loadedMazeId, deleteMaze, setSearchParams]);
  
  // Load maze from URL param on mount - only run once when storage is loaded
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

  // Mark unsaved changes
  useEffect(() => {
    if (loadedMazeId !== null) {
      setHasUnsavedChanges(true);
    }
  }, [grid, config, dialogues, characters]);

  const resizeGrid = useCallback(() => {
    const evenWidth = width % 2 === 0 ? width : width + 1;
    const evenHeight = height % 2 === 0 ? height : height + 1;
    setGrid(createEmptyGrid(evenWidth, evenHeight));
    if (width !== evenWidth) setWidth(evenWidth);
    if (height !== evenHeight) setHeight(evenHeight);
    setDialogues([]);
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
  }, [selectedTool, selectedDialogueId, singleTileMode]);

  const handleMouseDown = (x: number, y: number) => {
    if (placingCharacterId) {
      const char = characters.find(c => c.id === placingCharacterId);
      if (char) {
        updateCharacter(placingCharacterId, { position: { x, y } });
        toast.success(`${char.name} placed at (${x}, ${y})`);
        setPlacingCharacterId(null);
        setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
    toast.success('Dialogue created! Now click cells on the grid to add trigger zones.');
  };

  const updateDialogue = (id: string, updates: Partial<DialogueConfig>) => {
    setDialogues(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
    toast.success('Character created! Click on the grid to place them.');
  };

  const updateCharacter = (id: string, updates: Partial<CharacterConfig>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
  };

  const getCharacterAtCell = (x: number, y: number): CharacterConfig | undefined => {
    return characters.find(c => c.position?.x === x && c.position?.y === y);
  };

  // Build current maze object
  const buildCurrentMaze = useCallback((): Maze => {
    const mazeGrid = grid.map((row, y) =>
      row.map((cell, x) => ({
        x,
        y,
        isWall: cell === '#',
        isStart: cell === 'S',
        isEnd: cell === 'E',
        isPowerUp: cell === 'P',
        isStation: cell === 'H',
        powerUpType: cell === 'P' ? 'time' as const : undefined,
        brand: cell === 'P' ? 'T-Mobile' : undefined,
      }))
    );

    return {
      id: loadedMazeId || Date.now(),
      name: config.name,
      difficulty: config.difficulty,
      timeLimit: config.timeLimit,
      previewTime: config.previewTime,
      medalTimes: { gold: 30, silver: 45, bronze: 60 },
      characters: characters.filter(c => c.position).map(c => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        model: c.model,
        animation: c.animation,
        position: c.position!,
      })),
      dialogues: dialogues.map(d => ({
        id: d.id,
        speaker: d.speaker,
        speakerEmoji: d.speakerEmoji,
        message: d.message,
        cells: d.cells,
        characterModel: d.characterModel,
        characterAnimation: d.characterAnimation,
        requires: d.requires,
        speakerCharacterId: d.speakerCharacterId,
      })),
      endConditions: config.requiredDialogues && config.requiredDialogues.length > 0 
        ? { requiredDialogues: config.requiredDialogues } 
        : undefined,
      grid: mazeGrid,
    };
  }, [grid, config, characters, dialogues, loadedMazeId]);

  // Save current maze
  const handleSaveMaze = useCallback(() => {
    const maze = buildCurrentMaze();
    saveMaze(maze);
    setLoadedMazeId(maze.id);
    setHasUnsavedChanges(false);
    toast.success(`Saved: ${maze.name}`);
  }, [buildCurrentMaze, saveMaze]);

  // Create new maze
  const handleCreateNew = useCallback(() => {
    const newMaze = createNewMaze();
    loadMaze(newMaze.id);
  }, [createNewMaze, loadMaze]);

  // Delete current maze
  const handleDeleteMaze = useCallback(() => {
    if (!loadedMazeId) return;
    if (!confirm('Are you sure you want to delete this maze?')) return;
    
    deleteMaze(loadedMazeId);
    setLoadedMazeId(null);
    setSearchParams({});
    setGrid(createEmptyGrid(16, 16));
    setConfig({
      name: 'New Maze',
      difficulty: 'easy',
      timeLimit: 60,
      previewTime: 5,
      requiredDialogues: [],
    });
    setDialogues([]);
    setCharacters([]);
    setHasUnsavedChanges(false);
    toast.success('Maze deleted');
  }, [loadedMazeId, deleteMaze, setSearchParams]);

  // Reset to default
  const handleResetToDefault = useCallback(() => {
    if (!loadedMazeId) return;
    if (!confirm('Reset this maze to its default state? Your changes will be lost.')) return;
    
    resetToDefault(loadedMazeId);
    loadMaze(loadedMazeId);
    toast.success('Reset to default');
  }, [loadedMazeId, resetToDefault, loadMaze]);

  // Export all mazes
  const handleExportAll = useCallback(() => {
    const json = exportAllMazes();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-mazes.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('All mazes exported!');
  }, [exportAllMazes]);

  // Import mazes
  const handleImportMazes = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = importMazes(content);
      if (result.success) {
        toast.success(`Imported ${result.count} mazes!`);
        // Reload current maze if it was updated
        if (loadedMazeId) {
          loadMaze(loadedMazeId);
        }
      } else {
        toast.error(`Import failed: ${result.error}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [importMazes, loadedMazeId, loadMaze]);

  // DnD sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const currentMazes = getAllMazes();
      const oldIndex = currentMazes.findIndex(m => m.id === active.id);
      const newIndex = currentMazes.findIndex(m => m.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentMazes.map(m => m.id), oldIndex, newIndex);
        reorderMazes(newOrder);
      }
    }
  }, [getAllMazes, reorderMazes]);

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
    setHasUnsavedChanges(true);
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
            🌽 Maze Editor {loadedMazeId && hasUnsavedChanges && <span className="text-orange-600 text-sm">(unsaved)</span>}
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
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>All Mazes ({allMazes.length})</span>
                  <Button size="sm" variant="default" onClick={handleCreateNew}>
                    <Plus className="w-3 h-3 mr-1" /> New
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={allMazes.map(m => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {allMazes.map((maze) => (
                      <SortableMazeItem
                        key={maze.id}
                        maze={maze}
                        isSelected={loadedMazeId === maze.id}
                        isCustomized={isCustomized(maze.id)}
                        onSelect={() => loadMaze(maze.id, false)}
                        onDelete={(e) => handleDeleteMazeById(maze.id, maze.name, e)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                
                {/* Import/Export buttons */}
                <div className="pt-4 border-t space-y-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={handleExportAll}>
                    <FileDown className="w-3 h-3 mr-1" /> Export All
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-3 h-3 mr-1" /> Import
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportMazes}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Editor Area */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Tools Panel */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Tools</span>
                  {loadedMazeId && (
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        onClick={handleSaveMaze}
                        variant={hasUnsavedChanges ? "default" : "outline"}
                      >
                        <Save className="w-3 h-3 mr-1" /> Save
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Save/Delete actions for loaded maze */}
                {loadedMazeId && (
                  <div className="flex gap-2 pb-2 border-b">
                    {isCustomized(loadedMazeId) && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="flex-1 text-xs"
                        onClick={handleResetToDefault}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="flex-1 text-xs text-destructive"
                      onClick={handleDeleteMaze}
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                )}

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

                {/* Schema Actions */}
                <div className="space-y-2 pt-4 border-t">
                  <Button onClick={copyToClipboard} className="w-full" variant="outline" size="sm">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Schema
                  </Button>
                  <Button onClick={downloadSchema} className="w-full" variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download Schema
                  </Button>
                  <Button onClick={clearGrid} className="w-full" variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Grid
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Grid Editor */}
            <Card className="lg:col-span-2 overflow-auto">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {loadedMazeId ? config.name : 'New Maze'} ({width}x{height})
                </CardTitle>
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
                          {cellCharacter ? (
                            <span className="text-sm">{cellCharacter.emoji}</span>
                          ) : (
                            <span className="text-white">{cell !== '#' && cell !== ' ' ? cell : ''}</span>
                          )}
                          
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
                <div className="mt-4 flex flex-wrap gap-3 text-xs">
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
                  {characters.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No characters. Click "Add" to create one.
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
                        
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className={`w-3 h-3 rounded ${getDialogueColor(dialogue.id)}`}></span>
                          {dialogue.cells.length} trigger cell{dialogue.cells.length !== 1 ? 's' : ''} placed
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
                          <Label className="text-xs">Message</Label>
                          <Textarea
                            value={dialogue.message}
                            onChange={e => updateDialogue(dialogue.id, { message: e.target.value })}
                            className="h-12 text-xs"
                            onClick={e => e.stopPropagation()}
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Speaker Character</Label>
                          <Select
                            value={dialogue.speakerCharacterId || 'none'}
                            onValueChange={v => updateDialogue(dialogue.id, { 
                              speakerCharacterId: v === 'none' ? undefined : v
                            })}
                          >
                            <SelectTrigger className="h-8 text-xs" onClick={e => e.stopPropagation()}>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (spawn new)</SelectItem>
                              {characters.filter(c => c.position).map(char => (
                                <SelectItem key={char.id} value={char.id}>
                                  {char.emoji} {char.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

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
                              setHasUnsavedChanges(true);
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                          <Label className="text-xs">Required to complete</Label>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Schema Preview */}
        <Card className="mt-4">
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Generated Schema</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto text-xs max-h-40">
              {generateSchema()}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MazeEditor;
