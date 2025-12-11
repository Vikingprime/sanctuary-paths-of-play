import { Maze } from '@/types/game';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LevelSelectProps {
  mazes: Maze[];
  onSelect: (maze: Maze) => void;
  onBack: () => void;
}

export const LevelSelect = ({ mazes, onSelect, onBack }: LevelSelectProps) => {
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
        {mazes.map((maze, index) => (
          <button
            key={maze.id}
            onClick={() => onSelect(maze)}
            className={cn(
              'group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300',
              'hover:scale-[1.02] hover:shadow-warm-lg',
              'bg-gradient-card border-2 border-border hover:border-primary',
              index === 1 && 'animate-fade-in-delay-1',
              index === 2 && 'animate-fade-in-delay-2'
            )}
          >
            <div className="flex items-center justify-between">
              <div>
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
              </div>
              <div className="text-3xl opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                →
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={onBack}>
          ← Back to Animals
        </Button>
      </div>
    </div>
  );
};
