import { cn } from '@/lib/utils';

interface ProgressTrackerProps {
  mealsUnlocked: number;
  currentProgress: number;
  targetMeals: number;
}

export const ProgressTracker = ({
  mealsUnlocked,
  currentProgress,
  targetMeals = 5,
}: ProgressTrackerProps) => {
  const meals = Array.from({ length: targetMeals }, (_, i) => i < mealsUnlocked);

  return (
    <div className="bg-card rounded-2xl p-6 shadow-warm">
      <h3 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        <span>🍽️</span> Sanctuary Meals
      </h3>

      {/* Meal icons */}
      <div className="flex justify-center gap-3 mb-4">
        {meals.map((unlocked, i) => (
          <div
            key={i}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300',
              unlocked
                ? 'bg-gradient-to-br from-primary to-sunset shadow-warm scale-110'
                : 'bg-muted'
            )}
          >
            <span className={cn('text-2xl', unlocked ? '' : 'opacity-30')}>
              {unlocked ? '🥗' : '🍽️'}
            </span>
          </div>
        ))}
      </div>

      {/* Progress to next meal */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Next meal progress</span>
          <span className="font-semibold text-primary">{currentProgress}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sage to-secondary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Complete mazes to unlock real meals for sanctuary animals! 🌾
      </p>
    </div>
  );
};
