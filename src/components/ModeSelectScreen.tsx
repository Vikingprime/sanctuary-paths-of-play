import { GameMode } from '@/types/quest';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { BookOpen, Timer, Dice6, Volume2, VolumeX } from 'lucide-react';
import { ProgressTracker } from '@/components/ProgressTracker';

interface ModeSelectScreenProps {
  onSelectMode: (mode: GameMode) => void;
  onBack: () => void;
  storyProgress?: {
    currentChapter: string;
    completedQuests: number;
    totalQuests: number;
  };
  // Settings props
  isSoundOn?: boolean;
  onSoundToggle?: (on: boolean) => void;
  debugMode?: boolean;
  onDebugToggle?: (on: boolean) => void;
  // Progress props
  mealsUnlocked?: number;
  mealProgress?: number;
}

export const ModeSelectScreen = ({
  onSelectMode,
  onBack,
  storyProgress,
  isSoundOn = false,
  onSoundToggle,
  debugMode = false,
  onDebugToggle,
  mealsUnlocked = 0,
  mealProgress = 0,
}: ModeSelectScreenProps) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="text-center space-y-2 md:space-y-4">
        <div className="text-4xl md:text-6xl mb-2 md:mb-4">🐷🐮🐔</div>
        <h1 className="font-display text-3xl md:text-5xl font-bold text-gradient">
          Foggy Farm
        </h1>
        <p className="text-sm md:text-lg text-muted-foreground max-w-md mx-auto">
          Navigate 3D corn mazes with adorable farm animals and help unlock
          real meals for sanctuary residents!
        </p>
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
          Choose Your Adventure
        </h2>
        <p className="text-muted-foreground text-sm">
          How would you like to play today?
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
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
        {/* Board Game Card */}
        <button
          onClick={() => onSelectMode('board_game')}
          className="group relative bg-card rounded-2xl p-6 shadow-warm border-2 border-transparent hover:border-secondary transition-all duration-300 text-left hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center">
              <Dice6 className="w-8 h-8 text-secondary" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">
                Roll & Feed
              </h2>
              <p className="text-sm text-muted-foreground">
                Roll the dice, collect feed, and earn stars for your sanctuary animals!
              </p>
            </div>
            <div className="pt-2 border-t border-border space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                🎲 Earn rolls from gold medals
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                🥣 Fill feed bags to send meals
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Info text */}
      <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
        All modes contribute to unlocking meals for sanctuary animals! 🐷🐮🐔
      </p>

      {/* Settings */}
      <div className="flex flex-col items-center gap-3">
        {/* Sound Toggle */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {isSoundOn ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          <Switch
            id="sound-toggle"
            checked={isSoundOn}
            onCheckedChange={(checked) => onSoundToggle?.(checked)}
          />
          <Label htmlFor="sound-toggle" className="cursor-pointer">
            Sound
          </Label>
        </div>

        {/* Debug Mode Toggle */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            id="debug-mode"
            checked={debugMode}
            onCheckedChange={(checked) => onDebugToggle?.(checked)}
          />
          <Label htmlFor="debug-mode" className="cursor-pointer">
            Debug Mode (skip preview, infinite time)
          </Label>
        </div>
      </div>

      {/* Progress Tracker */}
      <div className="max-w-sm mx-auto">
        <ProgressTracker
          mealsUnlocked={mealsUnlocked}
          currentProgress={mealProgress}
          targetMeals={5}
        />
      </div>
    </div>
  );
};
