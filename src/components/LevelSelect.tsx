import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Maze, MedalType } from '@/types/game';
import { SaveData } from '@/types/save';
import { Button } from '@/components/ui/button';
import { cn, formatTime } from '@/lib/utils';
import { Lock, Pencil, Bug, Trash2 } from 'lucide-react';
import { HowToPlayPanel } from './HowToPlayPanel';
import { SaveManager } from '@/services/SaveManager';
import { toast } from 'sonner';

interface LevelSelectProps {
  mazes: Maze[];
  onSelect: (maze: Maze) => void;
  onBack: () => void;
  save: SaveData;
  isMazeUnlocked: (maze: Maze) => Promise<boolean>;
  unlockMazeWithCurrency: (maze: Maze) => Promise<boolean>;
  onRefreshSave?: () => void;
}

const medalEmoji: Record<string, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};

export const LevelSelect = ({ 
  mazes, 
  onSelect, 
  onBack, 
  save, 
  isMazeUnlocked,
  unlockMazeWithCurrency,
  onRefreshSave
}: LevelSelectProps) => {
  const navigate = useNavigate();
  const [unlockedStatus, setUnlockedStatus] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const handleClearMazeData = async (mazeId: number) => {
    await SaveManager.clearMazeData(mazeId);
    toast.success(`Cleared data for maze ${mazeId}`);
    onRefreshSave?.();
  };

  // Helper to get maze name from props
  const getMazeName = (mazeId: number): string => {
    const maze = mazes.find(m => m.id === mazeId);
    return maze?.name || `Maze ${mazeId}`;
  };

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
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header with back button */}
      <div className="text-center mb-4">
        <h2 className="font-display text-3xl font-bold text-foreground mb-2">
          Choose Your Maze
        </h2>
        <p className="text-muted-foreground mb-4">
          Navigate through the cornfield and find the exit!
        </p>
        
        {/* How to Play Panel - expanded by default if no completed mazes */}
        <div className="max-w-md mx-auto mb-4">
          <HowToPlayPanel defaultExpanded={Object.keys(save.levels).length === 0} />
        </div>
        
        <div className="flex items-center justify-center gap-2 mb-2">
          <Button variant="ghost" onClick={onBack}>
            ← Back to Animals
          </Button>
          {save.settings.debugMode && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
            >
              <Bug className="w-4 h-4 mr-1" />
              Save Data
            </Button>
          )}
        </div>

        {/* Debug Panel for viewing/fixing save data */}
        {showDebugPanel && save.settings.debugMode && (
          <div className="max-w-md mx-auto mb-4 p-4 bg-card rounded-lg border text-left text-xs">
            <h4 className="font-bold mb-2">Save Data (levels):</h4>
            {Object.entries(save.levels).map(([mazeId, data]) => (
              <div key={mazeId} className="flex items-center justify-between py-1 border-b border-border/50">
                <div>
                  <span className="font-mono">Maze {mazeId}:</span>
                  <span className="ml-2 text-muted-foreground">
                    attempts={data.attempts}, best={data.bestTime}s, medal={data.medal || 'none'}
                  </span>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => handleClearMazeData(Number(mazeId))}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {Object.keys(save.levels).length === 0 && (
              <p className="text-muted-foreground">No level data saved yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Scrollable maze list */}
      <div className="flex-1 overflow-y-auto pb-24 mb-16">
        <div className="grid gap-4 max-w-md mx-auto px-4">
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

                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{difficultyEmoji[maze.difficulty]}</span>
                      <h3 className="font-display text-xl font-bold text-foreground">
                        {maze.name}
                      </h3>
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
                        <span className="flex items-center gap-1 text-destructive/70" title="Gold only possible on first try">
                          <span className="line-through">🥇</span>
                          <span className="text-[10px] font-medium">(1st try only)</span>
                        </span>
                      )}
                      <span>🥈 ≤{maze.medalTimes.silver}s</span>
                      <span>🥉 ≤{maze.medalTimes.bronze}s</span>
                    </div>
                    {/* Best time if completed - stronger highlight */}
                    {levelData?.bestTime && (
                      <div className="mt-2 inline-block bg-primary/20 px-3 py-1 rounded-full">
                        <span className="text-sm font-bold text-primary">
                          🏆 Best: {formatTime(levelData.bestTime)}s
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Large medal on the right OR arrow */}
                  <div className="flex flex-col items-center justify-center min-w-[60px] gap-2">
                    {medal ? (
                      <span className="text-5xl" title={`${medal} medal`}>
                        {medalEmoji[medal]}
                      </span>
                    ) : (
                      <div className="text-3xl opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                        {isUnlocked ? '→' : '🔒'}
                      </div>
                    )}
                    {/* Edit button - always visible for debugging/admin */}
                    {save.settings.debugMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/editor?mazeId=${maze.id}`);
                        }}
                        className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/40 transition-colors"
                        title="Edit maze"
                      >
                        <Pencil className="w-4 h-4 text-primary" />
                      </button>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom back button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border py-4 z-20">
        <div className="flex justify-center">
          <Button variant="ghost" onClick={onBack} size="lg">
            ← Back to Animals
          </Button>
        </div>
      </div>
    </div>
  );
};