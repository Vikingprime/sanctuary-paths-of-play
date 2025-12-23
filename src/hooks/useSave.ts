import { useState, useEffect, useCallback } from 'react';
import { SaveManager } from '@/services/SaveManager';
import { SaveData, DEFAULT_SAVE } from '@/types/save';
import { Maze, MedalType } from '@/types/game';

export function useSave() {
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SaveManager.load().then((data) => {
      setSave(data);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    const data = await SaveManager.load();
    setSave(data);
  }, []);

  const startAttempt = useCallback(
    async (mazeId: number) => {
      await SaveManager.startAttempt(mazeId, save.settings.debugMode);
      await refresh();
    },
    [refresh, save.settings.debugMode]
  );

  const completeLevel = useCallback(
    async (mazeId: number, time: number, maze: Maze, powerUps: string[] = []): Promise<{ medal: MedalType; currencyEarned: number }> => {
      const result = await SaveManager.completeLevel(mazeId, time, powerUps, maze, save.settings.debugMode);
      if (!save.settings.debugMode) {
        await refresh();
      }
      return result;
    },
    [refresh, save.settings.debugMode]
  );

  const addScore = useCallback(
    async (points: number) => {
      await SaveManager.addScore(points);
      await refresh();
    },
    [refresh]
  );

  const unlockMeal = useCallback(async () => {
    await SaveManager.unlockMeal();
    await refresh();
  }, [refresh]);

  const addCurrency = useCallback(
    async (amount: number) => {
      await SaveManager.addCurrency(amount);
      await refresh();
    },
    [refresh]
  );

  const isMazeUnlocked = useCallback(
    async (maze: Maze): Promise<boolean> => {
      return SaveManager.isMazeUnlocked(maze, save.settings.debugMode);
    },
    [save.settings.debugMode]
  );

  const unlockMazeWithCurrency = useCallback(
    async (maze: Maze): Promise<boolean> => {
      const success = await SaveManager.unlockMazeWithCurrency(maze);
      if (success) await refresh();
      return success;
    },
    [refresh]
  );

  const updateSettings = useCallback(
    async (newSettings: Partial<SaveData['settings']>) => {
      // Optimistically update local state for immediate UI feedback
      setSave(prev => ({
        ...prev,
        settings: { ...prev.settings, ...newSettings }
      }));
      
      // Then persist to storage
      const current = await SaveManager.load();
      current.settings = { ...current.settings, ...newSettings };
      await SaveManager.save(current);
    },
    []
  );

  return {
    save,
    loading,
    refresh,
    startAttempt,
    completeLevel,
    addScore,
    unlockMeal,
    addCurrency,
    isMazeUnlocked,
    unlockMazeWithCurrency,
    updateSettings,
    reset: SaveManager.reset.bind(SaveManager),
  };
}
