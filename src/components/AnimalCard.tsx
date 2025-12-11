import { Animal } from '@/types/game';
import { cn } from '@/lib/utils';

interface AnimalCardProps {
  animal: Animal;
  isSelected: boolean;
  isLocked?: boolean;
  onClick: () => void;
  delay?: number;
}

export const AnimalCard = ({
  animal,
  isSelected,
  isLocked = false,
  onClick,
  delay = 0,
}: AnimalCardProps) => {
  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={cn(
        'animal-card group',
        'bg-gradient-card shadow-lg',
        isSelected && 'selected ring-4 ring-primary/30',
        isLocked && 'opacity-50 cursor-not-allowed',
        delay === 1 && 'animate-fade-in-delay-1',
        delay === 2 && 'animate-fade-in-delay-2',
        delay === 3 && 'animate-fade-in-delay-3',
        delay === 0 && 'animate-fade-in'
      )}
    >
      {/* Animal Emoji */}
      <div
        className={cn(
          'text-7xl mb-4 transition-transform duration-300',
          'group-hover:scale-110',
          isSelected && 'floating'
        )}
      >
        {animal.emoji}
      </div>

      {/* Animal Name */}
      <h3 className="font-display text-xl font-bold text-foreground mb-2">
        {animal.name}
      </h3>

      {/* Ability */}
      <div className="bg-muted rounded-xl p-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{animal.ability.icon}</span>
          <span className="font-display font-semibold text-sm text-foreground">
            {animal.ability.name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {animal.ability.description}
        </p>
      </div>

      {/* Meal Progress */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Meals unlocked</span>
          <span>{animal.mealsUnlocked}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-sunset rounded-full transition-all duration-500"
            style={{ width: `${animal.mealProgress}%` }}
          />
        </div>
      </div>

      {/* Lock overlay */}
      {isLocked && (
        <div className="absolute inset-0 bg-foreground/10 rounded-2xl flex items-center justify-center">
          <span className="text-4xl">🔒</span>
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
          <span className="text-primary-foreground text-lg">✓</span>
        </div>
      )}
    </button>
  );
};
