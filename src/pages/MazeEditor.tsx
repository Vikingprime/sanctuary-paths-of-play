import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, Grid3X3, Plus, MessageSquare, X, User, ArrowLeft, Apple, Route, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { FineSpineEditor } from '@/components/FineSpineEditor';
import { useMazeStorage, createGrid } from '@/hooks/useMazeStorage';
import { Maze, DialogueSequenceItem, CardinalDirection, DirectionalVision, TurningConfig, RelativeVisionZone, ConeVisionConfig, MazeObstacle, PushableBarrel } from '@/types/game';
import { useBackButton } from '@/hooks/useBackButton';
import { animalAppleDialogues, AnimalAppleDialogues, AppleDialogue, getAppleDialogueCount } from '@/data/appleDialogues';
import { canBeFedApples } from '@/types/appleDialogue';
import { buildMazeEditorSpine, cellsTouchSpine, getMazeCellKey } from '@/lib/mazeEditorSpine';
import { branchContainsFineCell, expandDeletedSpineBranches, getSpineBranchCells, getSpineBranchRangeForCell, getSpineFineCellKey, normalizeSpineFineBranches, normalizeSpineFineCells, SPINE_FINE_GRID_SCALE, type SpineFineBranchRange, type SpineFineCellCoordinate } from '@/lib/spineFineCells';
import { getCharacterAnimations } from '@/game/CharacterConfig';
import { generateConeVisionOffsets } from '@/game/NPCRuntime';
import { 
  EditorPalette, 
  DRAG_TYPE_CHARACTER, 
  DRAG_TYPE_OBSTACLE, 
  DRAG_TYPE_PUSHABLE_BARREL,
  DRAG_TYPE_PLACED_CHARACTER, 
  DRAG_TYPE_PLACED_OBSTACLE,
  DRAG_TYPE_PLACED_PUSHABLE_BARREL,
  type DragCharacterData,
  type DragObstacleData,
  type DragPushableBarrelData,
} from '@/components/maze-editor/EditorPalette';

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
  dialogueSequence?: DialogueSequenceItem[];
  visionDialogueId?: string;
  directionalVision?: DirectionalVision;
  coneVision?: ConeVisionConfig;
  turning?: TurningConfig;
  luredByBait?: boolean;
}

interface ObstacleConfig {
  id: string;
  model: string;
  position: { x: number; y: number } | null;
  rotation?: number;
}

interface PushableBarrelConfig {
  id: string;
  model: string;
  position: { x: number; y: number } | null;
}

type VisionConePreset = 'none' | 'narrow' | 'wide' | 'long';

const VISION_CONE_PRESETS: Record<VisionConePreset, { label: string; description: string }> = {
  none: { label: 'None', description: 'No vision' },
  narrow: { label: 'Narrow', description: '1-wide, 3 deep' },
  wide: { label: 'Wide', description: '3-wide, 2 deep' },
  long: { label: 'Long', description: '1-wide, 5 deep' },
};

// Generate relative vision cells for a cone preset facing north (dy negative = north)
// Other directions are derived by rotating these offsets
function generateConeOffsets(preset: VisionConePreset): { dx: number; dy: number }[] {
  switch (preset) {
    case 'narrow':
      return [
        { dx: 0, dy: -1 }, { dx: 0, dy: -2 }, { dx: 0, dy: -3 },
      ];
    case 'wide':
      return [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: -2 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 },
      ];
    case 'long':
      return [
        { dx: 0, dy: -1 }, { dx: 0, dy: -2 }, { dx: 0, dy: -3 },
        { dx: 0, dy: -4 }, { dx: 0, dy: -5 },
      ];
    default:
      return [];
  }
}

// Rotate "north-facing" offsets to another direction
function rotateOffsets(cells: { dx: number; dy: number }[], dir: CardinalDirection): { dx: number; dy: number }[] {
  return cells.map(({ dx, dy }) => {
    switch (dir) {
      case 'north': return { dx, dy };
      case 'south': return { dx: -dx, dy: -dy };
      case 'east': return { dx: -dy, dy: dx };
      case 'west': return { dx: dy, dy: -dx };
    }
  });
}

const ALL_DIRECTIONS: CardinalDirection[] = ['north', 'south', 'east', 'west'];
const DIRECTION_LABELS: Record<CardinalDirection, string> = {
  north: '⬆ North', south: '⬇ South', east: '➡ East', west: '⬅ West',
};

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
  timerDisabled?: boolean;
  requiredDialogues?: string[];
  goalCharacterId?: string;
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

// Raw hex colors matching DIALOGUE_COLORS for use in CSS gradients
const DIALOGUE_HEX_COLORS = [
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
  '#f59e0b',
];

const AVAILABLE_MODELS = [
  'Farmer.glb',
  'Animated_Woman.glb',
  'Cow.glb',
  'Pig.glb',
  'Hen.glb',
  'Hen_idle.glb',
  'Hen_walk.glb',
  'Rat.glb',
  'Hamster.glb',
  'Kangaroo_rat.glb',
  'Squirrel.glb',
  'Rat-2.glb',
  'Spiny_mouse.glb',
  'Sparrow.glb',
  'Bush_with_Berries.glb',
];

const OBSTACLE_MODELS = [
  'Log.glb',
  'Log_with_Fungus.glb',
];



type SpineEditMode = 'cell' | 'branch';

