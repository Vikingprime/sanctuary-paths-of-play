import { useState, useEffect, useCallback } from 'react';
import { SaveManager } from '@/services/SaveManager';
import { SaveData, DEFAULT_SAVE } from '@/types/save';

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

  const completeLevel = useCallback(
    async (mazeId: number, time: number, powerUps: string[] = []) => {
      await SaveManager.completeLevel(mazeId, time, powerUps);
      await refresh();
    },
    [refresh]
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

  const updateSettings = useCallback(
    async (settings: Partial<SaveData['settings']>) => {
      const current = await SaveManager.load();
      current.settings = { ...current.settings, ...settings };
      await SaveManager.save(current);
      await refresh();
    },
    [refresh]
  );

  return {
    save,
    loading,
    refresh,
    completeLevel,
    addScore,
    unlockMeal,
    updateSettings,
    reset: SaveManager.reset.bind(SaveManager),
  };
}
