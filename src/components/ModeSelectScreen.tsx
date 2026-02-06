import { GameMode } from '@/types/quest';
import { Button } from '@/components/ui/button';
import { BookOpen, Timer, ArrowLeft } from 'lucide-react';

interface ModeSelectScreenProps {
  onSelectMode: (mode: GameMode) => void;
  onBack: () => void;
  storyProgress?: {
    currentChapter: string;
    completedQuests: number;
    totalQuests: number;
  };
}

export const ModeSelectScreen = ({
  onSelectMode,
  onBack,
  storyProgress,
}: ModeSelectScreenProps) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      {/* Title */}
      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
          Choose Your Adventure
        </h1>
        <p className="text-muted-foreground">
          How would you like to play today?
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Story Mode Card */}
        <button
          onClick={() => onSelectMode('story')}
          className="group relative bg-card rounded-2xl p-6 shadow-warm border-2 border-transparent hover:border-primary transition-all duration-300 text-left hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="space-y-4">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>

            {/* Title & Description */}
            <div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">
                Story Mode
              </h2>
              <p className="text-sm text-muted-foreground">
                Embark on a quest-driven adventure! Solve puzzles, meet characters, and uncover the mystery of Foggy Farm.
              </p>
            </div>

            {/* Progress indicator */}
            {storyProgress && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  📖 {storyProgress.currentChapter}
                </p>
                <p className="text-xs text-muted-foreground">
                  ✅ {storyProgress.completedQuests}/{storyProgress.totalQuests} quests completed
                </p>
              </div>
            )}

            {/* NEW badge */}
            <div className="absolute top-4 right-4 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded-full">
              NEW
            </div>
          </div>
        </button>

        {/* Time Trial Card */}
        <button
          onClick={() => onSelectMode('time_trial')}
          className="group relative bg-card rounded-2xl p-6 shadow-warm border-2 border-transparent hover:border-accent transition-all duration-300 text-left hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="space-y-4">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Timer className="w-8 h-8 text-accent" />
            </div>

            {/* Title & Description */}
            <div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">
                Time Trial
              </h2>
              <p className="text-sm text-muted-foreground">
                Race against the clock! Navigate mazes as fast as possible to earn medals and unlock new challenges.
              </p>
            </div>

            {/* Features */}
            <div className="pt-2 border-t border-border space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                🥇 Earn Gold, Silver & Bronze medals
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                ⭐ Collect stars to unlock new mazes
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Info text */}
      <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
        Both modes contribute to unlocking meals for sanctuary animals! 🐷🐮🐔
      </p>
    </div>
  );
};