const getSpineBranchKey = (branch: SpineFineBranchRange) =>
  `${getSpineFineCellKey(branch.start.x, branch.start.y)}:${getSpineFineCellKey(branch.end.x, branch.end.y)}`;

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
    timerDisabled: false,
    goalCharacterId: undefined,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dialogues, setDialogues] = useState<DialogueConfig[]>([]);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [showDialoguePanel, setShowDialoguePanel] = useState(false);
  const [characters, setCharacters] = useState<CharacterConfig[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [placingCharacterId, setPlacingCharacterId] = useState<string | null>(null);
  // Legacy vision painting removed - vision is now always cone-based
  const [obstacles, setObstacles] = useState<ObstacleConfig[]>([]);
  const [showObstaclePanel, setShowObstaclePanel] = useState(false);
  const [placingObstacleId, setPlacingObstacleId] = useState<string | null>(null);
  const [pushableBarrels, setPushableBarrels] = useState<PushableBarrelConfig[]>([]);
  const [placingPushableBarrelId, setPlacingPushableBarrelId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ x: number; y: number } | null>(null);
  const [loadedMazeId, setLoadedMazeId] = useState<number | null>(null);
  const [singleTileMode, setSingleTileMode] = useState(false);
  
  const [showAppleDialoguePanel, setShowAppleDialoguePanel] = useState(false);
  const [showSpineOverlay, setShowSpineOverlay] = useState(true);
  const [enableFineSpineEditing, setEnableFineSpineEditing] = useState(false);
  const [spineEditMode, setSpineEditMode] = useState<SpineEditMode>('branch');
  const [deletedSpineFineCells, setDeletedSpineFineCells] = useState<SpineFineCellCoordinate[]>([]);
  const [deletedSpineBranches, setDeletedSpineBranches] = useState<SpineFineBranchRange[]>([]);
  const [editableAppleDialogues, setEditableAppleDialogues] = useState<AnimalAppleDialogues[]>(() => 
    JSON.parse(JSON.stringify(animalAppleDialogues))
  );
  const normalizedDeletedSpineFineCells = useMemo(
    () => normalizeSpineFineCells(deletedSpineFineCells),
    [deletedSpineFineCells]
  );
  const normalizedDeletedSpineBranches = useMemo(
    () => normalizeSpineFineBranches(deletedSpineBranches),
    [deletedSpineBranches]
  );
  const deletedSpineFineCellKeys = useMemo(
    () => new Set(normalizedDeletedSpineFineCells.map((cell) => getSpineFineCellKey(cell.x, cell.y))),
    [normalizedDeletedSpineFineCells]
  );
  const baseSpineAnalysis = useMemo(() => buildMazeEditorSpine(grid), [grid]);
  const deletedSpineBranchCellKeys = useMemo(() => {
    if (!baseSpineAnalysis) return new Set<string>();

    return new Set(
      expandDeletedSpineBranches(normalizedDeletedSpineBranches, baseSpineAnalysis.fineSpineCellKeys).map((cell) =>
        getSpineFineCellKey(cell.x, cell.y)
      )
    );
  }, [baseSpineAnalysis, normalizedDeletedSpineBranches]);
  const deletedSpineCellKeys = useMemo(
    () => new Set([...deletedSpineFineCellKeys, ...deletedSpineBranchCellKeys]),
    [deletedSpineBranchCellKeys, deletedSpineFineCellKeys]
  );
  const spineAnalysis = useMemo(
    () => normalizedDeletedSpineFineCells.length === 0 && normalizedDeletedSpineBranches.length === 0
      ? baseSpineAnalysis
      : buildMazeEditorSpine(grid, normalizedDeletedSpineFineCells, normalizedDeletedSpineBranches),
    [baseSpineAnalysis, grid, normalizedDeletedSpineFineCells, normalizedDeletedSpineBranches]
  );

  // Hardware back button - navigate back to home
  useBackButton(() => navigate('/'), true);

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
      timerDisabled: maze.timerDisabled || false,
      goalCharacterId: maze.goalCharacterId,
    });
    setDeletedSpineBranches(normalizeSpineFineBranches(maze.deletedSpineBranches || []));
    setDeletedSpineFineCells(normalizeSpineFineCells(maze.deletedSpineFineCells || []));
    
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
        visionDialogueId: c.visionDialogueId || undefined,
        directionalVision: c.directionalVision || undefined,
        coneVision: c.coneVision || undefined,
        turning: c.turning || undefined,
      })));
    } else {
      setCharacters([]);
    }
    
    // Load obstacles
    if (maze.obstacles) {
      setObstacles(maze.obstacles.map(o => ({
        id: o.id,
        model: o.model,
        position: o.position,
        rotation: o.rotation,
      })));
    } else {
      setObstacles([]);
    }

    // Load pushable barrels
    if (maze.pushableBarrels) {
      setPushableBarrels(maze.pushableBarrels.map(b => ({
        id: b.id,
        model: b.model,
        position: b.position,
      })));
    } else {
      setPushableBarrels([]);
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
    setDeletedSpineBranches([]);
    setDeletedSpineFineCells([]);
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
      // When placing a wall, remove this cell from all dialogue trigger zones
      if (selectedTool === '#') {
        setDialogues(prev => prev.map(d => ({
          ...d,
          cells: d.cells.filter(c => !(c.x === x && c.y === y)),
        })));
      }
    }
  }, [selectedTool, selectedDialogueId, singleTileMode]);

  // Vision painting removed - vision is now cone-based only

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
    if (placingObstacleId) {
      setObstacles(prev => prev.map(o => 
        o.id === placingObstacleId ? { ...o, position: { x, y } } : o
      ));
      toast.success(`Obstacle placed at (${x}, ${y})`);
      setPlacingObstacleId(null);
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

  const toggleDeletedSpineFineCell = useCallback((cell: SpineFineCellCoordinate) => {
    if (!enableFineSpineEditing) return;

    setDeletedSpineFineCells((prev) => {
      const nextKeys = new Set(normalizeSpineFineCells(prev).map((fineCell) => getSpineFineCellKey(fineCell.x, fineCell.y)));
      const fineKey = getSpineFineCellKey(cell.x, cell.y);

      if (!baseSpineAnalysis?.fineSpineCellKeys.has(fineKey) && !nextKeys.has(fineKey)) {
        return prev;
      }

      if (nextKeys.has(fineKey)) {
        nextKeys.delete(fineKey);
      } else {
        nextKeys.add(fineKey);
      }

      return normalizeSpineFineCells(
        Array.from(nextKeys).map((key) => {
          const [x, y] = key.split(',').map(Number);
          return { x, y };
        })
      );
    });
  }, [baseSpineAnalysis, enableFineSpineEditing]);

  const toggleDeletedSpineBranch = useCallback((cell: SpineFineCellCoordinate) => {
    if (!enableFineSpineEditing || !baseSpineAnalysis) return;

    const sourceSet = baseSpineAnalysis.fineSpineCellKeys;
    const existingBranch = normalizedDeletedSpineBranches.find((branch) => branchContainsFineCell(branch, cell, sourceSet));

    if (existingBranch) {
      const existingKey = getSpineBranchKey(existingBranch);
      setDeletedSpineBranches((prev) =>
        normalizeSpineFineBranches(prev).filter((branch) => getSpineBranchKey(branch) !== existingKey)
      );
      toast.success('Branch restored.');
      return;
    }

    const branch = getSpineBranchRangeForCell(cell, sourceSet);
    if (!branch) {
      toast.error('Click a non-junction fine spine cell below to delete a full branch.');
      return;
    }

    const branchCellCount = getSpineBranchCells(branch, sourceSet).length;
    setDeletedSpineBranches((prev) => normalizeSpineFineBranches([...prev, branch]));
    toast.success(`Deleted branch (${branchCellCount} fine cells).`);
  }, [baseSpineAnalysis, enableFineSpineEditing, normalizedDeletedSpineBranches]);

  const handleFineSpineToggle = useCallback((cell: SpineFineCellCoordinate) => {
    if (spineEditMode === 'branch') {
      toggleDeletedSpineBranch(cell);
      return;
    }

    toggleDeletedSpineFineCell(cell);
  }, [spineEditMode, toggleDeletedSpineBranch, toggleDeletedSpineFineCell]);

  const addDialogue = (preLinkedCharacterId?: string) => {
    const newId = `dialogue_${Date.now()}`;
    const linkedChar = preLinkedCharacterId ? characters.find(c => c.id === preLinkedCharacterId) : undefined;
    const newDialogue: DialogueConfig = {
      id: newId,
      speaker: linkedChar?.name || 'Farmer',
      speakerEmoji: linkedChar?.emoji || '👨‍🌾',
      message: 'Hello there!',
      cells: [],
      characterModel: linkedChar ? undefined : 'Farmer.glb',
      characterAnimation: 'idle',
      speakerCharacterId: preLinkedCharacterId,
    };
    setDialogues(prev => [...prev, newDialogue]);
    setSelectedDialogueId(newId);
    setSelectedTool('D');
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




  const getObstacleAtCell = (x: number, y: number): ObstacleConfig | undefined => {
    return obstacles.find(o => o.position?.x === x && o.position?.y === y);
  };

  const getPushableBarrelAtCell = (x: number, y: number): PushableBarrelConfig | undefined => {
    return pushableBarrels.find(b => b.position?.x === x && b.position?.y === y);
  };

  const addObstacle = () => {
    const newId = `obstacle_${Date.now()}`;
    const newObstacle: ObstacleConfig = {
      id: newId,
      model: 'Log.glb',
      position: null,
      rotation: 0,
    };
    setObstacles(prev => [...prev, newObstacle]);
    setPlacingObstacleId(newId);
    setShowObstaclePanel(true);
    toast.success('Obstacle created! Click on the grid to place it.');
  };

  const removeObstacle = (id: string) => {
    setObstacles(prev => prev.filter(o => o.id !== id));
    if (placingObstacleId === id) setPlacingObstacleId(null);
  };

  // --- Drag-and-Drop Handlers ---
  const handleGridDragOver = useCallback((e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCell({ x, y });
  }, []);

  const handleGridDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  const handleGridDrop = useCallback((e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    setDragOverCell(null);

    // Check for new character drop
    const charData = e.dataTransfer.getData(DRAG_TYPE_CHARACTER);
    if (charData) {
      try {
        const data: DragCharacterData = JSON.parse(charData);
        const newId = `char_${Date.now()}`;
        const newChar: CharacterConfig = {
          id: newId,
          name: data.name,
          emoji: data.emoji,
          model: data.model,
          animation: data.defaultAnimation,
          position: { x, y },
        };
        setCharacters(prev => [...prev, newChar]);
        setSelectedCharacterId(newId);
        setShowCharacterPanel(true);
        toast.success(`${data.name} placed at (${x}, ${y})`);
      } catch {}
      return;
    }

    // Check for new obstacle drop
    const obsData = e.dataTransfer.getData(DRAG_TYPE_OBSTACLE);
    if (obsData) {
      try {
        const data: DragObstacleData = JSON.parse(obsData);
        const newId = `obstacle_${Date.now()}`;
        setObstacles(prev => [...prev, {
          id: newId,
          model: data.model,
          position: { x, y },
          rotation: 0,
        }]);
        setShowObstaclePanel(true);
        toast.success(`Obstacle placed at (${x}, ${y})`);
      } catch {}
      return;
    }

    // Check for new pushable barrel drop
    const pushData = e.dataTransfer.getData(DRAG_TYPE_PUSHABLE_BARREL);
    if (pushData) {
      try {
        const data: DragPushableBarrelData = JSON.parse(pushData);
        const newId = `pushbarrel_${Date.now()}`;
        setPushableBarrels(prev => [...prev, {
          id: newId,
          model: data.model,
          position: { x, y },
        }]);
        toast.success(`Pushable barrel placed at (${x}, ${y})`);
      } catch {}
      return;
    }

    // Check for placed character repositioning
    const placedCharData = e.dataTransfer.getData(DRAG_TYPE_PLACED_CHARACTER);
    if (placedCharData) {
      const charId = placedCharData;
      updateCharacter(charId, { position: { x, y } });
      toast.success(`Character moved to (${x}, ${y})`);
      return;
    }

    // Check for placed obstacle repositioning
    const placedObsData = e.dataTransfer.getData(DRAG_TYPE_PLACED_OBSTACLE);
    if (placedObsData) {
      const obsId = placedObsData;
      setObstacles(prev => prev.map(o => o.id === obsId ? { ...o, position: { x, y } } : o));
      toast.success(`Obstacle moved to (${x}, ${y})`);
      return;
    }

    // Check for placed pushable barrel repositioning
    const placedPushData = e.dataTransfer.getData(DRAG_TYPE_PLACED_PUSHABLE_BARREL);
    if (placedPushData) {
      const barrelId = placedPushData;
      setPushableBarrels(prev => prev.map(b => b.id === barrelId ? { ...b, position: { x, y } } : b));
      toast.success(`Pushable barrel moved to (${x}, ${y})`);
      return;
    }
  }, [updateCharacter]);

  // Click on a placed character on the grid → select and open config
  const handleGridCharacterClick = useCallback((charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCharacterId(charId);
    setShowCharacterPanel(true);
    const char = characters.find(c => c.id === charId);
    if (char) {
      const linked = dialogues.filter(d => d.speakerCharacterId === charId);
      if (linked.length === 0) {
        toast.info(`Click "+ New" in dialogues section to add dialogue for ${char.name}`);
      }
    }
  }, [characters, dialogues]);

  // Click on a placed obstacle → select and show panel
  const handleGridObstacleClick = useCallback((obsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowObstaclePanel(true);
  }, []);


  const generateSchema = useCallback(() => {
    const gridStrings = grid.map(row => row.join('').replace(/D/g, ' '));
    
    const charactersSchema = characters.filter(c => c.position).length > 0 ? `
  characters: [
${characters.filter(c => c.position).map(c => {
  const dialogueSeqStr = c.dialogueSequence && c.dialogueSequence.length > 0
    ? `\n      dialogueSequence: [${c.dialogueSequence.map(item => `{ type: '${item.type}', id: '${item.id}' }`).join(', ')}],`
    : '';
  const visionDlgStr = c.visionDialogueId
    ? `\n      visionDialogueId: '${c.visionDialogueId}',`
    : '';
  const dirVisionStr = c.directionalVision && Object.keys(c.directionalVision).length > 0
    ? `\n      directionalVision: {\n${Object.entries(c.directionalVision).map(([dir, zone]) => 
        `        ${dir}: { cells: [${(zone as RelativeVisionZone).cells.map(cell => `{ dx: ${cell.dx}, dy: ${cell.dy} }`).join(', ')}] },`
      ).join('\n')}\n      },`
    : '';
  const turningStr = c.turning
    ? `\n      turning: { pattern: '${c.turning.pattern}', directions: [${c.turning.directions.map(d => `'${d}'`).join(', ')}], intervalMs: ${c.turning.intervalMs}${c.turning.initialDirection ? `, initialDirection: '${c.turning.initialDirection}'` : ''} },`
    : '';
  const coneVisionStr = c.coneVision
    ? `\n      coneVision: { range: ${c.coneVision.range}, spreadPerCell: ${c.coneVision.spreadPerCell} },`
    : '';
  return `    {
      id: '${c.id}',
      name: '${c.name}',
      emoji: '${c.emoji}',
      model: '${c.model}',
      animation: '${c.animation}',
      position: { x: ${c.position!.x}, y: ${c.position!.y} },${dialogueSeqStr}${dirVisionStr}${coneVisionStr}${turningStr}${visionDlgStr}
    }`;
}).join(',\n')}
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

    const goalCharacterSchema = config.goalCharacterId 
      ? `
  goalCharacterId: '${config.goalCharacterId}',`
      : '';

    const timerDisabledSchema = config.timerDisabled
      ? `
  timerDisabled: true,`
      : '';

    const deletedSpineBranchesSchema = normalizedDeletedSpineBranches.length > 0
      ? `
  deletedSpineBranches: [
${normalizedDeletedSpineBranches.map((branch) => `    { start: { x: ${branch.start.x}, y: ${branch.start.y} }, end: { x: ${branch.end.x}, y: ${branch.end.y} } },`).join('\n')}
  ],`
      : '';

    const deletedSpineFineCellsSchema = normalizedDeletedSpineFineCells.length > 0
      ? `
  deletedSpineFineCells: [
${normalizedDeletedSpineFineCells.map((cell) => `    { x: ${cell.x}, y: ${cell.y} },`).join('\n')}
  ],`
      : '';

    const obstaclesSchema = obstacles.filter(o => o.position).length > 0 ? `
  obstacles: [
${obstacles.filter(o => o.position).map(o => `    { id: '${o.id}', model: '${o.model}', position: { x: ${o.position!.x}, y: ${o.position!.y} }${o.rotation ? `, rotation: ${o.rotation}` : ''} },`).join('\n')}
  ],` : '';

    const pushableBarrelsSchema = pushableBarrels.filter(b => b.position).length > 0 ? `
  pushableBarrels: [
${pushableBarrels.filter(b => b.position).map(b => `    { id: '${b.id}', model: '${b.model}', position: { x: ${b.position!.x}, y: ${b.position!.y} } },`).join('\n')}
  ],` : '';

    const schema = `{
  id: ${loadedMazeId || Date.now()},
  name: '${config.name}',
  difficulty: '${config.difficulty}',
  timeLimit: ${config.timeLimit},
  previewTime: ${config.previewTime},${timerDisabledSchema}${deletedSpineBranchesSchema}${deletedSpineFineCellsSchema}
  medalTimes: { gold: 15, silver: 25, bronze: 40 },${charactersSchema}${obstaclesSchema}${pushableBarrelsSchema}${dialogueSchema}${endConditionsSchema}${goalCharacterSchema}
  grid: createGrid([
${gridStrings.map(row => `    '${row}',`).join('\n')}
  ]),
},`;
    
    return schema;
  }, [grid, config, dialogues, characters, obstacles, pushableBarrels, loadedMazeId, normalizedDeletedSpineBranches, normalizedDeletedSpineFineCells]);

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
    setDeletedSpineBranches([]);
    setDeletedSpineFineCells([]);
    toast.info('Grid cleared');
  };

  const getCellDialogue = (x: number, y: number): DialogueConfig | undefined => {
    return dialogues.find(d => d.cells.some(c => c.x === x && c.y === y));
  };

  const getCellDialogues = (x: number, y: number): DialogueConfig[] => {
    return dialogues.filter(d => d.cells.some(c => c.x === x && c.y === y));
  };

  const getDialogueIndex = (id: string): number => {
    return dialogues.findIndex(d => d.id === id);
  };

  const getDialogueColor = (id: string): string => {
    const index = getDialogueIndex(id);
    return DIALOGUE_COLORS[index % DIALOGUE_COLORS.length];
  };

  const getDialogueHexColor = (id: string): string => {
    const index = getDialogueIndex(id);
    return DIALOGUE_HEX_COLORS[index % DIALOGUE_HEX_COLORS.length];
  };

  const getStripedBackground = (dialogueConfigs: DialogueConfig[]): React.CSSProperties => {
    if (dialogueConfigs.length <= 1) return {};
    const colors = dialogueConfigs.map(d => getDialogueHexColor(d.id));
    const stripeW = 4; // px per stripe band
    const totalW = colors.length * stripeW;
    const stops: string[] = [];
    colors.forEach((color, i) => {
      stops.push(`${color} ${i * stripeW}px`);
      stops.push(`${color} ${(i + 1) * stripeW}px`);
    });
    return {
      background: `repeating-linear-gradient(135deg, ${stops.join(', ')})`,
      backgroundSize: `${totalW * 1.414}px ${totalW * 1.414}px`,
    };
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

    if (!spineAnalysis || spineAnalysis.traversedCellKeys.size === 0) {
      warnings.push('⚠️ Traversal spine could not be generated for the current maze layout');
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

        if (spineAnalysis && !cellsTouchSpine(charDialogue.cells, spineAnalysis.traversedCellKeys)) {
          warnings.push(`⚠️ Character "${char.name}" dialogue trigger cells do not touch the traversal spine`);
        }
      }

      // Validate luredByBait characters are on the spine
      if (char.luredByBait && spineAnalysis) {
        const charCell = { x: char.position.x, y: char.position.y };
        if (!cellsTouchSpine([charCell], spineAnalysis.traversedCellKeys)) {
          warnings.push(`🚨 Bait-lured character "${char.name}" at (${charCell.x}, ${charCell.y}) is NOT on the traversal spine — llamas must block the path`);
        }
      }
    });
    
    return warnings;
  }, [grid, dialogues, characters, spineAnalysis]);

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
            {/* Maze list removed */}
          </div>
        </div>

        <div className="flex gap-4">
          {/* Palette Sidebar - Drag characters & obstacles onto grid */}
          <EditorPalette className="w-44" />

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
                      disabled={config.timerDisabled}
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

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Disable Timer</Label>
                  <Switch
                    checked={config.timerDisabled || false}
                    onCheckedChange={(checked) => setConfig(c => ({ ...c, timerDisabled: checked }))}
                  />
                </div>

                {/* Goal Character */}
                {characters.length > 0 && (
                  <div className="space-y-2">
                    <Label>Goal Character</Label>
                    <Select
                      value={config.goalCharacterId || '_none'}
                      onValueChange={(v) => setConfig(c => ({ ...c, goalCharacterId: v === '_none' ? undefined : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None (use end cell)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None (use end cell)</SelectItem>
                        {characters.map(ch => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.emoji} {ch.name} ({ch.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Reaching this character completes the level</p>
                  </div>
                )}

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

                {/* Obstacles Toggle */}
                <div className="pt-2">
                  <Button 
                    onClick={() => setShowObstaclePanel(!showObstaclePanel)} 
                    variant={placingObstacleId ? 'default' : 'outline'}
                    className="w-full"
                  >
                    🪵 Obstacles ({obstacles.length})
                  </Button>
                </div>

                {/* Apple Dialogues Toggle */}
                <div className="pt-2">
                  <Button 
                    onClick={() => setShowAppleDialoguePanel(!showAppleDialoguePanel)} 
                    variant="outline" 
                    className="w-full"
                  >
                    <Apple className="w-4 h-4 mr-2" />
                    Apple Dialogues
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
                <CardTitle className="text-lg flex items-center justify-between gap-3">
                  <span>Grid ({grid[0]?.length || 0} x {grid.length})</span>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="flex items-center gap-2 text-sm font-normal">
                      <Route className="h-4 w-4 text-primary" />
                      <Label htmlFor="show-spine-overlay" className="cursor-pointer text-sm font-normal">
                        Show spine
                      </Label>
                      <Switch
                        id="show-spine-overlay"
                        checked={showSpineOverlay}
                        onCheckedChange={setShowSpineOverlay}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm font-normal">
                      <Label htmlFor="edit-fine-spine" className="cursor-pointer text-sm font-normal">
                        Edit fine spine
                      </Label>
                      <Switch
                        id="edit-fine-spine"
                        checked={enableFineSpineEditing}
                        onCheckedChange={setEnableFineSpineEditing}
                      />
                    </div>
                    {placingCharacterId && (
                      <span className="text-sm text-primary animate-pulse">
                        Click to place character...
                      </span>
                    )}
                    {placingObstacleId && (
                      <span className="text-sm text-amber-700 animate-pulse">
                        🪵 Click to place obstacle...
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="overflow-auto max-h-[60vh] border rounded-lg p-2 bg-background"
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
                        const cellDialogues = getCellDialogues(x, y);
                        const dialogue = cellDialogues[0];
                        const character = getCharacterAtCell(x, y);
                        const obstacle = getObstacleAtCell(x, y);
                        const pushBarrel = getPushableBarrelAtCell(x, y);
                        
                        const isDialogueCell = cellDialogues.length > 0;
                        const isMultiDialogue = cellDialogues.length > 1;
                        const dialogueColor = dialogue ? getDialogueColor(dialogue.id) : '';
                        const isSelectedDialogue = cellDialogues.some(d => d.id === selectedDialogueId);
                        const isOnSpine = showSpineOverlay && (spineAnalysis?.traversedCellKeys.has(getMazeCellKey(x, y)) ?? false);
                        const stripedStyle = isMultiDialogue ? getStripedBackground(cellDialogues) : {};
                        const dialogueNames = cellDialogues.map(d => d.speaker).join(', ');
                         
                        
                        return (
                          <div
                            key={`${x}-${y}`}
                            className={`
                              w-4 h-4 md:w-5 md:h-5 cursor-crosshair transition-colors relative
                              ${character ? 'ring-2 ring-primary' : ''}
                              ${obstacle && !character ? 'ring-2 ring-amber-700' : ''}
                              ${pushBarrel && !character && !obstacle ? 'ring-2 ring-cyan-600' : ''}
                              ${dragOverCell?.x === x && dragOverCell?.y === y ? 'ring-2 ring-blue-500 bg-blue-200/50' : ''}
                              ${isDialogueCell && !isMultiDialogue ? dialogueColor : ''}
                              ${!isDialogueCell && !obstacle && !pushBarrel ? CELL_COLORS[cell] : ''}
                              ${!isDialogueCell && obstacle ? 'bg-amber-600' : ''}
                              ${!isDialogueCell && !obstacle && pushBarrel ? 'bg-cyan-700' : ''}
                              ${isSelectedDialogue ? 'ring-2 ring-offset-1 ring-foreground' : ''}
                              
                              ${selectedCharacterId && character?.id === selectedCharacterId ? 'ring-2 ring-offset-1 ring-blue-500' : ''}
                            `}
                            style={stripedStyle}
                            onMouseDown={() => handleMouseDown(x, y)}
                            onMouseEnter={() => handleMouseEnter(x, y)}
                            onDragOver={(e) => handleGridDragOver(e, x, y)}
                            onDragLeave={handleGridDragLeave}
                            onDrop={(e) => handleGridDrop(e, x, y)}
                            title={`(${x}, ${y}) ${CELL_LABELS[cell]}${isDialogueCell ? ` - ${dialogueNames}${isMultiDialogue ? ' (overlapping)' : ''}` : ''}${character ? ` - ${character.name}` : ''}${obstacle ? ` - 🪵 ${obstacle.model}` : ''}${pushBarrel ? ` - 🛢️ ${pushBarrel.model} (pushable)` : ''}${isOnSpine ? ' - Traversal spine' : ''}`}
                          >
                            {isOnSpine && (
                              <span className="pointer-events-none absolute inset-[3px] rounded-full border border-primary bg-primary/35" />
                            )}
                            {obstacle && !character && (
                              <span
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData(DRAG_TYPE_PLACED_OBSTACLE, obstacle.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={(e) => handleGridObstacleClick(obstacle.id, e)}
                                className="absolute inset-0 z-10 flex items-center justify-center text-[8px] cursor-grab active:cursor-grabbing"
                              >🪵</span>
                            )}
                            {pushBarrel && !character && !obstacle && (
                              <span
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData(DRAG_TYPE_PLACED_PUSHABLE_BARREL, pushBarrel.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPushableBarrels(prev => prev.filter(b => b.id !== pushBarrel.id));
                                  toast.info('Pushable barrel removed');
                                }}
                                className="absolute inset-0 z-10 flex items-center justify-center text-[8px] cursor-grab active:cursor-grabbing"
                              >🛢️</span>
                            )}
                            {character && (
                              <span
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData(DRAG_TYPE_PLACED_CHARACTER, character.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={(e) => handleGridCharacterClick(character.id, e)}
                                className="absolute inset-0 z-10 flex items-center justify-center text-[10px] cursor-grab active:cursor-grabbing"
                              >
                                {character.emoji}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                {showSpineOverlay && (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Cell markers show the traversed maze cells; the fine editor below shows the true {SPINE_FINE_GRID_SCALE}×{SPINE_FINE_GRID_SCALE} subsquare spine resolution used for rail generation.
                    </p>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Fine spine editor</p>
                          <p className="text-xs text-muted-foreground">
                            Use branch mode for compact start/end deletions, or cell mode for manual cleanup before exporting the maze config.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant={spineEditMode === 'branch' ? 'default' : 'outline'}
                            onClick={() => {
                              setSpineEditMode('branch');
                              setEnableFineSpineEditing(true);
                              toast.info('Branch mode active. Click a non-junction fine spine cell below.');
                            }}
                          >
                            Delete branch
                          </Button>
                          <Button
                            size="sm"
                            variant={spineEditMode === 'cell' ? 'default' : 'outline'}
                            onClick={() => {
                              setSpineEditMode('cell');
                              setEnableFineSpineEditing(true);
                              toast.info('Cell mode active. Click a fine spine cell below.');
                            }}
                          >
                            Delete cell
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDeletedSpineBranches([]);
                              setDeletedSpineFineCells([]);
                            }}
                            disabled={normalizedDeletedSpineBranches.length === 0 && normalizedDeletedSpineFineCells.length === 0}
                          >
                            Reset deletions
                          </Button>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {spineEditMode === 'branch'
                          ? 'Delete branch is a two-step action: click the button, then click a non-junction fine spine cell in the grid below.'
                          : 'Delete cell is a two-step action: click the button, then click an individual fine spine cell below.'}
                      </p>

                      <FineSpineEditor
                        mazeWidth={grid[0]?.length || 0}
                        mazeHeight={grid.length}
                        fineScale={baseSpineAnalysis?.fineScale ?? SPINE_FINE_GRID_SCALE}
                        fineSpineCells={baseSpineAnalysis?.fineSpineCells ?? []}
                        deletedFineCellKeys={deletedSpineCellKeys}
                        editable={enableFineSpineEditing}
                        editMode={spineEditMode}
                        onToggleFineCell={handleFineSpineToggle}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {(baseSpineAnalysis?.fineSpineCells.length ?? 0).toLocaleString()} fine spine cells • {normalizedDeletedSpineBranches.length.toLocaleString()} branches • {normalizedDeletedSpineFineCells.length.toLocaleString()} cells • {deletedSpineCellKeys.size.toLocaleString()} hidden
                        </span>
                        <span>
                          {enableFineSpineEditing
                            ? spineEditMode === 'branch'
                              ? 'Click a non-junction fine spine cell to toggle its whole branch.'
                              : 'Click a fine cell to toggle a single deletion.'
                            : 'Enable “Edit fine spine” to toggle deletions.'}
                        </span>
                      </div>

                      <Textarea
                        readOnly
                        value={normalizedDeletedSpineBranches.length > 0 || normalizedDeletedSpineFineCells.length > 0
                          ? [
                              normalizedDeletedSpineBranches.length > 0
                                ? `deletedSpineBranches: [\n${normalizedDeletedSpineBranches.map((branch) => `  { start: { x: ${branch.start.x}, y: ${branch.start.y} }, end: { x: ${branch.end.x}, y: ${branch.end.y} } },`).join('\n')}\n]`
                                : '',
                              normalizedDeletedSpineFineCells.length > 0
                                ? `deletedSpineFineCells: [\n${normalizedDeletedSpineFineCells.map((cell) => `  { x: ${cell.x}, y: ${cell.y} },`).join('\n')}\n]`
                                : '',
                            ].filter(Boolean).join('\n\n')
                          : '// No deletedSpineBranches or deletedSpineFineCells'
                        }
                        className="h-24 resize-none font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
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
                        {(() => {
                          const modelAnimations = getCharacterAnimations(char.model);
                          const hasCurrentAnim = modelAnimations.includes(char.animation);
                          return (
                            <Select
                              value={hasCurrentAnim ? char.animation : '__none__'}
                              onValueChange={v => updateCharacter(char.id, { animation: v === '__none__' ? 'idle' : v })}
                            >
                              <SelectTrigger className="text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {modelAnimations.length === 0 && (
                                  <SelectItem value="__none__" disabled>No animations</SelectItem>
                                )}
                                {modelAnimations.map(a => (
                                  <SelectItem key={a} value={a}>{a}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
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

                        {/* Vision Section - Cone only */}
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold flex items-center gap-1">
                              👁 Vision Cone
                            </Label>
                            <Switch
                              checked={!!char.coneVision}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  updateCharacter(char.id, { 
                                    coneVision: { range: 4, spreadPerCell: 1 },
                                    directionalVision: undefined,
                                  });
                                } else {
                                  updateCharacter(char.id, { 
                                    coneVision: undefined,
                                    visionDialogueId: undefined,
                                  });
                                }
                              }}
                            />
                          </div>

                          {char.coneVision && (
                            <div className="space-y-2 p-2 bg-muted rounded">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">Range:</Label>
                                <Input
                                  type="number"
                                  value={char.coneVision.range}
                                  onChange={e => updateCharacter(char.id, { 
                                    coneVision: { ...char.coneVision!, range: parseInt(e.target.value) || 1 } 
                                  })}
                                  className="text-xs h-7 w-16"
                                  min={1}
                                  max={10}
                                />
                                <Label className="text-xs">Spread:</Label>
                                <Input
                                  type="number"
                                  value={char.coneVision.spreadPerCell}
                                  onChange={e => updateCharacter(char.id, { 
                                    coneVision: { ...char.coneVision!, spreadPerCell: parseInt(e.target.value) || 0 } 
                                  })}
                                  className="text-xs h-7 w-16"
                                  min={0}
                                  max={3}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Triangle vision blocked by walls. Follows facing direction.
                              </p>

                              {/* Vision dialogue */}
                              <div>
                                <Label className="text-xs">On vision → trigger dialogue</Label>
                                <div className="flex gap-1 mt-1">
                                  <Select
                                    value={char.visionDialogueId || '__none__'}
                                    onValueChange={v => updateCharacter(char.id, { visionDialogueId: v === '__none__' ? undefined : v })}
                                  >
                                    <SelectTrigger className="text-xs h-7 flex-1">
                                      <SelectValue placeholder="None" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">None</SelectItem>
                                      {dialogues.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.speaker}: {d.message.slice(0, 30)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {!char.visionDialogueId && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const dlg = addDialogue(char.id);
                                        // Link the new dialogue to this character's vision
                                        const newDlgId = dialogues[dialogues.length]?.id; // Will be set after state update
                                      }}
                                    >
                                      <Plus className="w-3 h-3 mr-1" /> New
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Turning config */}
                          <div className="mt-2 pt-2 border-t space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs font-semibold">🔄 Turning</Label>
                              <Switch
                                checked={!!char.turning}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    updateCharacter(char.id, {
                                      turning: {
                                        pattern: 'ping-pong',
                                        directions: ['north', 'south'],
                                        intervalMs: 3000,
                                      },
                                      directionalVision: char.directionalVision ?? {},
                                    });
                                  } else {
                                    updateCharacter(char.id, { turning: undefined });
                                  }
                                }}
                              />
                            </div>
                            {char.turning && (
                              <div className="space-y-2 pl-2">
                                <div>
                                  <Label className="text-xs">Directions (ping-pong)</Label>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {ALL_DIRECTIONS.map(dir => {
                                      const isIn = char.turning!.directions.includes(dir);
                                      return (
                                        <Button
                                          key={dir}
                                          size="sm"
                                          variant={isIn ? 'default' : 'outline'}
                                          className="text-xs px-2 h-6"
                                          onClick={() => {
                                            const dirs = isIn
                                              ? char.turning!.directions.filter(d => d !== dir)
                                              : [...char.turning!.directions, dir];
                                            if (dirs.length >= 2) {
                                              updateCharacter(char.id, {
                                                turning: { ...char.turning!, directions: dirs as CardinalDirection[] },
                                              });
                                            }
                                          }}
                                        >
                                          {DIRECTION_LABELS[dir]}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Interval (ms)</Label>
                                  <Input
                                    type="number"
                                    value={char.turning.intervalMs}
                                    onChange={e => updateCharacter(char.id, {
                                      turning: { ...char.turning!, intervalMs: parseInt(e.target.value) || 1000 },
                                    })}
                                    className="text-xs h-7 w-24"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>


                        {(() => {
                          const charDialogues = dialogues.filter(d => d.speakerCharacterId === char.id);
                          // Check overlap: do all dialogues for this character share at least some cells?
                          const cellSets = charDialogues.map(d => new Set(d.cells.map(c => `${c.x},${c.y}`)));
                          const hasOverlapIssue = charDialogues.length >= 2 && (() => {
                            // Check that each pair shares at least one cell
                            for (let i = 0; i < cellSets.length; i++) {
                              for (let j = i + 1; j < cellSets.length; j++) {
                                const shared = [...cellSets[i]].filter(k => cellSets[j].has(k));
                                if (shared.length === 0) return true;
                              }
                            }
                            return false;
                          })();
                          const allOverlap = charDialogues.length >= 2 && !hasOverlapIssue;

                          return (
                            <div className="mt-3 pt-3 border-t space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3" />
                                  Dialogues ({charDialogues.length})
                                </Label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs px-2"
                                  onClick={(e) => { e.stopPropagation(); addDialogue(char.id); }}
                                >
                                  <Plus className="w-3 h-3 mr-1" /> New
                                </Button>
                              </div>
                              
                              {charDialogues.length >= 2 && (
                                <div className={`text-xs px-2 py-1 rounded ${allOverlap ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {allOverlap 
                                    ? '✅ All dialogues share trigger cells' 
                                    : '⚠️ Some dialogues have NO overlapping cells'}
                                </div>
                              )}

                              {charDialogues.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No dialogues linked</p>
                              ) : (
                                <div className="space-y-1">
                                  {charDialogues.map((d) => {
                                    const dIndex = dialogues.findIndex(dd => dd.id === d.id);
                                    const color = DIALOGUE_COLORS[dIndex % DIALOGUE_COLORS.length];
                                    const isSelected = selectedDialogueId === d.id;
                                    return (
                                      <div
                                        key={d.id}
                                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors text-xs ${
                                          isSelected 
                                            ? 'ring-2 ring-primary bg-primary/10' 
                                            : 'hover:bg-muted'
                                        } ${color.replace('bg-', 'border-l-4 border-')}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedDialogueId(d.id);
                                          setSelectedTool('D');
                                        }}
                                      >
                                        <div className="flex-1 truncate">
                                          <span className="font-medium">{d.speaker}</span>
                                          <span className="text-muted-foreground ml-1">({d.cells.length} cells)</span>
                                          {d.requires && d.requires.length > 0 && (
                                            <span className="text-muted-foreground ml-1">• req: {d.requires.join(', ')}</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {canBeFedApples(char.id) && (
                          <div className="mt-3 pt-3 border-t-2 border-primary/40 bg-primary/5 rounded-md p-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Apple className="w-3.5 h-3.5 text-primary" />
                              <Label className="text-xs font-bold text-primary">Dialogue Sequence</Label>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              Build the interaction order: click 🍎 buttons to add apple-feeding steps, click 💬 buttons to add normal dialogue steps. The sequence plays left-to-right.
                            </p>
                            
                            {/* Current sequence */}
                            <div className="flex flex-wrap gap-1 mb-2 min-h-[28px] p-1 bg-muted rounded">
                              {(char.dialogueSequence || []).map((item, idx) => (
                                <div 
                                  key={idx} 
                                  className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                                    item.type === 'apple' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {item.type === 'apple' ? '🍎' : '💬'}{item.id}
                                  <button 
                                    className="hover:text-red-600 ml-1"
                                    onClick={() => {
                                      const newSeq = [...(char.dialogueSequence || [])];
                                      newSeq.splice(idx, 1);
                                      updateCharacter(char.id, { dialogueSequence: newSeq });
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {(!char.dialogueSequence || char.dialogueSequence.length === 0) && (
                                <span className="text-xs text-muted-foreground italic">Empty - add items below</span>
                              )}
                            </div>
                            
                            {/* Add items */}
                            <div className="flex gap-1 flex-wrap">
                              {/* Apple dialogue buttons */}
                              {Array.from({ length: getAppleDialogueCount(char.id) }, (_, i) => i + 1).map(num => (
                                <Button
                                  key={`apple-${num}`}
                                  size="sm"
                                  variant="outline"
                                  className="text-xs px-2 py-0.5 h-6"
                                  onClick={() => {
                                    const newSeq = [...(char.dialogueSequence || []), { type: 'apple' as const, id: num.toString() }];
                                    updateCharacter(char.id, { dialogueSequence: newSeq });
                                  }}
                                >
                                  🍎{num}
                                </Button>
                              ))}
                              
                              {/* Normal dialogue buttons - linked to this character */}
                              {dialogues
                                .filter(d => d.speakerCharacterId === char.id)
                                .map(d => (
                                  <Button
                                    key={`normal-${d.id}`}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-0.5 h-6"
                                    onClick={() => {
                                      const newSeq = [...(char.dialogueSequence || []), { type: 'normal' as const, id: d.id }];
                                      updateCharacter(char.id, { dialogueSequence: newSeq });
                                    }}
                                  >
                                    💬{d.speaker.slice(0, 8)}
                                  </Button>
                                ))
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Obstacle Panel */}
        {showObstaclePanel && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>🪵 Obstacles</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addObstacle}>
                    <Plus className="w-4 h-4 mr-1" /> Add Obstacle
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setShowObstaclePanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Place logs and other obstacles that block line-of-sight for small creatures. Taller creatures can see over them.
              </p>
              {obstacles.length === 0 ? (
                <p className="text-muted-foreground text-sm">No obstacles yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {obstacles.map(obstacle => (
                    <Card key={obstacle.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg">🪵</span>
                        <Button size="icon" variant="ghost" onClick={() => removeObstacle(obstacle.id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Select
                          value={obstacle.model}
                          onValueChange={v => setObstacles(prev => prev.map(o => o.id === obstacle.id ? { ...o, model: v } : o))}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OBSTACLE_MODELS.map(m => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Rotation°</Label>
                          <Input
                            type="number"
                            value={obstacle.rotation || 0}
                            onChange={e => setObstacles(prev => prev.map(o => o.id === obstacle.id ? { ...o, rotation: parseInt(e.target.value) || 0 } : o))}
                            className="text-xs h-7 w-20"
                          />
                        </div>
                        <Button 
                          size="sm" 
                          variant={placingObstacleId === obstacle.id ? 'default' : 'outline'}
                          className="w-full"
                          onClick={() => setPlacingObstacleId(placingObstacleId === obstacle.id ? null : obstacle.id)}
                        >
                          {obstacle.position ? `(${obstacle.position.x}, ${obstacle.position.y})` : 'Place on grid'}
                        </Button>
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
                  <Button size="sm" onClick={() => addDialogue()}>
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

        {/* Apple Dialogue Panel */}
        {showAppleDialoguePanel && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>🍎 Apple Feeding Dialogues</span>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(editableAppleDialogues, null, 2));
                      toast.success('Apple dialogues copied to clipboard!');
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1" /> Copy JSON
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setShowAppleDialoguePanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Edit progressive apple dialogues per animal. Copy the JSON and paste into src/data/appleDialogues.ts
              </p>
              <Tabs defaultValue={editableAppleDialogues[0]?.animalId || 'pig'}>
                <TabsList className="mb-4">
                  {editableAppleDialogues.map(animal => (
                    <TabsTrigger key={animal.animalId} value={animal.animalId}>
                      {animal.animalId === 'pig' && '🐷'}
                      {animal.animalId === 'cow' && '🐮'}
                      {animal.animalId === 'bird' && '🐔'}
                      {' '}{animal.animalId}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="add-new">+ Add Animal</TabsTrigger>
                </TabsList>
                
                {editableAppleDialogues.map(animal => (
                  <TabsContent key={animal.animalId} value={animal.animalId} className="space-y-4">
                    {/* Dialogue Sequence Builder - prominent placement */}
                    {(() => {
                      const char = characters.find(c => c.id === animal.animalId);
                      if (!char) return (
                        <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                          ⚠️ Place a <strong>{animal.animalId}</strong> character in the Characters section first to configure its dialogue sequence.
                        </div>
                      );
                      return (
                        <div className="p-3 bg-primary/5 border-2 border-primary/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Apple className="w-4 h-4 text-primary" />
                            <h3 className="font-bold text-sm">Interaction Order</h3>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            Build the sequence left-to-right. 🍎 = player feeds an apple, 💬 = normal dialogue triggers.
                          </p>
                          {/* Current sequence visualization */}
                          <div className="flex flex-wrap gap-1 mb-2 min-h-[32px] p-2 bg-background rounded border border-border">
                            {(char.dialogueSequence || []).map((item, idx) => (
                              <div 
                                key={idx} 
                                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                                  item.type === 'apple' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {item.type === 'apple' ? '🍎' : '💬'}{item.id}
                                {idx < (char.dialogueSequence || []).length - 1 && <span className="ml-1 text-muted-foreground">→</span>}
                                <button 
                                  className="hover:text-red-600 ml-1"
                                  onClick={() => {
                                    const newSeq = [...(char.dialogueSequence || [])];
                                    newSeq.splice(idx, 1);
                                    updateCharacter(char.id, { dialogueSequence: newSeq });
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {(!char.dialogueSequence || char.dialogueSequence.length === 0) && (
                              <span className="text-xs text-muted-foreground italic py-0.5">Empty — click buttons below to build sequence</span>
                            )}
                          </div>
                          {/* Add buttons */}
                          <div className="flex gap-1 flex-wrap items-center">
                            <span className="text-xs text-muted-foreground mr-1">Add:</span>
                            {Array.from({ length: animal.dialogues.length }, (_, i) => i + 1).map(num => (
                              <Button
                                key={`apple-${num}`}
                                size="sm"
                                variant="outline"
                                className="text-xs px-2 py-0.5 h-6"
                                onClick={() => {
                                  const newSeq = [...(char.dialogueSequence || []), { type: 'apple' as const, id: num.toString() }];
                                  updateCharacter(char.id, { dialogueSequence: newSeq });
                                }}
                              >
                                🍎{num}
                              </Button>
                            ))}
                            {dialogues
                              .filter(d => d.speakerCharacterId === char.id)
                              .map(d => (
                                <Button
                                  key={`normal-${d.id}`}
                                  size="sm"
                                  variant="outline"
                                  className="text-xs px-2 py-0.5 h-6"
                                  onClick={() => {
                                    const newSeq = [...(char.dialogueSequence || []), { type: 'normal' as const, id: d.id }];
                                    updateCharacter(char.id, { dialogueSequence: newSeq });
                                  }}
                                >
                                  💬{d.id}
                                </Button>
                              ))
                            }
                            {dialogues.filter(d => d.speakerCharacterId === char.id).length === 0 && (
                              <span className="text-xs text-muted-foreground italic ml-1">
                                (No normal dialogues linked — set speakerCharacterId to "{char.id}" in Dialogues section)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">Apple Dialogues for {animal.animalId}</h3>
                      <Button 
                        size="sm" 
                        onClick={() => {
                          const newDialogue: AppleDialogue = {
                            id: `${animal.animalId}-apple-${animal.dialogues.length + 1}`,
                            appleNumber: animal.dialogues.length + 1,
                            messages: [{ speaker: (() => { const c = characters.find(c => c.id === animal.animalId); return c?.name ?? 'Animal'; })(), speakerEmoji: (() => { const c = characters.find(c => c.id === animal.animalId); return c?.emoji ?? '🐾'; })(), message: 'Thank you for the apple!' }],
                          };
                          setEditableAppleDialogues(prev => 
                            prev.map(a => a.animalId === animal.animalId 
                              ? { ...a, dialogues: [...a.dialogues, newDialogue] }
                              : a
                            )
                          );
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add Apple Tier
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {animal.dialogues.map((dialogue, dIndex) => (
                        <Card key={dialogue.id} className="p-3 border-l-4 border-red-400">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm">🍎 Apple #{dialogue.appleNumber}</span>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => {
                                setEditableAppleDialogues(prev =>
                                  prev.map(a => a.animalId === animal.animalId
                                    ? { ...a, dialogues: a.dialogues.filter((_, i) => i !== dIndex) }
                                    : a
                                  )
                                );
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            {dialogue.messages.map((msg, mIndex) => (
                              <div key={mIndex} className="space-y-1 p-2 bg-muted rounded">
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Speaker"
                                    value={msg.speaker}
                                    onChange={e => {
                                      const newMessages = [...dialogue.messages];
                                      newMessages[mIndex] = { ...msg, speaker: e.target.value };
                                      setEditableAppleDialogues(prev =>
                                        prev.map(a => a.animalId === animal.animalId
                                          ? { ...a, dialogues: a.dialogues.map((d, i) => i === dIndex ? { ...d, messages: newMessages } : d) }
                                          : a
                                        )
                                      );
                                    }}
                                    className="flex-1 text-xs"
                                  />
                                  <Input
                                    placeholder="🐷"
                                    value={msg.speakerEmoji}
                                    onChange={e => {
                                      const newMessages = [...dialogue.messages];
                                      newMessages[mIndex] = { ...msg, speakerEmoji: e.target.value };
                                      setEditableAppleDialogues(prev =>
                                        prev.map(a => a.animalId === animal.animalId
                                          ? { ...a, dialogues: a.dialogues.map((d, i) => i === dIndex ? { ...d, messages: newMessages } : d) }
                                          : a
                                        )
                                      );
                                    }}
                                    className="w-12 text-xs"
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      const newMessages = dialogue.messages.filter((_, i) => i !== mIndex);
                                      setEditableAppleDialogues(prev =>
                                        prev.map(a => a.animalId === animal.animalId
                                          ? { ...a, dialogues: a.dialogues.map((d, i) => i === dIndex ? { ...d, messages: newMessages } : d) }
                                          : a
                                        )
                                      );
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                <Textarea
                                  placeholder="Message..."
                                  value={msg.message}
                                  onChange={e => {
                                    const newMessages = [...dialogue.messages];
                                    newMessages[mIndex] = { ...msg, message: e.target.value };
                                    setEditableAppleDialogues(prev =>
                                      prev.map(a => a.animalId === animal.animalId
                                        ? { ...a, dialogues: a.dialogues.map((d, i) => i === dIndex ? { ...d, messages: newMessages } : d) }
                                        : a
                                      )
                                    );
                                  }}
                                  className="text-xs"
                                  rows={2}
                                />
                              </div>
                            ))}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => {
                                const charInfo = characters.find(c => c.id === animal.animalId);
                                const newMessages = [...dialogue.messages, { speaker: charInfo?.name ?? 'Animal', speakerEmoji: charInfo?.emoji ?? '🐾', message: '' }];
                                setEditableAppleDialogues(prev =>
                                  prev.map(a => a.animalId === animal.animalId
                                    ? { ...a, dialogues: a.dialogues.map((d, i) => i === dIndex ? { ...d, messages: newMessages } : d) }
                                    : a
                                  )
                                );
                              }}
                            >
                              + Add Message
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                ))}
                
                <TabsContent value="add-new" className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <Label>Add a new animal</Label>
                    <div className="flex gap-2 mt-2">
                      <Select
                        onValueChange={(value) => {
                          if (!editableAppleDialogues.find(a => a.animalId === value)) {
                            setEditableAppleDialogues(prev => [
                              ...prev,
                              { animalId: value, dialogues: [] }
                            ]);
                            const char = characters.find(c => c.id === value);
                            toast.success(`Added ${char ? char.name : value} to apple dialogues`);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select character..." />
                        </SelectTrigger>
                        <SelectContent>
                          {characters.filter(c => c.position && canBeFedApples(c.id) && !editableAppleDialogues.find(e => e.animalId === c.id)).map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MazeEditor;
