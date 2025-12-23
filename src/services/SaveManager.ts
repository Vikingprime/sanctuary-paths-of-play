import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { SaveData, DEFAULT_SAVE, SaveDataV1 } from '@/types/save';
import { MedalType, Maze } from '@/types/game';

// File path - Unity reads this same file from Documents directory
const SAVE_FILENAME = 'sanctuary_run_save.json';

class SaveManagerClass {
  private cache: SaveData | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  async load(): Promise<SaveData> {
    if (this.cache) return this.cache;

    try {
      const result = await Filesystem.readFile({
        path: SAVE_FILENAME,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      
      if (result.data) {
        const parsed = JSON.parse(result.data as string) as SaveData;
        this.cache = this.migrate(parsed);
        return this.cache;
      }
    } catch (error: any) {
      // File doesn't exist yet - this is normal on first run
      if (error?.message?.includes('File does not exist') || error?.code === 'ERR_FILE_NOT_FOUND') {
        console.log('No save file found, creating default save');
      } else {
        console.error('Failed to load save:', error);
      }
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
        await Filesystem.writeFile({
          path: SAVE_FILENAME,
          data: JSON.stringify(data),
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
      } catch (error) {
        console.error('Failed to save:', error);
      }
    }, 100);
  }

  // Migrate old save versions to current
  private migrate(data: SaveData): SaveData {
    // Ensure all required fields exist (for old saves missing new fields)
    if (data.player.currency === undefined) {
      data.player.currency = 0;
    }
    if (!data.unlockedMazes) {
      data.unlockedMazes = [];
    }
    // Migrate old firstCompletion field to attempts
    for (const mazeId in data.levels) {
      const level = data.levels[mazeId];
      if ((level as any).firstCompletion !== undefined && level.attempts === undefined) {
        // If firstCompletion was false, they've completed at least once
        level.attempts = (level as any).firstCompletion === false ? 1 : 0;
        delete (level as any).firstCompletion;
      }
      if (level.attempts === undefined) {
        level.attempts = level.completed ? 1 : 0;
      }
    }
    return data as SaveDataV1;
  }

  // Calculate medal based on time and maze settings
  calculateMedal(time: number, maze: Maze, isFirstCompletion: boolean): MedalType {
    if (isFirstCompletion && time <= maze.medalTimes.gold) return 'gold';
    if (time <= maze.medalTimes.silver) return 'silver';
    if (time <= maze.medalTimes.bronze) return 'bronze';
    return null;
  }

  // Convenience methods
  async updatePlayer(updates: Partial<SaveData['player']>): Promise<void> {
    const save = await this.load();
    save.player = { ...save.player, ...updates };
    await this.save(save);
  }

  // Get currency (stars) reward based on medal
  getCurrencyReward(medal: MedalType): number {
    switch (medal) {
      case 'gold': return 15;
      case 'silver': return 10;
      case 'bronze': return 5;
      default: return 2; // Completion reward
    }
  }

  // Bonus stars for beating best time
  getBestTimeBonus(): number {
    return 3;
  }

  // Record that a maze attempt is starting (call when game begins)
  async startAttempt(mazeId: number, debugMode: boolean = false): Promise<void> {
    if (debugMode) return; // Don't track attempts in debug mode
    
    const save = await this.load();
    const existing = save.levels[mazeId];
    
    save.levels[mazeId] = {
      completed: existing?.completed ?? false,
      bestTime: existing?.bestTime ?? null,
      medal: existing?.medal ?? null,
      attempts: (existing?.attempts ?? 0) + 1,
      powerUpsCollected: existing?.powerUpsCollected ?? [],
    };
    
    await this.save(save);
  }

  async completeLevel(
    mazeId: number,
    time: number,
    powerUps: string[],
    maze: Maze,
    debugMode: boolean = false
  ): Promise<{ medal: MedalType; currencyEarned: number; isBestTime: boolean; bestTime: number | null }> {
    const save = await this.load();
    const existing = save.levels[mazeId];
    
    // Gold is only possible on first attempt AND if they don't already have a gold
    // In debug mode, all medals are always possible
    const attempts = existing?.attempts ?? 1;
    const hasGold = existing?.medal === 'gold';
    const goldEligible = debugMode || attempts === 1 || hasGold;
    
    const medal = this.calculateMedal(time, maze, goldEligible);
    
    // Determine best medal (gold > silver > bronze > null)
    const medalRank = { gold: 3, silver: 2, bronze: 1, null: 0 };
    const existingMedalRank = medalRank[existing?.medal || null] || 0;
    const newMedalRank = medalRank[medal || null] || 0;
    const bestMedal = newMedalRank > existingMedalRank ? medal : (existing?.medal || null);

    // Only consider existing best time if it's a valid positive number
    const existingBestTime = existing?.bestTime != null && existing.bestTime > 0 
      ? existing.bestTime 
      : null;
    
    // Only save if the new time is valid (positive)
    const validNewTime = time > 0 ? time : null;
    
    // Check if this is a new best time
    const isBestTime = validNewTime !== null && (existingBestTime === null || validNewTime < existingBestTime);
    
    let newBestTime: number | null = null;
    if (existingBestTime != null && validNewTime != null) {
      newBestTime = Math.min(existingBestTime, validNewTime);
    } else if (validNewTime != null) {
      newBestTime = validNewTime;
    } else if (existingBestTime != null) {
      newBestTime = existingBestTime;
    }

    // Calculate currency reward: medal bonus + best time bonus
    let currencyEarned = this.getCurrencyReward(medal);
    if (isBestTime) {
      currencyEarned += this.getBestTimeBonus();
    }
    
    // In debug mode, don't save times or medals (but still return what would be earned)
    if (debugMode) {
      return { medal, currencyEarned: 0, isBestTime, bestTime: newBestTime };
    }
    
    save.player.currency += currencyEarned;

    save.levels[mazeId] = {
      completed: true,
      bestTime: newBestTime,
      medal: bestMedal,
      attempts: existing?.attempts ?? 1,
      powerUpsCollected: [
        ...new Set([...(existing?.powerUpsCollected || []), ...powerUps]),
      ],
    };

    await this.save(save);
    return { medal, currencyEarned, isBestTime, bestTime: newBestTime };
  }

  async isLevelCompleted(mazeId: number): Promise<boolean> {
    const save = await this.load();
    return save.levels[mazeId]?.completed ?? false;
  }

  async getLevelMedal(mazeId: number): Promise<MedalType> {
    const save = await this.load();
    return save.levels[mazeId]?.medal ?? null;
  }

  // Check if a maze is unlocked based on conditions
  async isMazeUnlocked(maze: Maze, debugMode: boolean = false): Promise<boolean> {
    if (debugMode) return true;
    
    const save = await this.load();
    
    // Check if it's a currency-locked maze
    if (maze.currencyCost) {
      return (save.unlockedMazes || []).includes(maze.id);
    }
    
    // Check unlock conditions
    if (!maze.unlockConditions || maze.unlockConditions.length === 0) {
      return true; // No conditions = always unlocked
    }
    
    const medalRank = { gold: 3, silver: 2, bronze: 1 };
    
    for (const condition of maze.unlockConditions) {
      const levelData = save.levels[condition.mazeId];
      if (!levelData?.completed) return false;
      
      const requiredRank = medalRank[condition.requiredMedal];
      const earnedRank = medalRank[levelData.medal as keyof typeof medalRank] || 0;
      
      if (earnedRank < requiredRank) return false;
    }
    
    return true;
  }

  // Unlock a special maze with currency
  async unlockMazeWithCurrency(maze: Maze): Promise<boolean> {
    if (!maze.currencyCost) return true;
    
    const save = await this.load();
    
    if (save.player.currency < maze.currencyCost) return false;
    
    save.player.currency -= maze.currencyCost;
    save.unlockedMazes.push(maze.id);
    await this.save(save);
    return true;
  }

  async addCurrency(amount: number): Promise<void> {
    const save = await this.load();
    save.player.currency += amount;
    await this.save(save);
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
