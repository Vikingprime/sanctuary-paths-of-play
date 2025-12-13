import { Preferences } from '@capacitor/preferences';
import { SaveData, DEFAULT_SAVE, SaveDataV1 } from '@/types/save';

// Storage key - Unity must use same key
const SAVE_KEY = 'sanctuary_run_save';

class SaveManagerClass {
  private cache: SaveData | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  async load(): Promise<SaveData> {
    if (this.cache) return this.cache;

    try {
      const { value } = await Preferences.get({ key: SAVE_KEY });
      
      if (value) {
        const parsed = JSON.parse(value) as SaveData;
        this.cache = this.migrate(parsed);
        return this.cache;
      }
    } catch (error) {
      console.error('Failed to load save:', error);
    }

    // Return default save
    this.cache = { ...DEFAULT_SAVE };
    await this.save(this.cache);
    return this.cache;
  }

  async save(data: SaveData): Promise<void> {
    data.lastUpdated = new Date().toISOString();
    this.cache = data;

    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        await Preferences.set({
          key: SAVE_KEY,
          value: JSON.stringify(data),
        });
      } catch (error) {
        console.error('Failed to save:', error);
      }
    }, 100);
  }

  // Migrate old save versions to current
  private migrate(data: SaveData): SaveData {
    // Currently on v1, add migration logic here for future versions
    // Example: if (data.version === 1) { return migrateV1toV2(data); }
    return data as SaveDataV1;
  }

  // Convenience methods
  async updatePlayer(updates: Partial<SaveData['player']>): Promise<void> {
    const save = await this.load();
    save.player = { ...save.player, ...updates };
    await this.save(save);
  }

  async completeLevel(
    mazeId: number,
    time: number,
    powerUps: string[]
  ): Promise<void> {
    const save = await this.load();
    const existing = save.levels[mazeId];
    
    // Calculate stars based on time (customize thresholds per level later)
    const stars = time < 30 ? 3 : time < 60 ? 2 : 1;

    save.levels[mazeId] = {
      completed: true,
      bestTime: existing?.bestTime 
        ? Math.min(existing.bestTime, time) 
        : time,
      stars: existing?.stars 
        ? Math.max(existing.stars, stars) 
        : stars,
      powerUpsCollected: [
        ...new Set([...(existing?.powerUpsCollected || []), ...powerUps]),
      ],
    };

    await this.save(save);
  }

  async isLevelCompleted(mazeId: number): Promise<boolean> {
    const save = await this.load();
    return save.levels[mazeId]?.completed ?? false;
  }

  async addScore(points: number): Promise<void> {
    const save = await this.load();
    save.player.totalScore += points;
    await this.save(save);
  }

  async unlockMeal(): Promise<void> {
    const save = await this.load();
    save.player.totalMealsUnlocked += 1;
    await this.save(save);
  }

  async reset(): Promise<void> {
    this.cache = { ...DEFAULT_SAVE };
    await this.save(this.cache);
  }

  // For debugging
  async exportSave(): Promise<string> {
    const save = await this.load();
    return JSON.stringify(save, null, 2);
  }
}

export const SaveManager = new SaveManagerClass();
