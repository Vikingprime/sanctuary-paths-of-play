import { useState, useEffect, useCallback } from 'react';
import { Maze, MazeCell } from '@/types/game';
import { mazes as defaultMazes } from '@/data/mazes';

const STORAGE_KEY = 'custom_mazes';
const DELETED_KEY = 'deleted_maze_ids';
const ORDER_KEY = 'maze_order';

// Helper to create a maze grid from layout strings
export const createGrid = (layout: string[]): MazeCell[][] => {
  return layout.map((row, y) =>
    row.split('').map((cell, x) => ({
      x,
      y,
      isWall: cell === '#',
      isStart: cell === 'S',
      isEnd: cell === 'E',
      isPowerUp: cell === 'P',
      isStation: cell === 'H',
      powerUpType: cell === 'P' ? 'time' : undefined,
      brand: cell === 'P' ? 'T-Mobile' : undefined,
    }))
  );
};

// Convert grid back to layout strings
export const gridToLayout = (grid: MazeCell[][]): string[] => {
  return grid.map(row =>
    row.map(cell => {
      if (cell.isWall) return '#';
      if (cell.isStart) return 'S';
      if (cell.isEnd) return 'E';
      if (cell.isPowerUp) return 'P';
      if (cell.isStation) return 'H';
      return ' ';
    }).join('')
  );
};

// Serializable maze format for storage (without grid objects)
interface StoredMaze extends Omit<Maze, 'grid'> {
  layout: string[];
}

const mazeToStored = (maze: Maze): StoredMaze => {
  const { grid, ...rest } = maze;
  return {
    ...rest,
    layout: gridToLayout(grid),
  };
};

const storedToMaze = (stored: StoredMaze): Maze => {
  const { layout, ...rest } = stored;
  return {
    ...rest,
    grid: createGrid(layout),
  };
};

