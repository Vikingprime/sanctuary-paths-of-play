import { useState, useEffect } from 'react';
import { Maze, MedalType } from '@/types/game';
import { SaveData } from '@/types/save';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { mazes as allMazes } from '@/data/mazes';

interface LevelSelectProps {
  mazes: Maze[];
  onSelect: (maze: Maze) => void;
  onBack: () => void;
  save: SaveData;
  isMazeUnlocked: (maze: Maze) => Promise<boolean>;
  unlockMazeWithCurrency: (maze: Maze) => Promise<boolean>;
}

const medalEmoji: Record<string, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};

const getMazeName = (mazeId: number): string => {
  const maze = allMazes.find(m => m.id === mazeId);
  return maze?.name || `Maze ${mazeId}`;
};

export const LevelSelect = ({ 
  mazes, 
  onSelect, 
  onBack, 
  save, 
  isMazeUnlocked,
  unlockMazeWithCurrency 
}: LevelSelectProps) => {
  const [unlockedStatus, setUnlockedStatus] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUnlocks = async () => {
      const status: Record<number, boolean> = {};
      for (const maze of mazes) {
        status[maze.id] = await isMazeUnlocked(maze);
      }
      setUnlockedStatus(status);
      setLoading(false);
    };
    checkUnlocks();
  }, [mazes, isMazeUnlocked, save]);

  const difficultyColors = {
    easy: 'from-sage to-secondary',
    medium: 'from-primary to-sunset',
    hard: 'from-barn to-destructive',
  };

  const difficultyEmoji = {
    easy: '🌱',
    medium: '🌻',
    hard: '🌾',
  };

  const handleMazeClick = async (maze: Maze) => {
    const isUnlocked = unlockedStatus[maze.id];
    
    if (isUnlocked) {
      onSelect(maze);
      return;
    }

    // Try to unlock with currency if it's a currency-locked maze
    if (maze.currencyCost && save.player.currency >= maze.currencyCost) {
      const success = await unlockMazeWithCurrency(maze);
      if (success) {
        setUnlockedStatus(prev => ({ ...prev, [maze.id]: true }));
        onSelect(maze);
      }
    }
  };

  const getUnlockRequirements = (maze: Maze): string => {
    if (maze.currencyCost) {
      return `Requires ${maze.currencyCost} ⭐`;
    }
    if (maze.unlockConditions && maze.unlockConditions.length > 0) {
      return maze.unlockConditions
        .map(c => `${getMazeName(c.mazeId)} (${c.requiredMedal})`)
        .join(', ');
    }
    return '';
  };

  const getLevelMedal = (mazeId: number): MedalType => {
    return save.levels[mazeId]?.medal || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading levels...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-foreground mb-2">
          Choose Your Maze
        </h2>
        <p className="text-muted-foreground">
          Navigate through the cornfield and find the exit!
        </p>
      </div>

      <div className="grid gap-4 max-w-md mx-auto">
        {mazes.map((maze, index) => {
          const isUnlocked = unlockedStatus[maze.id];
          const medal = getLevelMedal(maze.id);
          const levelData = save.levels[maze.id];
          const canAfford = maze.currencyCost ? save.player.currency >= maze.currencyCost : true;

          return (
            <button
              key={maze.id}
              onClick={() => handleMazeClick(maze)}
              disabled={!isUnlocked && (!maze.currencyCost || !canAfford)}
              className={cn(
                'group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300',
                'bg-gradient-card border-2',
                isUnlocked 
                  ? 'hover:scale-[1.02] hover:shadow-warm-lg border-border hover:border-primary cursor-pointer'
                  : maze.currencyCost && canAfford
                    ? 'hover:scale-[1.02] hover:shadow-warm-lg border-primary/50 hover:border-primary cursor-pointer'
                    : 'opacity-60 cursor-not-allowed border-border',
                index === 1 && 'animate-fade-in-delay-1',
                index === 2 && 'animate-fade-in-delay-2'
              )}
            >
              {/* Lock overlay for locked mazes */}
              {!isUnlocked && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                  <div className="text-center">
                    <Lock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground px-4">
                      {getUnlockRequirements(maze)}
                    </p>
                    {maze.currencyCost && canAfford && (
                      <p className="text-xs text-primary mt-1 font-semibold">
                        Click to unlock!
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{difficultyEmoji[maze.difficulty]}</span>
                    <h3 className="font-display text-xl font-bold text-foreground">
                      {maze.name}
                    </h3>
                    {medal && (
                      <span className="text-xl" title={`${medal} medal`}>
                        {medalEmoji[medal]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-semibold text-cream capitalize',
                        `bg-gradient-to-r ${difficultyColors[maze.difficulty]}`
                      )}
                    >
                      {maze.difficulty}
                    </span>
                    <span>⏱️ {maze.timeLimit}s</span>
                    <span>👀 {maze.previewTime}s preview</span>
                  </div>
                  {/* Medal times - hide gold if no longer achievable */}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {/* Gold is only possible if: no attempts yet, OR already have gold */}
                    {(levelData?.medal === 'gold' || !levelData?.attempts || levelData.attempts === 0) ? (
                      <span>🥇 ≤{maze.medalTimes.gold}s</span>
                    ) : (
                      <span className="line-through opacity-50" title="Gold only possible on first try">🥇 ≤{maze.medalTimes.gold}s</span>
                    )}
                    <span>🥈 ≤{maze.medalTimes.silver}s</span>
                    <span>🥉 ≤{maze.medalTimes.bronze}s</span>
                  </div>
                  {/* Best time if completed */}
                  {levelData?.bestTime && (
                    <div className="mt-1 text-xs text-primary">
                      Best: {levelData.bestTime.toFixed(1)}s
                    </div>
                  )}
                </div>
                <div className="text-3xl opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  {isUnlocked ? '→' : '🔒'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={onBack}>
          ← Back to Animals
        </Button>
      </div>
    </div>
  );
};