export function useMazeStorage() {
  const [customMazes, setCustomMazes] = useState<Maze[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());
  const [mazeOrder, setMazeOrder] = useState<number[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load custom mazes, deleted IDs, and order from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredMaze[] = JSON.parse(stored);
        setCustomMazes(parsed.map(storedToMaze));
      }
      const deletedStored = localStorage.getItem(DELETED_KEY);
      if (deletedStored) {
        const parsed: number[] = JSON.parse(deletedStored);
        setDeletedIds(new Set(parsed));
      }
      const orderStored = localStorage.getItem(ORDER_KEY);
      if (orderStored) {
        const parsed: number[] = JSON.parse(orderStored);
        setMazeOrder(parsed);
      }
    } catch (error) {
      console.error('Failed to load custom mazes:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  const saveToStorage = useCallback((mazes: Maze[], deleted: Set<number>, order: number[]) => {
    try {
      const toStore = mazes.map(mazeToStored);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      localStorage.setItem(DELETED_KEY, JSON.stringify([...deleted]));
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } catch (error) {
      console.error('Failed to save custom mazes:', error);
    }
  }, []);

  // Get all mazes (default + custom, with custom overriding default by ID, excluding deleted)
  const getAllMazes = useCallback((): Maze[] => {
    const customIds = new Set(customMazes.map(m => m.id));
    // Filter out defaults that have been overridden by custom OR explicitly deleted
    const filteredDefaults = defaultMazes.filter(m => !customIds.has(m.id) && !deletedIds.has(m.id));
    // Filter out custom mazes that were deleted
    const filteredCustoms = customMazes.filter(m => !deletedIds.has(m.id));
    const allMazes = [...filteredDefaults, ...filteredCustoms];
    
    // Sort by custom order if available, otherwise by ID
    if (mazeOrder.length > 0) {
      const orderMap = new Map(mazeOrder.map((id, index) => [id, index]));
      return allMazes.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999999;
        const orderB = orderMap.get(b.id) ?? 999999;
        if (orderA === orderB) return a.id - b.id;
        return orderA - orderB;
      });
    }
    return allMazes.sort((a, b) => a.id - b.id);
  }, [customMazes, deletedIds, mazeOrder]);

  // Save or update a maze
  const saveMaze = useCallback((maze: Maze) => {
    // If this maze was previously deleted, remove it from deleted set
    setDeletedIds(prevDeleted => {
      const newDeleted = new Set(prevDeleted);
      newDeleted.delete(maze.id);
      
      setCustomMazes(prev => {
        const existingIndex = prev.findIndex(m => m.id === maze.id);
        let updated: Maze[];
        if (existingIndex >= 0) {
          updated = [...prev];
          updated[existingIndex] = maze;
        } else {
          updated = [...prev, maze];
        }
        saveToStorage(updated, newDeleted, mazeOrder);
        return updated;
      });
      
      return newDeleted;
    });
  }, [saveToStorage, mazeOrder]);

  // Delete a maze completely
  const deleteMaze = useCallback((mazeId: number) => {
    setDeletedIds(prevDeleted => {
      const newDeleted = new Set(prevDeleted);
      newDeleted.add(mazeId);
      
      setCustomMazes(prev => {
        const updated = prev.filter(m => m.id !== mazeId);
        const newOrder = mazeOrder.filter(id => id !== mazeId);
        setMazeOrder(newOrder);
        saveToStorage(updated, newDeleted, newOrder);
        return updated;
      });
      
      return newDeleted;
    });
  }, [saveToStorage, mazeOrder]);

  // Reorder mazes
  const reorderMazes = useCallback((newOrder: number[]) => {
    setMazeOrder(newOrder);
    saveToStorage(customMazes, deletedIds, newOrder);
  }, [saveToStorage, customMazes, deletedIds]);

  // Create a new maze with a unique ID
  const createNewMaze = useCallback((): Maze => {
    const allMazes = getAllMazes();
    const maxId = allMazes.reduce((max, m) => Math.max(max, m.id), 0);
    const newMaze: Maze = {
      id: maxId + 1,
      name: 'New Maze',
      difficulty: 'easy',
      timeLimit: 60,
      previewTime: 5,
      medalTimes: { gold: 30, silver: 45, bronze: 60 },
      characters: [],
      dialogues: [],
      grid: createGrid([
        '################',
        '################',
        '##SS          ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##            ##',
        '##          EE##',
        '##          EE##',
        '################',
        '################',
      ]),
    };
    saveMaze(newMaze);
    return newMaze;
  }, [getAllMazes, saveMaze]);

  // Check if a maze has been customized
  const isCustomized = useCallback((mazeId: number): boolean => {
    return customMazes.some(m => m.id === mazeId);
  }, [customMazes]);

  // Reset a maze to default
  const resetToDefault = useCallback((mazeId: number) => {
    deleteMaze(mazeId);
  }, [deleteMaze]);

  // Export all mazes as JSON
  const exportAllMazes = useCallback((): string => {
    const allMazes = getAllMazes();
    const toExport = allMazes.map(mazeToStored);
    return JSON.stringify(toExport, null, 2);
  }, [getAllMazes]);

  // Import mazes from JSON
  const importMazes = useCallback((jsonString: string): { success: boolean; count: number; error?: string } => {
    try {
      const parsed: StoredMaze[] = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, error: 'Invalid format: expected array' };
      }
      const mazes = parsed.map(storedToMaze);
      // Replace all custom mazes with imported ones, clear deleted IDs and order
      const newDeleted = new Set<number>();
      const newOrder: number[] = [];
      setCustomMazes(mazes);
      setDeletedIds(newDeleted);
      setMazeOrder(newOrder);
      saveToStorage(mazes, newDeleted, newOrder);
      return { success: true, count: mazes.length };
    } catch (error) {
      return { success: false, count: 0, error: String(error) };
    }
  }, [saveToStorage]);

  return {
    getAllMazes,
    getMaze: (id: number) => getAllMazes().find(m => m.id === id),
    saveMaze,
    deleteMaze,
    createNewMaze,
    isCustomized,
    resetToDefault,
    exportAllMazes,
    importMazes,
    reorderMazes,
    isLoaded,
    customMazes,
  };
}
